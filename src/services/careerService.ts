/**
 * Career lifecycle, the weekly RPG loop and read models for the UI.
 *
 * Every mutation runs one pure engine function (src/career/engine.ts) inside
 * a single IndexedDB transaction that also posts the money it produced, so
 * career state and the ledger always move together.
 */
import { phaseOf } from '../story/phase';
import { settleSports } from '../career/sportsbook';
import type { UnlockRecord } from '../expansion/unlocks';
import type { LocationState, NpcState } from '../npc/types';
import { achievementById } from '../career/achievements';
import { gameDate, PLAYER_ID, PLAYER_NAME, START_MONEY } from '../career/config';
import { reconcileFieldPools } from '../career/field';
import * as engine from '../career/engine';
import { CareerRuleError, type ActionId, type Outcome } from '../career/engine';
import { activeCourse, completeRound, finalizeTournament, findTournament, type TournamentResult } from '../career/tournament';
import { albatrossId, isAlbatross } from '../records/albatross';
import type { Appearance } from '../story/types';
import type { CareerState, RoundMode, StatKey } from '../career/types';
import { getPropertyDefinition, STARTER_PAD_ID, type PropertyDefinition } from '../catalog/properties';
import { DomainError } from '../core/errors';
import { CAREER_START_GAME_TIME } from '../core/ids';
import type {
  CareerEvent,
  EconomyTransaction,
  FurnitureInstance,
  PlayerId,
  PlayerProfile,
  Property,
  TrophyInstance,
  TrophyPlacement,
} from '../core/types';
import type { AppDB } from '../persistence/db';
import type { TournamentRecord } from '../persistence/records';
import { validateRow } from '../persistence/schemas';
import type { EconomyService } from './economyService';
import type { Notifier } from './notifier';
import { buildTournamentEvent, type ProcessOutcome, type TournamentPipeline } from './tournamentPipeline';

export function homePropertyId(ownerId: PlayerId) {
  return `property:${ownerId}:home`;
}

export interface ClubhouseState {
  profile: PlayerProfile;
  balance: number;
  transactions: EconomyTransaction[];
  property: Property;
  propertyDef: PropertyDefinition;
  furniture: FurnitureInstance[];
  trophies: TrophyInstance[];
  placements: TrophyPlacement[];
  career: CareerState;
  /** Casino Secrets & Rivalries: unlocks, peak bankroll, dealer relationships, lobby state. */
  expansion: ExpansionView;
}

export interface ExpansionView {
  unlocks: UnlockRecord[];
  peakBalance: number;
  npcs: NpcState[];
  locations: LocationState[];
}

export interface TrophyHistory {
  trophy: TrophyInstance;
  tournament: TournamentRecord | null;
  careerEvent: CareerEvent | null;
}

export class CareerService {
  constructor(
    private readonly db: AppDB,
    private readonly economy: EconomyService,
    private readonly notifier: Notifier,
    private readonly pipeline: TournamentPipeline,
  ) {}

  /** Creates Ryan's career if none exists. Safe to call repeatedly. */
  async ensureCareer(playerId: PlayerId = PLAYER_ID, seed = 2027): Promise<void> {
    await this.db.transaction('rw', [...this.economy.tables, this.db.properties, this.db.careers], async () => {
      if (await this.db.profiles.get(playerId)) return;
      await this.db.profiles.add({ id: playerId, displayName: PLAYER_NAME, createdAtReal: new Date().toISOString(), careerClock: CAREER_START_GAME_TIME, ledgerSeq: 0 });
      await this.db.properties.add({ id: homePropertyId(playerId), ownerId: playerId, propertyDefinitionId: STARTER_PAD_ID, unlockedAt: CAREER_START_GAME_TIME, layoutVersion: 0 });
      await this.db.careers.put({ ...engine.newCareerState(seed), playerId });
      await this.economy.post({ ownerId: playerId, amount: START_MONEY, type: 'career_start_grant', sourceId: 'new_career', idempotencyKey: `career_start:${playerId}` });
    });
  }

