/**
 * The poker table: a pure state machine for three games.
 *   holdem  No-limit Texas Hold'em: blinds, two hole cards, a five-card board.
 *   omaha8  Pot-limit Omaha Hi-Lo: four hole cards, exactly two of them plus three from the
 *           board; the pot splits between the best high and the best 8-or-better low.
 *   stud    Fixed-limit Seven Card Stud: antes, a bring-in from the lowest card showing,
 *           two down and one up, then three more up and the last one down. No board.
 *
 * No I/O, no ledger, no randomness except the shuffle (passed in). Chips are conserved: every
 * chip is in a stack or in front of a seat (this hand's contributions) at all times.
 * Side pots are built at showdown from what each seat put in; folded chips stay in the pots
 * they fed.
 *
 * Table rules (the Pokerrrr-style extras, all optional):
 *   runTwice    when everyone left is all in before the river, the table may deal the rest of
 *               the board twice; each pot is split between the two runs.
 *   doubleBoard every hand deals two boards from the flop on; each pot is split between them.
 *   sevenDeuce  the 7-2 Game: win a pot holding 7-2 and every other player dealt in pays you
 *               this bounty (Hold'em only).
 *   straddle    (per hand) the player left of the big blind posts a blind raise of 2× the big blind.
 */
import type { Card } from '../blackjack';
import { cryptoInt, type RandomInt } from '../random';
import { newDeck } from '../threeCard';
import { bestHand, HAND_CLASS_NAMES, lowName, omahaHigh, omahaLow, scoreShowing, type HandClass } from './handRank';

export type PokerVariant = 'holdem' | 'stud' | 'omaha8';
export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'third' | 'fourth' | 'fifth' | 'sixth' | 'seventh' | 'showdown';

export interface Seat {
  id: string;
  name: string;
  stack: number;
  hole: Card[];
  /** Stud: which of the seat's cards are face up (same order as hole). */
  up?: boolean[];
  /** Chips put in on this street. */
  bet: number;
  /** Chips put in this hand, all streets. */
  total: number;
  folded: boolean;
  allIn: boolean;
  /** Acted since the last full raise (blinds and the bring-in don't count as acting). */
  acted: boolean;
  /** Dealt into this hand (a seat with no chips sits the hand out). */
  inHand: boolean;
}

export interface PotWin { seat: number; amount: number; hand?: string; half?: 'high' | 'low'; run?: 1 | 2 }

export interface TableRules { runTwice?: boolean; doubleBoard?: boolean; sevenDeuce?: number }

export interface HoldemState {
  /** Missing on tables saved by 0.25.0: Hold'em. */
  variant?: PokerVariant;
  seats: Seat[];
  button: number;
  /** Hold'em/Omaha: the blinds. Stud: the small bet is `bb`, the big bet twice that. */
  sb: number;
  bb: number;
  /** Stud only. */
  ante?: number;
  bringIn?: number;
  deck: Card[];
  board: Card[];
  /** The second board (Double Board, or the second run of Run It Twice). */
  board2?: Card[];
  rules?: TableRules;
  /** Everyone left is all in before the river: waiting for the table to choose one run or two. */
  awaitRunout?: boolean;
  /** How the board was run out this hand (2 = Run It Twice). */
  runs?: 1 | 2;
  /** The 7-2 bounty paid this hand, if any. */
  bounty?: { seat: number; amount: number };
  street: Street;
  /** Index of the seat to act, or -1 when nobody can (hand over or running out). */
  toAct: number;
  currentBet: number;
  /** Size of the last full raise; the next raise must be at least this much more. */
  minRaise: number;
  /** Bets and raises this street (fixed limit caps them at four). */
  raises?: number;
  handNo: number;
  /** Set once the hand is over. */
  result?: { wins: PotWin[]; shown: boolean };
  log: string[];
}

export type Action = { type: 'fold' } | { type: 'check' } | { type: 'call' } | { type: 'raise'; to: number };

