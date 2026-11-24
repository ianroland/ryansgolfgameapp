/**
 * Phase D (part 2): the league years after the ledger. Generated and proposed, never verified.
 *
 *   2026  off-season (retirements, v0.4's listed 2026 debuts, reserves back, the 2026 draft),
 *         then a full season played on the engine with no target records: real standings,
 *         real playoffs, a real champion.
 *   2027  the off-season after it, giving the rosters the live leagues start from.
 *
 * Everything is seeded from HISTORY_SEED, so it is the same in every save. The 1972-2025 data
 * is never rewritten: this layer sits on top (forward.json) and `mergeForward` combines them.
 *
 * Rules (documented for the owner):
 * - Retirement: each active player retires after a season with his league's historical chance
 *   for his age (1990-2024 rosters, smoothed over neighbouring ages). Players named in the bible
 *   are exempt: their careers end only by owner decision.
 * - Rosters keep the 2025 composition (positions per team). Players stay with their team (the
 *   data has one trade in 50 years, so none are invented). Open places are filled in order by
 *   v0.4's listed debuts for that team, then the team's own reserves, then the draft.
 * - Draft: order is the previous season in reverse (non-playoff teams worst first, then the
 *   semifinal losers, the runner-up, the champion last). Each team takes the best prospect left
 *   at a position it needs. Prospects get names from the source data's own first and last names
 *   (never a name already used) and debut ages from the league's history.
 * - Team strength: half of last season's strength carries over (`offsets`); the rest is talent
 *   and age, exactly as in the historical rosters.
 */
import { SPORTS_CONFIG } from '../config';
import { leagueById, SEASON_FORMAT, type LeagueId, type Sport } from '../demo';
import type { Player } from '../players';
import { stream } from '../rng';
import { seasonSchedule } from '../schedule';
import { HOME_PATTERN, SIMULATORS, standingsOf } from '../season';
import type { GameContext, GameResult } from '../sim';
import type { HistoryData, HPlayer, HSeason } from './data';
import type { HGame, HistorySeason, HSeries } from './games';
import { HISTORY_SEED, historyRoster, level, offsetOf } from './rosters';

export const LAST_LEDGER_YEAR = 2025;
export const SIMULATED_YEAR = 2026;
export const LIVE_YEAR = 2027;
export const LEAGUE_IDS: LeagueId[] = ['gdc', 'ccl', 'igl', 'fhl'];
/** Share of last season's team strength that carries into the next. */
export const CARRY = 0.5;

const sportOf = (l: LeagueId): Sport => leagueById(l).sport;

// ── Retirement ──
/** Chance of retiring after a season, by league and age, from the 1990-2024 rosters. */
export function retirementHazard(data: HistoryData): Record<LeagueId, Map<number, number>> {
  const out = {} as Record<LeagueId, Map<number, number>>;
  for (const l of LEAGUE_IDS) {
    const active = new Map<number, number>();
    const retired = new Map<number, number>();
    for (const s of data.seasons) {
      if (s.league !== l || s.year < 1990 || s.year > 2024) continue;
      for (const ix of Object.values(s.rosters).flat()) {
        const p = data.players[ix];
        const a = s.year - p.b;
        active.set(a, (active.get(a) ?? 0) + 1);
        if (p.f === s.year) retired.set(a, (retired.get(a) ?? 0) + 1);
      }
    }
    const ages = [...active.keys()];
    const h = new Map<number, number>();
    for (let a = Math.min(...ages); a <= Math.max(...ages) + 6; a++) {
      let r = 0;
      let n = 0;
      for (let d = -1; d <= 1; d++) {
        r += retired.get(a + d) ?? 0;
        n += active.get(a + d) ?? 0;
      }
      h.set(a, n >= 10 ? Math.min(0.95, Math.max(0.01, r / n)) : 0.95);
    }
    out[l] = h;
  }
  return out;
}
export const hazardAt = (h: Map<number, number>, age: number) => h.get(age) ?? (age < Math.min(...h.keys()) ? 0.01 : 0.95);

