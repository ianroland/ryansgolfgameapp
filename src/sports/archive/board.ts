/**
 * The History Board's read-only model (Phase E). Combines
 *   - the shared archive: ledger history 1972-2025 (proposed canon) and the simulated 2026 season;
 *   - this save's own seasons from 2027 (stored years) and, for legacy saves, seasons it played on
 *     the fixed 2027 rosters before yearly off-seasons began (rebuilt from their games).
 * Every screen reads the same season list, so a champion shown anywhere is the same everywhere.
 * Nothing here writes to the shared files or the save.
 */
import { LEAGUES, leagueById, teamById, teamsOf, type LeagueId, type Sport } from '../demo';
import { FOUNDED, type Award, type Comeback, type Leader, type RecordEntry } from '../history/honors';
import { SERIES_ANCHORS, VOSS } from '../history/games';
import { ANCHOR_STATS } from '../history/stats';
import { bundledLore } from '../lore/service';
import { UNIVERSE } from '../universe/chain';
import type { UState } from '../universe/model';
import type { LeagueYear, YearLines, YearSummary } from '../universe/offseason';
import { careerRecords, careerTotals, RECORD_CATS, seasonRecords, type CareerTotal, type RecordCat, type RecordRow } from './records';
import { provenanceOfYear, type ArchiveSeries, type Provenance, type SeasonLine, type SharedArchive } from './shared';

export const SPORT_AWARD: Record<Sport, string> = { baseball: 'Pitcher of the Year', basketball: 'Defensive Player of the Year', football: 'Defensive Player of the Year', hockey: 'Goaltender of the Year' };
export const AWARD_ORDER = ['Most Valuable Player', 'Championship MVP', 'Rookie of the Year'] as const;
const sportOf = (l: LeagueId) => leagueById(l).sport;

// ── Save input ──
export interface ReplaySeason {
  year: number;
  lines: YearLines;
  leagues: Record<LeagueId, { standings: [string, number, number, number, number][]; seeds: string[]; champion: string; runnerUp: string; series: ArchiveSeries[] }>;
}
export interface SaveHistory {
  /** The current career season and its sports year (in progress). */
  season: number;
  week: number;
  year: number;
  rows: { year: number; summary: YearSummary; lines: YearLines }[];
  /** The newest stored state (next season's players and record book), if any. */
  state: UState | null;
  replays: ReplaySeason[];
  /** Sports years this save played in the original generated leagues (not part of this history). */
  generatedYears: number[];
  /** Completed history-universe years whose off-season hasn't been stored yet. */
  pendingYears: number[];
}

// ── Views ──
export interface StandingRow { team: string; w: number; l: number; t: number; otl: number }
export interface SeasonView {
  id: string;
  league: LeagueId;
  year: number;
  source: Provenance;
  standings: StandingRow[];
  /** Ledger seasons store hockey overtime losses inside losses. */
  otlSeparate: boolean;
  seeds: string[];
  champion: string;
  runnerUp: string;
  /** Null when only the final's result was stored. */
  series: ArchiveSeries[] | null;
  finalWins: [number, number] | null;
  awards: Award[];
  leaders: Leader[];
  awardsRecorded: boolean;
  comebacks: Comeback[];
  /** Records set or tied this season (save seasons), or all-time top-5 marks set (ledger). */
  marks: { label: string; value: number; who: string; verdict: string }[];
  adjusted: boolean;
  origin: string;
}
export interface PlayerEntry {
  i: string;
  n: string;
  l: LeagueId;
  pos: string;
  born: number;
  first: number | null;
  last: number | null;
  teams: string[];
  status: 'active' | 'reserve' | 'retired' | 'unplayed';
  source: Provenance;
  legend: boolean;
  draft: { year: number; round: number; pick: number; overall: number; team: string } | null;
}
export interface HofEntry { i: string; n: string; l: LeagueId; year: number; pathway: 'statistical' | 'legends'; basis?: string; score?: number; source: Provenance }
export interface Moment { id: string; league: LeagueId; year: number; title: string; text: string; type: string; teams: string[]; provenance: 'bible+games' | 'bible' | 'records' | 'save' }

const loreLeague = (l: LeagueId) => bundledLore().leagues.find((x) => x.id === l)!;

