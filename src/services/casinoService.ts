/**
 * Desert Palms Casino. Every chip that goes on the table is debited from the
 * ledger straight away (so walking away mid-hand can't undo a bet), and
 * winnings are credited when a round settles. Both use idempotency keys.
 * A payout can never exceed what the round could legally return.
 */
import { BJ_LIMITS } from '../casino/blackjack';
import { CRAPS_LIMITS } from '../casino/craps';
import { ROULETTE_LIMITS } from '../casino/roulette';
import type { MoniqueMemory } from '../casino/monique';
import {
  betBlocker as greyhoundBlocker, cardForPending, drawCard, HISTORY_SIZE, newCardSeed, newRaceSeed, priceCard, raceForPending, winReturn,
  type PendingRace, type RaceHistoryEntry, type RaceResult,
} from '../casino/greyhounds';
import { SLOT_BETS } from '../casino/slots';
import * as engine from '../career/engine';
import { CareerRuleError } from '../career/engine';
import type { CareerState } from '../career/types';
import { DomainError } from '../core/errors';
import { newId } from '../core/ids';
import type { AppDB } from '../persistence/db';
import type { CareerService } from './careerService';
import type { EconomyService } from './economyService';
import type { Notifier } from './notifier';

export type CasinoGame = 'blackjack' | 'slots' | 'craps' | 'roulette' | 'greyhounds';

/** Most a round can return per dollar wagered in it (roulette: straight up, 35 to 1 plus the stake). */
const MAX_RETURN: Record<CasinoGame, number> = { blackjack: 2.5, slots: 400, craps: 4, roulette: 36, greyhounds: 31 };

/** The greyhound race bet on and decided but not yet paid, if any (kept on the career so a reload can't lose it). */
export function pendingRace(c: CareerState): PendingRace | null {
  const raw = c.flags.greyhoundPending;
  if (typeof raw !== 'string' || !raw) return null;
  try {
    return JSON.parse(raw) as PendingRace;
  } catch {
    return null;
  }
}

