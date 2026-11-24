/**
 * Craps, the full game: Pass Line and Don't Pass with odds, Come and Don't Come with their own
 * points and odds, Place bets on 4, 5, 6, 8, 9 and 10, the Field, the hardways and the one-roll
 * proposition bets (0.20.3). Big 6/8 is left out (a worse version of placing the 6 or 8). Pure
 * rules; money is handled by CasinoService, which keeps the table on the career so bets ride
 * across rolls and reloads.
 *
 * Rules (standard Las Vegas):
 *  - Pass / Don't Pass go down on the come-out roll only. 7 or 11 wins Pass, 2, 3, 12 lose it;
 *    Don't Pass wins on 2 and 3, pushes on 12 (bar 12), loses on 7 and 11. Any other number is the
 *    point: Pass wins if it repeats before a 7, Don't Pass if the 7 comes first. Both pay 1 to 1.
 *  - Come / Don't Come are the same bets made while a point is on; each travels to its own number.
 *  - Odds behind Pass and Come pay true odds (2:1 on 4/10, 3:2 on 5/9, 6:5 on 6/8), up to 2x the
 *    flat bet. Lay odds behind Don't Pass and Don't Come pay 1:2, 2:3, 5:6, up to what wins 2x the
 *    flat bet. Odds on Come points are off on the come-out roll (returned if a 7 or the number
 *    rolls then); lay odds always work.
 *  - Place bets pay 9:5 on 4/10, 7:5 on 5/9, 7:6 on 6/8, stay up after a win (only the win is
 *    paid), lose on a 7, and are off on the come-out roll unless turned on.
 *  - Field (one roll): 3, 4, 9, 10, 11 pay 1:1, 2 pays 2:1, 12 pays 3:1, else loses.
 *  - Hardways: hard 4 / 10 pay 7:1, hard 6 / 8 pay 9:1 (the number rolled as a pair); they lose on
 *    the easy way or a 7, stay up after a win, and (like Place bets) are off on the come-out roll
 *    unless turned on. $1–$100 each.
 *  - One-roll bets: Any Seven 4:1, Any Craps (2, 3, 12) 7:1, Aces (2) 30:1, Ace-Deuce (3) 15:1,
 *    Yo (11) 15:1, Twelve 30:1. Horn puts the chip on each of 2, 3, 11 and 12. $1–$100 each.
 * Odd amounts that a ratio can't pay exactly are rounded down, as at a real table.
 */
import { cryptoInt, type RandomInt } from './random';

export const CRAPS_LIMITS = { min: 5, max: 1000 };
export const POINTS = [4, 5, 6, 8, 9, 10] as const;
export type PointNo = (typeof POINTS)[number];

const TRUE_ODDS: Record<PointNo, [number, number]> = { 4: [2, 1], 10: [2, 1], 5: [3, 2], 9: [3, 2], 6: [6, 5], 8: [6, 5] };
const LAY_ODDS: Record<PointNo, [number, number]> = { 4: [1, 2], 10: [1, 2], 5: [2, 3], 9: [2, 3], 6: [5, 6], 8: [5, 6] };
const PLACE_PAYS: Record<PointNo, [number, number]> = { 4: [9, 5], 10: [9, 5], 5: [7, 5], 9: [7, 5], 6: [7, 6], 8: [7, 6] };

export const HARD_NUMBERS = [4, 6, 8, 10] as const;
export type HardNo = (typeof HARD_NUMBERS)[number];
export const HARD_PAYS: Record<HardNo, number> = { 4: 7, 6: 9, 8: 9, 10: 7 };

export type PropKey = 'any7' | 'anyCraps' | 'two' | 'three' | 'yo' | 'twelve';
export const PROPS: { key: PropKey; name: string; pays: number; wins: (sum: number) => boolean }[] = [
  { key: 'any7', name: 'Any Seven', pays: 4, wins: (s) => s === 7 },
  { key: 'anyCraps', name: 'Any Craps', pays: 7, wins: (s) => s === 2 || s === 3 || s === 12 },
  { key: 'two', name: 'Aces (2)', pays: 30, wins: (s) => s === 2 },
  { key: 'three', name: 'Ace-Deuce (3)', pays: 15, wins: (s) => s === 3 },
  { key: 'yo', name: 'Yo (11)', pays: 15, wins: (s) => s === 11 },
  { key: 'twelve', name: 'Twelve', pays: 30, wins: (s) => s === 12 },
];
/** Horn: the chip goes on each of these. */
export const HORN: PropKey[] = ['two', 'three', 'yo', 'twelve'];
export const PROP_LIMITS = { min: 1, max: 100 };
export const ODDS_MULTIPLE = 2;