export const variantOf = (s: HoldemState): PokerVariant => s.variant ?? 'holdem';
export const holeCount = (v: PokerVariant) => (v === 'omaha8' ? 4 : v === 'stud' ? 7 : 2);
export const pot = (s: HoldemState) => s.seats.reduce((a, x) => a + x.total, 0);
export const chipsInPlay = (s: HoldemState) => s.seats.reduce((a, x) => a + x.stack + x.total, 0);
const live = (s: HoldemState) => s.seats.filter((x) => x.inHand && !x.folded);
const canBet = (x: Seat) => x.inHand && !x.folded && !x.allIn;
const owesAction = (s: HoldemState) => (x: Seat) => canBet(x) && (!x.acted || x.bet < s.currentBet);
/** Cards anyone at the table can see for a seat (stud up cards). */
export const showing = (x: Seat) => x.hole.filter((_, i) => x.up?.[i]);
const STUD_CAP = 4;
/** Stud suit order for the bring-in tie-break: clubs, diamonds, hearts, spades (our suits are s, h, d, c). */
const SUIT_RANK = [3, 2, 1, 0];

/** Next seat after i (clockwise) that matches pred; -1 if none. */
function nextSeat(s: HoldemState, i: number, pred: (x: Seat) => boolean): number {
  const n = s.seats.length;
  for (let k = 1; k <= n; k++) {
    const j = (i + k) % n;
    if (pred(s.seats[j])) return j;
  }
  return -1;
}

export function newTable(
  players: { id: string; name: string; stack: number }[], sb: number, bb: number,
  opts: { variant?: PokerVariant; ante?: number; bringIn?: number; rules?: TableRules } = {},
): HoldemState {
  const variant = opts.variant ?? 'holdem';
  return {
    variant,
    seats: players.map((p) => ({ ...p, hole: [], bet: 0, total: 0, folded: false, allIn: false, acted: false, inHand: false })),
    button: players.length - 1, sb, bb, deck: [], board: [], street: 'showdown', toAct: -1,
    currentBet: 0, minRaise: bb, raises: 0, handNo: 0, log: [], rules: variant === 'stud' ? {} : { ...opts.rules, ...(variant !== 'holdem' ? { sevenDeuce: 0 } : {}) },
    ...(variant === 'stud' ? { ante: opts.ante ?? Math.max(1, Math.round(bb / 5)), bringIn: opts.bringIn ?? sb } : {}),
  };
}

const clone = (s: HoldemState): HoldemState => ({
  ...s, seats: s.seats.map((x) => ({ ...x, hole: [...x.hole], up: x.up ? [...x.up] : undefined })), deck: [...s.deck], board: [...s.board], log: [...s.log],
  board2: s.board2 ? [...s.board2] : undefined,
  result: s.result ? { ...s.result, wins: [...s.result.wins] } : undefined,
});

/** Moves chips from a stack into the pot (as this street's bet unless `dead`, as with antes). */
function put(seat: Seat, amount: number, dead = false) {
  const a = Math.min(amount, seat.stack);
  seat.stack -= a;
  if (!dead) seat.bet += a;
  seat.total += a;
  if (seat.stack === 0) seat.allIn = true;
  return a;
}

const dealTo = (s: HoldemState, x: Seat, faceUp: boolean) => {
  x.hole.push(s.deck.pop()!);
  if (variantOf(s) === 'stud') x.up = [...(x.up ?? []), faceUp];
};

/** Stud: the seat with the best hand showing acts first (ties: first left of the button). */
function studFirst(s: HoldemState): number {
  let best = -1;
  let pick = -1;
  for (let k = 1; k <= s.seats.length; k++) {
    const i = (s.button + k) % s.seats.length;
    const x = s.seats[i];
    if (!canBet(x)) continue;
    const v = scoreShowing(showing(x));
    if (v > best) { best = v; pick = i; }
  }
  return pick;
}

