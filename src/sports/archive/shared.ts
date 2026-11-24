/**
 * The History Board's shared archive (Phase E): read-only, loaded on demand (several MB of JSON,
 * kept out of the game's first load), never written.
 *
 *   1972-2025  ledger history (proposed canon): players, seasons, honours, records
 *   2026       shared simulated season and off-seasons (forward.json)
 *   archive    every player's season line and playoff series, 1972-2026 (archive.json, derived)
 */
import type { LeagueId, Sport } from '../demo';
import type { HPlayer, HSeason } from '../history/data';
import type { Award, Comeback, HallOfFamer, Leader, RecordEntry } from '../history/honors';
import type { Offseason } from '../history/forward';
import type { StatLine } from '../history/stats';

export interface ArchiveSeries { round: 'semifinal' | 'final'; high: string; low: string; winner: string; wins: [number, number]; games: [number, number, number, number][] }
interface ArchiveFile {
  keys: Record<Sport, string[]>;
  players: string[];
  seasons: Record<string, { teams: Record<string, { r: number[][]; p?: number[][] }>; series: ArchiveSeries[] }>;
}
export interface HonorsFile {
  awards: Award[];
  leaders: Leader[];
  records: { game: RecordEntry[]; season: RecordEntry[]; career: RecordEntry[]; team: RecordEntry[]; comebacks: Comeback[] };
  hallOfFame: HallOfFamer[];
  hallOfFameNext: HallOfFamer[];
  hallOfFameThreshold: Record<LeagueId, number>;
  transactions: { playerId: string; year: number; from: string; to: string; type: string; note?: string }[];
  drafts: { league: LeagueId; year: number; round: number; pick: number; overall: number; playerId: string; teamId: string }[];
}
export interface ForwardFile {
  offseasons: Offseason[];
  seasons: HSeason[];
  honors2026: {
    awards: Award[];
    leaders: Leader[];
    champions: { league: LeagueId; champion: string; runnerUp: string }[];
    records: (RecordEntry & { verdict: string; previous?: number })[];
    comebacks: Comeback[];
    hallOfFame: HallOfFamer[];
  };
}
/** One player's line for one season. */
export interface SeasonLine { playerId: string; league: LeagueId; year: number; team: string; r: StatLine; p?: StatLine; source: Provenance }
/**
 * Where a fact comes from. canon: the 1972-2025 ledger history (proposed canon). shared: the
 * simulated 2026 season and the 2027 rosters, the same in every save. save: this save's own
 * seasons from 2027 on. replay: a season this save played before its yearly off-seasons began,
 * rebuilt from its games for display.
 */
export type Provenance = 'canon' | 'shared' | 'save' | 'replay';
export const provenanceOfYear = (year: number): Provenance => (year <= 2025 ? 'canon' : year === 2026 ? 'shared' : 'save');

export interface SharedArchive {
  players: HPlayer[];
  byId: Map<string, HPlayer>;
  seasons: HSeason[];
  honors: HonorsFile;
  forward: ForwardFile;
  keys: Record<Sport, string[]>;
  series: Map<string, ArchiveSeries[]>;
  /** Lines by season id, unpacked on first use. */
  linesOf: (seasonId: string) => SeasonLine[];
  /** Every shared line (built once, about 37,000). */
  allLines: () => SeasonLine[];
}

const sportOf: Record<LeagueId, Sport> = { gdc: 'baseball', ccl: 'basketball', igl: 'football', fhl: 'hockey' };

export function buildShared(files: { players: HPlayer[]; seasons: HSeason[]; honors: HonorsFile; forward: ForwardFile; archive: ArchiveFile }): SharedArchive {
  const { honors, forward, archive } = files;
  // Ledger players plus the 2026 and 2027 draftees; careers run through 2026 where played.
  const players: HPlayer[] = files.players.map((p) => ({ ...p, s: p.s.map((x) => [...x] as [string, number, number]) }));
  for (const o of forward.offseasons) for (const p of o.newPlayers) players.push({ ...p, s: p.s.map((x) => [...x] as [string, number, number]), f: p.d });
  const byId = new Map(players.map((p) => [p.i, p]));
  const seasons = [...files.seasons, ...forward.seasons];
  const series = new Map(Object.entries(archive.seasons).map(([id, v]) => [id, v.series]));
  const cache = new Map<string, SeasonLine[]>();
  const linesOf = (id: string): SeasonLine[] => {
    const hit = cache.get(id);
    if (hit) return hit;
    const s = archive.seasons[id];
    if (!s) return [];
    const [league, y] = id.split('-') as [LeagueId, string];
    const year = Number(y);
    const keys = archive.keys[sportOf[league]];
    const unpack = (row: number[]): StatLine => Object.fromEntries(row.slice(1).map((v, i) => [keys[i], v]).filter(([, v]) => v !== 0));
    const out: SeasonLine[] = [];
    for (const [team, t] of Object.entries(s.teams)) {
      const po = new Map((t.p ?? []).map((row) => [row[0], unpack(row)]));
      for (const row of t.r) out.push({ playerId: archive.players[row[0]], league, year, team, r: unpack(row), ...(po.has(row[0]) ? { p: po.get(row[0]) } : {}), source: provenanceOfYear(year) });
    }
    cache.set(id, out);
    return out;
  };
  let all: SeasonLine[] | null = null;
  return {
    players, byId, seasons, honors, forward, keys: archive.keys, series, linesOf,
    allLines: () => (all ??= Object.keys(archive.seasons).flatMap(linesOf)),
  };
}

let loading: Promise<SharedArchive> | null = null;
/** Loads the shared archive once (separate chunks; the game's first load is unaffected). */
export function loadShared(): Promise<SharedArchive> {
  loading ??= Promise.all([
    import('../history/data/players.json'),
    import('../history/data/seasons.json'),
    import('../history/data/honors.json'),
    import('../history/data/forward.json'),
    import('../history/data/archive.json'),
  ]).then(([p, s, h, f, a]) => buildShared({
    players: (p.default as unknown as { players: HPlayer[] }).players,
    seasons: (s.default as unknown as { seasons: HSeason[] }).seasons,
    honors: h.default as unknown as HonorsFile,
    forward: f.default as unknown as ForwardFile,
    archive: a.default as unknown as ArchiveFile,
  }));
  loading.catch(() => { loading = null; });
  return loading;
}