  /** Loads and validates everything the game UI needs. */
  async loadClubhouse(playerId: PlayerId = PLAYER_ID): Promise<ClubhouseState> {
    return this.db.transaction('r', this.db.allTables, async () => {
      const profileRow = await this.db.profiles.get(playerId);
      if (!profileRow) throw new DomainError('NO_PROFILE', 'No career found');
      const profile = validateRow('profiles', profileRow);
      await this.economy.verifyIntegrity(playerId);
      const property = validateRow('properties', await this.db.properties.get(homePropertyId(playerId)));
      const furniture = (await this.db.furniture.where('ownerId').equals(playerId).toArray()).map((r) => validateRow('furniture', r));
      const trophies = (await this.db.trophies.where('ownerId').equals(playerId).toArray()).map((r) => validateRow('trophies', r) as TrophyInstance);
      const trophyIds = new Set(trophies.map((t) => t.id));
      const placements = (await this.db.trophyPlacements.toArray()).map((r) => validateRow('trophyPlacements', r)).filter((p) => trophyIds.has(p.trophyInstanceId));
      const career = validateRow('careers', await this.db.careers.get('career')) as unknown as CareerState;
      trophies.sort((a, b) => a.earnedAt.localeCompare(b.earnedAt));
      const expansion: ExpansionView = {
        unlocks: (await this.db.unlocks.where('ownerId').equals(playerId).toArray()).map((r) => validateRow('unlocks', r) as UnlockRecord),
        peakBalance: (await this.db.milestones.get(playerId))?.peakBalance ?? 0,
        npcs: (await this.db.npcState.toArray()).map((r) => validateRow('npcState', r) as NpcState),
        locations: (await this.db.locationState.toArray()).map((r) => validateRow('locationState', r) as LocationState),
      };
      return {
        profile,
        balance: await this.economy.getBalance(playerId),
        transactions: await this.economy.listTransactions(playerId),
        property,
        propertyDef: getPropertyDefinition(property.propertyDefinitionId),
        furniture,
        trophies,
        placements,
        career,
        expansion,
      };
    });
  }

  /**
   * Older saves: men's fields for the Amateur Circuit and SoCal Pro Series, Kayla on the women's
   * tours, and a women's Q-School pool (see reconcileFieldPools). Names only: ids, ratings,
   * results and money are untouched. Returns true when the save was updated.
   */
  async reconcileFields(): Promise<boolean> {
    return this.db.transaction('rw', this.db.careers, async () => {
      const c = await this.db.careers.get('career');
      if (!c) return false;
      const next = reconcileFieldPools(c.pools, Number(c.flags?.seed ?? 0), 'current', phaseOf(c));
      if (!next) return false;
      await this.db.careers.put({ ...c, pools: next });
      return true;
    });
  }

  async getCareer(): Promise<CareerState> {
    const c = await this.db.careers.get('career');
    if (!c) throw new DomainError('NO_PROFILE', 'No career found');
    return c;
  }

  /** Historical record behind a trophy, straight from stored records. */
  async getTrophyHistory(trophyId: string): Promise<TrophyHistory> {
    const trophy = await this.db.trophies.get(trophyId);
    if (!trophy) throw new DomainError('NOT_OWNED', 'Trophy not found');
    const t = await this.db.tournaments.get(trophy.sourceTournamentId);
    const e = await this.db.careerEvents.get(trophy.sourceCareerEventId);
    return {
      trophy: validateRow('trophies', trophy) as TrophyInstance,
      tournament: t ? (validateRow('tournaments', t) as unknown as TournamentRecord) : null,
      careerEvent: e ? (validateRow('careerEvents', e) as CareerEvent) : null,
    };
  }

  async getTournament(id: string): Promise<TournamentRecord | null> {
    return (await this.db.tournaments.get(id)) ?? null;
  }

  async listTournaments(season?: number): Promise<TournamentRecord[]> {
    const rows = season === undefined ? await this.db.tournaments.toArray() : await this.db.tournaments.where('season').equals(season).toArray();
    return rows.sort((a, b) => a.def.season - b.def.season || a.def.week - b.def.week);
  }

  // ───────────────────────── Mutations ─────────────────────────

  /**
   * Runs one engine step atomically: reads career + balance + home, computes
   * the outcome, posts its money, saves the career and advances the clock.
   */
  private async mutate(
    step: (c: CareerState, ctx: { balance: number; home: PropertyDefinition }) => Outcome,
    extra?: (o: Outcome) => Promise<void>,
  ): Promise<Outcome> {
    const outcome = await this.db.transaction('rw', [...this.economy.tables, this.db.careers, this.db.properties], async () => {
      const c = await this.getCareer();
      const balance = await this.economy.getBalance(c.playerId);
      const prop = await this.db.properties.get(homePropertyId(c.playerId));
      const home = getPropertyDefinition(prop?.propertyDefinitionId ?? STARTER_PAD_ID);
      let o: Outcome;
      try {
        o = engine.withAchievements(step(c, { balance, home }), { homeTier: home.tier });
      } catch (e) {
        if (e instanceof CareerRuleError) throw new DomainError('CAREER_RULE', e.message);
        throw e;
      }
      for (const op of o.money) {
        await this.economy.post({ ownerId: c.playerId, amount: op.amount, type: op.type, sourceId: op.sourceId, idempotencyKey: op.key });
      }
      await this.db.careers.put(o.career);
      const clock = gameDate(o.career.season, o.career.week);
      const profile = await this.db.profiles.get(c.playerId);
      if (profile && clock > profile.careerClock) await this.db.profiles.update(c.playerId, { careerClock: clock });
      await extra?.(o);
      return o;
    });
    for (const id of outcome.unlocked ?? []) {
      const a = achievementById(id);
      this.notifier.emit({ kind: 'info', title: `Achievement: ${a?.name ?? id}`, body: a?.description, refId: `ach:${id}` });
    }
    return outcome;
  }

