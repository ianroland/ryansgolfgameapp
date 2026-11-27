/**
 * Phase D part 3: one off-season for a save's leagues, run once after a season is complete.
 *
 * Steps (the brief's order; tickets are settled by the service before this runs):
 *  1-4  the finished season: standings, champions and every player's stat line from its games
 *  5    awards, leaders, records, milestones, comebacks, career totals
 *  6    retirements          7  Hall of Fame (decided at retirement, inducted five years later)
 *  8-10 reserves back on their own team first, then a rookie class sized to the open places and
 *       the draft (worst record first, champion last)
 *  11   development and decline for everyone who stays
 *  12   the schedule: made by the season engine from the save seed and season (nothing to store)
 *  13   the new state, validated (full rosters, no retired or duplicated players) before return
 *
 * Pure and deterministic: same inputs, same output.
 */
import { SEASON_FORMAT, teamById, type LeagueId, type Sport } from '../demo';
import { SEASON_ENDING, STORYLINE_NOTE, VALE, VALE_ARC, type Storyline } from '../storylines';
import { SPORTS_CONFIG } from '../config';
import { stream } from '../rng';
import type { LeagueSeason, PlayedGame, Series, World } from '../season';
import type { HistoryData, HSeason } from '../history/data';
import type { HGame, HistorySeason } from '../history/games';
import { attrsFor } from '../history/rosters';
import { awardBonus, FOUNDED, GAME_STATS, keep, LEGENDARY_DEFICIT, SEASON_STATS, seasonHonors, seasonValue, type Award, type Leader, type RecordEntry } from '../history/honors';
import { gameLines, type PlayerSeason, type StatLine } from '../history/stats';
import {
  DEFAULT_ENGINE_POS, develop, devKindFor, LEAGUE_IDS, peakFor, retireChance, sportOfLeague,
  type HofPending, type RecordBook, type UCareer, type UniverseSeed, type UPlayer, type UState,
} from './model';

export class RosterError extends Error {}
/** Prospect pools are centred this many player spreads below the historical level (see the draft). */
export const PROSPECT_DISCOUNT = 0.7;

export interface SeasonInput {
  /** The season year that was played. */
  year: number;
  leagues: Record<LeagueId, LeagueSeason>;
  /** The world it was played with. */
  world: World;
}

export interface LeagueYear {
  champion: string;
  runnerUp: string;
  seeds: string[];
  /** team, wins, losses, ties, overtime losses (standings order). */
  standings: [string, number, number, number, number][];
  final: Record<string, number>;
  awards: Award[];
  leaders: Leader[];
  comebacks: { seriesId: string; winner: string; loser: string; deficit: string; tags?: string[] }[];
  /** Entries that set or tied a league record this season. */
  records: (RecordEntry & { verdict: 'new record' | 'ties record'; previous: number })[];
  milestones: { i: string; stat: string; value: number }[];
  titleDrought: number | null;
  consecutive: number;
  /** Playoff series (from v0.19.9; older rows have only `final`): wins [higher seed, lower seed]; games [higher seed at home 1/0, home score, away score, overtime]. */
  series?: { round: 'semifinal' | 'final'; high: string; low: string; winner: string; wins: [number, number]; games: [number, number, number, number][] }[];
}
export interface YearSummary {
  year: number;
  leagues: Record<LeagueId, LeagueYear>;
  retired: { i: string; n: string; l: LeagueId; t: string; age: number; seasons: number }[];
  hallOfFame: { i: string; n: string; l: LeagueId; y: number; sc: number; pathway: 'statistical' }[];
  returned: string[];
  /** Scripted storylines this off-season (src/sports/storylines.ts). Absent in older summaries. */
  storylines?: Storyline[];
  draft: { l: LeagueId; round: number; pick: number; overall: number; i: string; n: string; pos: string; t: string; age: number; pot: number }[];
  counts: Record<LeagueId, { active: number; rostered: number; reserves: number; retired: number; drafted: number; returned: number }>;
  /** The steps completed, in order (audit trail). */
  steps: string[];
}
/** Player season lines (regular season; playoffs when played). */
export type YearLines = Record<string, { t: string; r: StatLine; p?: StatLine }>;