export interface Board {
  now: number;
  lastCompleted: number;
  save: SaveHistory | null;
  shared: SharedArchive;
  league: (l: LeagueId) => { id: LeagueId; name: string; short: string; nickname: string; trophy: string; founded: number; sport: Sport };
  seasons: (l: LeagueId) => SeasonView[];
  season: (l: LeagueId, year: number) => SeasonView | undefined;
  titles: (l: LeagueId) => Map<string, number[]>;
  players: () => PlayerEntry[];
  player: (id: string) => PlayerEntry | undefined;
  name: (id: string) => string;
  linesOf: (id: string) => SeasonLine[];
  /** Every season line: shared history and this save. */
  allLines: () => SeasonLine[];
  totals: () => Map<string, CareerTotal>;
  awardsOf: (id: string) => Award[];
  hallOfFame: () => HofEntry[];
  candidates: () => { i: string; n: string; l: LeagueId; f: number; eligible: number; seasons: number }[];
  records: (l: LeagueId) => { cats: RecordCat[]; season: Map<string, RecordRow[]>; career: Map<string, RecordRow[]>; game: RecordEntry[]; team: TeamRecords };
  moments: () => Moment[];
  reviewYears: () => number[];
  review: (year: number) => Review | null;
  coverage: (id: string) => string[];
}
export interface TeamRecords {
  wins: { team: string; year: number; w: number; l: number; source: Provenance }[];
  streaks: RecordEntry[];
  titles: { team: string; count: number; last: number | null }[];
  consecutive: { team: string; count: number; span: [number, number] }[];
  droughts: { team: string; seasons: number; span: [number, number]; ongoing: boolean }[];
  comebacks: (Comeback & { round: string })[];
}
export interface Review {
  year: number;
  source: Provenance;
  leagues: { league: LeagueId; champion: string; runnerUp: string; final: [number, number] | null; awards: Award[]; leaders: Leader[]; marks: SeasonView['marks']; comebacks: Comeback[] }[];
  retired: { i: string; n: string; l: LeagueId; seasons: number }[];
  retiredTotal: number | null;
  /** Scripted storylines that off-season (src/sports/storylines.ts). */
  storylines?: { i: string; kind: string; note: string }[];
  hof: { i: string; n: string; l: LeagueId; year: number }[];
  draft: { l: LeagueId; n: string; i: string; pos: string; t: string; year: number }[];
  draftTotal: number | null;
  note?: string;
}