  /** Runs any engine step atomically (used by the casino). */
  runStep(step: (c: CareerState) => Outcome) {
    return this.mutate((c) => step(c));
  }

  doAction(id: ActionId) {
    return this.mutate((c) => engine.doAction(c, id));
  }

  spendSkillPoint(stat: StatKey) {
    return this.mutate((c) => engine.spendSkillPoint(c, stat));
  }

  turnPro() {
    return this.mutate((c) => engine.turnPro(c));
  }

  buyGear(itemId: string) {
    return this.mutate((c, { balance }) => engine.buyGear(c, itemId, balance));
  }

  /** Baba's one-time $500 loan (only when the bank is under $100). */
  askBabaLoan() {
    return this.mutate((c, { balance }) => engine.askBabaLoan(c, balance));
  }

  /** Pays Baba's loan back (optional). */
  repayBabaLoan() {
    return this.mutate((c, { balance }) => engine.repayBabaLoan(c, balance));
  }

  buyLifestyle(itemId: string) {
    return this.mutate((c, { balance }) => engine.buyLifestyle(c, itemId, balance));
  }

  rytire() {
    return this.mutate((c) => engine.rytire(c));
  }

  recordMuniRound(strokes: number[]) {
    return this.mutate((c) => engine.recordMuniRound(c, strokes));
  }

  buySnack(itemId: string) {
    return this.mutate((c, { balance }) => engine.buySnack(c, itemId, balance));
  }

  /** Advances the week, then settles any sportsbook tickets whose games are now final (same transaction). */
  async advanceWeek() {
    let settled = 0;
    const o = await this.mutate((c, { balance, home }) => {
      const s = settleSports(engine.advanceWeek(c, { balance, livingCost: home.livingCost, homeEnergy: home.energyBonus }));
      settled = s.settledTickets.length;
      return s;
    });
    if (settled) this.notifier.emit({ kind: 'info', title: `Sportsbook: ${settled} ticket${settled > 1 ? 's' : ''} settled`, body: 'Results are in your Inbox.', refId: `sb:${o.career.season}:${o.career.week}` });
    return o;
  }

  resolveStory(choice: number) {
    return this.mutate((c, { balance }) => engine.resolveStory(c, choice, balance));
  }

  /**
   * Applies a finished encounter. Runs in one transaction with the ledger, and
   * the engine refuses an encounter that's already completed, so a double
   * click or a replayed request can't pay out or charge twice.
   */
  async resolveEncounter(id: string, path: string[]): Promise<Outcome & { outcomeId?: string }> {
    let outcomeId: string | undefined;
    const out = await this.mutate((c, { balance }) => {
      const r = engine.resolveEncounter(c, id, path, balance);
      outcomeId = r.outcomeId;
      return r;
    });
    return { ...out, outcomeId };
  }

  setAppearance(a: Appearance) {
    return this.mutate((c) => engine.setAppearance(c, a));
  }

  /** Moves to a better home (clubhouse level). Furniture stays where it is. */
  buyHome(propertyDefinitionId: string) {
    const target = getPropertyDefinition(propertyDefinitionId);
    return this.mutate(
      (c, { balance, home }) => {
        if (target.tier <= home.tier) throw new CareerRuleError('You already live somewhere at least this nice');
        if (c.fame < target.minFame) throw new CareerRuleError(`Needs ${target.minFame} fame`);
        if (balance < target.price) throw new CareerRuleError('Not enough money');
        const career = structuredClone(c);
        career.inbox = [
          { id: `msg_home_${target.id}`, at: gameDate(c.season, c.week), title: `Welcome home: ${target.name}`, body: target.theme, tone: 'good' as const },
          ...career.inbox,
        ].slice(0, 40);
        return engine.withAchievements(
          { career, money: [{ amount: -target.price, type: 'home_purchase', sourceId: target.id, key: `home:${target.id}` }], message: `Moved into ${target.name}` },
          { homeTier: target.tier },
        );
      },
      async () => {
        const prop = await this.db.properties.get(homePropertyId(PLAYER_ID));
        if (prop) await this.db.properties.update(prop.id, { propertyDefinitionId: target.id, layoutVersion: prop.layoutVersion + 1 });
      },
    );
  }