export const MILESTONES: Record<Sport, [string, number[]][]> = {
  basketball: [['pts', [5000, 7500]], ['reb', [2500, 3500]], ['ast', [1500]]],
  baseball: [['hr', [50, 100]], ['h', [500, 750, 1000]], ['w', [50, 75]], ['p_k', [500, 1000]]],
  football: [['pass_yds', [20000, 30000]], ['rush_yds', [10000, 15000, 20000]], ['rec_yds', [8000, 12000]], ['sacks', [100, 150]]],
  hockey: [['g', [100, 150]], ['pts', [200, 300]], ['sv', [5000, 8000]]],
};

const add = (into: StatLine, from: StatLine) => {
  for (const [k, v] of Object.entries(from)) into[k] = (into[k] ?? 0) + v;
};
const played = (l: StatLine | undefined) => !!l && Object.values(l).some((v) => v > 0);

function toHGame(g: PlayedGame, league: LeagueId, year: number, series?: Series, n?: number): HGame {
  const hs = g.result.homeScore;
  const as = g.result.awayScore;
  const winner = hs > as ? g.home : as > hs ? g.away : '';
  const loser = winner === g.home ? g.away : winner === g.away ? g.home : '';
  return {
    id: g.id, league, year, day: g.pre.playoff ? (n ?? 0) : g.round, playoff: g.pre.playoff,
    ...(series ? { round: series.round, seriesId: g.id.replace(/:g\d+$/, ''), ...(n === series.games.length - 1 ? { decider: true } : {}) } : {}),
    home: g.home, away: g.away, winner, loser, result: g.result, events: [], provenance: 'generated',
  };
}

/** Merges candidate entries into a record list, keeping the top 5 per league and stat. */
function mergeBook(list: RecordEntry[], add: RecordEntry[], unique = false): RecordEntry[] {
  let all = [...list, ...add];
  if (unique) {
    const best = new Map<string, RecordEntry>();
    for (const r of all) {
      const k = `${r.league}:${r.stat}:${r.playerId}`;
      if (!best.has(k) || best.get(k)!.value < r.value) best.set(k, r);
    }
    all = [...best.values()];
  }
  const groups = new Map<string, RecordEntry[]>();
  for (const r of all) groups.set(`${r.league}:${r.stat}`, [...(groups.get(`${r.league}:${r.stat}`) ?? []), r]);
  return [...groups.keys()].sort().flatMap((k) => keep(groups.get(k)!, 5));
}
const topOf = (list: RecordEntry[], league: string, stat: string) => list.filter((r) => r.league === league && r.stat === stat).sort((a, b) => b.value - a.value)[0];

/** Draft order: non-playoff teams worst first, then semifinal losers (worse record first), runner-up, champion. */
export function draftOrderLive(s: LeagueSeason): string[] {
  const order = s.standings.map((r) => r.team);
  const seeds = order.slice(0, SPORTS_CONFIG.playoffs.teams);
  const final = s.playoffs[2];
  const runnerUp = final.winner === final.high ? final.low : final.high;
  const semiLosers = s.playoffs.slice(0, 2).map((x) => (x.winner === x.high ? x.low : x.high));
  const rev = (ts: string[]) => [...ts].sort((a, b) => order.indexOf(b) - order.indexOf(a));
  return [...rev(order.filter((t) => !seeds.includes(t))), ...rev(semiLosers), runnerUp, s.champion];
}

