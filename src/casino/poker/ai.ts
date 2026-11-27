/**
 * Poker opponents. Each decision is made from a `SeatView`: the seat's own two cards, the
 * board, and public betting facts. Nobody else's hole cards are in it, so an opponent can't
 * cheat even by accident. Strength is a Monte Carlo estimate against random hands.
 */
import type { Card } from '../blackjack';
import { cryptoInt, type RandomInt } from '../random';
import { bestHand } from './handRank';
import { legal, pot, type Action, type HoldemState } from './holdem';

export interface Personality {
  /** 0 loose … 1 tight: how much equity it wants before putting chips in. */
  tight: number;
  /** 0 passive … 1 aggressive: how often a good hand bets or raises instead of calling. */
  aggro: number;
  /** 0 … 1: how often it bets or raises with nothing. */
  bluff: number;
}

export interface SeatView {
  hole: Card[];
  board: Card[];
  pot: number;
  toCall: number;
  currentBet: number;
  myBet: number;
  stack: number;
  minTo: number;
  maxTo: number;
  /** Other players still in the hand. */
  opponents: number;
  bb: number;
}

/** What seat `i` is allowed to know. */
export function viewFor(s: HoldemState, i: number): SeatView {
  const L = legal(s, i);
  const x = s.seats[i];
  return {
    hole: [...x.hole], board: [...s.board], pot: pot(s), toCall: L.toCall, currentBet: s.currentBet, myBet: x.bet,
    stack: x.stack, minTo: L.minTo, maxTo: L.maxTo, bb: s.bb,
    opponents: s.seats.filter((o, j) => j !== i && o.inHand && !o.folded).length,
  };
}

/** Share of the pot this hand wins on average against `opponents` random hands (ties split). */
export function equity(hole: Card[], board: Card[], opponents: number, iterations = 160, rand: RandomInt = cryptoInt): number {
  const known = new Set([...hole, ...board].map((c) => c.rank * 4 + c.suit));
  const rest: Card[] = [];
  for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) if (!known.has(r * 4 + s)) rest.push({ rank: r, suit: s as Card['suit'] });
  const need = 5 - board.length + 2 * opponents;
  let won = 0;
  for (let it = 0; it < iterations; it++) {
    // Partial shuffle: only the cards we need.
    const d = rest;
    for (let k = 0; k < need; k++) { const j = k + rand(d.length - k); [d[k], d[j]] = [d[j], d[k]]; }
    const full = [...board, ...d.slice(0, 5 - board.length)];
    const mine = bestHand([...hole, ...full]).score;
    let best = mine;
    let ties = 1;
    let lost = false;
    for (let o = 0; o < opponents; o++) {
      const off = 5 - board.length + 2 * o;
      const theirs = bestHand([d[off], d[off + 1], ...full]).score;
      if (theirs > best) { lost = true; break; }
      if (theirs === best) ties++;
    }
    if (!lost) won += 1 / ties;
  }
  return won / iterations;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const chance = (p: number, rand: RandomInt) => rand(1000) < p * 1000;

/** Picks a legal action. Uses only the view (and a random source for mixing). */
export function decide(v: SeatView, p: Personality, rand: RandomInt = cryptoInt): Action {
  const eq = equity(v.hole, v.board, Math.max(1, v.opponents), 160, rand);
  // Equity a fair share would be, so "strong" means strong for this many players.
  const fair = 1 / (v.opponents + 1);
  const strength = eq / fair; // 1 = average hand here
  const raiseTo = (frac: number) => {
    if (!v.maxTo) return 0;
    const target = v.currentBet + Math.max(v.minTo - v.currentBet, Math.round((v.pot + v.toCall) * frac));
    const to = clamp(target, v.minTo, v.maxTo);
    // Short stacks just shove.
    return v.maxTo - to < v.bb * 3 ? v.maxTo : to;
  };
  const wants = 0.95 + 0.6 * p.tight; // strength needed to put money in voluntarily
  if (v.toCall === 0) {
    if (strength > wants + 0.35 && chance(0.35 + 0.6 * p.aggro, rand) && v.maxTo) return { type: 'raise', to: raiseTo(0.5 + 0.3 * p.aggro) };
    if (strength < 0.8 && chance(p.bluff * 0.35, rand) && v.maxTo) return { type: 'raise', to: raiseTo(0.5) };
    return { type: 'check' };
  }
  const potOdds = v.toCall / (v.pot + v.toCall);
  // Calling is fine when equity beats the price, with a margin for tight players.
  const callable = eq > potOdds * (0.9 + 0.5 * p.tight) && strength > 0.55 + 0.4 * p.tight;
  if (strength > wants + 0.6 && chance(0.25 + 0.6 * p.aggro, rand) && v.maxTo) return { type: 'raise', to: raiseTo(0.6 + 0.4 * p.aggro) };
  if (callable) return { type: 'call' };
  if (chance(p.bluff * 0.12, rand) && v.maxTo && v.toCall < v.stack / 4) return { type: 'raise', to: raiseTo(0.75) };
  return { type: 'fold' };
}
