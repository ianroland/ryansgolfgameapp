/**
 * Roulette, single-zero (37 pockets, 0–36), with the bets on the Desert Palms
 * table: straight up on any number (35 to 1), red/black, odd/even, 1–18/19–36
 * (even money), dozens and columns (2 to 1). Zero loses every outside bet.
 * Every pocket is equally likely.
 */
import { cryptoInt, type RandomInt } from './random';

export const ROULETTE_LIMITS = { min: 5, maxSpot: 500, maxTable: 2_000 };

/** European wheel order, clockwise from zero. */
export const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
export const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export type OutsideBet = 'red' | 'black' | 'odd' | 'even' | 'low' | 'high' | 'dozen1' | 'dozen2' | 'dozen3' | 'col1' | 'col2' | 'col3';
/** A bet spot: a number ("n17") or an outside bet. */
export type RouletteSpot = `n${number}` | OutsideBet;
export type RouletteBets = Partial<Record<RouletteSpot, number>>;

export const OUTSIDE: OutsideBet[] = ['red', 'black', 'odd', 'even', 'low', 'high', 'dozen1', 'dozen2', 'dozen3', 'col1', 'col2', 'col3'];

export const colorOf = (n: number): 'green' | 'red' | 'black' => (n === 0 ? 'green' : RED.has(n) ? 'red' : 'black');

/** Does this spot win when the ball lands on n? */
export function wins(spot: RouletteSpot, n: number): boolean {
  if (spot.startsWith('n')) return Number(spot.slice(1)) === n;
  if (n === 0) return false;
  switch (spot as OutsideBet) {
    case 'red': return RED.has(n);
    case 'black': return !RED.has(n);
    case 'odd': return n % 2 === 1;
    case 'even': return n % 2 === 0;
    case 'low': return n <= 18;
    case 'high': return n >= 19;
    case 'dozen1': return n <= 12;
    case 'dozen2': return n >= 13 && n <= 24;
    case 'dozen3': return n >= 25;
    case 'col1': return n % 3 === 1;
    case 'col2': return n % 3 === 2;
    case 'col3': return n % 3 === 0;
  }
  return false;
}

/** What a winning spot returns per chip, stake included. */
export function returnPer(spot: RouletteSpot): number {
  if (spot.startsWith('n')) return 36; // 35 to 1
  if (spot.startsWith('dozen') || spot.startsWith('col')) return 3; // 2 to 1
  return 2; // even money
}

export const totalOn = (bets: RouletteBets): number => Object.values(bets).reduce<number>((a, b) => a + (b ?? 0), 0);

export function isSpot(s: string): s is RouletteSpot {
  if (/^n\d{1,2}$/.test(s)) return Number(s.slice(1)) <= 36;
  return (OUTSIDE as string[]).includes(s);
}

/** Why a chip can't go on this spot, if it can't. */
export function betBlocker(bets: RouletteBets, spot: RouletteSpot, amount: number): string | null {
  if (!isSpot(spot)) return 'Not a bet on this table';
  if (!Number.isInteger(amount) || amount <= 0) return 'Pick a chip';
  if ((bets[spot] ?? 0) + amount > ROULETTE_LIMITS.maxSpot) return `Max $${ROULETTE_LIMITS.maxSpot} a spot`;
  if (totalOn(bets) + amount > ROULETTE_LIMITS.maxTable) return `Table max $${ROULETTE_LIMITS.maxTable} a spin`;
  return null;
}

/** The ball drops: any pocket 0–36, equally likely. */
export const spinWheel = (rand: RandomInt = cryptoInt): number => WHEEL[rand(WHEEL.length)];

export interface SpinOutcome {
  spot: RouletteSpot;
  stake: number;
  /** Returned to the player, stake included (0 when the spot loses). */
  payout: number;
}

export function resolveSpin(bets: RouletteBets, n: number): { outcomes: SpinOutcome[]; payout: number } {
  const outcomes = (Object.entries(bets) as [RouletteSpot, number][])
    .filter(([, stake]) => stake > 0)
    .map(([spot, stake]) => ({ spot, stake, payout: wins(spot, n) ? stake * returnPer(spot) : 0 }));
  return { outcomes, payout: outcomes.reduce((a, o) => a + o.payout, 0) };
}

export const spotLabel = (spot: RouletteSpot): string =>
  spot.startsWith('n')
    ? spot.slice(1)
    : ({ red: 'Red', black: 'Black', odd: 'Odd', even: 'Even', low: '1 to 18', high: '19 to 36', dozen1: '1st 12', dozen2: '2nd 12', dozen3: '3rd 12', col1: 'Column (1–34)', col2: 'Column (2–35)', col3: 'Column (3–36)' } as Record<string, string>)[spot];