/** Deals a new hand: moves the button, posts blinds (or antes and the bring-in), deals. Needs two seats with chips. */
export function startHand(prev: HoldemState, rand: RandomInt = cryptoInt, opts: { straddle?: boolean } = {}): HoldemState {
  const s = clone(prev);
  const v = variantOf(s);
  for (const x of s.seats) Object.assign(x, { hole: [], up: v === 'stud' ? [] : undefined, bet: 0, total: 0, folded: false, allIn: false, acted: false, inHand: x.stack > 0 });
  const dealt = s.seats.filter((x) => x.inHand).length;
  if (dealt < 2) throw new Error('Need two players with chips');
  s.handNo += 1;
  s.result = undefined;
  s.board = [];
  s.board2 = s.rules?.doubleBoard && v !== 'stud' ? [] : undefined;
  s.awaitRunout = false;
  s.runs = undefined;
  s.bounty = undefined;
  s.deck = newDeck(rand);
  s.log = [];
  s.raises = 0;
  s.button = nextSeat(s, s.button, (x) => x.inHand);

  if (v === 'stud') {
    const ante = s.ante ?? 1;
    for (const x of s.seats) if (x.inHand) put(x, ante, true);
    s.log.push(`Antes of ${ante} are in`);
    for (const faceUp of [false, false, true]) {
      let i = s.button;
      for (let k = 0; k < dealt; k++) { i = nextSeat(s, i, (x) => x.inHand); dealTo(s, s.seats[i], faceUp); }
    }
    // Lowest card showing brings it in.
    let low = -1;
    let lowKey = Infinity;
    s.seats.forEach((x, i) => {
      if (!x.inHand || x.allIn) return;
      const c = showing(x)[0];
      const key = (c.rank === 1 ? 14 : c.rank) * 4 + SUIT_RANK[c.suit];
      if (key < lowKey) { lowKey = key; low = i; }
    });
    if (low >= 0) {
      put(s.seats[low], s.bringIn ?? s.sb);
      s.log.push(`${s.seats[low].name} brings it in for ${s.seats[low].bet}`);
    }
    s.currentBet = Math.max(0, ...s.seats.map((x) => x.bet));
    s.minRaise = s.bb;
    s.street = 'third';
    s.toAct = nextSeat(s, low >= 0 ? low : s.button, canBet);
    return settleIfDone(s);
  }

  // Heads-up the button posts the small blind and acts first before the flop.
  const sbSeat = dealt === 2 ? s.button : nextSeat(s, s.button, (x) => x.inHand);
  const bbSeat = nextSeat(s, sbSeat, (x) => x.inHand);
  put(s.seats[sbSeat], s.sb);
  put(s.seats[bbSeat], s.bb);
  s.log.push(`${s.seats[sbSeat].name} posts ${s.seats[sbSeat].bet}`, `${s.seats[bbSeat].name} posts ${s.seats[bbSeat].bet}`);
  s.currentBet = s.bb;
  s.minRaise = s.bb;
  let lastBlind = bbSeat;
  if (opts.straddle && dealt > 2) {
    const st = nextSeat(s, bbSeat, (x) => x.inHand && !x.allIn);
    if (st >= 0 && st !== sbSeat) {
      put(s.seats[st], s.bb * 2);
      s.log.push(`${s.seats[st].name} straddles for ${s.seats[st].bet}`);
      s.currentBet = Math.max(s.bb, s.seats[st].bet);
      s.minRaise = s.bb * 2;
      lastBlind = st;
    }
  }
  for (let r = 0; r < holeCount(v); r++) {
    let i = sbSeat;
    for (let k = 0; k < dealt; k++) {
      dealTo(s, s.seats[i], false);
      i = nextSeat(s, i, (x) => x.inHand);
    }
  }
  s.street = 'preflop';
  s.toAct = nextSeat(s, lastBlind, canBet);
  return settleIfDone(s);
}

export interface Legal {
  fold: boolean;
  check: boolean;
  /** Chips needed to call (0 when checking is possible). */
  toCall: number;
  /** Smallest legal raise-to, or 0 when raising isn't possible. */
  minTo: number;
  /** Largest raise-to. */
  maxTo: number;
}

/** Stud bet size this street: the small bet on third and fourth street, the big bet after. */
const studBet = (s: HoldemState) => (s.street === 'third' || s.street === 'fourth' ? s.bb : s.bb * 2);