export function runOffseason(prev: UState, input: SeasonInput, seed: number, U: UniverseSeed): { next: UState; summary: YearSummary; lines: YearLines } {
  const year = input.year;
  const nextYear = year + 1;
  const steps: string[] = [];
  const players = new Map(prev.players.map((p) => [p.i, { ...p }]));
  const careers: Record<string, UCareer> = Object.fromEntries(Object.entries(prev.careers).map(([k, v]) => [k, { ...v, tot: { ...v.tot }, ...(v.aw ? { aw: [...v.aw] } : {}) }]));
  const titles: Record<string, number[]> = Object.fromEntries(Object.entries(prev.titles).map(([k, v]) => [k, [...v]]));
  let book: RecordBook = { game: [...prev.book.game], season: [...prev.book.season], career: [...prev.book.career], team: [...prev.book.team] };
  const lines: YearLines = {};
  const leagues = {} as Record<LeagueId, LeagueYear>;
  /** Games each player appeared in (any stat), for playing time. */
  const appeared = new Map<string, number>();
  const dataLike = { players: [...players.values()].map((p) => ({ i: p.i, d: p.d })), seasons: [] } as unknown as HistoryData;

  // 1-5: the season, stats, awards and records, league by league.
  for (const l of LEAGUE_IDS) {
    const s = input.leagues[l];
    const sport = sportOfLeague(l);
    const rosters = new Map<string, typeof input.world.players>();
    for (const p of input.world.players) if (p.sport === sport && s.standings.some((r) => r.team === p.teamId)) rosters.set(p.teamId, [...(rosters.get(p.teamId) ?? []), p]);
    const acc = new Map<string, PlayerSeason>();
    for (const [t, ps] of rosters) for (const p of ps) acc.set(p.id, { playerId: p.id, teamId: t, league: l, year, regular: {}, playoffs: {} });
    const finals = new Map<string, StatLine>();
    const gameCands: RecordEntry[] = [];
    const finalSeries = s.playoffs[2];
    const games: [PlayedGame, Series | undefined, number | undefined][] = [...s.regular.map((g) => [g, undefined, undefined] as [PlayedGame, undefined, undefined]), ...s.playoffs.flatMap((x) => x.games.map((g, n) => [g, x, n] as [PlayedGame, Series, number]))];
    for (const [g, series, n] of games) {
      const out = new Set(g.pre.out);
      const avail = new Map([...rosters].filter(([t]) => t === g.home || t === g.away).map(([t, ps]) => [t, ps.filter((p) => !out.has(p.id))]));
      const gl = gameLines(toHGame(g, l, year, series, n), avail);
      for (const [pid, ln] of gl) {
        const ps = acc.get(pid);
        if (!ps) continue;
        if (!g.pre.playoff && played(ln)) appeared.set(pid, (appeared.get(pid) ?? 0) + 1);
        add(g.pre.playoff ? ps.playoffs : ps.regular, ln);
        if (series === finalSeries) { const f = finals.get(pid) ?? {}; add(f, ln); finals.set(pid, f); }
        for (const [stat, label] of GAME_STATS[sport]) if ((ln[stat] ?? 0) > 0) gameCands.push({ kind: 'game', league: l, stat, label, value: ln[stat], playerId: pid, teamId: ps.teamId, year, gameId: g.id });
      }
    }
    const seasonPlayers = [...acc.values()];
    const records = Object.fromEntries(s.standings.map((r) => [r.team, [r.w, r.l + r.otl + r.t] as [number, number]]));
    const final = s.playoffs[2];
    const runnerUp = final.winner === final.high ? final.low : final.high;
    const hs: HSeason = { id: `${l}-${year}`, league: l, year, games: SEASON_FORMAT[sport].gamesPerTeam, records, seeds: s.standings.slice(0, 4).map((r) => r.team), champion: s.champion, runnerUp, origin: 'save', adjusted: false, rosters: {} };
    const hon = seasonHonors(dataLike, { season: hs, regular: [], playoffs: [], attempts: 0 } as HistorySeason, seasonPlayers, finals);

    // Records against this save's book (canon + 2026 + earlier save seasons).
    const before = book;
    const verdicts: LeagueYear['records'] = [];
    const judge = (kind: 'game' | 'season' | 'career' | 'team', cands: RecordEntry[]) => {
      for (const c of cands) {
        const top = topOf(before[kind], c.league, c.stat);
        if (!top) continue;
        if (c.value > top.value) verdicts.push({ ...c, verdict: 'new record', previous: top.value });
        else if (c.value === top.value && kind !== 'career') verdicts.push({ ...c, verdict: 'ties record', previous: top.value });
      }
    };
    const seasonCands: RecordEntry[] = [];
    const careerCands: RecordEntry[] = [];
    const milestones: LeagueYear['milestones'] = [];
    for (const ps of seasonPlayers) {
      lines[ps.playerId] = { t: ps.teamId, r: ps.regular, ...(played(ps.playoffs) ? { p: ps.playoffs } : {}) };
      for (const [stat, label] of SEASON_STATS[sport]) if ((ps.regular[stat] ?? 0) > 0) seasonCands.push({ kind: 'season', league: l, stat, label, value: ps.regular[stat], playerId: ps.playerId, teamId: ps.teamId, year });
      if (!played(ps.regular) && !played(ps.playoffs)) continue;
      const c = careers[ps.playerId] ?? { n: 0, ti: 0, v: 0, bo: 0, tot: {} };
      const beforeTot = { ...c.tot };
      c.n += 1;
      c.v = Math.round((c.v + seasonValue(sport, ps.regular)) * 10) / 10;
      if (ps.teamId === s.champion) c.ti += 1;
      for (const [stat] of SEASON_STATS[sport]) if (ps.regular[stat]) c.tot[stat] = (c.tot[stat] ?? 0) + ps.regular[stat];
      for (const [stat, marks] of MILESTONES[sport]) for (const m of marks) if ((beforeTot[stat] ?? 0) < m && (c.tot[stat] ?? 0) >= m) milestones.push({ i: ps.playerId, stat, value: m });
      careers[ps.playerId] = c;
      const p = players.get(ps.playerId)!;
      for (const [stat, label] of SEASON_STATS[sport]) if ((c.tot[stat] ?? 0) > 0) careerCands.push({ kind: 'career', league: l, stat, label: label.replace('in a season', 'career'), value: c.tot[stat], playerId: ps.playerId, seasons: [p.d, year] });
    }
    for (const a of hon.awards) {
      const c = careers[a.playerId];
      if (!c) continue;
      c.bo += awardBonus(a.award);
      c.aw = [...(c.aw ?? []), `${year} ${a.award}`];
    }
    // Team: winning streaks (a tie ends a streak) and wins.
    const teamCands: RecordEntry[] = [];
    const cur = new Map<string, number>();
    const bestStreak = new Map<string, number>();
    for (const g of [...s.regular].sort((a, b) => a.round - b.round || a.id.localeCompare(b.id))) {
      const hsc = g.result.homeScore;
      const asc = g.result.awayScore;
      for (const [t, won] of [[g.home, hsc > asc], [g.away, asc > hsc]] as const) {
        cur.set(t, won ? (cur.get(t) ?? 0) + 1 : 0);
        bestStreak.set(t, Math.max(bestStreak.get(t) ?? 0, cur.get(t)!));
      }
    }
    for (const r of s.standings) {
      teamCands.push({ kind: 'team', league: l, stat: 'streak', label: 'Longest winning streak', value: bestStreak.get(r.team) ?? 0, teamId: r.team, year });
      teamCands.push({ kind: 'team', league: l, stat: 'wins', label: 'Most wins in a season', value: r.w, teamId: r.team, year });
    }
    judge('game', gameCands);
    judge('season', seasonCands);
    judge('career', careerCands);
    judge('team', teamCands);
    book = {
      game: mergeBook(book.game, gameCands),
      season: mergeBook(book.season, seasonCands),
      career: mergeBook(book.career, careerCands, true),
      team: mergeBook(book.team, teamCands),
    };
    // Championships: drought ended and titles in a row.
    const ty = titles[s.champion] ?? [];
    const last = ty.filter((y) => y < year).at(-1);
    titles[s.champion] = [...ty.filter((y) => y !== year), year].sort((a, b) => a - b);
    let consecutive = 0;
    for (let y = year; titles[s.champion].includes(y); y--) consecutive++;
    const comebacks = s.playoffs.flatMap((x) => {
      let w = 0;
      let lo = 0;
      let worst = 0;
      let at = '';
      for (const g of x.games) {
        const highWon = (g.result.homeScore > g.result.awayScore) === (g.home === x.high);
        if ((highWon ? x.high : x.low) === x.winner) w++;
        else lo++;
        if (lo - w > worst) { worst = lo - w; at = `${w}-${lo}`; }
      }
      const loser = x.winner === x.high ? x.low : x.high;
      return worst >= 2 ? [{ seriesId: x.games[0].id.replace(/:g\d+$/, ''), winner: x.winner, loser, deficit: at, ...(at === LEGENDARY_DEFICIT ? { tags: ['legendary_comeback'] } : {}) }] : [];
    });
    leagues[l] = {
      champion: s.champion, runnerUp, seeds: hs.seeds,
      standings: s.standings.map((r) => [r.team, r.w, r.l, r.t, r.otl]),
      final: { [final.high]: final.wins[0], [final.low]: final.wins[1] },
      awards: hon.awards, leaders: hon.leaders, comebacks, records: verdicts, milestones,
      titleDrought: last === undefined ? null : year - last - 1, consecutive,
      series: s.playoffs.map((x) => ({ round: x.round, high: x.high, low: x.low, winner: x.winner, wins: [x.wins[0], x.wins[1]] as [number, number], games: x.games.map((g) => [g.home === x.high ? 1 : 0, g.result.homeScore, g.result.awayScore, g.result.ot] as [number, number, number, number]) })),
    };
  }
  steps.push('season final', 'tickets settled (service)', 'standings and champions', 'player stats', 'awards and records');

  // 6-7: retirements; Hall of Fame decided at retirement, inducted five years later.
  const retired: YearSummary['retired'] = [];
  const pending: HofPending[] = [...prev.pending];
  const retireIds = new Set<string>();
  // Players stepping away for a scripted comeback: off the roster, kept on file.
  const awayIds = new Set<string>();
  const storylines: Storyline[] = [];
  const story = (p: UPlayer, kind: Storyline['kind'], age: number) =>
    storylines.push({ i: p.i, n: p.n, t: p.t, kind, age, note: STORYLINE_NOTE[kind](p.n, teamById(p.t).name) });
  // The scripted injury happened during the season just played.
  if (year === VALE_ARC.injuredIn) {
    const hurt = input.leagues.igl.injuries.find((e) => e.playerId === VALE && e.games === SEASON_ENDING);
    const p = players.get(VALE);
    if (hurt && p) story(p, 'injured', year - p.b);
  }
  for (const l of LEAGUE_IDS) {
    const games = SEASON_FORMAT[sportOfLeague(l)].gamesPerTeam;
    for (const team of Object.keys(prev.rosters[l]).sort()) {
      const members = [...players.values()].filter((p) => p.l === l && p.t === team && !p.x).sort((a, b) => b.L - a.L || a.i.localeCompare(b.i));
      members.forEach((p, idx) => {
        const share = p.r ? 0 : Math.min(1, (appeared.get(p.i) ?? 0) / games);
        const age = year - p.b;
        if (p.i === VALE && year === VALE_ARC.retireAfter) {
          // Scripted: he retires (and says it's for good), but stays on file for the comeback.
          awayIds.add(p.i);
          retired.push({ i: p.i, n: p.n, l, t: team, age, seasons: careers[p.i]?.n ?? 0 });
          story(p, 'retired', age);
          return;
        }
        const q = retireChance(p, age, { share, rank: members.length > 1 ? idx / (members.length - 1) : 0, seasons: careers[p.i]?.n ?? 0 }, U.hazard[l], year);
        if (stream(seed, 'retire', p.i, year).next() < q) {
          retireIds.add(p.i);
          const c = careers[p.i] ?? { n: 0, ti: 0, v: 0, bo: 0, tot: {} };
          retired.push({ i: p.i, n: p.n, l, t: team, age, seasons: c.n });
          const sc = Math.round((c.v + c.bo + 5 * c.ti) * 10) / 10;
          if (c.n >= 8 && sc >= U.threshold[l]) pending.push({ i: p.i, n: p.n, l, y: year + 5, f: year, s: c.n, sc });
        }
      });
    }
  }
  for (const id of retireIds) { players.delete(id); delete careers[id]; }
  for (const id of awayIds) { const p = players.get(id)!; p.x = 1; p.r = 1; }
  const inducted = pending.filter((h) => h.y === nextYear);
  const stillPending = pending.filter((h) => h.y !== nextYear);
  steps.push('retirements', 'hall of fame');

  // 8-10: reserves back first, then the rookie class and the draft.
  const rosters = {} as UState['rosters'];
  const returned: string[] = [];
  const draft: YearSummary['draft'] = [];
  const names = new Set([...U.canonNames, ...prev.names]);
  const newNames: string[] = [...prev.names];
  for (const l of LEAGUE_IDS) {
    const sport = sportOfLeague(l);
    const comp = U.composition[l];
    const r: Record<string, string[]> = {};
    for (const [team, ids] of Object.entries(prev.rosters[l])) r[team] = ids.filter((id) => !retireIds.has(id) && !awayIds.has(id));
    // Scripted comeback: back on his old team; its weakest player at his position goes to the reserves.
    const back = players.get(VALE);
    if (l === back?.l && back.x && nextYear === VALE_ARC.returnFor && r[back.t]) {
      const bench = r[back.t].map((id) => players.get(id)!).filter((q) => q.p === back.p).sort((a, b) => a.L - b.L || a.i.localeCompare(b.i))[0];
      if (bench) { r[back.t] = r[back.t].filter((id) => id !== bench.i); bench.r = 1; }
      delete back.x;
      back.r = 0;
      r[back.t].push(back.i);
      story(back, 'comeback', nextYear - back.b);
    }
    const need = (team: string, pos: string) => comp[pos] - r[team].filter((id) => players.get(id)!.p === pos).length;
    for (const p of [...players.values()].filter((x) => x.l === l && x.r === 1 && !x.x).sort((a, b) => b.L - a.L || a.i.localeCompare(b.i))) {
      if (r[p.t] && need(p.t, p.p) > 0) { r[p.t].push(p.i); p.r = 0; returned.push(p.i); }
    }
    const teams = Object.keys(r).sort();
    const open = Object.fromEntries(Object.keys(comp).map((pos) => [pos, teams.reduce((n, t) => n + Math.max(0, need(t, pos)), 0)]));
    const rng = stream(seed, 'prospects', l, nextYear);
    const pool: { p: UPlayer; scout: number }[] = [];
    let k = 0;
    const spread = SPORTS_CONFIG.generation[sport].playerSpread;
    for (const pos of Object.keys(comp).sort()) {
      for (let j = 0; open[pos] > 0 && j < open[pos] * 2 + 3; j++) {
        let name = '';
        for (let tries = 0; tries < 500 && (!name || names.has(name)); tries++) name = `${rng.pick(U.vocab.first)} ${rng.pick(U.vocab.last)}`;
        if (names.has(name)) throw new RosterError(`No free name for a ${l} ${nextYear} prospect`);
        names.add(name);
        const id = `${l}_d${nextYear}_${String(++k).padStart(3, '0')}`;
        const b = nextYear - rng.pick(U.debutAges[l]);
        const pk = peakFor(seed, sport, id);
        const kind = devKindFor(seed, id);
        // Teams take the best of a deeper pool, so the pool sits below the league's historical
        // level (60) by PROSPECT_DISCOUNT spreads; a typical draft class then averages about 60.
        const talent = 60 - PROSPECT_DISCOUNT * spread + stream(seed, 'talent', id).normal() * spread;
        const age = nextYear - b;
        const L = Math.round((talent - Math.max(0, pk - age) * 1.2) * 10) / 10;
        const e = DEFAULT_ENGINE_POS[sport][pos];
        const attrs = attrsFor(sport, e, L, id, nextYear);
        const p: UPlayer = { i: id, n: name, l, p: pos, b, d: nextYear, t: '', r: 0, pk, k: kind, L, L0: L, e, a0: Object.values(attrs), dL: 0, pot: Math.round(talent * 10) / 10 };
        pool.push({ p, scout: talent + stream(seed, 'scouting', id).normal() * 5 });
      }
    }
    pool.sort((a, b) => b.scout - a.scout || a.p.i.localeCompare(b.p.i));
    const order = draftOrderLive(input.leagues[l]);
    let overall = 0;
    for (let round = 1; teams.some((t) => Object.keys(comp).some((pos) => need(t, pos) > 0)); round++) {
      if (round > 40) throw new RosterError(`${l} ${nextYear}: the draft could not fill the rosters`);
      let pick = 0;
      for (const team of order) {
        const at = pool.findIndex((x) => need(team, x.p.p) > 0);
        if (at < 0) continue;
        const [{ p }] = pool.splice(at, 1);
        p.t = team;
        p.dr = [nextYear, round, ++pick, ++overall];
        players.set(p.i, p);
        r[team].push(p.i);
        newNames.push(p.n);
        draft.push({ l, round, pick, overall, i: p.i, n: p.n, pos: p.p, t: team, age: nextYear - p.b, pot: p.pot! });
      }
    }
    for (const t of teams) r[t].sort();
    rosters[l] = r;
  }
  steps.push('rookie class', 'draft', 'rosters replenished');

  // 11: development for everyone who stays (draftees start at their drafted ability).
  for (const p of players.values()) {
    if (p.d === nextYear) continue;
    const d = develop(p, prev.year, nextYear, seed);
    p.L = d.L;
    p.dL = d.dL;
  }
  steps.push('development', 'schedule (engine)');

  // 13: validate and build the new state.
  const next: UState = {
    v: 1, year: nextYear,
    players: [...players.values()].sort((a, b) => a.i.localeCompare(b.i)),
    rosters, careers, pending: stillPending, book, titles, names: newNames,
  };
  validateState(next, U);
  steps.push('validated');
  const counts = {} as YearSummary['counts'];
  for (const l of LEAGUE_IDS) {
    const act = next.players.filter((p) => p.l === l);
    counts[l] = {
      active: act.length, rostered: Object.values(rosters[l]).flat().length, reserves: act.filter((p) => p.r === 1).length,
      retired: retired.filter((x) => x.l === l).length, drafted: draft.filter((x) => x.l === l).length, returned: returned.filter((id) => id.startsWith(`${l}_`)).length,
    };
  }
  const summary: YearSummary = {
    year, leagues, retired, returned, draft, counts, steps,
    ...(storylines.length ? { storylines } : {}),
    hallOfFame: inducted.map((h) => ({ i: h.i, n: h.n, l: h.l, y: h.y, sc: h.sc, pathway: 'statistical' as const })),
  };
  return { next, summary, lines };
}

