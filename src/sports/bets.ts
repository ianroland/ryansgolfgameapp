/**
 * Sportsbook tickets (pure). Building a ticket re-prices every pick from the engine and refuses a
 * line that doesn't match what the board offers, so odds are locked exactly as offered. Settling
 * grades each leg from the engine's final score.
 *
 * Rules (SPORTSBOOK_DESIGN.md §11): singles pay stake × decimal odds; pushes and voids refund.
 * A parlay is lost if any leg loses; pushed or void legs drop out and the rest pay the product
 * of their odds; if every leg pushes or voids the stake comes back. Parlay payout cap applies.
 */
import { decimalOf, fmtAmerican, teamById, type LeagueId, type Market, type Side } from './demo';
import { findGame, isFinal, openGame, type WorldRef } from './book';
import { parlayCheck, SLIP_RULES, type Selection } from './slip';
import type { PlayedGame } from './season';

export type LegResult = 'won' | 'lost' | 'push' | 'void';
export interface TicketLeg {
  gameId: string;
  league: LeagueId;
  season: number;
  week: number;
  when: string;
  home: string;
  away: string;
  market: Market;
  side: Side;
  point: number | null;
  american: number;
  label: string;
  result?: LegResult;
  /** Final score, home first. */
  final?: [number, number];
}
export interface Ticket {
  id: string;
  kind: 'single' | 'parlay';
  legs: TicketLeg[];
  stake: number;
  /** Return if everything wins (stake included), at the locked odds. */
  toReturn: number;
  placed: { season: number; week: number };
  lounge: string;
  status: 'open' | 'won' | 'lost' | 'push';
  payout: number;
  settled?: { season: number; week: number };
}
export interface BookTotals { tickets: number; staked: number; returned: number; won: number; lost: number; pushed: number }
export const EMPTY_TOTALS: BookTotals = { tickets: 0, staked: 0, returned: 0, won: 0, lost: 0, pushed: 0 };

/** Max single stake by lounge (APPROVED proposal: $1,000 / $2,500 / $10,000). */
export const MAX_STAKE: Record<string, number> = { desert_palms: 1000, white_buffalo: 2500, morongo_sky: 10000 };
export const MAX_OPEN_TICKETS = 50;
/** Settled tickets kept for the history list (lifetime totals are kept separately). */
export const HISTORY_KEEP = 100;

export function gradeLeg(leg: Pick<TicketLeg, 'market' | 'side' | 'point'>, hs: number, as: number): LegResult {
  if (leg.market === 'moneyline') {
    if (hs === as) return 'push';
    return (hs > as) === (leg.side === 'home') ? 'won' : 'lost';
  }
  if (leg.market === 'spread') {
    const d = (leg.side === 'home' ? hs - as : as - hs) + (leg.point ?? 0);
    return d > 0 ? 'won' : d < 0 ? 'lost' : 'push';
  }
  const total = hs + as;
  const pt = leg.point ?? 0;
  if (total === pt) return 'push';
  return (total > pt) === (leg.side === 'over') ? 'won' : 'lost';
}

/** Grade a whole ticket once all its games are final. Returns null while any leg is still open. */
export function settleTicket(t: Ticket, seed: WorldRef, season: number, week: number): Ticket | null {
  if (t.status !== 'open') return null;
  if (!t.legs.every((l) => isFinal(l.season, l.week, season, week))) return null;
  const legs = t.legs.map((l): TicketLeg => {
    const f = findGame(seed, l.season, l.gameId);
    if (!f) return { ...l, result: 'void' };
    const g: PlayedGame = f.game;
    return { ...l, result: gradeLeg(l, g.result.homeScore, g.result.awayScore), final: [g.result.homeScore, g.result.awayScore] };
  });
  let payout: number;
  let status: Ticket['status'];
  if (legs.some((l) => l.result === 'lost')) {
    payout = 0;
    status = 'lost';
  } else {
    const live = legs.filter((l) => l.result === 'won');
    if (!live.length) {
      payout = t.stake;
      status = 'push';
    } else {
      const dec = live.reduce((a, l) => a * decimalOf(l.american), 1);
      payout = Math.floor(t.stake * dec);
      if (t.kind === 'parlay') payout = Math.min(payout, t.stake * SLIP_RULES.capMultiple, SLIP_RULES.capAmount);
      status = 'won';
    }
  }
  return { ...t, legs, payout, status, settled: { season, week } };
}

