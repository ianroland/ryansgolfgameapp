/**
 * Baccarat (Punto Banco), 8 decks. Pure rules: dealing, the fixed third-card
 * tableau, and payouts. Money is handled by CasinoService.
 *
 * Payouts (returned, stake included): Player 1:1, Banker 0.95:1 (commission
 * floored to whole dollars, since the bank holds whole dollars), Tie 8:1.
 * Player and Banker bets push on a tie. Each hand is independent: the history
 * board is a record, not a prediction.
 */
import type { Card } from './blackjack';
import { cryptoInt, type RandomInt } from './random';

export const BACCARAT_DECKS = 8;
export const SHOE_SIZE = BACCARAT_DECKS * 52;
/** The cut card sits this many cards from the back of the shoe. When it comes out, the hand finishes and the shoe is shuffled before the next one. */
export const CUT_FROM_END = 16;
/** Proposed table limits (per betting spot), pending approval. */
export const BACCARAT_LIMITS = { min: 10, max: 1000 };
export const HISTORY_SIZE = 20;

export type BaccaratSpot = 'player' | 'banker' | 'tie';
export type BaccaratBets = Partial<Record<BaccaratSpot, number>>;
export type Outcome = 'P' | 'B' | 'T';

export const cardValue = (c: Card) => (c.rank >= 10 ? 0 : c.rank);
export const handTotal = (cards: Card[]) => cards.reduce((a, c) => a + cardValue(c), 0) % 10;

