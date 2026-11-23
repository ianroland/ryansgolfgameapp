/**
 * Blackjack: 6 decks, dealer stands on all 17s, blackjack pays 3:2, double on
 * any first two cards, one split (split aces get one card each), dealer peeks
 * for blackjack. Pure state machine; money is handled by CasinoService.
 */
import { cryptoInt, type RandomInt } from './random';

export interface Card {
  rank: number; // 1 = ace … 13 = king
  suit: 0 | 1 | 2 | 3; // ♠ ♥ ♦ ♣
}

export type HandResult = 'blackjack' | 'win' | 'push' | 'lose' | 'bust';

export interface BJHand {
  cards: Card[];
  bet: number;
  doubled: boolean;
  fromSplit: boolean;
  done: boolean;
  result?: HandResult;
  /** Total returned to the player (stake included). */
  payout?: number;
}

export interface BJState {
  shoe: Card[];
  dealer: Card[];
  hands: BJHand[];
  active: number;
  phase: 'betting' | 'player' | 'done';
  /** Dealer's hole card is face down until the player finishes. */
  holeHidden: boolean;
}

export const DECKS = 6;
export const BJ_LIMITS = { min: 10, max: 1000 };

export function newShoe(rand: RandomInt = cryptoInt): Card[] {
  const cards: Card[] = [];
  for (let d = 0; d < DECKS; d++) for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) cards.push({ rank: r, suit: s as Card['suit'] });
  for (let i = cards.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

export function newTable(rand: RandomInt = cryptoInt): BJState {
  return { shoe: newShoe(rand), dealer: [], hands: [], active: 0, phase: 'betting', holeHidden: true };
}

const cardPoints = (c: Card) => (c.rank === 1 ? 1 : Math.min(10, c.rank));

export function handValue(cards: Card[]): { total: number; soft: boolean } {
  let total = cards.reduce((a, c) => a + cardPoints(c), 0);
  const hasAce = cards.some((c) => c.rank === 1);
  const soft = hasAce && total + 10 <= 21;
  if (soft) total += 10;
  return { total, soft };
}

export const isBlackjack = (cards: Card[]) => cards.length === 2 && handValue(cards).total === 21;

function draw(s: BJState, rand: RandomInt): Card {
  if (s.shoe.length < 1) s.shoe = newShoe(rand);
  return s.shoe.pop()!;
}

const clone = (s: BJState): BJState => ({
  ...s,
  shoe: [...s.shoe],
  dealer: [...s.dealer],
  hands: s.hands.map((h) => ({ ...h, cards: [...h.cards] })),
});

/** Starts a round. Reshuffles when the shoe is under about one deck. */
export function deal(prev: BJState, bet: number, rand: RandomInt = cryptoInt): BJState {
  if (prev.phase === 'player') throw new Error('Finish the current hand first');
  const s = clone(prev);
  if (s.shoe.length < 60) s.shoe = newShoe(rand);
  s.hands = [{ cards: [draw(s, rand)], bet, doubled: false, fromSplit: false, done: false }];
  s.dealer = [draw(s, rand)];
  s.hands[0].cards.push(draw(s, rand));
  s.dealer.push(draw(s, rand));
  s.active = 0;
  s.phase = 'player';
  s.holeHidden = true;
  // Dealer peeks with an ace or ten showing; naturals end the round at once.
  if (isBlackjack(s.dealer) || isBlackjack(s.hands[0].cards)) return finish(s, rand, false);
  return s;
}

export function canDouble(s: BJState) {
  const h = s.hands[s.active];
  return s.phase === 'player' && !!h && h.cards.length === 2 && !h.done && !(h.fromSplit && h.cards[0].rank === 1);
}

export function canSplit(s: BJState) {
  const h = s.hands[s.active];
  return s.phase === 'player' && s.hands.length === 1 && !!h && h.cards.length === 2 && cardPoints(h.cards[0]) === cardPoints(h.cards[1]);
}

function advance(s: BJState, rand: RandomInt): BJState {
  while (s.active < s.hands.length && s.hands[s.active].done) s.active++;
  if (s.active >= s.hands.length) return finish(s, rand, true);
  // A split hand gets its second card when it becomes active.
  const h = s.hands[s.active];
  if (h.cards.length === 1) {
    h.cards.push(draw(s, rand));
    if (h.cards[0].rank === 1 || handValue(h.cards).total === 21) {
      h.done = true; // split aces: one card only
      return advance(s, rand);
    }
  }
  return s;
}

export function hit(prev: BJState, rand: RandomInt = cryptoInt): BJState {
  if (prev.phase !== 'player') return prev;
  const s = clone(prev);
  const h = s.hands[s.active];
  h.cards.push(draw(s, rand));
  if (handValue(h.cards).total >= 21) h.done = true;
  return advance(s, rand);
}

export function stand(prev: BJState, rand: RandomInt = cryptoInt): BJState {
  if (prev.phase !== 'player') return prev;
  const s = clone(prev);
  s.hands[s.active].done = true;
  return advance(s, rand);
}

/** Doubles the bet (caller has already taken the extra stake), one card. */
export function double(prev: BJState, rand: RandomInt = cryptoInt): BJState {
  if (!canDouble(prev)) return prev;
  const s = clone(prev);
  const h = s.hands[s.active];
  h.bet *= 2;
  h.doubled = true;
  h.cards.push(draw(s, rand));
  h.done = true;
  return advance(s, rand);
}

/** Splits a pair into two hands (caller has already taken the second stake). */
export function split(prev: BJState, rand: RandomInt = cryptoInt): BJState {
  if (!canSplit(prev)) return prev;
  const s = clone(prev);
  const [a, b] = s.hands[0].cards;
  const bet = s.hands[0].bet;
  s.hands = [
    { cards: [a], bet, doubled: false, fromSplit: true, done: false },
    { cards: [b], bet, doubled: false, fromSplit: true, done: false },
  ];
  s.active = 0;
  return advance(s, rand);
}

function finish(s: BJState, rand: RandomInt, dealerPlays: boolean): BJState {
  s.holeHidden = false;
  const anyLive = s.hands.some((h) => handValue(h.cards).total <= 21);
  const playerNatural = s.hands.length === 1 && !s.hands[0].fromSplit && isBlackjack(s.hands[0].cards);
  if (dealerPlays && anyLive && !playerNatural) {
    while (handValue(s.dealer).total < 17) s.dealer.push(draw(s, rand));
  }
  const d = handValue(s.dealer).total;
  const dealerBJ = isBlackjack(s.dealer);
  for (const h of s.hands) {
    const p = handValue(h.cards).total;
    const natural = !h.fromSplit && isBlackjack(h.cards);
    if (natural && !dealerBJ) [h.result, h.payout] = ['blackjack', h.bet + Math.floor(h.bet * 1.5)];
    else if (natural && dealerBJ) [h.result, h.payout] = ['push', h.bet];
    else if (dealerBJ) [h.result, h.payout] = ['lose', 0];
    else if (p > 21) [h.result, h.payout] = ['bust', 0];
    else if (d > 21 || p > d) [h.result, h.payout] = ['win', h.bet * 2];
    else if (p === d) [h.result, h.payout] = ['push', h.bet];
    else [h.result, h.payout] = ['lose', 0];
    h.done = true;
  }
  s.phase = 'done';
  return s;
}

export const totalBet = (s: BJState) => s.hands.reduce((a, h) => a + h.bet, 0);
export const totalPayout = (s: BJState) => s.hands.reduce((a, h) => a + (h.payout ?? 0), 0);
