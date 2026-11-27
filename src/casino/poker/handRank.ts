/**
 * Poker hand ranking for any 5–7 cards: the best five-card hand, as one comparable number.
 * Shared by Hold'em now and by Stud and Omaha later. Aces play high, and low in A-2-3-4-5.
 */
import type { Card } from '../blackjack';

export type HandClass = 'high' | 'pair' | 'two_pair' | 'trips' | 'straight' | 'flush' | 'full_house' | 'quads' | 'straight_flush';
export const HAND_CLASSES: HandClass[] = ['high', 'pair', 'two_pair', 'trips', 'straight', 'flush', 'full_house', 'quads', 'straight_flush'];
export const HAND_CLASS_NAMES: Record<HandClass, string> = {
  high: 'High card', pair: 'Pair', two_pair: 'Two pair', trips: 'Three of a kind', straight: 'Straight',
  flush: 'Flush', full_house: 'Full house', quads: 'Four of a kind', straight_flush: 'Straight flush',
};

const hi = (r: number) => (r === 1 ? 14 : r);

/** Score of exactly five cards: class × 16⁵ plus tie-breakers, higher is better. */
export function score5(cards: readonly Card[]): number {
  const ranks = cards.map((c) => hi(c.rank)).sort((a, b) => b - a);
  const flush = cards.every((c) => c.suit === cards[0].suit);
  const uniq = [...new Set(ranks)];
  let straightHigh = 0;
  if (uniq.length === 5) {
    if (ranks[0] - ranks[4] === 4) straightHigh = ranks[0];
    else if (ranks[0] === 14 && ranks[1] === 5) straightHigh = 5; // the wheel
  }
  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  // groups: by count, then by rank
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const order = groups.map((g) => g[0]);
  const pack = (cls: number, ks: number[]) => ks.slice(0, 5).reduce((acc, k, i) => acc + k * 16 ** (4 - i), cls * 16 ** 5);
  if (straightHigh && flush) return pack(8, [straightHigh]);
  if (groups[0][1] === 4) return pack(7, order);
  if (groups[0][1] === 3 && groups[1][1] === 2) return pack(6, order);
  if (flush) return pack(5, ranks);
  if (straightHigh) return pack(4, [straightHigh]);
  if (groups[0][1] === 3) return pack(3, order);
  if (groups[0][1] === 2 && groups[1][1] === 2) return pack(2, order);
  if (groups[0][1] === 2) return pack(1, order);
  return pack(0, ranks);
}

export const classOf = (score: number): HandClass => HAND_CLASSES[Math.floor(score / 16 ** 5)];

/** Best five of 5–7 cards. */
export function bestHand(cards: readonly Card[]): { score: number; cards: Card[]; cls: HandClass } {
  let best = -1;
  let pick: Card[] = [];
  const n = cards.length;
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let c = b + 1; c < n; c++) for (let d = c + 1; d < n; d++) for (let e = d + 1; e < n; e++) {
    const five = [cards[a], cards[b], cards[c], cards[d], cards[e]];
    const s = score5(five);
    if (s > best) { best = s; pick = five; }
  }
  return { score: best, cards: pick, cls: classOf(best) };
}

const pairs = <T,>(xs: readonly T[], k: number): T[][] => {
  const out: T[][] = [];
  const go = (start: number, acc: T[]) => {
    if (acc.length === k) { out.push(acc); return; }
    for (let i = start; i < xs.length; i++) go(i + 1, [...acc, xs[i]]);
  };
  go(0, []);
  return out;
};

/** Omaha high: exactly two hole cards and three from the board. */
export function omahaHigh(hole: readonly Card[], board: readonly Card[]): { score: number; cls: HandClass } {
  let best = -1;
  for (const h of pairs(hole, 2)) for (const b of pairs(board, 3)) best = Math.max(best, score5([...h, ...b]));
  return { score: best, cls: classOf(best) };
}

/**
 * 8-or-better low value of five cards (ace plays low), or null if they don't qualify.
 * Smaller is better: the highest card is compared first, then the next.
 */
export function low5(cards: readonly Card[]): number | null {
  const r = cards.map((c) => c.rank).sort((a, b) => b - a); // ace = 1 already low
  if (new Set(r).size !== 5 || r[0] > 8) return null;
  return r.reduce((acc, k, i) => acc + k * 16 ** (4 - i), 0);
}

/** Omaha low: exactly two hole cards and three from the board, 8 or better; null if none. */
export function omahaLow(hole: readonly Card[], board: readonly Card[]): number | null {
  let best: number | null = null;
  for (const h of pairs(hole, 2)) for (const b of pairs(board, 3)) {
    const v = low5([...h, ...b]);
    if (v !== null && (best === null || v < best)) best = v;
  }
  return best;
}

/** "8-6 low" style name for a low value. */
export function lowName(v: number): string {
  const top = Math.floor(v / 16 ** 4);
  const next = Math.floor(v / 16 ** 3) % 16;
  const n = (k: number) => (k === 1 ? 'A' : String(k));
  return `${n(top)}-${n(next)} low`;
}

/** Score of the cards showing (stud action order): pairs, trips and quads count; straights and flushes don't. */
export function scoreShowing(cards: readonly Card[]): number {
  const ranks = cards.map((c) => hi(c.rank));
  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const cls = groups[0]?.[1] === 4 ? 7 : groups[0]?.[1] === 3 ? 3 : groups[0]?.[1] === 2 && groups[1]?.[1] === 2 ? 2 : groups[0]?.[1] === 2 ? 1 : 0;
  return groups.map((g) => g[0]).slice(0, 4).reduce((acc, k, i) => acc + k * 16 ** (3 - i), cls * 16 ** 4);
}