// ── Off-season ──
export interface ForwardPick { league: LeagueId; year: number; round: number; pick: number; overall: number; playerId: string; teamId: string; pos: string }
export interface Offseason {
  year: number;
  /** Retired after the previous season (their final season stays as it was). */
  retired: string[];
  /** v0.4's listed debuts for this year placed on their team. */
  signed: string[];
  /** Reserves (active, not on a game roster) back on their team. */
  returned: string[];
  draft: ForwardPick[];
  /** league → team → player ids on the game roster. */
  rosters: Record<LeagueId, Record<string, string[]>>;
  /** Active players not on a game roster this season. */
  reserves: string[];
  /** Draftees created this off-season. */
  newPlayers: HPlayer[];
}

/** Positions per team, from the 2025 rosters. */
export function compositionOf(data: HistoryData, league: LeagueId): Record<string, number> {
  const s = data.seasons.find((x) => x.league === league && x.year === LAST_LEDGER_YEAR)!;
  const first = Object.values(s.rosters)[0];
  const c: Record<string, number> = {};
  for (const ix of first) c[data.players[ix].p] = (c[data.players[ix].p] ?? 0) + 1;
  return c;
}

/** Draft order from a finished season: worst first, the champion last. */
export function draftOrder(s: HSeason): string[] {
  const pct = (t: string) => s.records[t][0] / Math.max(1, s.records[t][0] + s.records[t][1]);
  const byRecord = (a: string, b: string) => pct(a) - pct(b) || a.localeCompare(b);
  const out = Object.keys(s.records).filter((t) => !s.seeds.includes(t)).sort(byRecord);
  out.push(...s.seeds.filter((t) => t !== s.champion && t !== s.runnerUp).sort(byRecord), s.runnerUp, s.champion);
  return out;
}

function vocabulary(players: HPlayer[]) {
  const first = new Set<string>();
  const last = new Set<string>();
  for (const p of players) {
    const i = p.n.indexOf(' ');
    first.add(p.n.slice(0, i));
    last.add(p.n.slice(i + 1));
  }
  return { first: [...first].sort(), last: [...last].sort() };
}

/**
 * One off-season. `players` holds every player known so far (ids unique) and gains the draftees;
 * `prevRosters` is the season just finished and `reserves` the active players left off it.
 */