/** A bet that has travelled to a number, with its odds. */
export interface NumberBet { bet: number; odds: number }

export interface CrapsTable {
  v: 2;
  point: PointNo | null;
  pass: number;
  passOdds: number;
  dontPass: number;
  dontOdds: number;
  field: number;
  /** Come / Don't Come bets waiting for their first roll. */
  come: number;
  dontCome: number;
  comePoints: Partial<Record<PointNo, NumberBet>>;
  dontComePoints: Partial<Record<PointNo, NumberBet>>;
  place: Partial<Record<PointNo, number>>;
  /** Place bets and hardways work on the come-out roll too. */
  placeOn: boolean;
  hard: Partial<Record<HardNo, number>>;
  props: Partial<Record<PropKey, number>>;
}

export const newTable = (): CrapsTable => ({
  v: 2, point: null, pass: 0, passOdds: 0, dontPass: 0, dontOdds: 0, field: 0, come: 0, dontCome: 0,
  comePoints: {}, dontComePoints: {}, place: {}, placeOn: false, hard: {}, props: {},
});

export type CrapsAction =
  | { kind: 'pass' | 'dontPass' | 'passOdds' | 'dontOdds' | 'field' | 'come' | 'dontCome' }
  | { kind: 'place' | 'comeOdds' | 'dontComeOdds'; n: PointNo }
  | { kind: 'hard'; n: HardNo }
  | { kind: 'prop'; p: PropKey }
  | { kind: 'horn' };

/** Chips one tap of an action takes from the bank (Horn: the chip on each of four numbers). */
export const costOf = (a: CrapsAction, chip: number) => (a.kind === 'horn' ? chip * HORN.length : chip);

export const isPoint = (n: number): n is PointNo => (POINTS as readonly number[]).includes(n);
const ratio = (amount: number, [a, b]: [number, number]) => Math.floor((amount * a) / b);

/** Most odds a flat bet allows on a number: Pass/Come 2x; lay odds up to what wins 2x the flat bet. */
export const maxOdds = (flat: number) => flat * ODDS_MULTIPLE;
export const maxLay = (flat: number, n: PointNo) => Math.floor((flat * ODDS_MULTIPLE * LAY_ODDS[n][1]) / LAY_ODDS[n][0]);

/** Chips on the table for an action (what adding to it starts from). */
export function amountOn(t: CrapsTable, a: CrapsAction): number {
  switch (a.kind) {
    case 'place': return t.place[a.n] ?? 0;
    case 'comeOdds': return t.comePoints[a.n]?.odds ?? 0;
    case 'dontComeOdds': return t.dontComePoints[a.n]?.odds ?? 0;
    case 'hard': return t.hard[a.n] ?? 0;
    case 'prop': return t.props[a.p] ?? 0;
    case 'horn': return HORN.reduce((s, p) => s + (t.props[p] ?? 0), 0);
    default: return t[a.kind];
  }
}