  // ───────────────────────── Tournaments ─────────────────────────

  enterTournament(tournamentId: string, mode: RoundMode) {
    const def = findTournament(tournamentId);
    if (!def) throw new DomainError('CAREER_RULE', 'Unknown tournament');
    return this.mutate((c, { balance }) => engine.enterTournament(c, def, mode, balance));
  }

  withdraw() {
    return this.mutate((c) => engine.withdraw(c));
  }

  /** Records strokes for a hole Ryan played himself in the current round. */
  async recordHole(holeIndex: number, strokes: number, shot?: string): Promise<CareerState> {
    return this.db.transaction('rw', this.db.careers, async () => {
      const c = await this.getCareer();
      if (!c.active) throw new DomainError('CAREER_RULE', 'Not in a tournament');
      if (!Number.isInteger(strokes) || strokes < 1 || strokes > 15) throw new DomainError('CAREER_RULE', 'Invalid score');
      const next = structuredClone(c);
      next.active!.playerHoles[holeIndex] = strokes;
      // Keep how an albatross was holed, for the record book (cosmetic only).
      const par = activeCourse(next.active!).holes[holeIndex]?.par;
      if (shot && par !== undefined && isAlbatross(par, strokes)) {
        const id = albatrossId(next.active!.tournamentId, next.playerId, next.active!.round + 1, holeIndex + 1);
        next.shotNotes = { ...(next.shotNotes ?? {}), [id]: shot.slice(0, 120) };
      }
      await this.db.careers.put(next);
      return next;
    });
  }

  /** Changes how the remaining rounds are played (e.g. sim the rest). */
  async setMode(mode: RoundMode): Promise<void> {
    await this.db.transaction('rw', this.db.careers, async () => {
      const c = await this.getCareer();
      if (!c.active) return;
      await this.db.careers.put({ ...c, active: { ...c.active, mode } });
    });
  }

  /**
   * Simulates the rest of the current round (the field, plus any holes Ryan
   * didn't play), applies the cut, and finalizes the tournament after the
   * last round.
   */
  async finishRound(): Promise<{ career: CareerState; outcome?: ProcessOutcome; result?: TournamentResult }> {
    const career = await this.db.transaction('rw', this.db.careers, async () => {
      const c = await this.getCareer();
      if (!c.active) throw new DomainError('CAREER_RULE', 'Not in a tournament');
      const def = findTournament(c.active.tournamentId)!;
      if (c.active.round >= def.rounds) return c;
      let next: CareerState = { ...c, active: completeRound(c.active, def, c) };
      // Missed the cut: the rest of the tournament plays out without Ryan.
      while (!next.active!.alive.includes(c.playerId) && next.active!.round < def.rounds) next.active = completeRound(next.active!, def, next);
      // Between rounds: a story scene may be waiting for this tournament.
      if (next.active!.round < def.rounds && next.active!.alive.includes(c.playerId)) next = engine.offerStoryNow(next);
      await this.db.careers.put(next);
      return next;
    });
    const def = findTournament(career.active!.tournamentId)!;
    if (career.active!.round < def.rounds) return { career };
    return this.finalizeActive();
  }

  /** Seals the finished tournament and sends it through the pipeline. */
  async finalizeActive(): Promise<{ career: CareerState; outcome?: ProcessOutcome; result?: TournamentResult }> {
    const c = await this.getCareer();
    if (!c.active) return { career: c };
    const def = findTournament(c.active.tournamentId)!;
    const result = finalizeTournament(c.active, def, c.playerId);
    const outcome = await this.pipeline.process(buildTournamentEvent(result));
    if (outcome.status === 'rejected') {
      // Never leave the player stuck in a tournament the pipeline refused.
      await this.db.careers.put({ ...(await this.getCareer()), active: null });
    }
    // A scene that follows a tournament (e.g. Championship Sunday) is offered straight away.
    await this.db.transaction('rw', this.db.careers, async () => {
      const after = await this.getCareer();
      if (!after.active && after.story?.act === 4) await this.db.careers.put(engine.offerStoryNow(after));
    });
    return { career: await this.getCareer(), outcome, result };
  }
}
