/**
 * No-limit Texas Hold'em: a pure state machine. No I/O, no ledger, no randomness except the
 * shuffle (passed in). Chips are conserved: every chip is in a stack or in front of a seat
 * (this hand's contributions) at all times, and the pot is just the sum of contributions.
 *
 * Side pots are built at showdown from what each seat put in. A seat can only win the
 * layers it contributed to; folded seats' chips stay in the pots they fed.
 */
import type { Card } from '../blackjack';
import { cryptoInt, type RandomInt } from '../random';
import { newDeck } from '../threeCard';
import { bestHand, HAND_CLASS_NAMES } from './handRank';

export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';

export interface Seat {
  id: string;
  name: string;
  stack: number;
  hole: Card[];
  /** Chips put in on this street. */
  bet: number;
  /** Chips put in this hand, all streets. */
  total: number;
  folded: boolean;
  allIn: boolean;
  /** Acted since the last full raise (blinds don't count as acting). */
  acted: boolean;
  /** Dealt into this hand (a seat with no chips sits the hand out). */
  inHand: boolean;
}

export interface PotWin { seat: number; amount: number; hand?: string }

export interface HoldemState {
  seats: Seat[];
  button: number;
  sb: number;
  bb: number;
  deck: Card[];
  board: Card[];
  street: Street;
  /** Index of the seat to act, or -1 when nobody can (hand over or running out). */
  toAct: number;
  currentBet: number;
  /** Size of the last full raise; the next raise must be at least this much more. */
  minRaise: number;
  handNo: number;
  /** Set once the hand is over. */
  result?: { wins: PotWin[]; shown: boolean };
  log: string[];
}

export type Action = { type: 'fold' } | { type: 'check' } | { type: 'call' } | { type: 'raise'; to: number };

export const pot = (s: HoldemState) => s.seats.reduce((a, x) => a + x.total, 0);
export const chipsInPlay = (s: HoldemState) => s.seats.reduce((a, x) => a + x.stack + x.total, 0);
const live = (s: HoldemState) => s.seats.filter((x) => x.inHand && !x.folded);
const canBet = (x: Seat) => x.inHand && !x.folded && !x.allIn;
const owesAction = (s: HoldemState) => (x: Seat) => canBet(x) && (!x.acted || x.bet < s.currentBet);

/** Next seat after i (clockwise) that matches pred; -1 if none. */
function nextSeat(s: HoldemState, i: number, pred: (x: Seat) => boolean): number {
  const n = s.seats.length;
  for (let k = 1; k <= n; k++) {
    const j = (i + k) % n;
    if (pred(s.seats[j])) return j;
  }
  return -1;
}

export function newTable(players: { id: string; name: string; stack: number }[], sb: number, bb: number): HoldemState {
  return {
    seats: players.map((p) => ({ ...p, hole: [], bet: 0, total: 0, folded: false, allIn: false, acted: false, inHand: false })),
    button: players.length - 1, sb, bb, deck: [], board: [], street: 'showdown', toAct: -1,
    currentBet: 0, minRaise: bb, handNo: 0, log: [],
  };
}

const clone = (s: HoldemState): HoldemState => ({
  ...s, seats: s.seats.map((x) => ({ ...x, hole: [...x.hole] })), deck: [...s.deck], board: [...s.board], log: [...s.log],
  result: s.result ? { ...s.result, wins: [...s.result.wins] } : undefined,
});

function put(seat: Seat, amount: number) {
  const a = Math.min(amount, seat.stack);
  seat.stack -= a;
  seat.bet += a;
  seat.total += a;
  if (seat.stack === 0) seat.allIn = true;
  return a;
}