export function legal(s: HoldemState, i = s.toAct): Legal {
  const x = s.seats[i];
  const none = { fold: false, check: false, toCall: 0, minTo: 0, maxTo: 0 };
  if (!x || i !== s.toAct || s.result) return none;
  const v = variantOf(s);
  const toCall = Math.min(s.currentBet - x.bet, x.stack);
  const allInTo = x.bet + x.stack;
  const othersCanCall = s.seats.some((o, j) => j !== i && canBet(o));
  const base = { fold: toCall > 0, check: toCall === 0, toCall };
  if (allInTo <= s.currentBet || !othersCanCall) return { ...base, minTo: 0, maxTo: 0 };
  if (v === 'stud') {
    if ((s.raises ?? 0) >= STUD_CAP) return { ...base, minTo: 0, maxTo: 0 };
    const size = studBet(s);
    // On third street the first raise "completes" the bring-in to a full small bet.
    const to = Math.min(s.currentBet < size ? size : s.currentBet + size, allInTo);
    return { ...base, minTo: to, maxTo: to };
  }
  let maxTo = allInTo;
  if (v === 'omaha8') maxTo = Math.min(allInTo, s.currentBet + pot(s) + toCall); // pot limit
  const minTo = Math.min(s.currentBet + s.minRaise, maxTo);
  return { ...base, minTo, maxTo };
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
      if (to < L.minTo || to > L.maxTo) throw new Error(L.minTo === L.maxTo ? `Raise to ${L.minTo}` : `Raise to between ${L.minTo} and ${L.maxTo}`);
      const raiseBy = to - s.currentBet;
      put(x, to - x.bet);
      const stud = variantOf(s) === 'stud';
      const full = stud ? raiseBy * 2 >= studBet(s) : raiseBy >= s.minRaise;
      if (full) {
        if (!stud) s.minRaise = raiseBy;
        s.raises = (s.raises ?? 0) + 1;
        for (const o of s.seats) if (o !== x) o.acted = false; // a full raise reopens the action
      }
      const verb = prev.currentBet === 0 ? 'bets' : stud && prev.street === 'third' && (prev.raises ?? 0) === 0 ? 'completes to' : 'raises to';
      s.currentBet = Math.max(s.currentBet, to);
      s.log.push(`${x.name} ${verb} ${to}${x.allIn ? ' (all in)' : ''}`);
      break;
    }
  }
  x.acted = true;
  s.toAct = nextSeat(s, i, owesAction(s));
  return settleIfDone(s);
}

const roundClosed = (s: HoldemState) => s.seats.every((x) => !canBet(x) || (x.acted && x.bet === s.currentBet));

const NEXT: Partial<Record<Street, Street>> = {
  preflop: 'flop', flop: 'turn', turn: 'river', river: 'showdown',
  third: 'fourth', fourth: 'fifth', fifth: 'sixth', sixth: 'seventh', seventh: 'showdown',
};

function nextStreet(s: HoldemState) {
  for (const x of s.seats) { x.bet = 0; x.acted = false; }
  s.currentBet = 0;
  s.minRaise = s.bb;
  s.raises = 0;
  s.street = NEXT[s.street] ?? 'showdown';
  if (s.street === 'showdown') { s.toAct = -1; return; }
  if (variantOf(s) === 'stud') {
    const faceUp = s.street !== 'seventh';
    let i = s.button;
    // Five seats never run the deck short (5 × 7 = 35 cards).
    for (let k = 0; k < s.seats.length; k++) {
      i = (i + 1) % s.seats.length;
      const x = s.seats[i];
      if (x.inHand && !x.folded) dealTo(s, x, faceUp);
    }
    s.toAct = studFirst(s);
    return;
  }
  dealBoards(s);
  s.toAct = nextSeat(s, s.button, canBet);
}

/** Burn and deal the next street to the board (and the second board, under Double Board). */
function dealBoards(s: HoldemState) {
  const n = s.board.length === 0 ? 3 : 1;
  s.deck.pop();
  for (let k = 0; k < n; k++) s.board.push(s.deck.pop()!);
  if (s.board2 && !s.runs) {
    s.deck.pop();
    for (let k = 0; k < n; k++) s.board2.push(s.deck.pop()!);
  }
}

