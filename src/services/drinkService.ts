/**
 * Cocktail service: orders, water, chat, rudeness and apologies with the casino's server, and the
 * enforced refusal. Drink purchases are ledger debits (type 'drink', idempotency key
 * `drink:<server>:<orderId>`), in the same transaction as the drink state (career flags) and the
 * server's relationship, so a double click or reload can't charge or count twice.
 *
 * Nothing here is read by casino rules, RNG, odds or payouts. Effects are social and stamina only.
 * Servers come by between completed rounds only (the table calls `round()` after each one).
 */
import { casinoWeekKey } from '../career/engine';
import { gameDate } from '../career/config';
import type { CareerState } from '../career/types';
import { DomainError } from '../core/errors';
import { hashString } from '../golf/math';
import type { AppDB } from '../persistence/db';
import { applyInteraction, applyVisit, freshNpcState, normalizeNpcState, tierIdOf, tierRank } from '../npc/relationship';
import type { NpcState, RelationshipLogEntry } from '../npc/types';
import { SERVER_CONFIG as C, type ServerEffectDef } from '../casino/servers/config';
import {
  applyOrder, applyRefusal, applyRounds, applyWater, canOrderAlcohol, drinkLevel, forVisit, parseDrinkState, recordIncident, serverDue,
  type DrinkState,
} from '../casino/servers/drinks';
import { serverById, type ServerEvent, type ServerId } from '../casino/servers/registry';
import type { EconomyService } from './economyService';

export const DRINK_FLAG = 'drinkState';

export interface ServiceResult {
  /** Which line the server answers with (servers.json event). */
  event: ServerEvent;
  state: DrinkState;
  npc: NpcState;
  effect?: ServerEffectDef | null;
  /** The sponsor wrote (a pattern of serious incidents). */
  sponsorWarning?: boolean;
  replayed?: boolean;
}

export class DrinkService {
  constructor(
    private readonly db: AppDB,
    private readonly economy: EconomyService,
  ) {}

  private get tables() {
    return [...this.economy.tables, this.db.careers, this.db.profiles, this.db.npcState, this.db.relationshipLog];
  }

  private async openCareer(): Promise<CareerState> {
    const c = await this.db.careers.get('career');
    if (!c) throw new DomainError('NO_PROFILE', 'No career found');
    if (c.flags.casinoVisit !== casinoWeekKey(c)) throw new DomainError('CAREER_RULE', 'Visit the casino first (uses one activity)');
    if (c.active) throw new DomainError('CAREER_RULE', 'Finish your tournament first');
    return c;
  }

  private stateIn(c: CareerState): DrinkState {
    return forVisit(parseDrinkState(c.flags[DRINK_FLAG]), casinoWeekKey(c));
  }

  private async npc(id: ServerId): Promise<NpcState> {
    const row = (await this.db.npcState.get(id)) as NpcState | undefined;
    return row ? normalizeNpcState(row) : freshNpcState(id);
  }

  private async at(c: CareerState): Promise<string> {
    return (await this.db.profiles.get(c.playerId))?.careerClock ?? gameDate(c.season, c.week);
  }

  private async log(entry: Omit<RelationshipLogEntry, 'seq'>) {
    const last = await this.db.relationshipLog.where('[npcId+seq]').between([entry.npcId, 0], [entry.npcId, Infinity]).last();
    await this.db.relationshipLog.add({ ...entry, seq: (last?.seq ?? 0) + 1 });
  }

  /** Saves the drink state (and any career changes) on the career row. */
  private async saveCareer(c: CareerState, s: DrinkState, patch: Partial<CareerState> = {}) {
    await this.db.careers.put({ ...c, ...patch, flags: { ...c.flags, ...(patch.flags ?? {}), [DRINK_FLAG]: JSON.stringify(s) } });
  }

