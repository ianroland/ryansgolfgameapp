/**
 * Desert Palms Casino. Every chip that goes on the table is debited from the
 * ledger straight away (so walking away mid-hand can't undo a bet), and
 * winnings are credited when a round settles. Both use idempotency keys.
 * A payout can never exceed what the round could legally return.
 */
import { BJ_LIMITS } from '../casino/blackjack';
import {
  addBet, betBlocker as crapsBlocker, canTakeDown, costOf, CRAPS_LIMITS, MAX_ROLL_RETURN, onTable, readTable, resolveRoll, rollDice, takeDown,
  type BetOutcome as CrapsOutcome, type CrapsAction, type CrapsTable,
} from '../casino/craps';
import { ROULETTE_LIMITS } from '../casino/roulette';
import type { MoniqueMemory } from '../casino/monique';
import {
  betBlocker as greyhoundBlocker, cardForPending, drawCard, HISTORY_SIZE, newCardSeed, newRaceSeed, priceCard, raceForPending, winReturn,
  type PendingRace, type RaceHistoryEntry, type RaceResult,
} from '../casino/greyhounds';
import { SLOT_BETS } from '../casino/slots';
import {
  betBlocker as baccaratBlocker, dealFromShoe, freshShoe, HISTORY_SIZE as BACCARAT_HISTORY, needsShuffle, totalReturn, totalStaked,
  type BaccaratBets, type BaccaratHand, type BaccaratHistoryEntry, type ShoeState,
} from '../casino/baccarat';
import { betBlocker as threeCardBlocker, newDeck, settle3, type PendingThreeCard, type ThreeCardResult } from '../casino/threeCard';
import { betBlocker as vpBlocker, dealVP, settleVP, VP_MAX_RETURN, vpStake, type PendingVideoPoker, type VideoPokerResult } from '../casino/videoPoker';
import { betBlocker as wheelBlocker, settleWheel, spinSlot, WHEEL_MAX_RETURN, type WheelBets, type WheelResult } from '../casino/wheel';
import { betBlocker as kenoBlocker, drawBalls, KENO_MAX_RETURN, settleKeno, type KenoResult } from '../casino/keno';
import * as engine from '../career/engine';
import { locationById } from '../expansion/locations';
import type { LocationId } from '../expansion/unlocks';
import { CareerRuleError } from '../career/engine';
import type { CareerState } from '../career/types';
import { DomainError } from '../core/errors';
import { newId } from '../core/ids';
import type { AppDB } from '../persistence/db';
import type { CareerService } from './careerService';
import type { EconomyService } from './economyService';
import type { Notifier } from './notifier';

export type CasinoGame = 'blackjack' | 'slots' | 'craps' | 'roulette' | 'greyhounds' | 'baccarat' | 'threecard' | 'videopoker' | 'keno' | 'wheel';

/** Most a round can return per dollar wagered in it (roulette: straight up, 35 to 1 plus the stake). */
const MAX_RETURN: Record<CasinoGame, number> = { blackjack: 2.5, slots: 400, craps: 4, roulette: 36, greyhounds: 31, baccarat: 9, threecard: 41, videopoker: VP_MAX_RETURN, keno: KENO_MAX_RETURN, wheel: WHEEL_MAX_RETURN };

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

/** The baccarat shoe in play (additive flag). Null until the first hand, or if unreadable (a fresh shoe is shuffled). */
export const baccaratShoe = (c: CareerState) => readJson<ShoeState>(c.flags.baccaratShoe);
/** The last 20 baccarat outcomes, newest first (additive flag). */
export const baccaratHistory = (c: CareerState) => readJson<BaccaratHistoryEntry[]>(c.flags.baccaratHistory) ?? [];
/** The Three Card Poker hand dealt and waiting for Play or Fold, if any (additive flag; survives a reload). */
export const pendingThreeCard = (c: CareerState) => readJson<PendingThreeCard>(c.flags.threeCardPending);
/** The video poker hand dealt and waiting for holds, if any (additive flag; survives a reload). */
export const pendingVideoPoker = (c: CareerState) => readJson<PendingVideoPoker>(c.flags.videoPokerPending);
/** The craps table: every bet riding on it, the point and the last roll (additive flag; survives a reload). */
export const crapsTable = (c: CareerState) => readTable(c.flags.crapsTable);
export interface CrapsLastRoll { dice: [number, number]; message: string; outcomes: CrapsOutcome[]; n: number }
export const crapsLast = (c: CareerState) => readJson<CrapsLastRoll>(c.flags.crapsLast);