/** Deals a new hand: moves the button, posts blinds, deals two cards each. Needs two seats with chips. */
export function startHand(prev: HoldemState, rand: RandomInt = cryptoInt): HoldemState {
  const s = clone(prev);
  for (const x of s.seats) Object.assign(x, { hole: [], bet: 0, total: 0, folded: false, allIn: false, acted: false, inHand: x.stack > 0 });
  const dealt = s.seats.filter((x) => x.inHand).length;
  if (dealt < 2) throw new Error('Need two players with chips');
  s.handNo += 1;
  s.result = undefined;
  s.board = [];
  s.deck = newDeck(rand);
  s.log = [];
  s.button = nextSeat(s, s.button, (x) => x.inHand);
  // Heads-up the button posts the small blind and acts first before the flop.
  const sbSeat = dealt === 2 ? s.button : nextSeat(s, s.button, (x) => x.inHand);
  const bbSeat = nextSeat(s, sbSeat, (x) => x.inHand);
  put(s.seats[sbSeat], s.sb);
  put(s.seats[bbSeat], s.bb);
  s.log.push(`${s.seats[sbSeat].name} posts ${s.seats[sbSeat].bet}`, `${s.seats[bbSeat].name} posts ${s.seats[bbSeat].bet}`);
  s.currentBet = s.bb;
  s.minRaise = s.bb;
  for (let r = 0; r < 2; r++) {
    let i = sbSeat;
    for (let k = 0; k < dealt; k++) {
      s.seats[i].hole.push(s.deck.pop()!);
      i = nextSeat(s, i, (x) => x.inHand);
    }
  }
  s.street = 'preflop';
  s.toAct = nextSeat(s, bbSeat, canBet);
  return settleIfDone(s);
}

export interface Legal {
  fold: boolean;
  check: boolean;
  /** Chips needed to call (0 when checking is possible). */
  toCall: number;
  /** Smallest legal raise-to, or 0 when raising isn't possible. */
  minTo: number;
  /** Largest raise-to (all in). */
  maxTo: number;
}

export function legal(s: HoldemState, i = s.toAct): Legal {
  const x = s.seats[i];
  if (!x || i !== s.toAct || s.result) return { fold: false, check: false, toCall: 0, minTo: 0, maxTo: 0 };
  const toCall = Math.min(s.currentBet - x.bet, x.stack);
  const maxTo = x.bet + x.stack;
  const othersCanCall = s.seats.some((o, j) => j !== i && canBet(o));
  const canRaise = maxTo > s.currentBet && othersCanCall;
  return {
    fold: toCall > 0, check: toCall === 0, toCall,
    minTo: canRaise ? Math.min(s.currentBet + s.minRaise, maxTo) : 0,
    maxTo: canRaise ? maxTo : 0,
  };
}

/** Applies the seat-to-act's action. Throws on anything illegal. */
export function act(prev: HoldemState, a: Action): HoldemState {
  const s = clone(prev);
  const i = s.toAct;
  if (i < 0 || s.result) throw new Error('Nobody to act');
  const x = s.seats[i];
  const L = legal(prev, i);
  switch (a.type) {
    case 'fold':
      if (!L.fold) throw new Error('Nothing to fold to — check instead');
      x.folded = true;
      s.log.push(`${x.name} folds`);
      break;
    case 'check':
      if (!L.check) throw new Error(`It's ${L.toCall} to call`);
      s.log.push(`${x.name} checks`);
      break;
    case 'call':
      if (L.toCall <= 0) throw new Error('Nothing to call');
      put(x, L.toCall);
      s.log.push(`${x.name} calls ${L.toCall}${x.allIn ? ' (all in)' : ''}`);
      break;
    case 'raise': {
      const to = Math.floor(a.to);
      if (!L.maxTo) throw new Error('Raising is closed');
      if (to < L.minTo || to > L.maxTo) throw new Error(`Raise to between ${L.minTo} and ${L.maxTo}`);
      const raiseBy = to - s.currentBet;
      put(x, to - x.bet);
      if (raiseBy >= s.minRaise) {
        s.minRaise = raiseBy;
        for (const o of s.seats) if (o !== x) o.acted = false; // a full raise reopens the action
      }
      s.currentBet = Math.max(s.currentBet, to);
      s.log.push(`${x.name} ${prev.currentBet === 0 ? 'bets' : 'raises to'} ${to}${x.allIn ? ' (all in)' : ''}`);
      break;
    }
  }
  x.acted = true;
  s.toAct = nextSeat(s, i, owesAction(s));
  return settleIfDone(s);
}

const roundClosed = (s: HoldemState) => s.seats.every((x) => !canBet(x) || (x.acted && x.bet === s.currentBet));

function nextStreet(s: HoldemState) {
  for (const x of s.seats) { x.bet = 0; x.acted = false; }
  s.currentBet = 0;
  s.minRaise = s.bb;
  const deal = (n: number) => { s.deck.pop(); for (let k = 0; k < n; k++) s.board.push(s.deck.pop()!); }; // burn, then deal
  if (s.street === 'preflop') { deal(3); s.street = 'flop'; }
  else if (s.street === 'flop') { deal(1); s.street = 'turn'; }
  else if (s.street === 'turn') { deal(1); s.street = 'river'; }
  else s.street = 'showdown';
  s.toAct = s.street === 'showdown' ? -1 : nextSeat(s, s.button, canBet);
}