  /**
   * A serious incident: counts toward the sponsor pattern. A single drink or a normal visit never
   * counts. At the threshold the sponsor (if any) writes once a season (draft wording) and the
   * sponsor relationship drops; each further incident that season drops it again. Never ends a deal.
   */
  private incident(c: CareerState, s: DrinkState): { state: DrinkState; patch: Partial<CareerState>; sponsorWarning: boolean } {
    const r = recordIncident(s, c.season);
    if (!c.sponsor || !r.sponsorLoss) return { state: r.state, patch: {}, sponsorWarning: false };
    const relationships = { ...c.relationships, sponsor: Math.max(0, (c.relationships.sponsor ?? 0) - C.sponsorRelLoss) };
    const patch: Partial<CareerState> = { relationships };
    if (r.sponsorWarning) {
      const at = gameDate(c.season, c.week);
      const item = {
        id: `msg_${c.season}_${c.week}_sponsor_drinks_${hashString(String(r.state.incidents.count))}`,
        at,
        title: `${c.sponsor.name}: a word about the casino [draft]`,
        body: "We've heard you've been cut off at the casino more than once this season. Enjoy yourself, but our name is on your bag. Please keep it under control.",
        tone: 'bad' as const,
      };
      patch.inbox = [item, ...c.inbox].slice(0, 40);
    }
    return { state: r.state, patch, sponsorWarning: r.sponsorWarning };
  }

  /** The current drink state (a new visit reads as sober). */
  async state(): Promise<DrinkState> {
    const c = await this.db.careers.get('career');
    return c ? this.stateIn(c) : parseDrinkState(undefined);
  }

  /** Ryan orders a Tito's Double. Refused when impaired: enforced here, whatever the UI shows. */
  async order(serverId: ServerId, orderId: string): Promise<ServiceResult> {
    const server = serverById(serverId);
    if (!server) throw new DomainError('CAREER_RULE', 'Unknown server');
    if (!orderId) throw new DomainError('CAREER_RULE', 'Missing order id');
    const key = `drink:${serverId}:${orderId}`;
    return this.db.transaction('rw', this.tables, async () => {
      const c = await this.openCareer();
      let s = this.stateIn(c);
      const prev = await this.npc(serverId);
      if (await this.db.ledger.where('idempotencyKey').equals(key).count()) return { event: 'order', state: s, npc: prev, replayed: true };
      const at = await this.at(c);
      const visitKey = casinoWeekKey(c);
      if (!canOrderAlcohol(s).ok) {
        const newly = !s.refused;
        s = applyRefusal(s);
        let patch: Partial<CareerState> = {};
        let sponsorWarning = false;
        if (newly) ({ state: s, patch, sponsorWarning } = this.incident(c, s));
        await this.saveCareer(c, s, patch);
        const npc = applyVisit(prev, visitKey);
        await this.db.npcState.put(npc);
        await this.log({ id: `rel:${serverId}:refused:${orderId}`, npcId: serverId, at, kind: 'refused', delta: 0, visitKey });
        return { event: 'refusal', state: s, npc, sponsorWarning };
      }
      const price = C.drink.prices[server.location];
      const { transaction } = await this.economy.post({ ownerId: c.playerId, amount: -price, type: 'drink', sourceId: serverId, idempotencyKey: key });
      const first = s.lifetimeDrinks === 0;
      const r = applyOrder(s, Number(c.flags.seed ?? 0));
      await this.saveCareer(c, r.state, { energy: Math.max(0, c.energy - r.energyCost) });
      const npc = applyInteraction(applyVisit(prev, visitKey), 0, first ? 'first_order' : 'ordered', transaction.timestamp);
      await this.db.npcState.put(npc);
      await this.log({ id: `rel:${serverId}:order:${orderId}`, npcId: serverId, at: transaction.timestamp, kind: 'order', amount: price, delta: 0, txnId: transaction.id, visitKey });
      return { event: r.concern ? 'concern' : first ? 'first_order' : 'order', state: r.state, npc, effect: r.effect };
    });
  }

  /** Water: free, always available, helps Ryan recover. */
  async water(serverId: ServerId, requestId: string): Promise<ServiceResult> {
    if (!serverById(serverId)) throw new DomainError('CAREER_RULE', 'Unknown server');
    return this.db.transaction('rw', this.tables, async () => {
      const c = await this.openCareer();
      const s = applyWater(this.stateIn(c));
      await this.saveCareer(c, s);
      const visitKey = casinoWeekKey(c);
      const npc = applyVisit(await this.npc(serverId), visitKey);
      await this.db.npcState.put(npc);
      await this.log({ id: `rel:${serverId}:water:${requestId}`, npcId: serverId, at: await this.at(c), kind: 'water', delta: 0, visitKey });
      return { event: 'water', state: s, npc };
    });
  }

