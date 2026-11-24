/**
 * Spin to Win: the classic casino money wheel ("Big Six"), approved 2026-11-24. Pure rules; money
 * is handled by CasinoService.
 *
 * 54 equal slots: 24 × $1, 15 × $2, 7 × $5, 4 × $10, 2 × $20, 1 × the casino's emblem and 1 × the
 * star. Bet on one or more symbols; when the wheel stops, a bet on the symbol at the pointer pays
 * its number to 1 (the emblem and the star pay 40 to 1) and every other bet loses. Each slot is
 * equally likely, so the odds you can count on the wheel are the real odds. Return per bet:
 * $1 88.9%, $2 83.3%, $5 77.8%, $10 81.5%, $20 77.8%, emblem / star 75.9% (exact, in tests).
 */
import { cryptoInt, type RandomInt } from './random';

export type WheelSymbol = '1' | '2' | '5' | '10' | '20' | 'emblem' | 'star';
export const WHEEL_SYMBOLS: WheelSymbol[] = ['1', '2', '5', '10', '20', 'emblem', 'star'];

/** Pays "to 1" (a winning bet returns its stake too). */
export const WHEEL_PAYS: Record<WheelSymbol, number> = { '1': 1, '2': 2, '5': 5, '10': 10, '20': 20, emblem: 40, star: 40 };

/**
 * The slots clockwise from the top, fixed: evenly spread (no two of the rarer symbols side by
 * side), the emblem and the star opposite each other.
 */
export const WHEEL_SLOTS: readonly WheelSymbol[] = [
  'star', '1', '2', '5', '1', '2', '1', '10', '1', '2', '1', '5', '1', '2', '20', '1', '2', '1', '5', '1', '2', '1', '10', '2', '1', '1', '2',
  'emblem', '5', '1', '1', '2', '10', '1', '2', '1', '5', '1', '2', '1', '20', '2', '1', '5', '1', '2', '1', '10', '1', '2', '1', '5', '2', '1',
];
export const SLOT_COUNT = WHEEL_SLOTS.length;
export const slotsOf = (s: WheelSymbol) => WHEEL_SLOTS.filter((x) => x === s).length;

/** Chip sizes for the wheel, and the most on one symbol. */
export const WHEEL_CHIPS = [1, 5, 10, 25, 50, 100] as const;
export const WHEEL_LIMITS = { maxPerSymbol: 500 };
/** Most a spin can return per dollar bet (40 to 1, stake included). */
export const WHEEL_MAX_RETURN = 41;

export type WheelBets = Partial<Record<WheelSymbol, number>>;

export const wheelStaked = (b: WheelBets) => WHEEL_SYMBOLS.reduce((a, s) => a + (b[s] ?? 0), 0);

/** Why a spin can't go ahead, or null. */
export function betBlocker(b: WheelBets, balance: number): string | null {
  if (Object.keys(b).some((k) => !(WHEEL_SYMBOLS as string[]).includes(k))) return 'Invalid bet';
  const staked = wheelStaked(b);
  if (staked === 0) return 'Put a chip on a symbol';
  for (const s of WHEEL_SYMBOLS) {
    const v = b[s] ?? 0;
    if (!Number.isInteger(v) || v < 0) return 'Invalid bet';
    if (v > WHEEL_LIMITS.maxPerSymbol) return `Most on one symbol is $${WHEEL_LIMITS.maxPerSymbol}`;
  }
  if (staked > balance) return 'Not enough in the bank';
  return null;
}

/** The slot at the pointer: one unbiased draw over the 54 slots. */
export const spinSlot = (rand: RandomInt = cryptoInt) => rand(SLOT_COUNT);

export interface WheelResult {
  slot: number;
  symbol: WheelSymbol;
  bets: WheelBets;
  staked: number;
  /** Returned, stake included (0 if the bet on the winning symbol was nothing). */
  payout: number;
}

export function settleWheel(bets: WheelBets, slot: number): WheelResult {
  const symbol = WHEEL_SLOTS[slot];
  const on = bets[symbol] ?? 0;
  return { slot, symbol, bets: { ...bets }, staked: wheelStaked(bets), payout: on * (WHEEL_PAYS[symbol] + 1) };
}

/** Exact return for a bet on one symbol. */
export const wheelReturn = (s: WheelSymbol) => (slotsOf(s) * (WHEEL_PAYS[s] + 1)) / SLOT_COUNT;
