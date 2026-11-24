/**
 * This save's side of the History Board (read-only). Completed seasons only: stored years from
 * the living universe, plus (legacy saves) seasons played on the fixed 2027 rosters before the
 * yearly off-seasons began, rebuilt from the same games. Nothing is written.
 */
import { seasonOf, type WorldRef } from '../book';
import { LEAGUES, type LeagueId } from '../demo';
import { yearOfSeason } from '../universe/chain';
import type { UState } from '../universe/model';
import { seasonLinesOf, type YearLines, type YearSummary } from '../universe/offseason';
import type { ReplaySeason, SaveHistory } from './board';
import type { ArchiveSeries } from './shared';

export interface StoredYear { year: number; summary: YearSummary; lines: YearLines }

export function buildSaveHistory(args: { ref: WorldRef; season: number; week: number; rows: StoredYear[]; state: UState | null }): SaveHistory {
  const { ref, season, week } = args;
  const rows = [...args.rows].sort((a, b) => a.year - b.year);
  const stored = new Set(rows.map((r) => r.year));
  const generatedYears: number[] = [];
  const replays: ReplaySeason[] = [];
  const pendingYears: number[] = [];
  for (let s = 1; s < season; s++) {
    const year = yearOfSeason(s);
    if (typeof ref === 'number' || s < ref.historyFrom) { generatedYears.push(year); continue; }
    const evolveBase = ref.evolveFrom === undefined ? Infinity : ref.evolveFrom - 1;
    if (s < evolveBase) { replays.push(replay(ref, s)); continue; }
    if (!stored.has(year)) pendingYears.push(year);
  }
  return { season, week, year: yearOfSeason(season), rows: rows.filter((r) => r.year < yearOfSeason(season)), state: args.state, replays, generatedYears, pendingYears };
}

/** Rebuilds a fixed-roster season's standings, playoffs and player lines from its games. */
export function replay(ref: WorldRef, season: number): ReplaySeason {
  const year = yearOfSeason(season);
  const s = seasonOf(ref, season);
  const leagues = {} as ReplaySeason['leagues'];
  for (const L of LEAGUES) {
    const x = s.leagues[L.id as LeagueId];
    const series: ArchiveSeries[] = x.playoffs.map((p) => ({ round: p.round, high: p.high, low: p.low, winner: p.winner, wins: [p.wins[0], p.wins[1]], games: p.games.map((g) => [g.home === p.high ? 1 : 0, g.result.homeScore, g.result.awayScore, g.result.ot] as [number, number, number, number]) }));
    const final = x.playoffs[2];
    leagues[L.id] = {
      standings: x.standings.map((r) => [r.team, r.w, r.l, r.t, r.otl]),
      seeds: x.standings.slice(0, 4).map((r) => r.team), champion: x.champion, runnerUp: final.winner === final.high ? final.low : final.high, series,
    };
  }
  return { year, leagues, lines: seasonLinesOf({ year, leagues: s.leagues, world: s.world }) };
}
