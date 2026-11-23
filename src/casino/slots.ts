/**
 * "Fairway Fortune" slot machine: three reels, golf-themed symbols.
 * Return to player ≈ 93% (verified exactly in tests).
 */
import { cryptoInt, type RandomInt } from './random';

export type SlotSymbol = 'cherry' | 'bar' | 'bell' | 'flag' | 'seven' | 'trophy';

export const SYMBOL_ART: Record<SlotSymbol, { label: string; glyph: string }> = {
  cherry: { label: 'Cherry', glyph: '🍒' },
  bar: { label: 'Bar', glyph: 'BAR' },
  bell: { label: 'Bell', glyph: '🔔' },
  flag: { label: 'Flag', glyph: '⛳' },
  seven: { label: 'Seven', glyph: '7' },
  trophy: { label: 'Trophy', glyph: '🏆' },
};

/** Each reel has 20 stops. */
export const REEL: SlotSymbol[] = [
  ...Array<SlotSymbol>(4).fill('cherry'),
  ...Array<SlotSymbol>(5).fill('bar'),
  ...Array<SlotSymbol>(4).fill('bell'),
  ...Array<SlotSymbol>(4).fill('flag'),
  ...Array<SlotSymbol>(2).fill('seven'),
  'trophy',
];

export const PAYTABLE: { name: string; test: (r: SlotSymbol[]) => boolean; pays: number }[] = [
  { name: '🏆 🏆 🏆  JACKPOT', test: (r) => r.every((s) => s === 'trophy'), pays: 400 },
  { name: '7 7 7', test: (r) => r.every((s) => s === 'seven'), pays: 80 },
  { name: '⛳ ⛳ ⛳', test: (r) => r.every((s) => s === 'flag'), pays: 20 },
  { name: '🔔 🔔 🔔', test: (r) => r.every((s) => s === 'bell'), pays: 15 },
  { name: 'BAR BAR BAR', test: (r) => r.every((s) => s === 'bar'), pays: 10 },
  { name: '🍒 🍒 🍒', test: (r) => r.every((s) => s === 'cherry'), pays: 10 },
  { name: 'Any two 🍒', test: (r) => r.filter((s) => s === 'cherry').length === 2, pays: 3 },
];

export const SLOT_BETS = [5, 25, 100, 500];

export function payMultiplier(reels: SlotSymbol[]): { pays: number; line: string | null } {
  const hit = PAYTABLE.find((p) => p.test(reels));
  return { pays: hit?.pays ?? 0, line: hit?.name ?? null };
}

export function spin(bet: number, rand: RandomInt = cryptoInt) {
  const reels = [0, 1, 2].map(() => REEL[rand(REEL.length)]);
  const { pays, line } = payMultiplier(reels);
  return { reels, line, payout: bet * pays, jackpot: pays === 400 };
}

/** Exact return-to-player over every combination. */
export function returnToPlayer(): number {
  let total = 0;
  for (const a of REEL) for (const b of REEL) for (const c of REEL) total += payMultiplier([a, b, c]).pays;
  return total / REEL.length ** 3;
}