export function offseason(args: {
  data: HistoryData;
  players: Map<string, HPlayer>;
  year: number;
  prevSeasons: Record<LeagueId, HSeason>;
  prevRosters: Record<LeagueId, Record<string, string[]>>;
  reserves: string[];
  hazard: Record<LeagueId, Map<number, number>>;
}): Offseason {
  const { data, players, year, prevSeasons, prevRosters, hazard } = args;
  const out: Offseason = { year, retired: [], signed: [], returned: [], draft: [], rosters: {} as Offseason['rosters'], reserves: [], newPlayers: [] };
  const vocab = vocabulary([...players.values()]);
  const takenNames = new Set([...players.values()].map((p) => p.n));
  const retires = (p: HPlayer) => !p.a && stream(HISTORY_SEED, 'retire', p.i, year - 1).next() < hazardAt(hazard[p.l], year - 1 - p.b);
  const reservesLeft = new Set<string>();
  for (const id of args.reserves) {
    if (retires(players.get(id)!)) out.retired.push(id);
    else reservesLeft.add(id);
  }
  for (const league of LEAGUE_IDS) {
    const sport = sportOf(league);
    const comp = compositionOf(data, league);
    const rosters: Record<string, string[]> = {};
    const prevOffset = (t: string) => CARRY * offsetOf(sport, prevSeasons[league].records[t]);
    const need = (t: string, pos: string) => comp[pos] - rosters[t].filter((id) => players.get(id)!.p === pos).length;
    for (const [team, ids] of Object.entries(prevRosters[league])) {
      rosters[team] = [];
      for (const id of ids) {
        if (retires(players.get(id)!)) out.retired.push(id);
        else rosters[team].push(id);
      }
    }
    const teams = Object.keys(rosters).sort();
    // v0.4's listed debuts for this year, on the team v0.4 gives them.
    for (const p of [...players.values()].filter((x) => x.l === league && x.d === year && !x.i.includes(`_d${year}_`)).sort((a, b) => a.i.localeCompare(b.i))) {
      const team = p.s[0][0];
      if (rosters[team] && need(team, p.p) > 0) { rosters[team].push(p.i); out.signed.push(p.i); } else reservesLeft.add(p.i);
    }
    // Reserves back on their own team, best first.
    const lvl = (p: HPlayer) => level(sport, p, year, prevOffset(p.s.at(-1)![0]));
    for (const id of [...reservesLeft].filter((x) => players.get(x)!.l === league).sort((a, b) => lvl(players.get(b)!) - lvl(players.get(a)!) || a.localeCompare(b))) {
      const p = players.get(id)!;
      const team = p.s.at(-1)![0];
      if (rosters[team] && need(team, p.p) > 0) { rosters[team].push(id); out.returned.push(id); reservesLeft.delete(id); }
    }
    // The draft.
    const order = draftOrder(prevSeasons[league]);
    const open = Object.fromEntries(Object.keys(comp).map((pos) => [pos, teams.reduce((s, t) => s + need(t, pos), 0)]));
    const r = stream(HISTORY_SEED, 'prospects', league, year);
    const debutAges = data.players.filter((p) => p.l === league && p.d > 1980 && p.d <= LAST_LEDGER_YEAR).map((p) => p.d - p.b).sort((a, b) => a - b);
    const pool: { p: HPlayer; scout: number }[] = [];
    let n = 0;
    for (const pos of Object.keys(comp).sort()) {
      for (let k = 0; k < open[pos] * 2 + 3 && open[pos] > 0; k++) {
        let name = '';
        for (let tries = 0; tries < 500 && (!name || takenNames.has(name)); tries++) name = `${r.pick(vocab.first)} ${r.pick(vocab.last)}`;
        if (takenNames.has(name)) throw new Error(`No free name for a ${league} ${year} prospect`);
        takenNames.add(name);
        const id = `${league}_d${year}_${String(++n).padStart(3, '0')}`;
        const p: HPlayer = { i: id, n: name, l: league, p: pos, d: year, f: year, b: year - r.pick(debutAges), s: [] };
        pool.push({ p, scout: level(sport, p, year, 0) + stream(HISTORY_SEED, 'scouting', id).normal() * 6 });
      }
    }
    pool.sort((a, b) => b.scout - a.scout || a.p.i.localeCompare(b.p.i));
    let overall = 0;
    for (let round = 1; teams.some((t) => Object.keys(comp).some((pos) => need(t, pos) > 0)); round++) {
      let pick = 0;
      for (const team of order) {
        const at = pool.findIndex((x) => need(team, x.p.p) > 0);
        if (at < 0) continue;
        const [{ p }] = pool.splice(at, 1);
        p.s = [[team, year, year]];
        players.set(p.i, p);
        rosters[team].push(p.i);
        out.newPlayers.push(p);
        out.draft.push({ league, year, round, pick: ++pick, overall: ++overall, playerId: p.i, teamId: team, pos: p.p });
      }
      if (round > 40) throw new Error(`${league} ${year} draft did not fill the rosters`);
    }
    for (const t of teams) rosters[t].sort();
    out.rosters[league] = rosters;
  }
  out.reserves = [...reservesLeft].sort();
  out.retired.sort();
  return out;
}

// ── A season with no target records ──
function decided(sport: Sport, id: string, home: string, away: string, hr: Player[], ar: Player[], ctx: GameContext): { result: GameResult; tries: number } {
  for (let k = 0; k < 50; k++) {
    const result = SIMULATORS[sport](id, home, away, hr, ar, stream(HISTORY_SEED, 'game', id, k), ctx);
    if (result.homeScore !== result.awayScore) return { result, tries: k + 1 };
  }
  throw new Error(`${id} tied 50 times`);
}

/**
 * Plays a league season for real (today's schedule and playoff format). The league has never had
 * a tied game, so a tie is replayed on the next seeded stream; nothing else is steered.
 * `stub` needs id, league, year, rosters and offsets.
 */