/** Why a bet can't go down right now, or null. */
export function betBlocker(t: CrapsTable, a: CrapsAction, amount: number): string | null {
  if (!Number.isInteger(amount) || amount <= 0) return 'Pick a chip';
  if (a.kind === 'hard' || a.kind === 'prop' || a.kind === 'horn') {
    const each = a.kind === 'hard' ? [t.hard[a.n] ?? 0] : a.kind === 'prop' ? [t.props[a.p] ?? 0] : HORN.map((p) => t.props[p] ?? 0);
    if (each.some((v) => v + amount > PROP_LIMITS.max)) return `Most on one of these is $${PROP_LIMITS.max}`;
    return null;
  }
  const now = amountOn(t, a) + amount;
  switch (a.kind) {
    case 'pass':
    case 'dontPass':
      if (t.point !== null) return 'Line bets go down on the come-out roll';
      break;
    case 'come':
    case 'dontCome':
      if (t.point === null) return 'Come bets go down once a point is on (use the Pass Line now)';
      break;
    case 'passOdds':
      if (t.point === null || t.pass === 0) return 'Odds need a Pass bet and a point';
      if (now > maxOdds(t.pass)) return `Odds max is ${ODDS_MULTIPLE}× your Pass bet`;
      return null;
    case 'dontOdds':
      if (t.point === null || t.dontPass === 0) return 'Lay odds need a Don’t Pass bet and a point';
      if (now > maxLay(t.dontPass, t.point)) return `Lay odds max here is ${formatMax(maxLay(t.dontPass, t.point))}`;
      return null;
    case 'comeOdds': {
      const cb = t.comePoints[a.n];
      if (!cb) return `No Come bet on the ${a.n}`;
      if (now > maxOdds(cb.bet)) return `Odds max is ${ODDS_MULTIPLE}× your Come bet`;
      return null;
    }
    case 'dontComeOdds': {
      const db = t.dontComePoints[a.n];
      if (!db) return `No Don’t Come bet on the ${a.n}`;
      if (now > maxLay(db.bet, a.n)) return `Lay odds max here is ${formatMax(maxLay(db.bet, a.n))}`;
      return null;
    }
    case 'place':
      break;
    case 'field':
      break;
  }
  if (now > CRAPS_LIMITS.max) return `Table max $${CRAPS_LIMITS.max}`;
  if (now < CRAPS_LIMITS.min) return `Table min $${CRAPS_LIMITS.min}`;
  return null;
}
const formatMax = (n: number) => `$${n.toLocaleString('en-US')}`;

/** Bets that may be taken back down (Place bets and any odds), as at a real table. */
export const canTakeDown = (a: CrapsAction) => a.kind === 'place' || a.kind === 'hard' || a.kind === 'prop' || a.kind === 'horn' || a.kind === 'passOdds' || a.kind === 'dontOdds' || a.kind === 'comeOdds' || a.kind === 'dontComeOdds';

export function addBet(t: CrapsTable, a: CrapsAction, amount: number): CrapsTable {
  const n = clone(t);
  if (a.kind === 'place') n.place[a.n] = (n.place[a.n] ?? 0) + amount;
  else if (a.kind === 'hard') n.hard[a.n] = (n.hard[a.n] ?? 0) + amount;
  else if (a.kind === 'prop') n.props[a.p] = (n.props[a.p] ?? 0) + amount;
  else if (a.kind === 'horn') for (const p of HORN) n.props[p] = (n.props[p] ?? 0) + amount;
  else if (a.kind === 'comeOdds') n.comePoints[a.n]!.odds += amount;
  else if (a.kind === 'dontComeOdds') n.dontComePoints[a.n]!.odds += amount;
  else n[a.kind] += amount;
  return n;
}

/** Removes a bet that may come down; returns the new table and the chips returned. */
export function takeDown(t: CrapsTable, a: CrapsAction): { table: CrapsTable; returned: number } {
  if (!canTakeDown(a)) return { table: t, returned: 0 };
  const returned = amountOn(t, a);
  const n = clone(t);
  if (a.kind === 'place') delete n.place[a.n];
  else if (a.kind === 'hard') delete n.hard[a.n];
  else if (a.kind === 'prop') delete n.props[a.p];
  else if (a.kind === 'horn') for (const p of HORN) delete n.props[p];
  else if (a.kind === 'comeOdds') n.comePoints[a.n]!.odds = 0;
  else if (a.kind === 'dontComeOdds') n.dontComePoints[a.n]!.odds = 0;
  else n[a.kind as 'passOdds' | 'dontOdds'] = 0;
  return { table: n, returned };
}

export const rollDice = (rand: RandomInt = cryptoInt): [number, number] => [rand(6) + 1, rand(6) + 1];