/** Spin to Win: the last spins, newest first (slot and symbol; additive flag), and the last spin in full. */
export interface WheelHistoryEntry { slot: number; symbol: string }
export const wheelHistory = (c: CareerState) => readJson<WheelHistoryEntry[]>(c.flags.wheelHistory) ?? [];
export const wheelLast = (c: CareerState) => readJson<WheelResult & { roundId: string }>(c.flags.wheelLast);
export const WHEEL_HISTORY = 20;

/** The last keno draws, newest first (additive flag): each game's twenty balls. */
export const kenoHistory = (c: CareerState) => readJson<number[][]>(c.flags.kenoHistory) ?? [];
export const KENO_HISTORY = 10;

export interface BaccaratRound {
  roundId: string;
  hand: BaccaratHand;
  bets: BaccaratBets;
  staked: number;
  payout: number;
  /** A new shoe was shuffled before this hand (the cut card had come out). */
  shuffled: boolean;
  /** The cut card came out during this hand: the next hand starts a new shoe. */
  cutCardOut: boolean;
  shoeNo: number;
}

/** Today's greyhound race card (locked once dealt, until its race is run). Additive flag. */
export const currentGreyhoundCard = (c: CareerState) => readJson<{ seed: number; v: 2 }>(c.flags.greyhoundCard);
/** The last 10 greyhound races, newest first. Additive flag. */
export const greyhoundHistory = (c: CareerState) => readJson<RaceHistoryEntry[]>(c.flags.greyhoundHistory) ?? [];

/** The ledger source id for the bets on the craps table now (a new one once the table clears). */
const crapsSession = (c: CareerState) => (typeof c.flags.crapsSession === 'string' && c.flags.crapsSession ? c.flags.crapsSession : newId('casino_craps'));

export class CasinoService {
  constructor(
    private readonly db: AppDB,
    private readonly economy: EconomyService,
    private readonly career: CareerService,
    private readonly notifier: Notifier,
  ) {}