export function freeSeason(data: HistoryData, stub: HSeason): HistorySeason {
  const lg = stub.league;
  const sport = sportOf(lg);
  const teams = Object.keys(stub.rosters).sort();
  const rosters = new Map(teams.map((t) => [t, historyRoster(data, stub, t)]));
  const cal = SPORTS_CONFIG.calendar[sport];
  const fmt = SEASON_FORMAT[sport];
  const schedule = seasonSchedule(teams, fmt.meetingsPerOpponent, stream(HISTORY_SEED, 'schedule', stub.id), `${lg}:h${stub.year}`, cal.seriesLength);
  const played = new Map(teams.map((t) => [t, 0]));
  let attempts = 0;
  const play = (id: string, home: string, away: string, neutral: boolean, playoff: boolean) => {
    const ctx: GameContext = { neutral, playoff, homeGameNo: played.get(home)!, awayGameNo: played.get(away)! };
    const { result, tries } = decided(sport, id, home, away, rosters.get(home)!, rosters.get(away)!, ctx);
    attempts += tries;
    played.set(home, played.get(home)! + 1);
    played.set(away, played.get(away)! + 1);
    const winner = result.homeScore > result.awayScore ? home : away;
    return { result, winner, loser: winner === home ? away : home };
  };
  const regular: HGame[] = schedule.map((g) => {
    const x = play(g.id, g.home, g.away, false, false);
    return { id: g.id, league: lg, year: stub.year, day: g.round, playoff: false, home: g.home, away: g.away, ...x, events: [], provenance: 'generated' };
  });
  const standings = standingsOf(regular, teams, (t) => stream(HISTORY_SEED, 'tiebreak', stub.id, t).next(), sport);
  const seeds = standings.slice(0, SPORTS_CONFIG.playoffs.teams).map((r) => r.team);
  const po = SPORTS_CONFIG.playoffs[sport];
  const series = (round: 'semifinal' | 'final', high: string, low: string): HSeries => {
    const bestOf = round === 'final' ? po.final : po.semi;
    const need = Math.ceil(bestOf / 2);
    const id = `${lg}:h${stub.year}:po:${round}:${high}-${low}`;
    const wins: Record<string, number> = { [high]: 0, [low]: 0 };
    const games: HGame[] = [];
    for (let i = 0; wins[high] < need && wins[low] < need; i++) {
      const [home, away] = HOME_PATTERN[sport][bestOf][i] ? [high, low] : [low, high];
      const gid = `${id}:g${i + 1}`;
      const x = play(gid, home, away, sport === 'football' && round === 'final', true);
      wins[x.winner]++;
      games.push({ id: gid, league: lg, year: stub.year, day: i, playoff: true, round, seriesId: id, home, away, ...x, events: [], provenance: 'generated' });
    }
    games.at(-1)!.decider = true;
    const winner = wins[high] === need ? high : low;
    return { id, round, high, low, bestOf, winner, loser: winner === high ? low : high, wins, games };
  };
  const semi1 = series('semifinal', seeds[0], seeds[3]);
  const semi2 = series('semifinal', seeds[1], seeds[2]);
  const [fh, fl] = seeds.indexOf(semi1.winner) < seeds.indexOf(semi2.winner) ? [semi1.winner, semi2.winner] : [semi2.winner, semi1.winner];
  const final = series('final', fh, fl);
  const records = Object.fromEntries(standings.map((r) => [r.team, [r.w, r.l + r.otl + r.t] as [number, number]]));
  const season: HSeason = { ...stub, games: fmt.gamesPerTeam, records, seeds, champion: final.winner, runnerUp: final.loser, origin: 'simulated', adjusted: false };
  return { season, regular, playoffs: [semi1, semi2, final], attempts };
}

// ── The forward layer ──
export interface ForwardData {
  note: string;
  offseasons: Offseason[];
  /** The simulated 2026 seasons (rosters index the merged player list). */
  seasons: HSeason[];
}

/** 2025 rosters (by id) and the active players left off them. */
export function ledgerEnd(data: HistoryData) {
  const rosters = {} as Record<LeagueId, Record<string, string[]>>;
  const seasons = {} as Record<LeagueId, HSeason>;
  const on = new Set<string>();
  for (const l of LEAGUE_IDS) {
    const s = data.seasons.find((x) => x.league === l && x.year === LAST_LEDGER_YEAR)!;
    seasons[l] = s;
    rosters[l] = Object.fromEntries(Object.entries(s.rosters).map(([t, ixs]) => [t, ixs.map((ix) => data.players[ix].i)]));
    Object.values(rosters[l]).flat().forEach((id) => on.add(id));
  }
  const reserves = data.players.filter((p) => !on.has(p.i) && p.s.some(([, a, b]) => a <= LAST_LEDGER_YEAR && b >= LAST_LEDGER_YEAR)).map((p) => p.i).sort();
  return { rosters, seasons, reserves, onRoster: on };
}