export interface BetOutcome {
  /** Which bet, e.g. "pass", "come 6", "place 8". */
  bet: string;
  result: 'win' | 'lose' | 'push' | 'move';
  /** Chips that came off the table with this decision (0 for a Place win, whose bet stays up). */
  stake: number;
  /** Paid back to the player, stake included when it comes off the table. */
  payout: number;
}

export function resolveRoll(prev: CrapsTable, dice: [number, number]): { table: CrapsTable; outcomes: BetOutcome[]; message: string } {
  const sum = dice[0] + dice[1];
  const t = clone(prev);
  const out: BetOutcome[] = [];
  const comeOut = t.point === null;
  const push = (bet: string, result: BetOutcome['result'], stake: number, payout: number) => { if (stake > 0 || payout > 0) out.push({ bet, result, stake, payout }); };

  // Field: one roll.
  if (t.field > 0) {
    const f = t.field;
    if (sum === 2) push('field', 'win', f, f * 3);
    else if (sum === 12) push('field', 'win', f, f * 4);
    else if ([3, 4, 9, 10, 11].includes(sum)) push('field', 'win', f, f * 2);
    else push('field', 'lose', f, 0);
    t.field = 0;
  }

  // One-roll proposition bets.
  for (const pr of PROPS) {
    const b = t.props[pr.key];
    if (!b) continue;
    push(`prop ${pr.key}`, pr.wins(sum) ? 'win' : 'lose', b, pr.wins(sum) ? b * (pr.pays + 1) : 0);
  }
  t.props = {};

  // Hardways: off on the come-out unless turned on; stay up after a win.
  if (!comeOut || t.placeOn) {
    const pair = dice[0] === dice[1];
    for (const n of HARD_NUMBERS) {
      const b = t.hard[n];
      if (!b) continue;
      if (sum === n && pair) push(`hard ${n}`, 'win', 0, b * HARD_PAYS[n]);
      else if (sum === n || sum === 7) { push(`hard ${n}`, 'lose', b, 0); delete t.hard[n]; }
    }
  }

  // Place bets: off on the come-out unless turned on.
  if (!comeOut || t.placeOn) {
    for (const n of POINTS) {
      const b = t.place[n];
      if (!b) continue;
      if (sum === n) push(`place ${n}`, 'win', 0, ratio(b, PLACE_PAYS[n]));
      else if (sum === 7) { push(`place ${n}`, 'lose', b, 0); delete t.place[n]; }
    }
  }

  // Come points (before new Come bets travel, so a bet moving to a number isn't decided on the same roll).
  for (const n of POINTS) {
    const cb = t.comePoints[n];
    if (!cb) continue;
    if (sum === n) {
      // Odds are off on the come-out: returned, not paid.
      push(`come ${n}`, 'win', cb.bet + cb.odds, cb.bet * 2 + (comeOut ? cb.odds : cb.odds + ratio(cb.odds, TRUE_ODDS[n])));
      delete t.comePoints[n];
    } else if (sum === 7) {
      push(`come ${n}`, 'lose', cb.bet + cb.odds, comeOut ? cb.odds : 0);
      delete t.comePoints[n];
    }
  }
  for (const n of POINTS) {
    const db = t.dontComePoints[n];
    if (!db) continue;
    if (sum === 7) {
      push(`don't come ${n}`, 'win', db.bet + db.odds, db.bet * 2 + db.odds + ratio(db.odds, LAY_ODDS[n]));
      delete t.dontComePoints[n];
    } else if (sum === n) {
      push(`don't come ${n}`, 'lose', db.bet + db.odds, 0);
      delete t.dontComePoints[n];
    }
  }

  // New Come / Don't Come bets: decided like a come-out roll, or travel to the number.
  if (t.come > 0) {
    const c = t.come;
    if (sum === 7 || sum === 11) push('come', 'win', c, c * 2);
    else if (sum === 2 || sum === 3 || sum === 12) push('come', 'lose', c, 0);
    else {
      const n = sum as PointNo;
      t.comePoints[n] = { bet: (t.comePoints[n]?.bet ?? 0) + c, odds: t.comePoints[n]?.odds ?? 0 };
      out.push({ bet: `come to ${n}`, result: 'move', stake: 0, payout: 0 });
    }
    t.come = 0;
  }
  if (t.dontCome > 0) {
    const d = t.dontCome;
    if (sum === 2 || sum === 3) push("don't come", 'win', d, d * 2);
    else if (sum === 12) push("don't come", 'push', d, d);
    else if (sum === 7 || sum === 11) push("don't come", 'lose', d, 0);
    else {
      const n = sum as PointNo;
      t.dontComePoints[n] = { bet: (t.dontComePoints[n]?.bet ?? 0) + d, odds: t.dontComePoints[n]?.odds ?? 0 };
      out.push({ bet: `don't come to ${n}`, result: 'move', stake: 0, payout: 0 });
    }
    t.dontCome = 0;
  }

  // The line.
  let message: string;
  if (comeOut) {
    if (sum === 7 || sum === 11) {
      push('pass', 'win', t.pass, t.pass * 2);
      push("don't pass", 'lose', t.dontPass, 0);
      t.pass = 0; t.dontPass = 0;
      message = `${sum}: natural! Pass wins`;
    } else if (sum === 2 || sum === 3 || sum === 12) {
      push('pass', 'lose', t.pass, 0);
      if (sum === 12) push("don't pass", 'push', t.dontPass, t.dontPass);
      else push("don't pass", 'win', t.dontPass, t.dontPass * 2);
      t.pass = 0; t.dontPass = 0;
      message = `${sum}: craps`;
    } else {
      t.point = sum as PointNo;
      message = `Point is ${sum}`;
    }
  } else if (sum === t.point) {
    const n: PointNo = t.point;
    push('pass', 'win', t.pass + t.passOdds, t.pass * 2 + t.passOdds + ratio(t.passOdds, TRUE_ODDS[n]));
    push("don't pass", 'lose', t.dontPass + t.dontOdds, 0);
    t.pass = 0; t.passOdds = 0; t.dontPass = 0; t.dontOdds = 0;
    t.point = null;
    message = `${sum}: hit the point! Pass wins`;
  } else if (sum === 7) {
    const n = t.point as PointNo;
    push('pass', 'lose', t.pass + t.passOdds, 0);
    push("don't pass", 'win', t.dontPass + t.dontOdds, t.dontPass * 2 + t.dontOdds + ratio(t.dontOdds, LAY_ODDS[n]));
    t.pass = 0; t.passOdds = 0; t.dontPass = 0; t.dontOdds = 0;
    t.point = null;
    message = '7 out';
  } else {
    message = `${sum}: no decision on the line`;
  }
  return { table: t, outcomes: out, message };
}