export function buildBoard(shared: SharedArchive, save: SaveHistory | null): Board {
  const H = shared.honors;
  const F = shared.forward;
  const now = save?.year ?? 2027;
  const rowsByYear = new Map((save?.rows ?? []).map((r) => [r.year, r]));
  const replayByYear = new Map((save?.replays ?? []).map((r) => [r.year, r]));
  const lastCompleted = Math.max(2026, ...(save?.rows ?? []).map((r) => r.year), ...(save?.replays ?? []).map((r) => r.year));

  // ── Seasons ──
  const seasonCache = new Map<LeagueId, SeasonView[]>();
  const canonView = (l: LeagueId, s: (typeof shared.seasons)[number]): SeasonView => {
    const source = provenanceOfYear(s.year);
    const awards = (s.year === 2026 ? F.honors2026.awards : H.awards).filter((a) => a.league === l && a.year === s.year);
    const leaders = (s.year === 2026 ? F.honors2026.leaders : H.leaders).filter((a) => a.league === l && a.year === s.year);
    const comebacks = (s.year === 2026 ? F.honors2026.comebacks : H.records.comebacks).filter((c) => c.league === l && c.year === s.year);
    const marks = s.year === 2026
      ? F.honors2026.records.filter((r) => r.league === l).map((r) => ({ label: r.label, value: r.value, who: r.playerId ?? r.teamId ?? '', verdict: r.verdict }))
      : [...H.records.game, ...H.records.season, ...H.records.team].filter((r) => r.league === l && r.year === s.year).map((r) => ({ label: r.label, value: r.value, who: r.playerId ?? r.teamId ?? '', verdict: 'all-time top 5' }));
    const series = shared.series.get(s.id) ?? null;
    const final = series?.[2];
    return {
      id: s.id, league: l, year: s.year, source,
      standings: Object.entries(s.records).map(([team, [w, lo]]) => ({ team, w, l: lo, t: 0, otl: 0 })),
      otlSeparate: false, seeds: s.seeds, champion: s.champion, runnerUp: s.runnerUp, series,
      finalWins: final ? (final.winner === final.high ? [final.wins[0], final.wins[1]] : [final.wins[1], final.wins[0]]) : null,
      awards, leaders, awardsRecorded: true, comebacks, marks, adjusted: s.adjusted, origin: s.origin,
    };
  };
  const saveView = (l: LeagueId, year: number, y: LeagueYear): SeasonView => {
    const final = y.final;
    return {
      id: `${l}-${year}`, league: l, year, source: 'save',
      standings: y.standings.map(([team, w, lo, t, otl]) => ({ team, w, l: lo, t, otl })),
      otlSeparate: true, seeds: y.seeds, champion: y.champion, runnerUp: y.runnerUp, series: y.series ?? null,
      finalWins: [final[y.champion] ?? 0, final[y.runnerUp] ?? 0],
      awards: y.awards, leaders: y.leaders, awardsRecorded: true, comebacks: y.comebacks.map((c) => ({ ...c, year, league: l })),
      marks: y.records.map((r) => ({ label: r.label, value: r.value, who: r.playerId ?? r.teamId ?? '', verdict: r.verdict })), adjusted: false, origin: 'save',
    };
  };
  const replayView = (l: LeagueId, r: ReplaySeason): SeasonView => {
    const y = r.leagues[l];
    const final = y.series[2];
    return {
      id: `${l}-${r.year}`, league: l, year: r.year, source: 'replay',
      standings: y.standings.map(([team, w, lo, t, otl]) => ({ team, w, l: lo, t, otl })),
      otlSeparate: true, seeds: y.seeds, champion: y.champion, runnerUp: y.runnerUp, series: y.series,
      finalWins: final.winner === final.high ? [final.wins[0], final.wins[1]] : [final.wins[1], final.wins[0]],
      awards: [], leaders: [], awardsRecorded: false, comebacks: [], marks: [], adjusted: false, origin: 'replay',
    };
  };
  const seasons = (l: LeagueId): SeasonView[] => {
    const hit = seasonCache.get(l);
    if (hit) return hit;
    const out = shared.seasons.filter((s) => s.league === l).map((s) => canonView(l, s));
    for (const r of save?.replays ?? []) out.push(replayView(l, r));
    for (const r of save?.rows ?? []) out.push(saveView(l, r.year, r.summary.leagues[l]));
    out.sort((a, b) => a.year - b.year);
    seasonCache.set(l, out);
    return out;
  };
  const titles = (l: LeagueId) => {
    const m = new Map<string, number[]>(teamsOf(l).map((t) => [t.id, []]));
    for (const s of seasons(l)) m.get(s.champion)!.push(s.year);
    return m;
  };

  // ── Players and lines ──
  let lineIndex: Map<string, SeasonLine[]> | null = null;
  const saveLines = (): SeasonLine[] => {
    const out: SeasonLine[] = [];
    const push = (year: number, lines: YearLines, source: Provenance) => {
      for (const [playerId, x] of Object.entries(lines)) {
        const l = playerId.slice(0, 3) as LeagueId;
        out.push({ playerId, league: l, year, team: x.t, r: x.r, ...(x.p ? { p: x.p } : {}), source });
      }
    };
    for (const r of save?.replays ?? []) push(r.year, r.lines, 'replay');
    for (const r of save?.rows ?? []) push(r.year, r.lines, 'save');
    return out;
  };
  let allCache: SeasonLine[] | null = null;
  const allLines = () => (allCache ??= [...shared.allLines(), ...saveLines()]);
  const index = () => {
    if (lineIndex) return lineIndex;
    lineIndex = new Map();
    for (const l of allLines()) {
      const a = lineIndex.get(l.playerId);
      if (a) a.push(l);
      else lineIndex.set(l.playerId, [l]);
    }
    for (const a of lineIndex.values()) a.sort((x, y) => x.year - y.year);
    return lineIndex;
  };
  let totalsCache: Map<string, CareerTotal> | null = null;
  const totals = () => (totalsCache ??= careerTotals(allLines()));

  let playerList: PlayerEntry[] | null = null;
  let playerMap: Map<string, PlayerEntry> | null = null;
  const draftOf = new Map<string, PlayerEntry['draft']>();
  for (const d of H.drafts) draftOf.set(d.playerId, { year: d.year, round: d.round, pick: d.pick, overall: d.overall, team: d.teamId });
  for (const o of F.offseasons) for (const d of o.draft) draftOf.set(d.playerId, { year: d.year, round: d.round, pick: d.pick, overall: d.overall, team: d.teamId });
  for (const r of save?.rows ?? []) for (const d of r.summary.draft) draftOf.set(d.i, { year: r.year + 1, round: d.round, pick: d.pick, overall: d.overall, team: d.t });
  const activeState = save?.state ?? UNIVERSE.start;
  const players = (): PlayerEntry[] => {
    if (playerList) return playerList;
    const idx = index();
    const active = new Map(activeState.players.map((p) => [p.i, p]));
    const out: PlayerEntry[] = [];
    const add = (i: string, n: string, l: LeagueId, pos: string, born: number, source: Provenance, legend: boolean, fallbackTeam?: string) => {
      const ls = idx.get(i) ?? [];
      const a = active.get(i);
      const status: PlayerEntry['status'] = a ? (a.r ? 'reserve' : 'active') : ls.length ? 'retired' : 'unplayed';
      const teams = [...new Set(ls.map((x) => x.team))];
      if (!teams.length && (a?.t ?? fallbackTeam)) teams.push((a?.t ?? fallbackTeam)!);
      out.push({ i, n, l, pos, born, first: ls[0]?.year ?? null, last: ls.at(-1)?.year ?? null, teams, status, source, legend, draft: draftOf.get(i) ?? null });
    };
    for (const p of shared.players) add(p.i, p.n, p.l, p.p, p.b, p.d >= 2026 ? 'shared' : 'canon', !!p.a, p.s.at(-1)?.[0]);
    const known = new Set(out.map((p) => p.i));
    // This save's draftees: still active (state) or listed in a stored draft.
    for (const p of activeState.players) if (!known.has(p.i)) { add(p.i, p.n, p.l, p.p, p.b, 'save', false); known.add(p.i); }
    for (const r of save?.rows ?? []) for (const d of r.summary.draft) if (!known.has(d.i)) { add(d.i, d.n, d.l, d.pos, r.year + 1 - d.age, 'save', false, d.t); known.add(d.i); }
    out.sort((a, b) => a.n.localeCompare(b.n) || a.i.localeCompare(b.i));
    playerList = out;
    playerMap = new Map(out.map((p) => [p.i, p]));
    return out;
  };
  const player = (id: string) => (players(), playerMap!.get(id));
  const name = (id: string) => player(id)?.n ?? (id.includes('_') && teamsOf(id.slice(0, 3) as LeagueId).some((t) => t.id === id) ? teamById(id).displayName : id);

  // ── Awards ──
  const allAwards = (): Award[] => [...H.awards, ...F.honors2026.awards, ...(save?.rows ?? []).flatMap((r) => LEAGUES.flatMap((L) => r.summary.leagues[L.id].awards))];
  let awardsIdx: Map<string, Award[]> | null = null;
  const awardsOf = (id: string) => {
    if (!awardsIdx) {
      awardsIdx = new Map();
      for (const a of allAwards()) awardsIdx.set(a.playerId, [...(awardsIdx.get(a.playerId) ?? []), a]);
    }
    return awardsIdx.get(id) ?? [];
  };

  // ── Hall of Fame (only classes already inducted; nothing from the save's future) ──
  const hallOfFame = (): HofEntry[] => {
    const out: HofEntry[] = H.hallOfFame.map((h) => ({ i: h.playerId, n: name(h.playerId), l: h.league, year: h.year, pathway: h.pathway, basis: h.basis, score: h.score, source: 'canon' as Provenance }));
    for (const h of F.honors2026.hallOfFame) out.push({ i: h.playerId, n: name(h.playerId), l: h.league, year: h.year, pathway: 'statistical', score: h.score, source: 'shared' });
    for (const h of UNIVERSE.hof2027) out.push({ i: h.i, n: h.n, l: h.l, year: 2027, pathway: 'statistical', score: h.sc, source: 'shared' });
    for (const r of save?.rows ?? []) for (const h of r.summary.hallOfFame) if (h.y <= now) out.push({ i: h.i, n: h.n, l: h.l, year: h.y, pathway: 'statistical', score: h.sc, source: 'save' });
    return out.sort((a, b) => b.year - a.year || a.n.localeCompare(b.n));
  };
  const candidates = () => {
    const inducted = new Set(hallOfFame().map((h) => h.i));
    const t = totals();
    return players()
      .filter((p) => p.status === 'retired' && !inducted.has(p.i) && p.last !== null && p.last + 5 > now && (t.get(p.i)?.years.length ?? 0) >= 8)
      .map((p) => ({ i: p.i, n: p.n, l: p.l, f: p.last!, eligible: p.last! + 5, seasons: t.get(p.i)!.years.length }))
      .sort((a, b) => a.eligible - b.eligible || a.n.localeCompare(b.n));
  };

  // ── Records ──
  const recCache = new Map<LeagueId, ReturnType<Board['records']>>();
  const books = (kind: 'game' | 'team') => {
    const all: RecordEntry[] = [...H.records[kind], ...F.honors2026.records.filter((r) => r.kind === kind), ...(save?.state?.book[kind] ?? [])];
    const seen = new Set<string>();
    return all.filter((r) => {
      const k = `${r.league}:${r.stat}:${r.playerId ?? r.teamId}:${r.year}:${r.gameId ?? ''}:${r.value}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };
  const records = (l: LeagueId) => {
    const hit = recCache.get(l);
    if (hit) return hit;
    const cats = RECORD_CATS[sportOf(l)];
    const lines = allLines().filter((x) => x.league === l);
    const tot = [...totals().values()].filter((c) => c.league === l);
    const season = new Map(cats.map((c) => [c.key, seasonRecords(lines, l, c)]));
    const career = new Map(cats.map((c) => [c.key, careerRecords(tot, l, c)]));
    const game = books('game').filter((r) => r.league === l).sort((a, b) => a.stat.localeCompare(b.stat) || b.value - a.value || (a.year ?? 0) - (b.year ?? 0));
    const ss = seasons(l);
    const wins = ss.flatMap((s) => s.standings.map((r) => ({ team: r.team, year: s.year, w: r.w, l: r.l, source: s.source }))).sort((a, b) => b.w - a.w || a.year - b.year).slice(0, 10);
    const streaks = books('team').filter((r) => r.league === l && r.stat === 'streak').sort((a, b) => b.value - a.value || (a.year ?? 0) - (b.year ?? 0)).slice(0, 10);
    const tt = titles(l);
    const champs = ss.map((s) => s.champion);
    const consecutive: TeamRecords['consecutive'] = [];
    for (let i = 0; i < ss.length;) {
      let j = i;
      while (j + 1 < ss.length && champs[j + 1] === champs[i] && ss[j + 1].year === ss[j].year + 1) j++;
      if (j > i) consecutive.push({ team: champs[i], count: j - i + 1, span: [ss[i].year, ss[j].year] });
      i = j + 1;
    }
    consecutive.sort((a, b) => b.count - a.count || a.span[0] - b.span[0]);
    const first = ss[0]?.year ?? FOUNDED[l];
    const droughts: TeamRecords['droughts'] = [];
    for (const [team, ys] of tt) {
      const marks = [first - 1, ...ys, lastCompleted + 1];
      let best = { seasons: 0, span: [0, 0] as [number, number], ongoing: false };
      for (let i = 1; i < marks.length; i++) {
        const gap = marks[i] - marks[i - 1] - 1;
        if (gap > best.seasons) best = { seasons: gap, span: [marks[i - 1] + 1, marks[i] - 1], ongoing: i === marks.length - 1 };
      }
      if (best.seasons > 0) droughts.push({ team, ...best });
    }
    droughts.sort((a, b) => b.seasons - a.seasons);
    const sev = (d: string) => { const [w, lo] = d.split('-').map(Number); return lo - w; };
    const comebacks = ss.flatMap((s) => s.comebacks.map((c) => ({ ...c, year: s.year, league: l, round: c.seriesId.includes(':final') ? 'Final' : 'Semifinal' })))
      .sort((a, b) => sev(b.deficit) - sev(a.deficit) || (b.round === 'Final' ? 1 : 0) - (a.round === 'Final' ? 1 : 0) || a.year - b.year);
    const team: TeamRecords = {
      wins, streaks,
      titles: [...tt].map(([t, ys]) => ({ team: t, count: ys.length, last: ys.at(-1) ?? null })).sort((a, b) => b.count - a.count || a.team.localeCompare(b.team)),
      consecutive: consecutive.slice(0, 10), droughts: droughts.slice(0, 10), comebacks,
    };
    const out = { cats, season, career, game, team };
    recCache.set(l, out);
    return out;
  };

  // ── Historic moments ──
  const inGames = new Set<string>([VOSS.event, ANCHOR_STATS.soren.event, ANCHOR_STATS.redd.event, ...Object.values(SERIES_ANCHORS).flatMap((a) => a.events)]);
  const typeOf = (tags: string[]) => {
    const order: [string[], string][] = [[['comeback'], 'Comeback'], [['record', 'undefeated'], 'Record'], [['controversy', 'disputed call'], 'Controversy'], [['founding'], 'Founding'], [['trade'], 'Trade'], [['upset', 'underdog', 'turnaround'], 'Upset'], [['championship', 'finals', 'drought'], 'Championship'], [['rivalry', 'dynasty'], 'Rivalry & dynasty']];
    return order.find(([ts]) => ts.some((t) => tags.includes(t)))?.[1] ?? 'Event';
  };
  const moments = (): Moment[] => {
    const out: Moment[] = bundledLore().events.map((e) => ({
      id: e.id, league: e.league as LeagueId, year: e.year, title: e.title, text: e.summary, type: typeOf(e.tags), teams: e.teams,
      provenance: inGames.has(e.id) ? 'bible+games' : 'bible',
    }));
    const hasLore = (l: LeagueId, y: number) => out.some((m) => m.league === l && m.year === y && m.type === 'Comeback');
    for (const L of LEAGUES) {
      for (const s of seasons(L.id)) {
        for (const c of s.comebacks) {
          const legendary = c.tags?.includes('legendary_comeback');
          const final = c.seriesId.includes(':final');
          if (!legendary && !(final && s.source === 'save')) continue;
          if (hasLore(L.id, s.year) && final) continue;
          out.push({ id: `cb:${L.id}-${s.year}:${c.winner}`, league: L.id, year: s.year, title: `${teamById(c.winner).displayName} win from ${c.deficit.split('-').reverse().join('–')} down`, text: `${teamById(c.winner).displayName} beat ${teamById(c.loser).displayName} in the ${final ? 'final' : 'semifinal'} after trailing ${c.deficit.split('-').reverse().join('–')} in the series.${legendary ? ' One of the league\'s legendary 0–3 comebacks.' : ''}`, type: 'Comeback', teams: [c.winner, c.loser], provenance: s.source === 'save' || s.source === 'replay' ? 'save' : 'records' });
        }
        if (s.source === 'save') {
          for (const m of s.marks.filter((x) => x.verdict === 'new record')) {
            out.push({ id: `rec:${s.id}:${m.label}:${m.who}`, league: L.id, year: s.year, title: `New record: ${m.label.toLowerCase()}`, text: `${name(m.who)} set a new league mark of ${m.value.toLocaleString('en-US')}.`, type: 'Record', teams: [], provenance: 'save' });
          }
        }
      }
      // Leader titles: legends who led their league three or more times in one category.
      const legends = players().filter((p) => p.legend && p.l === L.id);
      const leaders = [...H.leaders, ...F.honors2026.leaders];
      for (const p of legends) {
        const byStat = new Map<string, number[]>();
        for (const x of leaders.filter((y) => y.playerId === p.i)) byStat.set(x.stat, [...(byStat.get(x.stat) ?? []), x.year]);
        for (const [stat, ys] of byStat) {
          if (ys.length < 3) continue;
          out.push({ id: `lead:${p.i}:${stat}`, league: L.id, year: ys[0], title: `${p.n}: ${ys.length} ${STAT_TITLE[stat] ?? stat} titles`, text: `${p.n} led the ${L.name} in ${STAT_TITLE[stat] ?? stat} in ${ys.join(', ')}.`, type: 'Record', teams: p.teams, provenance: 'records' });
        }
      }
    }
    return out.sort((a, b) => a.year - b.year || a.league.localeCompare(b.league) || a.id.localeCompare(b.id));
  };

  // ── Year in review ──
  const reviewYears = () => [2026, ...(save?.replays ?? []).map((r) => r.year), ...(save?.rows ?? []).map((r) => r.year)].sort((a, b) => b - a);
  const review = (year: number): Review | null => {
    const leagues = LEAGUES.map((L) => {
      const s = seasons(L.id).find((x) => x.year === year);
      return s && { league: L.id, champion: s.champion, runnerUp: s.runnerUp, final: s.finalWins, awards: s.awards, leaders: s.leaders, marks: s.marks, comebacks: s.comebacks };
    });
    if (leagues.some((x) => !x)) return null;
    const ls = leagues as Review['leagues'];
    const t = totals();
    if (year === 2026) {
      const o = F.offseasons.find((x) => x.year === 2027)!;
      return {
        year, source: 'shared', leagues: ls,
        retired: o.retired.map((i) => ({ i, n: name(i), l: i.slice(0, 3) as LeagueId, seasons: t.get(i)?.years.length ?? 0 })).sort((a, b) => b.seasons - a.seasons).slice(0, 8),
        retiredTotal: o.retired.length,
        hof: UNIVERSE.hof2027.map((h) => ({ i: h.i, n: h.n, l: h.l, year: 2027 })),
        draft: o.draft.filter((d) => d.overall === 1).map((d) => ({ l: d.league, n: name(d.playerId), i: d.playerId, pos: d.pos, t: d.teamId, year: 2027 })),
        draftTotal: o.draft.length,
      };
    }
    const row = rowsByYear.get(year);
    if (row) {
      const s = row.summary;
      return {
        year, source: 'save', leagues: ls,
        retired: [...s.retired].sort((a, b) => b.seasons - a.seasons).slice(0, 8).map((r) => ({ i: r.i, n: r.n, l: r.l, seasons: r.seasons })),
        retiredTotal: s.retired.length,
        hof: s.hallOfFame.map((h) => ({ i: h.i, n: h.n, l: h.l, year: h.y })),
        draft: s.draft.filter((d) => d.overall === 1).map((d) => ({ l: d.l, n: d.n, i: d.i, pos: d.pos, t: d.t, year: year + 1 })),
        draftTotal: s.draft.length,
        ...(s.storylines?.length ? { storylines: s.storylines.map((x) => ({ i: x.i, kind: x.kind, note: x.note })) } : {}),
      };
    }
    if (replayByYear.has(year)) {
      return { year, source: 'replay', leagues: ls, retired: [], retiredTotal: null, hof: [], draft: [], draftTotal: null, note: 'Played on the fixed 2027 rosters before this save\'s yearly off-seasons began: results are rebuilt from the games; no awards, retirements or draft were held.' };
    }
    return null;
  };

  // ── Coverage ──
  const coverage = (id: string): string[] => {
    const notes: string[] = [];
    const ls = index().get(id) ?? [];
    if (ls.some((x) => x.source === 'replay')) notes.push(`Includes ${ls.filter((x) => x.source === 'replay').map((x) => x.year).join(', ')}, rebuilt from this save's games (played before yearly off-seasons began).`);
    if (save?.pendingYears.length && player(id)?.status !== 'retired') notes.push(`The ${save.pendingYears.join(', ')} season${save.pendingYears.length > 1 ? 's are' : ' is'} complete but not yet filed; totals update when it is.`);
    if (save?.generatedYears.length) notes.push(`This save played ${save.generatedYears.join(', ')} in the original generated leagues; those seasons aren't part of this history.`);
    return notes;
  };

  return {
    now, lastCompleted, save, shared,
    league: (l) => { const L = leagueById(l); const lo = loreLeague(l); return { id: l, name: L.name, short: L.short, nickname: lo.identity, trophy: lo.trophy, founded: lo.founded, sport: L.sport }; },
    seasons, season: (l, y) => seasons(l).find((s) => s.year === y), titles,
    players, player, name, linesOf: (id) => index().get(id) ?? [], allLines, totals, awardsOf,
    hallOfFame, candidates, records, moments, reviewYears, review, coverage,
  };
}

export const STAT_TITLE: Record<string, string> = {
  ppg: 'scoring', rpg: 'rebounding', apg: 'assists', avg: 'batting', hr: 'home run', rbi: 'RBI', era: 'ERA', w: 'wins', so: 'strikeout',
  pass_yds: 'passing', rush_yds: 'rushing', rec_yds: 'receiving', sacks: 'sacks', g: 'goals', pts: 'points', sv_pct: 'save percentage',
};
