/**
 * Sportsbook clerk dialogue (pure). Each clerk has authored history lines that cite sports-lore
 * event ids (shown only if the clerk could know them in the current sports year) plus live lines
 * built from this week's real board: standings leaders, last week's finals, the next game week.
 * Live numbers come from the engine; nothing here affects odds, results or money.
 */
import { teamById, type LeagueId } from '../demo';
import { boardFor, recentFinals, seedOf, standingsToDate, type WorldRef } from '../book';
import type { ClerkExpression } from '../themes';
import { bundledLore, canKnow, lore, sportsYearForSeason } from '../lore/service';
import { EMMETT_LINES } from './emmett';

export interface ClerkLine {
  id: string;
  league: LeagueId;
  /** sports-lore event ids this line rests on (empty for live lines). */
  events: string[];
  mood: ClerkExpression;
  text: string;
  /** New dialogue stays draft until the owner approves it. */
  status?: 'draft' | 'approved';
}

export const CLERK_LINES: Record<string, ClerkLine[]> = { emmett_okafor: EMMETT_LINES };

const SPORT = { gdc: 'baseball', ccl: 'basketball', igl: 'football', fhl: 'hockey' } as const;

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** History lines the clerk can say this sports year: every cited event must be known (historian tier). */
export function historyLines(npcId: string, league: LeagueId, year: number): ClerkLine[] {
  const pack = bundledLore();
  return (CLERK_LINES[npcId] ?? []).filter((l) => l.league === league && l.events.every((id) => {
    const e = lore.event(id, pack);
    return !!e && e.facts.some((f) => canKnow({ year, tier: 'historian' }, e, f)) && e.span.end < year;
  }));
}

/** Lines about this season, from the real board. */
export function liveLines(seed: WorldRef, season: number, week: number, league: LeagueId): ClerkLine[] {
  const out: ClerkLine[] = [];
  const rows = standingsToDate(seed, season, week, league);
  const played = rows.some((r) => r.w + r.l + r.t + r.otl > 0);
  if (played) {
    const top = rows[0];
    const rec = `${top.w}–${top.l + top.otl}${top.t ? `–${top.t}` : ''}`;
    out.push({ id: `live.${league}.leader`, league, events: [], mood: 'friendly', text: `${teamById(top.team).name} lead the way at ${rec}. Don't jinx it, champ.` });
  } else {
    out.push({ id: `live.${league}.fresh`, league, events: [], mood: 'playful', text: `No ${SPORT[league]} played yet. Everybody's undefeated, my favorite time of year.` });
  }
  const last = recentFinals(seed, season, week, league, 1);
  if (last.length) {
    const g = last.reduce((a, b) => (Math.abs(b.result.homeScore - b.result.awayScore) > Math.abs(a.result.homeScore - a.result.awayScore) ? b : a));
    const homeWon = g.result.homeScore > g.result.awayScore;
    const [w, l, ws, ls] = homeWon ? [g.home, g.away, g.result.homeScore, g.result.awayScore] : [g.away, g.home, g.result.awayScore, g.result.homeScore];
    if (ws !== ls) out.push({ id: `live.${league}.blowout`, league, events: [], mood: 'impressed', text: `${teamById(w).name} beat ${teamById(l).name} ${ws}–${ls} last week. Quiet bus ride home.` });
  }
  const b = boardFor(seed, season, week, league);
  if (b.week === null) out.push({ id: `live.${league}.over`, league, events: [], mood: 'concerned', text: `${SPORT[league][0].toUpperCase()}${SPORT[league].slice(1)}'s done for the year, partner.` });
  else if (b.week !== week) out.push({ id: `live.${league}.next`, league, events: [], mood: 'friendly', text: `No ${SPORT[league]} this week. Week ${b.week} lines are already up, though.` });
  return out;
}

/**
 * The line to show: mostly history, sometimes the live board. `nonce` moves to the next line
 * (on a league change or a tap); the choice is deterministic for a given position.
 */
export function clerkLine(npcId: string, ctx: { seed: WorldRef; season: number; week: number; league: LeagueId; nonce: number }): ClerkLine | null {
  const year = sportsYearForSeason(ctx.season);
  const hist = historyLines(npcId, ctx.league, year);
  const live = liveLines(ctx.seed, ctx.season, ctx.week, ctx.league);
  // Two history lines for every live one, cycling through each pool in a shuffled order.
  const slot = ctx.nonce % 3;
  const pool = slot === 2 && live.length ? live : hist.length ? hist : live;
  if (!pool.length) return null;
  const turn = Math.floor(ctx.nonce / 3) * (pool === live ? 1 : 2) + (pool === live ? 0 : slot);
  const order = [...pool].sort((a, b) => hash(`${seedOf(ctx.seed)}:${ctx.season}:${ctx.league}:${a.id}`) - hash(`${seedOf(ctx.seed)}:${ctx.season}:${ctx.league}:${b.id}`));
  return order[turn % order.length];
}