  /**
   * Small talk: a little relationship once per visit. A server who trusts Ryan (Friend or better)
   * sometimes passes on a rumour (deterministic per visit). Rumours never guarantee anything.
   */
  async chat(serverId: ServerId, requestId: string): Promise<ServiceResult> {
    if (!serverById(serverId)) throw new DomainError('CAREER_RULE', 'Unknown server');
    return this.db.transaction('rw', this.tables, async () => {
      const c = await this.openCareer();
      const s = this.stateIn(c);
      const visitKey = casinoWeekKey(c);
      const at = await this.at(c);
      let npc = applyVisit(await this.npc(serverId), visitKey);
      const chattedFlag = `chat:${visitKey}`;
      const already = !!npc.flags?.[chattedFlag];
      const gain = already ? 0 : C.chatGain;
      if (!already) npc = { ...applyInteraction(npc, gain, 'chatted', at), flags: { ...(npc.flags ?? {}), [chattedFlag]: true } };
      await this.db.npcState.put(npc);
      await this.log({ id: `rel:${serverId}:chat:${requestId}`, npcId: serverId, at, kind: 'chat', delta: gain, visitKey });
      const trusted = tierRank(tierIdOf(npc)) >= tierRank('friend');
      const rumor = trusted && hashString(`rumor:${c.flags.seed ?? 0}:${serverId}:${visitKey}`) % 3 === 0;
      return { event: rumor ? 'rumor' : 'chat', state: s, npc };
    });
  }

  /** Ryan is rude to the server: relationship drops; if he's impaired it's a serious incident. */
  async rude(serverId: ServerId, requestId: string): Promise<ServiceResult> {
    if (!serverById(serverId)) throw new DomainError('CAREER_RULE', 'Unknown server');
    return this.db.transaction('rw', this.tables, async () => {
      const c = await this.openCareer();
      let s = this.stateIn(c);
      const visitKey = casinoWeekKey(c);
      const at = await this.at(c);
      const npc = applyInteraction(applyVisit(await this.npc(serverId), visitKey), -C.rudeLoss, 'was_rude', at);
      s = { ...s, rude: s.rude.includes(serverId) ? s.rude : [...s.rude, serverId] };
      let patch: Partial<CareerState> = {};
      let sponsorWarning = false;
      if (drinkLevel(s.buzz) === 'impaired') ({ state: s, patch, sponsorWarning } = this.incident(c, s));
      await this.saveCareer(c, s, patch);
      await this.db.npcState.put(npc);
      await this.log({ id: `rel:${serverId}:rude:${requestId}`, npcId: serverId, at, kind: 'rude', delta: -C.rudeLoss, visitKey });
      return { event: 'hostile', state: s, npc, sponsorWarning };
    });
  }

  /** An apology after being rude (only then): wins some of it back. */
  async apologize(serverId: ServerId, requestId: string): Promise<ServiceResult> {
    if (!serverById(serverId)) throw new DomainError('CAREER_RULE', 'Unknown server');
    return this.db.transaction('rw', this.tables, async () => {
      const c = await this.openCareer();
      let s = this.stateIn(c);
      if (!s.rude.includes(serverId)) throw new DomainError('CAREER_RULE', 'Nothing to apologise for');
      const visitKey = casinoWeekKey(c);
      const at = await this.at(c);
      const npc = applyInteraction(await this.npc(serverId), C.apologyGain, 'apologized', at);
      s = { ...s, rude: s.rude.filter((x) => x !== serverId) };
      await this.saveCareer(c, s);
      await this.db.npcState.put(npc);
      await this.log({ id: `rel:${serverId}:apology:${requestId}`, npcId: serverId, at, kind: 'apology', delta: C.apologyGain, visitKey });
      return { event: 'apology', state: s, npc };
    });
  }

  /** A round finished at a table: time passes (buzz eases). Returns whether the server comes by. */
  async round(): Promise<{ state: DrinkState; serverDue: boolean }> {
    return this.db.transaction('rw', [this.db.careers], async () => {
      const c = await this.db.careers.get('career');
      if (!c || c.flags.casinoVisit !== casinoWeekKey(c)) return { state: parseDrinkState(undefined), serverDue: false };
      const s = applyRounds(this.stateIn(c));
      await this.saveCareer(c, s);
      return { state: s, serverDue: serverDue(s.rounds) };
    });
  }
}
