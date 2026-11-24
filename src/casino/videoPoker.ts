/**
 * "Jacks or Better" video poker, full-pay 9/6 table. One 52-card deck, shuffled fresh for every
 * hand. Pure rules; money is handled by CasinoService.
 *
 * Deal five cards, hold any of them, draw replacements for the rest from the same deck, and the
 * final hand pays on the paytable (per coin). Five coins get the bonus Royal Flush (4000 instead
 * of 1250). With perfect strategy this table returns about 99.54% (the published figure for
 * 9/6 Jacks or Better); the hand counts behind it are verified exactly in tests.
 */
import type { Card } from './blackjack';
import { cryptoInt, type RandomInt } from './random';
import { newDeck } from './threeCard';

export type VPHand = 'royal' | 'straight_flush' | 'quads' | 'full_house' | 'flush' | 'straight' | 'trips' | 'two_pair' | 'jacks' | 'nothing';

export const VP_HAND_NAMES: Record<VPHand, string> = {
  royal: 'Royal Flush',
  straight_flush: 'Straight Flush',
  quads: 'Four of a Kind',
  full_house: 'Full House',
  flush: 'Flush',
  straight: 'Straight',
  trips: 'Three of a Kind',
  two_pair: 'Two Pair',
  jacks: 'Jacks or Better',
  nothing: 'No win',
};

/** Pays per coin, best hand first. The Royal pays 800 per coin at five coins (see `vpPays`). */
export const VP_PAYTABLE: { hand: Exclude<VPHand, 'nothing'>; pays: number }[] = [
  { hand: 'royal', pays: 250 },
  { hand: 'straight_flush', pays: 50 },
  { hand: 'quads', pays: 25 },
  { hand: 'full_house', pays: 9 },
  { hand: 'flush', pays: 6 },
  { hand: 'straight', pays: 4 },
  { hand: 'trips', pays: 3 },
  { hand: 'two_pair', pays: 2 },
  { hand: 'jacks', pays: 1 },
];
export const ROYAL_MAX_COINS_PAYS = 800;

/** Coin values on offer and the most coins a hand can take. */
export const VP_LIMITS = { denominations: [1, 5, 25] as readonly number[], maxCoins: 5 };
/** Most a hand can return per dollar bet (the five-coin Royal). */
export const VP_MAX_RETURN = ROYAL_MAX_COINS_PAYS;

/** Coins paid for a hand at a given number of coins bet. */
export function vpPays(hand: VPHand, coins: number): number {
  if (hand === 'nothing') return 0;
  if (hand === 'royal' && coins === VP_LIMITS.maxCoins) return ROYAL_MAX_COINS_PAYS * coins;
  return VP_PAYTABLE.find((p) => p.hand === hand)!.pays * coins;
}

/** What a five-card hand is. Aces play high or low (A-2-3-4-5 is a straight). */
export function evaluateVP(cards: readonly Card[]): VPHand {
  const counts = new Map<number, number>();
  for (const c of cards) counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1);
  const groups = [...counts.values()].sort((a, b) => b - a);
  const flush = cards.every((c) => c.suit === cards[0].suit);
  const ranks = [...counts.keys()].sort((a, b) => a - b);
  const broadway = ranks.join() === '1,10,11,12,13';
  const straight = counts.size === 5 && (ranks[4] - ranks[0] === 4 || broadway);
  if (straight && flush) return broadway ? 'royal' : 'straight_flush';
  if (groups[0] === 4) return 'quads';
  if (groups[0] === 3 && groups[1] === 2) return 'full_house';
  if (flush) return 'flush';
  if (straight) return 'straight';
  if (groups[0] === 3) return 'trips';
  if (groups[0] === 2 && groups[1] === 2) return 'two_pair';
  if (groups[0] === 2) {
    const pair = [...counts].find(([, n]) => n === 2)![0];
    if (pair === 1 || pair >= 11) return 'jacks';
  }
  return 'nothing';
}

/** The hand dealt and waiting for holds, kept on the career so a reload comes back to it. */
export interface PendingVideoPoker {
  roundId: string;
  denom: number;
  coins: number;
  cards: Card[];
  v: 1;
}

export interface VideoPokerResult {
  /** The final five cards (held cards stay in place). */
  cards: Card[];
  held: boolean[];
  hand: VPHand;
  /** Total returned, stake included (0 for no win). */
  payout: number;
}

export const vpStake = (denom: number, coins: number) => denom * coins;

/** Why a deal can't go ahead, or null. */
export function betBlocker(denom: number, coins: number, balance: number): string | null {
  if (!VP_LIMITS.denominations.includes(denom)) return 'Pick a coin value';
  if (!Number.isInteger(coins) || coins < 1 || coins > VP_LIMITS.maxCoins) return `Bet 1 to ${VP_LIMITS.maxCoins} coins`;
  if (vpStake(denom, coins) > balance) return 'Not enough in the bank';
  return null;
}

/** Five cards from a freshly shuffled deck. */
export function dealVP(rand: RandomInt = cryptoInt): Card[] {
  return newDeck(rand).slice(0, 5);
}

/**
 * Replaces every card not held with a card from the rest of the deck (the 47 not dealt),
 * drawn fresh at the moment of the draw.
 */
export function drawVP(dealt: readonly Card[], held: readonly boolean[], rand: RandomInt = cryptoInt): Card[] {
  const used = new Set(dealt.map((c) => c.rank * 4 + c.suit));
  const rest = newDeck(rand).filter((c) => !used.has(c.rank * 4 + c.suit));
  let next = 0;
  return dealt.map((c, i) => (held[i] ? c : rest[next++]));
}

export function settleVP(pending: PendingVideoPoker, held: readonly boolean[], rand: RandomInt = cryptoInt): VideoPokerResult {
  const holds = [0, 1, 2, 3, 4].map((i) => held[i] === true);
  const cards = drawVP(pending.cards, holds, rand);
  const hand = evaluateVP(cards);
  return { cards, held: holds, hand, payout: vpPays(hand, pending.coins) * pending.denom };
}