/** All chips on the table. */
export function onTable(t: CrapsTable): number {
  let s = t.pass + t.passOdds + t.dontPass + t.dontOdds + t.field + t.come + t.dontCome;
  for (const n of HARD_NUMBERS) s += t.hard[n] ?? 0;
  for (const p of PROPS) s += t.props[p.key] ?? 0;
  for (const n of POINTS) s += (t.place[n] ?? 0) + (t.comePoints[n]?.bet ?? 0) + (t.comePoints[n]?.odds ?? 0) + (t.dontComePoints[n]?.bet ?? 0) + (t.dontComePoints[n]?.odds ?? 0);
  return s;
}

/** The most one roll can pay back per chip on the table (a 2 or 12 one-roll bet: 31x). */
export const MAX_ROLL_RETURN = 31;

function clone(t: CrapsTable): CrapsTable {
  return {
    ...t,
    comePoints: Object.fromEntries(Object.entries(t.comePoints).map(([k, v]) => [k, { ...v! }])),
    dontComePoints: Object.fromEntries(Object.entries(t.dontComePoints).map(([k, v]) => [k, { ...v! }])),
    place: { ...t.place },
    hard: { ...(t.hard ?? {}) },
    props: { ...(t.props ?? {}) },
  };
}

/** Reads a saved table (null or unreadable: an empty table). */
export function readTable(raw: unknown): CrapsTable {
  if (typeof raw !== 'string' || !raw) return newTable();
  try {
    const t = JSON.parse(raw) as CrapsTable;
    return t && t.v === 2 ? { ...newTable(), ...t } : newTable();
  } catch {
    return newTable();
  }
}
