/**
 * Dealer relationships and tipping (Casino Secrets & Rivalries, Slice 1).
 *
 * A tip is one ledger debit (type 'tip', key `tip:<dealer>:<tipId>`) and one relationship
 * update, in a single transaction, so a double click or a reload can never charge or count a
 * tip twice. Tips never touch a casino game's rules, odds, payouts or casino statistics.
 */
import { casinoWeekKey } from '../career/engine';
import { DomainError } from '../core/errors';
import type { AppDB } from '../persistence/db';
import { dealerById, DEALERS } from '../npc/registry';
import { serverById } from '../casino/servers/registry';
import { SERVER_CONFIG } from '../casino/servers/config';
import { applyTip, applyVisit, freshNpcState, normalizeNpcState, TIP_AMOUNTS, type TipOutcome } from '../npc/relationship';
import { eligibleHooks, type RelationshipHook } from '../npc/hooks';
import { applyTableNight } from '../npc/vip';
import { casinoAt } from '../expansion/locations';
import type { NpcId, NpcState, RelationshipLogEntry } from '../npc/types';
import type { EconomyService } from './economyService';
import { pendingThreeCard } from './casinoService';

export interface TipResult {
  outcome: TipOutcome | null;
  state: NpcState;
  balance: number;
  /** This tip id was already applied: nothing was charged or counted again. */
  replayed: boolean;
  /** Future relationship events that became eligible (none are registered yet). */
  hooks: RelationshipHook[];
}

export class NpcService {
  constructor(
    private readonly db: AppDB,
    private readonly economy: EconomyService,
  ) {}

  private async openCareer() {
    const c = await this.db.careers.get('career');
    if (!c) throw new DomainError('NO_PROFILE', 'No career found');
    if (c.flags.casinoVisit !== casinoWeekKey(c)) throw new DomainError('CAREER_RULE', 'Visit the casino first (uses one activity)');
    if (c.active) throw new DomainError('CAREER_RULE', 'Finish your tournament first');
    return c;
  }

  private async stateOf(npcId: NpcId): Promise<NpcState> {
    const row = (await this.db.npcState.get(npcId)) as NpcState | undefined;
    return row ? normalizeNpcState(row) : freshNpcState(npcId);
  }

  private async log(entry: Omit<RelationshipLogEntry, 'seq'>) {
    const last = await this.db.relationshipLog.where('[npcId+seq]').between([entry.npcId, 0], [entry.npcId, Infinity]).last();
    await this.db.relationshipLog.add({ ...entry, seq: (last?.seq ?? 0) + 1 });
  }

  /** Every dealer's relationship (dealers Ryan hasn't met yet come back neutral). */
  async states(): Promise<NpcState[]> {
    const rows = new Map((await this.db.npcState.toArray()).map((r) => [r.npcId, r as NpcState]));
    return DEALERS.map((d) => { const r = rows.get(d.id); return r ? normalizeNpcState(r) : freshNpcState(d.id); });
  }

  /** Ryan sits at a dealer's table: counted once per casino visit. */
  async visit(npcId: NpcId): Promise<NpcState> {
    if (!dealerById(npcId)) throw new DomainError('CAREER_RULE', 'Unknown dealer');
    return this.db.transaction('rw', [this.db.careers, this.db.profiles, this.db.npcState, this.db.relationshipLog], async () => {
      const c = await this.openCareer();
      const key = casinoWeekKey(c);
      const prev = await this.stateOf(npcId);
      if (prev.lastVisitKey === key) return prev; // already counted this visit
      const at = (await this.db.profiles.get(c.playerId))?.careerClock ?? new Date(0).toISOString();
      // A night at this dealer's table here: counts toward the private-room invitation, and
      // once Ryan is a Regular it is real relationship (table time), the way past tips' ceiling.
      const { next, gain } = applyTableNight(applyVisit(prev, key), casinoAt(c), at);
      await this.db.npcState.put(next);
      await this.log({ id: `rel:${npcId}:visit:${key}`, npcId, at, kind: 'visit', delta: gain, visitKey: key });
      return next;
    });
  }

  /**
   * Tips a dealer between hands. `tipId` identifies this press of the button: retrying with
   * the same id (a double click, a reload mid-request) changes nothing.
   */
  async tip(npcId: NpcId, amount: number, tipId: string): Promise<TipResult> {
    const dealer = dealerById(npcId);
    const server = serverById(npcId);
    if (!dealer && !server) throw new DomainError('CAREER_RULE', 'Unknown dealer');
    // Servers have their own tip sizes and a fixed reference (dealers use their table minimum).
    const amounts: readonly number[] = server ? SERVER_CONFIG.tipAmounts : TIP_AMOUNTS;
    const reference = server ? SERVER_CONFIG.tipReference : dealer!.tableMin;
    if (!amounts.includes(amount)) throw new DomainError('CAREER_RULE', 'Pick a tip amount');
    if (!tipId) throw new DomainError('CAREER_RULE', 'Missing tip id');
    const key = `tip:${npcId}:${tipId}`;
    return this.db.transaction('rw', [...this.economy.tables, this.db.careers, this.db.npcState, this.db.relationshipLog], async () => {
      const c = await this.openCareer();
      if (await this.db.ledger.where('idempotencyKey').equals(key).count()) {
        return { outcome: null, state: await this.stateOf(npcId), balance: await this.economy.getBalance(c.playerId), replayed: true, hooks: [] };
      }
      if (npcId === 'winston' && pendingThreeCard(c)) throw new DomainError('CAREER_RULE', 'Tip between hands: finish this hand first');
      const { transaction } = await this.economy.post({ ownerId: c.playerId, amount: -amount, type: 'tip', sourceId: npcId, idempotencyKey: key });
      const visitKey = casinoWeekKey(c);
      const outcome = applyTip(applyVisit(await this.stateOf(npcId), visitKey), amount, reference, visitKey, transaction.timestamp);
      await this.db.npcState.put(outcome.next);
      await this.log({ id: `rel:${npcId}:${tipId}`, npcId, at: transaction.timestamp, kind: 'tip', amount, delta: outcome.gain, txnId: transaction.id, visitKey });
      return { outcome, state: outcome.next, balance: transaction.balanceAfter, replayed: false, hooks: eligibleHooks(outcome.next) };
    });
  }

  async history(npcId: NpcId): Promise<RelationshipLogEntry[]> {
    return (await this.db.relationshipLog.where('[npcId+seq]').between([npcId, 0], [npcId, Infinity]).toArray()) as RelationshipLogEntry[];
  }
}