/** A fresh 8-deck shoe, Fisher–Yates shuffled. */
export function newBaccaratShoe(rand: RandomInt = cryptoInt): Card[] {
  const cards: Card[] = [];
  for (let d = 0; d < BACCARAT_DECKS; d++) for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) cards.push({ rank: r, suit: s as Card['suit'] });
  for (let i = cards.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

/** Does the Banker draw, given the Banker's two-card total and the Player's third card (null if the Player stood)? */
export function bankerDraws(bankerTotal: number, playerThird: Card | null): boolean {
  if (playerThird === null) return bankerTotal <= 5;
  const t = cardValue(playerThird);
  switch (bankerTotal) {
    case 0: case 1: case 2: return true;
    case 3: return t !== 8;
    case 4: return t >= 2 && t <= 7;
    case 5: return t >= 4 && t <= 7;
    case 6: return t === 6 || t === 7;
    default: return false;
  }
}

export interface BaccaratHand {
  player: Card[];
  banker: Card[];
  playerTotal: number;
  bankerTotal: number;
  outcome: Outcome;
  natural: boolean;
}

/**
 * Plays one coup from the top of `cards` (in order: P, B, P, B, then any third cards).
 * Returns the hand and how many cards it used.
 */
export function playCoup(cards: Card[]): { hand: BaccaratHand; used: number } {
  let k = 0;
  const next = () => {
    const c = cards[k++];
    if (!c) throw new Error('Shoe ran out');
    return c;
  };
  const player = [next()];
  const banker = [next()];
  player.push(next());
  banker.push(next());
  const p2 = handTotal(player);
  const b2 = handTotal(banker);
  const natural = p2 >= 8 || b2 >= 8;
  if (!natural) {
    let third: Card | null = null;
    if (p2 <= 5) {
      third = next();
      player.push(third);
    }
    if (bankerDraws(b2, third)) banker.push(next());
  }
  const pt = handTotal(player);
  const bt = handTotal(banker);
  return { hand: { player, banker, playerTotal: pt, bankerTotal: bt, outcome: pt > bt ? 'P' : bt > pt ? 'B' : 'T', natural }, used: k };
}

/** What one spot returns (stake included) for an outcome. */
export function spotReturn(spot: BaccaratSpot, stake: number, outcome: Outcome): number {
  if (stake <= 0) return 0;
  if (spot === 'tie') return outcome === 'T' ? stake * 9 : 0;
  if (outcome === 'T') return stake; // Player and Banker push on a tie
  if (spot === 'player') return outcome === 'P' ? stake * 2 : 0;
  // Banker pays 0.95 to 1: counted in cents, then floored to whole dollars.
  return outcome === 'B' ? stake + Math.floor((stake * 95) / 100) : 0;
}

export function totalReturn(bets: BaccaratBets, outcome: Outcome): number {
  return (['player', 'banker', 'tie'] as const).reduce((a, s) => a + spotReturn(s, bets[s] ?? 0, outcome), 0);
}

export const totalStaked = (bets: BaccaratBets) => (bets.player ?? 0) + (bets.banker ?? 0) + (bets.tie ?? 0);

/** Why these bets can't go down, if they can't. */
export function betBlocker(bets: BaccaratBets, balance: number): string | null {
  const spots = (['player', 'banker', 'tie'] as const).filter((s) => (bets[s] ?? 0) > 0);
  if (!spots.length) return 'Place a bet on Player, Banker or Tie';
  for (const s of spots) {
    const v = bets[s]!;
    if (!Number.isInteger(v)) return 'Invalid bet';
    if (v < BACCARAT_LIMITS.min) return `Minimum bet is $${BACCARAT_LIMITS.min}`;
    if (v > BACCARAT_LIMITS.max) return `Table limit is $${BACCARAT_LIMITS.max} a spot`;
  }
  if (totalStaked(bets) > balance) return 'That wager exceeds your balance';
  return null;
}

// ── Persisted shoe (compact: one character per card) ──

export interface ShoeState {
  /** Cards still to come, one char each. */
  cards: string;
  /** Cards dealt so far from this shoe. */
  dealt: number;
  /** Shoe number (counts shuffles). */
  n: number;
}

export const encodeCard = (c: Card) => String.fromCharCode(48 + (c.rank - 1) * 4 + c.suit);
export const decodeCard = (ch: string): Card => {
  const v = ch.charCodeAt(0) - 48;
  return { rank: Math.floor(v / 4) + 1, suit: (v % 4) as Card['suit'] };
};
export const encodeCards = (cs: Card[]) => cs.map(encodeCard).join('');
export const decodeCards = (s: string) => [...s].map(decodeCard);

/** The cut card has come out (or the shoe is missing): shuffle before the next hand. */
export const needsShuffle = (shoe: ShoeState | null) => !shoe || shoe.cards.length <= CUT_FROM_END;

/**
 * A new shoe, with the burn: the first card is shown and that many cards are
 * burned (a ten or picture card burns ten).
 */
export function freshShoe(n: number, rand: RandomInt = cryptoInt): { shoe: ShoeState; burned: number } {
  const cards = newBaccaratShoe(rand);
  const first = cards[0];
  const burned = 1 + (cardValue(first) || 10);
  return { shoe: { cards: encodeCards(cards.slice(burned)), dealt: burned, n }, burned };
}

/** Deals one coup off a saved shoe. */
export function dealFromShoe(shoe: ShoeState): { hand: BaccaratHand; shoe: ShoeState } {
  const { hand, used } = playCoup(decodeCards(shoe.cards.slice(0, 6)));
  return { hand, shoe: { ...shoe, cards: shoe.cards.slice(used), dealt: shoe.dealt + used } };
}

export interface BaccaratHistoryEntry {
  o: Outcome;
  p: number;
  b: number;
  nat?: boolean;
}

/** The bead road: outcomes in order, filled down columns of six. */
export function beadRoad(history: BaccaratHistoryEntry[], rows = 6): (BaccaratHistoryEntry | null)[][] {
  const oldestFirst = [...history].reverse();
  const cols = Math.max(1, Math.ceil(oldestFirst.length / rows));
  return Array.from({ length: cols }, (_, c) => Array.from({ length: rows }, (_, r) => oldestFirst[c * rows + r] ?? null));
}