/**
 * Every player's lines for a season that was played, without running an off-season (read-only).
 * Used to rebuild seasons that a legacy save played on the fixed 2027 rosters before its yearly
 * off-seasons began (they were never stored): the same games, so the same lines.
 */
export function seasonLinesOf(input: SeasonInput): YearLines {
  const lines: YearLines = {};
  for (const l of LEAGUE_IDS) {
    const s = input.leagues[l];
    const sport = sportOfLeague(l);
    const rosters = new Map<string, typeof input.world.players>();
    for (const p of input.world.players) if (p.sport === sport && s.standings.some((r) => r.team === p.teamId)) rosters.set(p.teamId, [...(rosters.get(p.teamId) ?? []), p]);
    for (const [t, ps] of rosters) for (const p of ps) lines[p.id] = { t, r: {} };
    const games: [PlayedGame, Series | undefined, number | undefined][] = [...s.regular.map((g) => [g, undefined, undefined] as [PlayedGame, undefined, undefined]), ...s.playoffs.flatMap((x) => x.games.map((g, n) => [g, x, n] as [PlayedGame, Series, number]))];
    for (const [g, series, n] of games) {
      const out = new Set(g.pre.out);
      const avail = new Map([...rosters].filter(([t]) => t === g.home || t === g.away).map(([t, ps]) => [t, ps.filter((p) => !out.has(p.id))]));
      for (const [pid, ln] of gameLines(toHGame(g, l, input.year, series, n), avail)) {
        const e = lines[pid];
        if (!e) continue;
        if (g.pre.playoff) add((e.p ??= {}), ln);
        else add(e.r, ln);
      }
    }
  }
  return lines;
}