  /**
   * A night at a casino: uses one weekly activity (free if already in a casino this week, which
   * also lets Ryan move between casinos). A casino other than Desert Palms must be unlocked.
   */
  async visit(at: LocationId = 'desert_palms') {
    const loc = locationById(at);
    if (loc.status !== 'open') throw new DomainError('CAREER_RULE', `${loc.name} isn't open yet`);
    if (loc.unlock && !(await this.db.unlocks.get(loc.unlock))) throw new DomainError('CAREER_RULE', `${loc.name} is still locked`);
    return this.career.runStep((c) => engine.visitCasino(c, at));
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

  /**
   * Baccarat: one coup, start to finish, in a single step. The stake is debited once and the
   * return credited once inside the same transaction, so a reload, a double click or a
   * second tab can never take or pay a hand twice. The shoe is saved on the career (the cut
   * card ends it; the next hand shuffles a fresh 8-deck shoe).
   */
  async playBaccarat(bets: BaccaratBets): Promise<BaccaratRound> {
    const clean: BaccaratBets = {};
    for (const k of ['player', 'banker', 'tie'] as const) if ((bets[k] ?? 0) > 0) clean[k] = bets[k];
    const unlocked: string[] = [];
    const out = await this.db.transaction('rw', [...this.economy.tables, this.db.careers], async () => {
      const c = await this.open();
      const block = baccaratBlocker(clean, await this.economy.getBalance(c.playerId));
      if (block) throw new DomainError('CAREER_RULE', block);
      let shoe = baccaratShoe(c);
      const shuffled = needsShuffle(shoe);
      if (shuffled) shoe = freshShoe((shoe?.n ?? 0) + 1).shoe;
      const { hand, shoe: after } = dealFromShoe(shoe!);
      const staked = totalStaked(clean);
      const payout = totalReturn(clean, hand.outcome);
      if (payout > staked * MAX_RETURN.baccarat) throw new DomainError('CAREER_RULE', 'Payout exceeds what this hand can return');
      const roundId = newId('casino_baccarat');
      await this.economy.post({ ownerId: c.playerId, amount: -staked, type: 'casino', sourceId: roundId, idempotencyKey: `casino:${roundId}:bet:main` });
      if (payout > 0) await this.economy.post({ ownerId: c.playerId, amount: payout, type: 'casino', sourceId: roundId, idempotencyKey: `casino:${roundId}:pay:main` });
      let next = engine.recordCasino(c, staked, payout, { biggestWin: payout - staked });
      const entry: BaccaratHistoryEntry = { o: hand.outcome, p: hand.playerTotal, b: hand.bankerTotal, ...(hand.natural ? { nat: true } : {}) };
      next.flags.baccaratShoe = JSON.stringify(after);
      next.flags.baccaratHistory = JSON.stringify([entry, ...baccaratHistory(c)].slice(0, BACCARAT_HISTORY));
      if (payout > staked) {
        const o = engine.withAchievements({ career: next, money: [] });
        unlocked.push(...(o.unlocked ?? []));
        next = o.career;
      }
      await this.db.careers.put(next);
      return { roundId, hand, bets: clean, staked, payout, shuffled, cutCardOut: needsShuffle(after), shoeNo: after.n };
    });
    this.announce(unlocked);
    return out;
  }

  /**
   * Three Card Poker: puts the Ante (and Pair Plus, if any) down and deals both hands from a
   * freshly shuffled deck. The hand is saved on the career, so a reload comes back to the same
   * cards waiting for Play or Fold. The bank must cover the Play bet too.
   */
  async startThreeCard(ante: number, pairPlus: number): Promise<PendingThreeCard> {
    return this.db.transaction('rw', [...this.economy.tables, this.db.careers], async () => {
      const c = await this.open();
      if (pendingThreeCard(c)) throw new DomainError('CAREER_RULE', 'Finish the hand on the table first');
      const block = threeCardBlocker(ante, pairPlus, await this.economy.getBalance(c.playerId));
      if (block) throw new DomainError('CAREER_RULE', block);
      const deck = newDeck();
      const pending: PendingThreeCard = { roundId: newId('casino_threecard'), ante, pairPlus, player: deck.slice(0, 3), dealer: deck.slice(3, 6), v: 1 };
      await this.economy.post({ ownerId: c.playerId, amount: -ante, type: 'casino', sourceId: pending.roundId, idempotencyKey: `casino:${pending.roundId}:bet:ante` });
      if (pairPlus > 0) await this.economy.post({ ownerId: c.playerId, amount: -pairPlus, type: 'casino', sourceId: pending.roundId, idempotencyKey: `casino:${pending.roundId}:bet:pairplus` });
      const next = engine.recordCasino(c, ante + pairPlus, 0);
      next.flags.threeCardPending = JSON.stringify(pending);
      await this.db.careers.put(next);
      return pending;
    });
  }

  /**
   * Plays (puts down a Play bet equal to the Ante) or folds the saved hand, then settles every
   * bet once. Calling it again for the same hand changes nothing and returns null.
   */
  async finishThreeCard(roundId: string, play: boolean): Promise<{ pending: PendingThreeCard; result: ThreeCardResult; staked: number } | null> {
    const unlocked: string[] = [];
    const out = await this.db.transaction('rw', [...this.economy.tables, this.db.careers], async () => {
      const c = await this.db.careers.get('career');
      if (!c) throw new DomainError('NO_PROFILE', 'No career found');
      const pending = pendingThreeCard(c);
      if (!pending || pending.roundId !== roundId) return null;
      if (play) {
        if ((await this.economy.getBalance(c.playerId)) < pending.ante) throw new DomainError('CAREER_RULE', 'Not enough chips for the Play bet');
        await this.economy.post({ ownerId: c.playerId, amount: -pending.ante, type: 'casino', sourceId: roundId, idempotencyKey: `casino:${roundId}:bet:play` });
      }
      const result = settle3(pending.player, pending.dealer, pending.ante, pending.pairPlus, play);
      const staked = pending.ante + pending.pairPlus + (play ? pending.ante : 0);
      if (result.total > staked * MAX_RETURN.threecard) throw new DomainError('CAREER_RULE', 'Payout exceeds what this hand can return');
      if (result.total > 0) await this.economy.post({ ownerId: c.playerId, amount: result.total, type: 'casino', sourceId: roundId, idempotencyKey: `casino:${roundId}:pay:main` });
      let next = engine.recordCasino(c, play ? pending.ante : 0, result.total, { biggestWin: result.total - staked });
      delete next.flags.threeCardPending;
      if (result.total > staked) {
        const o = engine.withAchievements({ career: next, money: [] });
        unlocked.push(...(o.unlocked ?? []));
        next = o.career;
      }
      await this.db.careers.put(next);
      return { pending, result, staked };
    });
    this.announce(unlocked);
    return out;
  }

  /**
   * Video poker: takes the bet and deals five cards from a freshly shuffled deck. The hand is
   * saved on the career, so a reload comes back to the same cards waiting for holds. The
   * replacement cards are only drawn when the player draws.
   */
  async startVideoPoker(denom: number, coins: number): Promise<PendingVideoPoker> {
    return this.db.transaction('rw', [...this.economy.tables, this.db.careers], async () => {
      const c = await this.open();
      if (pendingVideoPoker(c)) throw new DomainError('CAREER_RULE', 'Finish the hand on the screen first');
      const block = vpBlocker(denom, coins, await this.economy.getBalance(c.playerId));
      if (block) throw new DomainError('CAREER_RULE', block);
      const pending: PendingVideoPoker = { roundId: newId('casino_videopoker'), denom, coins, cards: dealVP(), v: 1 };
      const stake = vpStake(denom, coins);
      await this.economy.post({ ownerId: c.playerId, amount: -stake, type: 'casino', sourceId: pending.roundId, idempotencyKey: `casino:${pending.roundId}:bet:main` });
      const next = engine.recordCasino(c, stake, 0);
      next.flags.videoPokerPending = JSON.stringify(pending);
      await this.db.careers.put(next);
      return pending;
    });
  }

  /** Draws for the saved hand (keeping the held cards) and pays it once. Calling it again returns null. */
  async finishVideoPoker(roundId: string, held: boolean[]): Promise<{ pending: PendingVideoPoker; result: VideoPokerResult; staked: number } | null> {
    const unlocked: string[] = [];
    const out = await this.db.transaction('rw', [...this.economy.tables, this.db.careers], async () => {
      const c = await this.db.careers.get('career');
      if (!c) throw new DomainError('NO_PROFILE', 'No career found');
      const pending = pendingVideoPoker(c);
      if (!pending || pending.roundId !== roundId) return null;
      const result = settleVP(pending, held);
      const staked = vpStake(pending.denom, pending.coins);
      if (result.payout > staked * MAX_RETURN.videopoker) throw new DomainError('CAREER_RULE', 'Payout exceeds what this hand can return');
      if (result.payout > 0) await this.economy.post({ ownerId: c.playerId, amount: result.payout, type: 'casino', sourceId: roundId, idempotencyKey: `casino:${roundId}:pay:main` });
      let next = engine.recordCasino(c, 0, result.payout, { biggestWin: result.payout - staked });
      delete next.flags.videoPokerPending;
      if (result.payout > staked) {
        const o = engine.withAchievements({ career: next, money: [] });
        unlocked.push(...(o.unlocked ?? []));
        next = o.career;
      }
      await this.db.careers.put(next);
      return { pending, result, staked };
    });
    this.announce(unlocked);
    return out;
  }

  /**
   * Keno: one game, start to finish, in a single step. The bet is debited and the return
   * credited in the same transaction, so a reload or a double click can never take or pay a
   * game twice. The last ten draws are kept on the career for the board.
   */
  async playKeno(picks: number[], bet: number): Promise<{ roundId: string; result: KenoResult }> {
    const unlocked: string[] = [];
    const out = await this.db.transaction('rw', [...this.economy.tables, this.db.careers], async () => {
      const c = await this.open();
      const block = kenoBlocker(picks, bet, await this.economy.getBalance(c.playerId));
      if (block) throw new DomainError('CAREER_RULE', block);
      const result = settleKeno(picks, bet, drawBalls());
      if (result.payout > bet * MAX_RETURN.keno) throw new DomainError('CAREER_RULE', 'Payout exceeds what this game can return');
      const roundId = newId('casino_keno');
      await this.economy.post({ ownerId: c.playerId, amount: -bet, type: 'casino', sourceId: roundId, idempotencyKey: `casino:${roundId}:bet:main` });
      if (result.payout > 0) await this.economy.post({ ownerId: c.playerId, amount: result.payout, type: 'casino', sourceId: roundId, idempotencyKey: `casino:${roundId}:pay:main` });
      let next = engine.recordCasino(c, bet, result.payout, { biggestWin: result.payout - bet });
      next.flags.kenoHistory = JSON.stringify([result.drawn, ...kenoHistory(c)].slice(0, KENO_HISTORY));
      if (result.payout > bet) {
        const o = engine.withAchievements({ career: next, money: [] });
        unlocked.push(...(o.unlocked ?? []));
        next = o.career;
      }
      await this.db.careers.put(next);
      return { roundId, result };
    });
    this.announce(unlocked);
    return out;
  }

  /**
   * Craps: puts chips on one bet. The table lives on the career (flag `crapsTable`), so bets ride
   * from roll to roll and survive a reload. Ledger entries share the table's session id.
   */
  async crapsBet(action: CrapsAction, amount: number): Promise<CrapsTable> {
    return this.db.transaction('rw', [...this.economy.tables, this.db.careers], async () => {
      const c = await this.open();
      const table = crapsTable(c);
      const block = crapsBlocker(table, action, amount);
      if (block) throw new DomainError('CAREER_RULE', block);
      const cost = costOf(action, amount);
      if ((await this.economy.getBalance(c.playerId)) < cost) throw new DomainError('CAREER_RULE', 'Not enough in the bank');
      const sid = crapsSession(c);
      const k = Number(c.flags.crapsSeq ?? 0) + 1;
      await this.economy.post({ ownerId: c.playerId, amount: -cost, type: 'casino', sourceId: sid, idempotencyKey: `casino:${sid}:bet:${k}` });
      const next = addBet(table, action, amount);
      const career = engine.recordCasino(c, cost, 0);
      career.flags.crapsTable = JSON.stringify(next);
      career.flags.crapsSession = sid;
      career.flags.crapsSeq = k;
      await this.db.careers.put(career);
      return next;
    });
  }

  /** Takes a Place bet or any odds back down, returning the chips. */
  async crapsTakeDown(action: CrapsAction): Promise<CrapsTable> {
    return this.db.transaction('rw', [...this.economy.tables, this.db.careers], async () => {
      const c = await this.open();
      if (!canTakeDown(action)) throw new DomainError('CAREER_RULE', 'That bet stays on the table until it is decided');
      const { table, returned } = takeDown(crapsTable(c), action);
      if (returned === 0) return table;
      const sid = crapsSession(c);
      const k = Number(c.flags.crapsSeq ?? 0) + 1;
      await this.economy.post({ ownerId: c.playerId, amount: returned, type: 'casino', sourceId: sid, idempotencyKey: `casino:${sid}:down:${k}` });
      const career = engine.recordCasino(c, 0, returned);
      career.flags.crapsTable = JSON.stringify(table);
      career.flags.crapsSeq = k;
      await this.db.careers.put(career);
      return table;
    });
  }

  /** Place bets working (or off) on the come-out roll. */
  async crapsPlaceOn(on: boolean): Promise<CrapsTable> {
    return this.db.transaction('rw', [this.db.careers], async () => {
      const c = await this.open();
      const table = { ...crapsTable(c), placeOn: on };
      await this.db.careers.put({ ...c, flags: { ...c.flags, crapsTable: JSON.stringify(table) } });
      return table;
    });
  }

  /**
   * Rolls the dice for the table: the roll is made here, decided by the rules, paid once and
   * saved with the new table in the same transaction, so a reload or a second tab can't reroll
   * or pay a roll twice.
   */
  async crapsRoll(): Promise<{ dice: [number, number]; outcomes: CrapsOutcome[]; message: string; table: CrapsTable; paid: number; staked: number }> {
    const unlocked: string[] = [];
    const out = await this.db.transaction('rw', [...this.economy.tables, this.db.careers], async () => {
      const c = await this.open();
      const before = crapsTable(c);
      if (onTable(before) === 0) throw new DomainError('CAREER_RULE', 'Put a bet down first');
      const dice = rollDice();
      const { table, outcomes, message } = resolveRoll(before, dice);
      const paid = outcomes.reduce((a, o) => a + o.payout, 0);
      if (paid > onTable(before) * MAX_ROLL_RETURN) throw new DomainError('CAREER_RULE', 'Payout exceeds what this roll can return');
      const sid = crapsSession(c);
      const n = Number(c.flags.crapsRolls ?? 0) + 1;
      if (paid > 0) await this.economy.post({ ownerId: c.playerId, amount: paid, type: 'casino', sourceId: sid, idempotencyKey: `casino:${sid}:roll:${n}` });
      const staked = outcomes.reduce((a, o) => a + o.stake, 0);
      let next = engine.recordCasino(c, 0, paid, { biggestWin: paid - staked });
      next.flags.crapsTable = JSON.stringify(table);
      next.flags.crapsRolls = n;
      next.flags.crapsLast = JSON.stringify({ dice, message, outcomes, n } satisfies CrapsLastRoll);
      // A cleared table starts a new session id for the next bets.
      if (onTable(table) === 0) delete next.flags.crapsSession;
      if (paid > staked) {
        const o = engine.withAchievements({ career: next, money: [] });
        unlocked.push(...(o.unlocked ?? []));
        next = o.career;
      }
      await this.db.careers.put(next);
      return { dice, outcomes, message, table, paid, staked };
    });
    this.announce(unlocked);
    return out;
  }

  /**
   * Spin to Win: the slot is drawn here (one unbiased draw over 54 equal slots), then the bets are
   * debited, the spin paid and saved, all in one transaction, before the wheel is animated. The
   * animation only shows the committed result; a reload shows the same result and never respins.
   */
  async spinWheel(bets: WheelBets): Promise<WheelResult & { roundId: string }> {
    const unlocked: string[] = [];
    const out = await this.db.transaction('rw', [...this.economy.tables, this.db.careers], async () => {
      const c = await this.open();
      const block = wheelBlocker(bets, await this.economy.getBalance(c.playerId));
      if (block) throw new DomainError('CAREER_RULE', block);
      const result = settleWheel(bets, spinSlot());
      if (result.payout > result.staked * MAX_RETURN.wheel) throw new DomainError('CAREER_RULE', 'Payout exceeds what this spin can return');
      const roundId = newId('casino_wheel');
      await this.economy.post({ ownerId: c.playerId, amount: -result.staked, type: 'casino', sourceId: roundId, idempotencyKey: `casino:${roundId}:bet:main` });
      if (result.payout > 0) await this.economy.post({ ownerId: c.playerId, amount: result.payout, type: 'casino', sourceId: roundId, idempotencyKey: `casino:${roundId}:pay:main` });
      let next = engine.recordCasino(c, result.staked, result.payout, { biggestWin: result.payout - result.staked });
      next.flags.wheelLast = JSON.stringify({ ...result, roundId });
      next.flags.wheelHistory = JSON.stringify([{ slot: result.slot, symbol: result.symbol }, ...wheelHistory(c)].slice(0, WHEEL_HISTORY));
      if (result.payout > result.staked) {
        const o = engine.withAchievements({ career: next, money: [] });
        unlocked.push(...(o.unlocked ?? []));
        next = o.career;
      }
      await this.db.careers.put(next);
      return { ...result, roundId };
    });
    this.announce(unlocked);
    return out;
  }

  private announce(unlocked: string[]) {
    for (const id of unlocked) {
      const name = id === 'high_roller' ? 'High Roller' : id === 'jackpot' ? 'Jackpot!' : id;
      this.notifier.emit({ kind: 'info', title: `Achievement: ${name}`, refId: `ach:${id}` });
    }
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