/** Ends the hand if one player is left, closes betting rounds, runs the board out when nobody can bet. */
function settleIfDone(s: HoldemState): HoldemState {
  for (;;) {
    const alive = live(s);
    if (alive.length === 1) {
      const w = s.seats.indexOf(alive[0]);
      const amount = pot(s);
      award(s, [{ seat: w, amount }], false);
      return s;
    }
    const bettors = s.seats.filter(canBet);
    // Betting goes on while someone owes a decision.
    const someoneOwes = bettors.length > 1 ? !roundClosed(s) : bettors.length === 1 && bettors[0].bet < s.currentBet;
    if (someoneOwes && s.toAct >= 0) return s;
    if (s.street === 'river' || s.street === 'showdown') { showdown(s); return s; }
    nextStreet(s);
    if (s.seats.filter(canBet).length > 1 && s.toAct >= 0) return s;
    // Everyone (or all but one) is all in: keep dealing.
  }
}

/** Layers of the pot by contribution level: each layer goes to the best live hand that paid into it. */
export function sidePots(seats: Seat[]): { amount: number; eligible: number[] }[] {
  const levels = [...new Set(seats.filter((x) => x.total > 0 && !x.folded).map((x) => x.total))].sort((a, b) => a - b);
  const pots: { amount: number; eligible: number[] }[] = [];
  let floor = 0;
  for (const lv of levels) {
    const amount = seats.reduce((a, x) => a + Math.max(0, Math.min(x.total, lv) - floor), 0);
    const eligible = seats.map((x, i) => (!x.folded && x.total >= lv ? i : -1)).filter((i) => i >= 0);
    if (amount > 0) pots.push({ amount, eligible });
    floor = lv;
  }
  // Chips above the highest live level (a folded seat that out-bet everyone left): last pot takes them.
  const rest = seats.reduce((a, x) => a + Math.max(0, x.total - floor), 0);
  if (rest > 0 && pots.length) pots[pots.length - 1].amount += rest;
  return pots;
}

function showdown(s: HoldemState) {
  while (s.board.length < 5) { s.deck.pop(); s.board.push(s.deck.pop()!); }
  s.street = 'showdown';
  const scores = s.seats.map((x) => (x.inHand && !x.folded ? bestHand([...x.hole, ...s.board]) : null));
  const wins: PotWin[] = [];
  for (const p of sidePots(s.seats)) {
    const best = Math.max(...p.eligible.map((i) => scores[i]!.score));
    // Odd chips go to the first winner left of the button.
    const winners = p.eligible.filter((i) => scores[i]!.score === best)
      .sort((a, b) => ((a - s.button - 1 + s.seats.length) % s.seats.length) - ((b - s.button - 1 + s.seats.length) % s.seats.length));
    const share = Math.floor(p.amount / winners.length);
    let odd = p.amount - share * winners.length;
    for (const w of winners) {
      wins.push({ seat: w, amount: share + (odd > 0 ? 1 : 0), hand: HAND_CLASS_NAMES[scores[w]!.cls] });
      if (odd > 0) odd--;
    }
  }
  award(s, wins, true);
}

const withArticle = (h: string) => { const l = h.toLowerCase(); return l === 'two pair' ? l : `${/^[aeiou]/.test(l) ? 'an' : 'a'} ${l}`; };

function award(s: HoldemState, wins: PotWin[], shown: boolean) {
  // Merge a seat's wins across pots for the log, keep the per-pot list for the result.
  for (const w of wins) s.seats[w.seat].stack += w.amount;
  for (const x of s.seats) { x.bet = 0; x.total = 0; }
  s.toAct = -1;
  s.currentBet = 0;
  s.result = { wins, shown };
  const byseat = new Map<number, PotWin>();
  for (const w of wins) {
    const m = byseat.get(w.seat);
    byseat.set(w.seat, m ? { ...m, amount: m.amount + w.amount } : { ...w });
  }
  for (const w of byseat.values()) s.log.push(`${s.seats[w.seat].name} wins $${w.amount.toLocaleString('en-US')}${w.hand ? ` with ${withArticle(w.hand)}` : ''}`);
}
