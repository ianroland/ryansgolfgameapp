/**
 * Keno. Pick 1 to 10 numbers from 1–80; twenty balls are drawn; the pay card for the number of
 * spots picked pays on how many were caught. Pure rules; money is handled by CasinoService.
 *
 * The pay card is a classic Vegas-style card. Its return for each spot count (75–83%) is
 * computed exactly in tests from the hypergeometric odds, so a change to it can't drift.
 */
import { cryptoInt, type RandomInt } from './random';

export const KENO_NUMBERS = 80;
export const KENO_DRAWN = 20;
export const KENO_MAX_SPOTS = 10;
export const KENO_BETS = [1, 2, 5, 10, 25] as const;

/** Multiplier (stake included) by spots picked, then by numbers caught. */
export const KENO_PAYS: Record<number, Record<number, number>> = {
  1: { 1: 3 },
  2: { 2: 13 },
  3: { 2: 2, 3: 35 },
  4: { 2: 1, 3: 5, 4: 120 },
  5: { 3: 2, 4: 18, 5: 600 },
  6: { 3: 1, 4: 6, 5: 90, 6: 1600 },
  7: { 3: 1, 4: 2, 5: 20, 6: 350, 7: 5000 },
  8: { 5: 12, 6: 100, 7: 1500, 8: 10000 },
  9: { 4: 1, 5: 5, 6: 50, 7: 250, 8: 3000, 9: 10000 },
  10: { 0: 2, 5: 2, 6: 20, 7: 150, 8: 1000, 9: 4000, 10: 10000 },
};
/** Most a game can return per dollar bet. */
export const KENO_MAX_RETURN = 10000;

export interface KenoResult {
  picks: number[];
  /** The twenty balls, in the order they came out. */
  drawn: number[];
  caught: number[];
  /** Multiplier on the bet (0 for no win). */
  pays: number;
  payout: number;
}

/** Why a game can't go ahead, or null. */
export function betBlocker(picks: readonly number[], bet: number, balance: number): string | null {
  if (picks.length === 0) return 'Pick at least one number';
  if (picks.length > KENO_MAX_SPOTS) return `Pick up to ${KENO_MAX_SPOTS} numbers`;
  if (new Set(picks).size !== picks.length || picks.some((n) => !Number.isInteger(n) || n < 1 || n > KENO_NUMBERS)) return 'Pick numbers from 1 to 80';
  if (!(KENO_BETS as readonly number[]).includes(bet)) return 'Pick a bet';
  if (bet > balance) return 'Not enough in the bank';
  return null;
}

/** Twenty different balls from 1–80. */
export function drawBalls(rand: RandomInt = cryptoInt): number[] {
  const pool = Array.from({ length: KENO_NUMBERS }, (_, i) => i + 1);
  for (let i = 0; i < KENO_DRAWN; i++) {
    const j = i + rand(KENO_NUMBERS - i);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, KENO_DRAWN);
}

export const kenoMultiplier = (spots: number, caught: number) => KENO_PAYS[spots]?.[caught] ?? 0;

export function settleKeno(picks: readonly number[], bet: number, drawn: readonly number[]): KenoResult {
  const set = new Set(drawn);
  const caught = picks.filter((n) => set.has(n));
  const pays = kenoMultiplier(picks.length, caught.length);
  return { picks: [...picks], drawn: [...drawn], caught, pays, payout: pays * bet };
}

/** n random different numbers from 1–80 (Quick Pick). */
export function quickPick(n: number, rand: RandomInt = cryptoInt): number[] {
  return drawBalls(rand).slice(0, Math.max(1, Math.min(KENO_MAX_SPOTS, n))).sort((a, b) => a - b);
}

const choose = (n: number, k: number) => {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
};
/** Chance of catching exactly `k` of `spots` picks. */
export const catchChance = (spots: number, k: number) =>
  (choose(spots, k) * choose(KENO_NUMBERS - spots, KENO_DRAWN - k)) / choose(KENO_NUMBERS, KENO_DRAWN);
/** Exact return to player for a spot count. */
export const kenoReturn = (spots: number) => Object.entries(KENO_PAYS[spots]).reduce((a, [k, m]) => a + m * catchChance(spots, Number(k)), 0);
