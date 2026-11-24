/**
 * Sportsbook state on the career (pure). Tickets and lifetime totals live in career flags (like
 * the casino's race history), so they save, export and import with the career and need no new
 * tables. Money moves only as ledger postings with keys `bet:<ticketId>` / `payout:<ticketId>`,
 * written in the same transaction as the career, so a replay can't charge or pay twice.
 */
import { hashString } from '../golf/math';
import { EMPTY_TOTALS, HISTORY_KEEP, settleTicket, ticketLine, type BookTotals, type Ticket } from '../sports/bets';
import type { WorldRef } from '../sports/book';
import { SPORTS_CONFIG } from '../sports/config';
import { inbox, type MoneyOp, type Outcome } from './engine';
import type { CareerState } from './types';

/** The sports world's seed: fixed per career, so every season replays identically. */
export const sportsSeedOf = (c: Pick<CareerState, 'flags' | 'playerId'>): number =>
  typeof c.flags.sportsSeed === 'number' ? c.flags.sportsSeed : hashString(`sports:${c.playerId}`) % 2_000_000_000;

/**
 * Sports world version. v2 (Phase D part 2) saves carry `sportsHistoryFrom`: the first career
 * season on the history carry-over rosters. v3 (Phase D part 3) adds `sportsEvolveFrom`: the first
 * season whose rosters come from a yearly off-season (aging, retirements, drafts); seasons from
 * `sportsHistoryFrom` up to it keep the fixed 2027 rosters. `sportsYearDone` is the last sports
 * year whose off-season is stored. Saves below v3 are moved up by `migrateSportsWorld`.
 */
export const SPORTS_WORLD_VERSION = 3;
/** First calendar week with sports games (a game in week W is final once the career passes W). */
export const SPORTS_FIRST_WEEK = Math.min(...Object.values(SPORTS_CONFIG.calendar).map((c) => c.startWeek));
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** The world this career's sportsbook runs in (see book.ts WorldRef). */
export function sportsWorldOf(c: Pick<CareerState, 'flags' | 'playerId'>): WorldRef {
  const seed = sportsSeedOf(c);
  const { sportsWorldV: v, sportsHistoryFrom: from, sportsEvolveFrom: evo } = c.flags;
  if (v === 3 && num(from) && num(evo)) return { seed, historyFrom: from, evolveFrom: evo };
  if ((v === 2 || v === 3) && num(from)) return { seed, historyFrom: from };
  return seed;
}
export const sportsWorldMarked = (c: Pick<CareerState, 'flags'>) =>
  c.flags.sportsWorldV === SPORTS_WORLD_VERSION && num(c.flags.sportsHistoryFrom) && num(c.flags.sportsEvolveFrom);

/**
 * How an older save moves to v3. A season that already has a ticket on it, or any final game,
 * keeps exactly the rosters it had: the history rosters (v2's `sportsHistoryFrom`, or for an
 * unmarked save this season if nothing has happened yet, else next season) and the yearly
 * off-seasons from the first season after that which is still untouched.
 */
export function planSportsMigration(c: Pick<CareerState, 'flags' | 'season' | 'week'>): { historyFrom: number; evolveFrom: number; reason: string } | null {
  if (sportsWorldMarked(c)) return null;
  const onSeason = ticketsOf(c).filter((t) => t.legs.some((l) => l.season >= c.season));
  const started = c.week > SPORTS_FIRST_WEEK;
  const safeNow = !onSeason.length && !started;
  const why = onSeason.length ? `${onSeason.length} ticket(s) on season ${c.season}` : started ? `season ${c.season} is under way` : `no season ${c.season} games played or bet on yet`;
  const from = c.flags.sportsHistoryFrom;
  const historyFrom = (c.flags.sportsWorldV === 2 || c.flags.sportsWorldV === 3) && num(from) ? from : safeNow ? c.season : c.season + 1;
  const evolveFrom = Math.max(historyFrom + 1, safeNow ? c.season : c.season + 1);
  return { historyFrom, evolveFrom, reason: why };
}

/**
 * Moves a save to the current world version (idempotent: a v3 save is returned unchanged).
 * Changes flags only: no money, tickets, players or schedules are touched.
 */