/** Builds 2026 and the 2027 rosters from the ledger. Deterministic. */
export function buildForward(data: HistoryData): ForwardData {
  const hazard = retirementHazard(data);
  const players = new Map(data.players.map((p) => [p.i, { ...p, s: p.s.map((x) => [...x] as [string, number, number]) }]));
  const end = ledgerEnd(data);
  const o26 = offseason({ data, players, year: SIMULATED_YEAR, prevSeasons: end.seasons, prevRosters: end.rosters, reserves: end.reserves, hazard });
  const merged26 = mergeForward(data, { note: '', offseasons: [o26], seasons: [] });
  const index = new Map(merged26.players.map((p, i) => [p.i, i]));
  const seasons: HSeason[] = [];
  const done = {} as Record<LeagueId, HSeason>;
  for (const l of LEAGUE_IDS) {
    const sport = sportOf(l);
    const stub: HSeason = {
      id: `${l}-${SIMULATED_YEAR}`, league: l, year: SIMULATED_YEAR, games: 0, records: {}, seeds: [], champion: '', runnerUp: '', origin: 'simulated', adjusted: false,
      rosters: Object.fromEntries(Object.entries(o26.rosters[l]).map(([t, ids]) => [t, ids.map((id) => index.get(id)!)])),
      offsets: Object.fromEntries(Object.keys(o26.rosters[l]).sort().map((t) => [t, Math.round(CARRY * offsetOf(sport, end.seasons[l].records[t]) * 100) / 100])),
    };
    const s = freeSeason(merged26, stub).season;
    seasons.push(s);
    done[l] = s;
  }
  const o27 = offseason({ data, players, year: LIVE_YEAR, prevSeasons: done, prevRosters: o26.rosters, reserves: o26.reserves, hazard });
  return {
    note: 'Generated by scripts/history/build_forward.ts. Simulated 2026 season and 2027 rosters: proposed, not verified history.',
    offseasons: [o26, o27],
    seasons,
  };
}

/**
 * The ledger plus the forward layer: draftees appended (ledger indexes unchanged), players who
 * played 2026 have their final year and last segment run through 2026, and the 2026 seasons.
 */
export function mergeForward(data: HistoryData, fwd: ForwardData): HistoryData {
  const players = data.players.map((p) => ({ ...p, s: p.s.map((x) => [...x] as [string, number, number]) }));
  for (const o of fwd.offseasons) players.push(...o.newPlayers.map((p) => ({ ...p, s: p.s.map((x) => [...x] as [string, number, number]), f: p.d })));
  for (const s of fwd.seasons) {
    for (const [team, ixs] of Object.entries(s.rosters)) {
      for (const ix of ixs) {
        const p = players[ix];
        p.f = Math.max(p.f, s.year);
        const last = p.s.at(-1);
        if (last && last[0] === team && last[2] >= s.year - 1) last[2] = Math.max(last[2], s.year);
        else if (!last || last[2] < s.year) p.s.push([team, s.year, s.year]);
      }
    }
  }
  return { players, seasons: [...data.seasons, ...fwd.seasons] };
}

/** The 2027 live rosters as engine players (talent and age as of 2027). */
export function liveRosters2027(data: HistoryData, fwd: ForwardData): Player[] {
  const merged = mergeForward(data, fwd);
  const index = new Map(merged.players.map((p, i) => [p.i, i]));
  const o27 = fwd.offseasons.find((o) => o.year === LIVE_YEAR)!;
  const out: Player[] = [];
  for (const l of LEAGUE_IDS) {
    const sport = sportOf(l);
    const prev = fwd.seasons.find((s) => s.league === l && s.year === SIMULATED_YEAR)!;
    const stub: HSeason = {
      id: `${l}-${LIVE_YEAR}`, league: l, year: LIVE_YEAR, games: 0, records: {}, seeds: [], champion: '', runnerUp: '', origin: 'simulated', adjusted: false,
      rosters: Object.fromEntries(Object.entries(o27.rosters[l]).map(([t, ids]) => [t, ids.map((id) => index.get(id)!)])),
      offsets: Object.fromEntries(Object.keys(o27.rosters[l]).sort().map((t) => [t, Math.round(CARRY * offsetOf(sport, prev.records[t]) * 100) / 100])),
    };
    for (const t of Object.keys(stub.rosters).sort()) out.push(...historyRoster(merged, stub, t));
  }
  return out;
}
