/**
 * Three Card Poker: Ante/Play with Pair Plus. One 52-card deck, shuffled fresh
 * for every hand. Pure rules; money is handled by CasinoService.
 *
 * Hand ranks, high to low: straight flush, three of a kind, straight, flush,
 * pair, high card. A straight outranks a flush. Aces are high, and A-2-3 is a
 * straight (the lowest); Q-K-A is the highest straight.
 *
 * The dealer qualifies with queen-high or better.
 *  - Fold: the Ante is lost.
 *  - Play (equal to the Ante), dealer doesn't qualify: Ante pays 1:1, Play pushes.
 *  - Play, dealer qualifies: higher hand wins both Ante and Play 1:1; equal hands push.
 *  - Ante Bonus (only if the player plays, whatever the dealer has):
 *    straight flush 5:1, three of a kind 4:1, straight 1:1.
 *  - Pair Plus settles on the player's hand alone, folded or not:
 *    straight flush 40:1, trips 30:1, straight 6:1, flush 4:1, pair 1:1.
 */
import type { Card } from './blackjack';
import { cryptoInt, type RandomInt } from './random';

export enum Rank3 {
  High = 0,
  Pair = 1,
  Flush = 2,
  Straight = 3,
  Trips = 4,
  StraightFlush = 5,
}

export const RANK3_NAMES: Record<Rank3, string> = {
  [Rank3.High]: 'High card',
  [Rank3.Pair]: 'Pair',
  [Rank3.Flush]: 'Flush',
  [Rank3.Straight]: 'Straight',
  [Rank3.Trips]: 'Three of a kind',
  [Rank3.StraightFlush]: 'Straight flush',
};

/** Proposed limits, pending approval. */
export const THREE_CARD_LIMITS = { anteMin: 10, anteMax: 500, pairPlusMin: 5, pairPlusMax: 250 };

export const PAIR_PLUS: Partial<Record<Rank3, number>> = {
  [Rank3.StraightFlush]: 40,
  [Rank3.Trips]: 30,
  [Rank3.Straight]: 6,
  [Rank3.Flush]: 4,
  [Rank3.Pair]: 1,
};
export const ANTE_BONUS: Partial<Record<Rank3, number>> = {
  [Rank3.StraightFlush]: 5,
  [Rank3.Trips]: 4,
  [Rank3.Straight]: 1,
};

export function newDeck(rand: RandomInt = cryptoInt): Card[] {
  const cards: Card[] = [];
  for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) cards.push({ rank: r, suit: s as Card['suit'] });
  for (let i = cards.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

export interface Eval3 {
  rank: Rank3;
  /** Tie-break values, most significant first (ace = 14; A-2-3 counts as 3-high). */
  kick: number[];
}

const hi = (r: number) => (r === 1 ? 14 : r);

export function evaluate3(cards: Card[]): Eval3 {
  if (cards.length !== 3) throw new Error('Three cards needed');
  const v = cards.map((c) => hi(c.rank)).sort((a, b) => b - a);
  const flush = cards[0].suit === cards[1].suit && cards[1].suit === cards[2].suit;
  const wheel = v[0] === 14 && v[1] === 3 && v[2] === 2; // A-2-3
  const straight = wheel || (v[0] - v[1] === 1 && v[1] - v[2] === 1);
  const top = wheel ? 3 : v[0];
  if (straight && flush) return { rank: Rank3.StraightFlush, kick: [top] };
  if (v[0] === v[2]) return { rank: Rank3.Trips, kick: [v[0]] };
  if (straight) return { rank: Rank3.Straight, kick: [top] };
  if (flush) return { rank: Rank3.Flush, kick: v };
  if (v[0] === v[1] || v[1] === v[2]) {
    const pair = v[1];
    const kicker = v[0] === v[1] ? v[2] : v[0];
    return { rank: Rank3.Pair, kick: [pair, kicker] };
  }
  return { rank: Rank3.High, kick: v };
}

/** >0 if a beats b, <0 if b beats a, 0 if equal. */
export function compare3(a: Eval3, b: Eval3): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  for (let i = 0; i < Math.max(a.kick.length, b.kick.length); i++) {
    const d = (a.kick[i] ?? 0) - (b.kick[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** Queen-high or better. */
export const dealerQualifies = (e: Eval3) => e.rank > Rank3.High || e.kick[0] >= 12;

export interface ThreeCardResult {
  player: Eval3;
  dealer: Eval3;
  played: boolean;
  qualifies: boolean;
  /** 'win' | 'lose' | 'push' for Ante/Play; 'fold' if folded; 'noqualify' when the dealer didn't qualify. */
  outcome: 'win' | 'lose' | 'push' | 'fold' | 'noqualify';
  anteReturn: number;
  playReturn: number;
  bonusReturn: number;
  pairPlusReturn: number;
  total: number;
}

/** Settles a hand. All returns include the stake where a stake comes back. */
export function settle3(player: Card[], dealer: Card[], ante: number, pairPlus: number, play: boolean): ThreeCardResult {
  const pe = evaluate3(player);
  const de = evaluate3(dealer);
  const qualifies = dealerQualifies(de);
  const pp = PAIR_PLUS[pe.rank];
  const pairPlusReturn = pairPlus > 0 && pp !== undefined ? pairPlus * (pp + 1) : 0;
  let anteReturn = 0;
  let playReturn = 0;
  let bonusReturn = 0;
  let outcome: ThreeCardResult['outcome'] = 'fold';
  if (play) {
    const bonus = ANTE_BONUS[pe.rank];
    bonusReturn = bonus !== undefined ? ante * bonus : 0;
    if (!qualifies) {
      outcome = 'noqualify';
      anteReturn = ante * 2;
      playReturn = ante;
    } else {
      const cmp = compare3(pe, de);
      outcome = cmp > 0 ? 'win' : cmp < 0 ? 'lose' : 'push';
      anteReturn = cmp > 0 ? ante * 2 : cmp === 0 ? ante : 0;
      playReturn = cmp > 0 ? ante * 2 : cmp === 0 ? ante : 0;
    }
  }
  return {
    player: pe, dealer: de, played: play, qualifies, outcome,
    anteReturn, playReturn, bonusReturn, pairPlusReturn,
    total: anteReturn + playReturn + bonusReturn + pairPlusReturn,
  };
}

export function betBlocker(ante: number, pairPlus: number, balance: number): string | null {
  const L = THREE_CARD_LIMITS;
  if (!Number.isInteger(ante) || !Number.isInteger(pairPlus) || pairPlus < 0) return 'Invalid bet';
  if (ante < L.anteMin) return `Minimum Ante is $${L.anteMin}`;
  if (ante > L.anteMax) return `Ante limit is $${L.anteMax}`;
  if (pairPlus > 0 && pairPlus < L.pairPlusMin) return `Minimum Pair Plus is $${L.pairPlusMin}`;
  if (pairPlus > L.pairPlusMax) return `Pair Plus limit is $${L.pairPlusMax}`;
  // Room for the Play bet too, so a good hand is never stuck unplayable.
  if (ante * 2 + pairPlus > balance) return 'Not enough chips for that wager (keep enough for the Play bet)';
  return null;
}

export interface PendingThreeCard {
  roundId: string;
  ante: number;
  pairPlus: number;
  player: Card[];
  dealer: Card[];
  v: 1;
}