const boardGame = (s: HoldemState) => variantOf(s) !== 'stud';

/**
 * Runs the board out once or twice after everyone left is all in (the table's choice under
 * Run It Twice). The second run shares the cards already out and deals its own after them.
 */
export function runOut(prev: HoldemState, times: 1 | 2): HoldemState {
  if (!prev.awaitRunout) throw new Error('Nothing to run out');
  const s = clone(prev);
  s.awaitRunout = false;
  s.runs = times;
  if (times === 2) {
    const shared = [...s.board];
    while (s.board.length < 5) { s.deck.pop(); s.board.push(s.deck.pop()!); }
    s.board2 = shared;
    while (s.board2.length < 5) { s.deck.pop(); s.board2.push(s.deck.pop()!); }
    s.log.push('Running it twice');
    s.street = 'river';
  }
  return settleIfDone(s);
}

/**
 * Rabbit hunt: the board cards that would have come if the hand had gone on (shown after a
 * hand ends early; changes nothing). Follows the same burn-and-deal order as the real deal.
 */
export function rabbit(s: HoldemState): Card[] {
  if (!s.result || !boardGame(s) || s.board.length >= 5) return [];
  const deck = [...s.deck];
  const out = [...s.board];
  while (out.length < 5) {
    const n = out.length === 0 ? 3 : 1;
    deck.pop();
    if (s.board2) deck.pop(); // the second board's burn would have come out too
    for (let k = 0; k < n; k++) out.push(deck.pop()!);
    if (s.board2) for (let k = 0; k < n; k++) deck.pop();
  }
  return out.slice(s.board.length);
}