export function migrateSportsWorld<C extends CareerState>(c: C): C {
  const plan = planSportsMigration(c);
  if (!plan) return c;
  const stamp = `${c.season}.${c.week}`;
  return {
    ...c,
    flags: {
      ...c.flags, sportsSeed: sportsSeedOf(c), sportsWorldV: SPORTS_WORLD_VERSION, sportsHistoryFrom: plan.historyFrom, sportsEvolveFrom: plan.evolveFrom,
      sportsWorldMigrated: typeof c.flags.sportsWorldMigrated === 'string' ? c.flags.sportsWorldMigrated : stamp, sportsEvolveMigrated: stamp,
    },
  };
}

function readJson<T>(v: unknown, fallback: T): T {
  if (typeof v !== 'string') return fallback;
  try {
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
}
export const ticketsOf = (c: Pick<CareerState, 'flags'>): Ticket[] => readJson<Ticket[]>(c.flags.sportsTickets, []);
export const bookTotalsOf = (c: Pick<CareerState, 'flags'>): BookTotals => ({ ...EMPTY_TOTALS, ...readJson<Partial<BookTotals>>(c.flags.sportsTotals, {}) });

/** Writes tickets (open ones, then the newest settled up to HISTORY_KEEP) and totals onto a copy. */
export function withBook(c: CareerState, tickets: Ticket[], totals: BookTotals): CareerState {
  const open = tickets.filter((t) => t.status === 'open');
  const done = tickets.filter((t) => t.status !== 'open').slice(0, HISTORY_KEEP);
  return {
    ...c,
    flags: { ...c.flags, sportsSeed: sportsSeedOf(c), sportsTickets: JSON.stringify([...open, ...done]), sportsTotals: JSON.stringify(totals) },
  };
}

/**
 * Settles every open ticket whose games are final at the career's calendar position. Adds a
 * payout posting per winning or pushed ticket and one inbox summary. Safe to run any number of
 * times: settled tickets are never settled again, and payout keys are unique per ticket.
 */
export function settleSports<O extends Outcome>(o: O): O & { settledTickets: Ticket[] } {
  const c = o.career;
  const all = ticketsOf(c);
  if (!all.some((t) => t.status === 'open')) return { ...o, settledTickets: [] };
  const seed = sportsWorldOf(c);
  const settled: Ticket[] = [];
  const next = all.map((t) => {
    const s = settleTicket(t, seed, c.season, c.week);
    if (s) settled.push(s);
    return s ?? t;
  });
  if (!settled.length) return { ...o, settledTickets: [] };
  const totals = bookTotalsOf(c);
  const money: MoneyOp[] = [];
  for (const t of settled) {
    totals.returned += t.payout;
    if (t.status === 'won') totals.won++;
    else if (t.status === 'lost') totals.lost++;
    else totals.pushed++;
    if (t.payout > 0) money.push({ amount: t.payout, type: 'sports_payout', sourceId: t.id, key: `payout:${t.id}` });
  }
  // Newest settled first in the history.
  const ordered = [...next.filter((t) => t.status === 'open'), ...settled, ...next.filter((t) => t.status !== 'open' && !settled.includes(t))];
  const career = withBook(c, ordered, totals);
  const staked = settled.reduce((a, t) => a + t.stake, 0);
  const paid = settled.reduce((a, t) => a + t.payout, 0);
  const net = paid - staked;
  const won = settled.filter((t) => t.status === 'won').length;
  const lost = settled.filter((t) => t.status === 'lost').length;
  const pushed = settled.length - won - lost;
  const parts = [won && `${won} won`, lost && `${lost} lost`, pushed && `${pushed} push${pushed > 1 ? 'es' : ''}`].filter(Boolean).join(', ');
  const netText = net > 0 ? `+$${net.toLocaleString()}` : net < 0 ? `−$${(-net).toLocaleString()}` : '$0';
  const lines = settled.slice(0, 4).map(ticketLine);
  if (settled.length > 4) lines.push(`…and ${settled.length - 4} more in Sportsbook › Tickets.`);
  inbox(career, `Sportsbook: ${parts} (${netText})`, lines.join(' · '), net > 0 ? 'good' : net < 0 ? 'bad' : 'neutral');
  return { ...o, career, money: [...o.money, ...money], settledTickets: settled };
}
