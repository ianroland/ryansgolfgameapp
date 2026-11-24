/**
 * The season in progress, for NPC dialogue that reacts to current results (sports-lore/2
 * live context). Built by the game at run time from this save's sportsbook world; never stored in
 * or merged into the knowledge pack. Only games already played are included.
 */
import { recentFinals, standingsToDate, type WorldRef } from '../book';
import { LEAGUES } from '../demo';
import { CONTRACT } from './schema';

export function liveContextOf(ref: WorldRef, season: number, week: number, recentWeeks = 2) {
  return {
    contract: CONTRACT,
    year: 2026 + season,
    week,
    scope: 'save' as const,
    leagues: LEAGUES.map((L) => ({
      league: L.id,
      standings: standingsToDate(ref, season, week, L.id).map((r) => ({ team: r.team, w: r.w, l: r.l, t: r.t, otl: r.otl })),
      recent: recentFinals(ref, season, week, L.id, recentWeeks).map((g) => ({ id: g.id, week: g.week, home: g.home, away: g.away, home_score: g.result.homeScore, away_score: g.result.awayScore })),
    })),
  };
}