/** Full rosters of the right shape, nobody twice, every rostered player active and on that team. */
export function validateState(st: UState, U: UniverseSeed) {
  const byId = new Map(st.players.map((p) => [p.i, p]));
  if (byId.size !== st.players.length) throw new RosterError('Duplicate player ids');
  const seen = new Set<string>();
  for (const l of LEAGUE_IDS) {
    const teams = Object.keys(st.rosters[l]);
    if (teams.length !== 8) throw new RosterError(`${l}: ${teams.length} teams`);
    for (const t of teams) {
      const c: Record<string, number> = {};
      for (const id of st.rosters[l][t]) {
        const p = byId.get(id);
        if (!p) throw new RosterError(`${t}: ${id} is not an active player`);
        if (seen.has(id)) throw new RosterError(`${id} is on two rosters`);
        if (p.t !== t || p.r !== 0 || p.l !== l) throw new RosterError(`${id} is rostered by ${t} but belongs to ${p.t}`);
        seen.add(id);
        c[p.p] = (c[p.p] ?? 0) + 1;
      }
      for (const [pos, n] of Object.entries(U.composition[l])) if ((c[pos] ?? 0) !== n) throw new RosterError(`${t}: ${c[pos] ?? 0} ${pos}, needs ${n}`);
    }
  }
  for (const p of st.players) if (p.r === 0 && !seen.has(p.i)) throw new RosterError(`${p.i} is active but on no roster`);
}

export { FOUNDED };