export type BuildResult = { ok: true; tickets: Ticket[]; total: number } | { ok: false; reason: string };

/**
 * Turn a slip into tickets: one per pick for singles, one for a parlay. Each pick must be on a
 * game still open at this calendar position, and its line must match the board exactly.
 */
export function buildTickets(args: {
  seed: WorldRef; season: number; week: number; picks: Selection[]; stake: number; parlay: boolean;
  balance: number; lounge: string; requestId: string; openCount: number;
}): BuildResult {
  const { seed, season, week, picks, stake, parlay, balance, lounge, requestId, openCount } = args;
  if (!picks.length) return { ok: false, reason: 'The slip is empty' };
  const max = MAX_STAKE[lounge] ?? SLIP_RULES.maxStake;
  if (!Number.isInteger(stake) || stake < SLIP_RULES.minStake) return { ok: false, reason: `Minimum stake is $${SLIP_RULES.minStake}` };
  if (stake > max) return { ok: false, reason: `Maximum stake here is $${max.toLocaleString()}` };
  if (parlay) {
    const pc = parlayCheck(picks);
    if (!pc.ok) return pc;
  }
  const count = parlay ? 1 : picks.length;
  if (openCount + count > MAX_OPEN_TICKETS) return { ok: false, reason: `You can hold up to ${MAX_OPEN_TICKETS} open tickets` };
  const legs: TicketLeg[] = [];
  for (const p of picks) {
    const g = openGame(seed, season, week, p.gameId);
    if (!g) return { ok: false, reason: 'That game has already been played' };
    const line = g.lines.find((l) => l.market === p.market && l.side === p.side);
    if (!line || line.american !== p.american || line.point !== p.point) return { ok: false, reason: 'A line changed. Check the board and try again.' };
    legs.push({ gameId: g.id, league: g.league, season: g.season, week: g.week, when: g.when, home: g.home, away: g.away, market: p.market, side: p.side, point: p.point, american: p.american, label: p.label });
  }
  const total = stake * count;
  if (total > balance) return { ok: false, reason: 'Not enough in the bank' };
  const mk = (id: string, ls: TicketLeg[], kind: Ticket['kind']): Ticket => {
    const dec = ls.reduce((a, l) => a * decimalOf(l.american), 1);
    const raw = Math.floor(stake * dec);
    const toReturn = kind === 'parlay' ? Math.min(raw, stake * SLIP_RULES.capMultiple, SLIP_RULES.capAmount) : raw;
    return { id, kind, legs: ls, stake, toReturn, placed: { season, week }, lounge, status: 'open', payout: 0 };
  };
  const tickets = parlay ? [mk(`${requestId}:p`, legs, 'parlay')] : legs.map((l, i) => mk(`${requestId}:${i}`, [l], 'single'));
  return { ok: true, tickets, total };
}

/** One line per ticket for the inbox and history. */
export function ticketLine(t: Ticket): string {
  const score = (l: TicketLeg) => (l.final ? ` (${teamById(l.away).short} ${l.final[1]}, ${teamById(l.home).short} ${l.final[0]})` : '');
  const legs = t.legs.map((l) => `${l.label} ${fmtAmerican(l.american)}${score(l)}${t.kind === 'parlay' && l.result ? ` ${l.result}` : ''}`).join('; ');
  const head = t.kind === 'parlay' ? `${t.legs.length}-leg parlay` : 'Single';
  const res = t.status === 'won' ? `won $${t.payout.toLocaleString()}` : t.status === 'lost' ? `lost $${t.stake.toLocaleString()}` : t.status === 'push' ? `push, $${t.stake.toLocaleString()} back` : `$${t.stake.toLocaleString()} to return $${t.toReturn.toLocaleString()}`;
  return `${head}, ${res}: ${legs}`;
}