const readJson = <T>(raw: unknown): T | null => {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

/** Today's greyhound race card (locked once dealt, until its race is run). Additive flag. */
export const currentGreyhoundCard = (c: CareerState) => readJson<{ seed: number; v: 2 }>(c.flags.greyhoundCard);
/** The last 10 greyhound races, newest first. Additive flag. */
export const greyhoundHistory = (c: CareerState) => readJson<RaceHistoryEntry[]>(c.flags.greyhoundHistory) ?? [];

export class CasinoService {
  constructor(
    private readonly db: AppDB,
    private readonly economy: EconomyService,
    private readonly career: CareerService,
    private readonly notifier: Notifier,
  ) {}

  /** Uses one weekly activity (free if already visited this week). */
  async visit() {
    return this.career.runStep((c) => engine.visitCasino(c));
  }

  newRoundId(game: CasinoGame) {
    return newId(`casino_${game}`);
  }

  private async open(): Promise<CareerState> {
    const c = await this.db.careers.get('career');
    if (!c) throw new DomainError('NO_PROFILE', 'No career found');
    if (c.flags.casinoVisit !== engine.casinoWeekKey(c)) throw new DomainError('CAREER_RULE', 'Visit the casino first (uses one activity)');
    if (c.active) throw new DomainError('CAREER_RULE', 'Finish your tournament first');
    return c;
  }

  /** Puts chips on the table. `part` distinguishes several stakes in one round. */
  async wager(game: CasinoGame, roundId: string, part: string, amount: number): Promise<number> {
    if (!Number.isInteger(amount) || amount <= 0) throw new DomainError('CAREER_RULE', 'Invalid bet');
    const max = game === 'blackjack' ? BJ_LIMITS.max * 2 : game === 'craps' ? CRAPS_LIMITS.max * 2 : game === 'roulette' ? ROULETTE_LIMITS.maxSpot : Math.max(...SLOT_BETS);
    if (amount > max) throw new DomainError('CAREER_RULE', 'Over the table limit');
    return this.db.transaction('rw', [...this.economy.tables, this.db.careers], async () => {
      const c = await this.open();
      const { replayed } = await this.economy.post({ ownerId: c.playerId, amount: -amount, type: 'casino', sourceId: roundId, idempotencyKey: `casino:${roundId}:bet:${part}` });
      if (!replayed) await this.db.careers.put(engine.recordCasino(c, amount, 0));
      return this.economy.getBalance(c.playerId);
    });
  }

  /**
   * Greyhounds: today's race card. Dealt once and saved on the career, so leaving the screen
   * or reloading never rerolls the dogs or the odds; a new card is dealt only after its race
   * is run. A new field is never the same six dogs as the last one.
   */
  async dealGreyhoundCard(): Promise<{ seed: number; v: 2 }> {
    return this.db.transaction('rw', [this.db.careers], async () => {
      const c = await this.open();
      const held = currentGreyhoundCard(c);
      if (held) return held;
      const last = readJson<string[]>(c.flags.greyhoundLastField) ?? [];
      const card = { seed: newCardSeed(last), v: 2 as const };
      await this.db.careers.put({ ...c, flags: { ...c.flags, greyhoundCard: JSON.stringify(card) } });
      return card;
    });
  }

  /**
   * Greyhounds: places a win bet on a trap of today's card and decides the race in the same
   * step. The stake is debited once; the race seed is drawn here and saved with the bet, so
   * the result is fixed before the dogs leave the boxes and survives a reload. Odds are the
   * card's locked odds (re-priced from its seed, never re-rolled).
   */
  async startGreyhoundRace(cardSeed: number, trap: number, stake: number): Promise<PendingRace> {
    if (!Number.isInteger(trap) || trap < 0 || trap > 5) throw new DomainError('CAREER_RULE', 'Pick a dog');
    if (!Number.isInteger(cardSeed) || cardSeed < 0) throw new DomainError('CAREER_RULE', 'Unknown race card');
    const card = priceCard(drawCard(cardSeed));
    return this.db.transaction('rw', [...this.economy.tables, this.db.careers], async () => {
      const c = await this.open();
      if (pendingRace(c)) throw new DomainError('CAREER_RULE', 'A race is already running');
      const held = currentGreyhoundCard(c);
      if (!held || held.seed !== cardSeed) throw new DomainError('CAREER_RULE', 'That race card is no longer open');
      const block = greyhoundBlocker(stake, await this.economy.getBalance(c.playerId));
      if (block) throw new DomainError('CAREER_RULE', block);
      const pending: PendingRace = { roundId: newId('casino_greyhounds'), cardSeed, raceSeed: newRaceSeed(), trap, stake, odds: card.odds[trap], v: 2 };
      await this.economy.post({ ownerId: c.playerId, amount: -stake, type: 'casino', sourceId: pending.roundId, idempotencyKey: `casino:${pending.roundId}:bet:win` });
      const next = engine.recordCasino(c, stake, 0);
      next.flags.greyhoundPending = JSON.stringify(pending);
      await this.db.careers.put(next);
      return pending;
    });
  }

  /**
   * Runs the saved race and pays a winning bet, once. Calling it again (a replay, a second tab,
   * a reload after paying) changes nothing and returns null. Closes today's card and adds the
   * race to the recent-races board.
   */
  async finishGreyhoundRace(roundId: string): Promise<{ pending: PendingRace; result: RaceResult; payout: number } | null> {
    const unlocked: string[] = [];
    const out = await this.db.transaction('rw', [...this.economy.tables, this.db.careers], async () => {
      const c = await this.db.careers.get('career');
      if (!c) throw new DomainError('NO_PROFILE', 'No career found');
      const pending = pendingRace(c);
      if (!pending || pending.roundId !== roundId) return null;
      const dogs = cardForPending(pending).dogs;
      const result = raceForPending(pending);
      const payout = result.order[0] === pending.trap ? winReturn(pending.stake, pending.odds) : 0;
      if (payout > pending.stake * MAX_RETURN.greyhounds) throw new DomainError('CAREER_RULE', 'Payout exceeds what this race can return');
      let next = { ...c, flags: { ...c.flags } };
      delete next.flags.greyhoundPending;
      delete next.flags.greyhoundCard;
      next.flags.greyhoundLastField = JSON.stringify(dogs.map((d) => d.id));
      const entry: RaceHistoryEntry = {
        roundId, season: c.season, week: c.week,
        order: result.order.map((trap) => ({ name: dogs[trap].name, trap, time: Math.round(result.times[trap] * 100) / 100 })),
        pick: { name: dogs[pending.trap].name, trap: pending.trap },
        stake: pending.stake, odds: pending.odds, payout,
      };
      next.flags.greyhoundHistory = JSON.stringify([entry, ...greyhoundHistory(c)].slice(0, HISTORY_SIZE));
      if (payout > 0) {
        await this.economy.post({ ownerId: c.playerId, amount: payout, type: 'casino', sourceId: roundId, idempotencyKey: `casino:${roundId}:pay:win` });
        const o = engine.withAchievements({ career: engine.recordCasino(next, 0, payout, { biggestWin: payout - pending.stake }), money: [] });
        unlocked.push(...(o.unlocked ?? []));
        next = o.career;
      }
      await this.db.careers.put(next);
      return { pending, result, payout };
    });
    for (const id of unlocked) {
      const name = id === 'high_roller' ? 'High Roller' : id === 'jackpot' ? 'Jackpot!' : id;
      this.notifier.emit({ kind: 'info', title: `Achievement: ${name}`, refId: `ach:${id}` });
    }
    return out;
  }

  /** Saves Madame Monique's memory of Ryan (streaks, visits, what she has remarked on). Additive: one flag. */
  async saveMonique(mem: MoniqueMemory): Promise<void> {
    await this.db.transaction('rw', [this.db.careers], async () => {
      const c = await this.db.careers.get('career');
      if (!c) throw new DomainError('NO_PROFILE', 'No career found');
      await this.db.careers.put({ ...c, flags: { ...c.flags, moniqueMemory: JSON.stringify(mem) } });
    });
  }

  /** Pays a settled round (stake included). Zero is fine and records nothing. */
  async settle(game: CasinoGame, roundId: string, part: string, amount: number, opts: { jackpot?: boolean } = {}): Promise<number> {
    if (!Number.isInteger(amount) || amount < 0) throw new DomainError('CAREER_RULE', 'Invalid payout');
    const unlocked: string[] = [];
    const balance = await this.db.transaction('rw', [...this.economy.tables, this.db.careers], async () => {
      const c = await this.db.careers.get('career');
      if (!c) throw new DomainError('NO_PROFILE', 'No career found');
      if (amount === 0) return this.economy.getBalance(c.playerId);
      const txs = await this.db.ledger.where('ownerId').equals(c.playerId).filter((t) => t.sourceId === roundId).toArray();
      const wagered = -txs.filter((t) => t.amount < 0).reduce((a, t) => a + t.amount, 0);
      const paid = txs.filter((t) => t.amount > 0).reduce((a, t) => a + t.amount, 0);
      const key = `casino:${roundId}:pay:${part}`;
      if (await this.db.ledger.where('idempotencyKey').equals(key).count()) return this.economy.getBalance(c.playerId);
      if (wagered === 0) throw new DomainError('CAREER_RULE', 'No bet for this round');
      if (paid + amount > Math.ceil(wagered * MAX_RETURN[game])) throw new DomainError('CAREER_RULE', 'Payout exceeds what this round can return');
      await this.economy.post({ ownerId: c.playerId, amount, type: 'casino', sourceId: roundId, idempotencyKey: key });
      const win = amount - wagered;
      const next = engine.withAchievements({ career: engine.recordCasino(c, 0, amount, { jackpot: opts.jackpot, biggestWin: win }), money: [] });
      unlocked.push(...(next.unlocked ?? []));
      await this.db.careers.put(next.career);
      return this.economy.getBalance(c.playerId);
    });
    for (const id of unlocked) {
      const name = id === 'jackpot' ? 'Jackpot!' : id === 'high_roller' ? 'High Roller' : id;
      this.notifier.emit({ kind: 'info', title: `Achievement: ${name}`, refId: `ach:${id}` });
    }
    return balance;
  }
}

export { CareerRuleError };
