/**
 * Record books for the History Board (Phase E), computed from season lines (shared history and
 * this save) with one set of rules, so every source is judged the same way. Rates need a
 * qualifying amount of play, as the leader boards do.
 */
import type { LeagueId, Sport } from '../demo';
import type { StatLine } from '../history/stats';
import type { Provenance, SeasonLine } from './shared';

export type Fmt = 'int' | 'avg' | 'pct' | 'dec1' | 'dec2';
export interface RecordCat {
  key: string;
  label: string;
  value: (l: StatLine) => number;
  /** Rates: minimum play to qualify, per season and per career. */
  qualify?: { season: (l: StatLine) => boolean; career: (l: StatLine) => boolean };
  /** Lower is better (ERA, goals-against average). */
  asc?: boolean;
  fmt?: Fmt;
}
const n = (l: StatLine, k: string) => l[k] ?? 0;
const sum = (key: string, label: string): RecordCat => ({ key, label, value: (l) => n(l, key) });
const ratio = (key: string, label: string, num: (l: StatLine) => number, den: (l: StatLine) => number, season: number, career: number, fmt: Fmt, asc = false): RecordCat => ({
  key, label, fmt, asc,
  value: (l) => (den(l) ? num(l) / den(l) : 0),
  qualify: { season: (l) => den(l) >= season, career: (l) => den(l) >= career },
});

export const RECORD_CATS: Record<Sport, RecordCat[]> = {
  baseball: [
    sum('hr', 'Home runs'), sum('h', 'Hits'), sum('rbi', 'Runs batted in'), sum('r', 'Runs'), sum('sb', 'Stolen bases'),
    ratio('avg', 'Batting average', (l) => n(l, 'h'), (l) => n(l, 'ab'), 100, 1000, 'avg'),
    sum('w', 'Pitching wins'), sum('p_k', 'Strikeouts (pitching)'), sum('sho', 'Shutouts'), sum('sv', 'Saves'), sum('nohit', 'No-hitters'),
    ratio('era', 'Earned run average', (l) => 27 * n(l, 'p_er'), (l) => n(l, 'p_outs'), 100, 1500, 'dec2', true),
  ],
  basketball: [
    sum('pts', 'Points'), sum('reb', 'Rebounds'), sum('ast', 'Assists'), sum('stl', 'Steals'), sum('blk', 'Blocks'), sum('fg3m', 'Three-pointers made'),
    ratio('ppg', 'Points per game', (l) => n(l, 'pts'), (l) => n(l, 'gp'), 17, 200, 'dec1'),
    ratio('fg_pct', 'Field-goal percentage', (l) => n(l, 'fgm'), (l) => n(l, 'fga'), 150, 1500, 'pct'),
    ratio('ft_pct', 'Free-throw percentage', (l) => n(l, 'ftm'), (l) => n(l, 'fta'), 60, 500, 'pct'),
  ],
  football: [
    sum('pass_yds', 'Passing yards'), sum('pass_td', 'Passing touchdowns'), sum('rush_yds', 'Rushing yards'), sum('rush_td', 'Rushing touchdowns'),
    sum('rec_yds', 'Receiving yards'), sum('rec', 'Receptions'), sum('rec_td', 'Receiving touchdowns'),
    sum('tackles', 'Tackles'), sum('sacks', 'Sacks'), sum('def_int', 'Interceptions'), sum('ff', 'Forced fumbles'),
  ],
  hockey: [
    sum('g', 'Goals'), sum('a', 'Assists'), sum('pts', 'Points'), sum('sv', 'Saves'), sum('so', 'Shutouts'), sum('w', 'Goaltender wins'),
    ratio('sv_pct', 'Save percentage', (l) => n(l, 'sv'), (l) => n(l, 'sa'), 300, 3000, 'avg'),
    ratio('gaa', 'Goals-against average', (l) => 60 * n(l, 'ga'), (l) => n(l, 'min'), 660, 4800, 'dec2', true),
  ],
};

export function fmtValue(v: number, fmt: Fmt = 'int'): string {
  if (fmt === 'avg') return v.toFixed(3).replace(/^0/, '');
  if (fmt === 'pct') return `${(v * 100).toFixed(1)}%`;
  if (fmt === 'dec1') return v.toFixed(1);
  if (fmt === 'dec2') return v.toFixed(2);
  return Math.round(v).toLocaleString('en-US');
}

export interface RecordRow {
  rank: number;
  playerId: string;
  value: number;
  /** Season records: team and year. Career records: teams and first/last season. */
  team?: string;
  year?: number;
  teams?: string[];
  span?: [number, number];
  provenance: Provenance | 'mixed';
}

const better = (cat: RecordCat) => (a: { value: number; id: string }, b: { value: number; id: string }) => (cat.asc ? a.value - b.value : b.value - a.value) || a.id.localeCompare(b.id);

/** Best single seasons for a category (regular season). */
export function seasonRecords(lines: SeasonLine[], league: LeagueId, cat: RecordCat, top = 10): RecordRow[] {
  const rows = lines
    .filter((l) => l.league === league && (cat.qualify ? cat.qualify.season(l.r) : n(l.r, cat.key) > 0))
    .map((l) => ({ l, value: cat.value(l.r), id: `${l.year}:${l.playerId}` }))
    .filter((x) => cat.asc || x.value > 0)
    .sort(better(cat))
    .slice(0, top);
  return rows.map((x, i) => ({ rank: i + 1, playerId: x.l.playerId, value: x.value, team: x.l.team, year: x.l.year, provenance: x.l.source }));
}

export interface CareerTotal { playerId: string; league: LeagueId; r: StatLine; p: StatLine; years: number[]; teams: string[]; sources: Set<Provenance> }
/** Career totals from lines (regular season and playoffs). */
export function careerTotals(lines: SeasonLine[]): Map<string, CareerTotal> {
  const out = new Map<string, CareerTotal>();
  for (const l of lines) {
    let c = out.get(l.playerId);
    if (!c) out.set(l.playerId, (c = { playerId: l.playerId, league: l.league, r: {}, p: {}, years: [], teams: [], sources: new Set() }));
    for (const [k, v] of Object.entries(l.r)) c.r[k] = (c.r[k] ?? 0) + v;
    for (const [k, v] of Object.entries(l.p ?? {})) c.p[k] = (c.p[k] ?? 0) + v;
    if (!c.years.includes(l.year)) c.years.push(l.year);
    if (!c.teams.includes(l.team)) c.teams.push(l.team);
    c.sources.add(l.source);
  }
  for (const c of out.values()) c.years.sort((a, b) => a - b);
  return out;
}

export function careerRecords(totals: Iterable<CareerTotal>, league: LeagueId, cat: RecordCat, top = 10): RecordRow[] {
  const rows = [...totals]
    .filter((c) => c.league === league && (cat.qualify ? cat.qualify.career(c.r) : n(c.r, cat.key) > 0))
    .map((c) => ({ c, value: cat.value(c.r), id: c.playerId }))
    .filter((x) => cat.asc || x.value > 0)
    .sort(better(cat))
    .slice(0, top);
  return rows.map((x, i) => ({
    rank: i + 1, playerId: x.c.playerId, value: x.value, teams: x.c.teams, span: [x.c.years[0], x.c.years.at(-1)!],
    provenance: x.c.sources.size === 1 ? [...x.c.sources][0] : 'mixed',
  }));
}