/** Ends the hand if one player is left, closes betting rounds, runs cards out when nobody can bet. */
function settleIfDone(s: HoldemState): HoldemState {
  for (;;) {
    const alive = live(s);
    if (alive.length === 1) {
      award(s, [{ seat: s.seats.indexOf(alive[0]), amount: pot(s) }], false);
      return s;
    }
    const bettors = s.seats.filter(canBet);
    const someoneOwes = bettors.length > 1 ? !roundClosed(s) : bettors.length === 1 && bettors[0].bet < s.currentBet;
    if (someoneOwes && s.toAct >= 0) return s;
    // Nobody can bet any more with cards to come: under Run It Twice the table decides first.
    if (bettors.length <= 1 && boardGame(s) && s.rules?.runTwice && !s.board2 && !s.runs && s.street !== 'river' && s.street !== 'showdown') {
      s.toAct = -1;
      s.awaitRunout = true;
      return s;
    }
    if (s.street === 'river' || s.street === 'seventh' || s.street === 'showdown') { showdown(s); return s; }
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

export interface Rated { high: number; cls: HandClass; low: number | null }

/** A seat's showdown value: high score (higher better) and, in Omaha Hi-Lo, low value (lower better). */
export function rate(v: PokerVariant, hole: readonly Card[], board: readonly Card[]): Rated {
  if (v === 'omaha8') {
    const h = omahaHigh(hole, board);
    return { high: h.score, cls: h.cls, low: omahaLow(hole, board) };
  }
  const b = bestHand([...hole, ...board]);
  return { high: b.score, cls: b.cls, low: null };
}

/** Splits `amount` among winners, odd chips to the first left of the button. */
function splitAmong(s: HoldemState, winners: number[], amount: number, label: (w: number) => Omit<PotWin, 'seat' | 'amount'>): PotWin[] {
  const n = s.seats.length;
  const ordered = [...winners].sort((a, b) => ((a - s.button - 1 + n) % n) - ((b - s.button - 1 + n) % n));
  const share = Math.floor(amount / ordered.length);
  let odd = amount - share * ordered.length;
  return ordered.map((w) => {
    const extra = odd > 0 ? 1 : 0;
    odd -= extra;
    return { seat: w, amount: share + extra, ...label(w) };
  });
}

function showdown(s: HoldemState) {
  const v = variantOf(s);
  if (v !== 'stud') {
    while (s.board.length < 5) { s.deck.pop(); s.board.push(s.deck.pop()!); }
    if (s.board2) while (s.board2.length < 5) { s.deck.pop(); s.board2.push(s.deck.pop()!); }
  }
  s.street = 'showdown';
  const boards = s.board2 ? [s.board, s.board2] : [s.board];
  const wins: PotWin[] = [];
  for (const p of sidePots(s.seats)) {
    // Each board takes its share of every pot (the first board gets the odd chip).
    const shares = boards.length === 2 ? [p.amount - Math.floor(p.amount / 2), Math.floor(p.amount / 2)] : [p.amount];
    boards.forEach((board, b) => {
      const rated = s.seats.map((x) => (x.inHand && !x.folded ? rate(v, x.hole, board) : null));
      const run = boards.length === 2 ? ((b + 1) as 1 | 2) : undefined;
      const amount = shares[b];
      const best = Math.max(...p.eligible.map((i) => rated[i]!.high));
      const hiWinners = p.eligible.filter((i) => rated[i]!.high === best);
      const lows = p.eligible.filter((i) => rated[i]!.low !== null);
      const hiName = (w: number) => ({ hand: HAND_CLASS_NAMES[rated[w]!.cls], run });
      if (v === 'omaha8' && lows.length) {
        const bestLow = Math.min(...lows.map((i) => rated[i]!.low!));
        const loWinners = lows.filter((i) => rated[i]!.low === bestLow);
        const loAmount = Math.floor(amount / 2); // the odd chip goes to the high half
        wins.push(...splitAmong(s, hiWinners, amount - loAmount, (w) => ({ ...hiName(w), half: 'high' })));
        wins.push(...splitAmong(s, loWinners, loAmount, () => ({ hand: lowName(bestLow), half: 'low', run })));
      } else {
        wins.push(...splitAmong(s, hiWinners, amount, hiName));
      }
    });
  }
  award(s, wins, true);
}

const withArticle = (h: string) => {
  const l = h.toLowerCase();
  if (l === 'two pair') return l;
  if (/low$/.test(l)) return `${/^(a|8)/.test(l) ? 'an' : 'a'} ${h}`;
  return `${/^[aeiou]/.test(l) ? 'an' : 'a'} ${l}`;
};

function award(s: HoldemState, wins: PotWin[], shown: boolean) {
  for (const w of wins) s.seats[w.seat].stack += w.amount;
  for (const x of s.seats) { x.bet = 0; x.total = 0; }
  s.toAct = -1;
  s.currentBet = 0;
  s.result = { wins, shown };
  // One log line per seat and half.
  const merged = new Map<string, PotWin>();
  for (const w of wins) {
    const k = `${w.seat}:${w.half ?? ''}:${w.run ?? ''}`;
    const m = merged.get(k);
    merged.set(k, m ? { ...m, amount: m.amount + w.amount } : { ...w });
  }
  for (const w of merged.values()) {
    const tag = [w.run ? `board ${w.run}` : '', w.half ?? ''].filter(Boolean).join(', ');
    s.log.push(`${s.seats[w.seat].name} wins $${w.amount.toLocaleString('en-US')}${tag ? ` (${tag})` : ''}${w.hand ? ` with ${withArticle(w.hand)}` : ''}`);
  }
  // The 7-2 Game: a pot won holding seven-deuce collects the bounty from everyone else dealt in.
  const bounty = s.rules?.sevenDeuce ?? 0;
  if (bounty > 0 && variantOf(s) === 'holdem') {
    const winners = [...new Set(wins.filter((w) => w.amount > 0).map((w) => w.seat))];
    const sd = winners.find((w) => { const r = s.seats[w].hole.map((c) => c.rank).sort((a, b) => a - b); return r[0] === 2 && r[1] === 7; });
    if (sd !== undefined) {
      let got = 0;
      for (const [i, x] of s.seats.entries()) {
        if (i === sd || !x.inHand) continue;
        const pay = Math.min(bounty, x.stack);
        x.stack -= pay;
        got += pay;
      }
      s.seats[sd].stack += got;
      s.bounty = { seat: sd, amount: got };
      s.log.push(`7-2! ${s.seats[sd].name} collects a $${got.toLocaleString('en-US')} bounty`);
    }
  }
}
