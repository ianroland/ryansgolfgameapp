/**
 * The sports world and full seasons for all four leagues: world creation from a seed, balanced
 * schedules on Ryan's calendar, every game, injuries, standings with tiebreakers, a top-4
 * playoff (series for baseball, basketball and hockey; single games for football, the final at a
 * neutral site) and awards. Pure and deterministic: the same seed and season always give the
 * same results. Nothing here is saved yet (Phase 4).
 */
import { playBaseball } from './baseball';
import { playBasketball } from './basketball';
import { SPORTS_CONFIG } from './config';
import { LEAGUES, SEASON_FORMAT, teamsOf, type LeagueId, type Sport } from './demo';
import { playFootball } from './football';
import { playHockey } from './hockey';
import { generateRoster, makeNameGen, type Player } from './players';
import { stream } from './rng';
import { scriptedInjury } from './storylines';
import { seasonSchedule, type ScheduledGame } from './schedule';
import type { GameResult, Simulator } from './sim';

export const SIMULATORS: Record<Sport, Simulator> = {
  basketball: playBasketball,
  baseball: playBaseball,
  football: playFootball,
  hockey: playHockey,
};

export const sportOf = (league: LeagueId): Sport => LEAGUES.find((l) => l.id === league)!.sport;

export interface World {
  seed: number;
  /** Hidden team quality used at generation (overall points vs league average). */
  quality: Record<string, number>;
  players: Player[];
}

/** League generation order (basketball first, so its rosters match the Phase 2a world). */
const GEN_ORDER: LeagueId[] = ['ccl', 'gdc', 'igl', 'fhl'];

/** A new world: rosters for all 32 franchises. */
export function createWorld(seed: number): World {
  const names = makeNameGen(stream(seed, 'names'));
  const quality: Record<string, number> = {};
  const players: Player[] = [];
  for (const league of GEN_ORDER) {
    const sport = sportOf(league);
    const g = SPORTS_CONFIG.generation[sport];
    for (const t of teamsOf(league)) {
      quality[t.id] = Math.round(stream(seed, 'team-quality', t.id).normal() * g.teamSpread * 10) / 10;
      players.push(...generateRoster(sport, t.id, quality[t.id], stream(seed, 'roster', t.id), names, `p_${t.id}`, g.playerSpread));
    }
  }
  return { seed, quality, players };
}

export interface PlayedGame extends ScheduledGame {
  week: number;
  result: GameResult;
  /**
   * The state going in: who was out injured and each team's game count (pitching and goalie
   * rotations). Lets the sportsbook price a game on its real lineups without replaying the season.
   */
  pre: { out: string[]; homeGameNo: number; awayGameNo: number; neutral: boolean; playoff: boolean };
}

export interface StandingRow {
  team: string;
  w: number;
  l: number;
  /** Football ties. */
  t: number;
  /** Hockey overtime/shootout losses (not counted in `l`). */
  otl: number;
  /** Hockey points (2 per win, 1 per OT/SO loss); 0 elsewhere. */
  pts: number;
  pf: number;
  pa: number;
  home: [number, number];
  away: [number, number];
  /** e.g. W3 or L1. */
  streak: string;
}

export interface Series {
  round: 'semifinal' | 'final';
  high: string;
  low: string;
  bestOf: number;
  games: PlayedGame[];
  winner: string;
  wins: [number, number];
}

export interface InjuryEvent {
  playerId: string;
  teamId: string;
  gameId: string;
  games: number;
}

export interface Awards {
  /** Best contribution per game (nudged by team success), at least 60% of games played. */
  mvp: { playerId: string; perGame: number };
  /** Most contribution in the final for the champion. */
  finalsMvp: { playerId: string; total: number };
}

export interface LeagueSeason {
  league: LeagueId;
  sport: Sport;
  season: number;
  regular: PlayedGame[];
  standings: StandingRow[];
  playoffs: Series[];
  champion: string;
  awards: Awards;
  injuries: InjuryEvent[];
  /** Player state at the end of the season (injuries carried). */
  players: Player[];
}
/** Phase 2a name, kept for callers. */
export type BasketballSeason = LeagueSeason;

/** Home games for the higher seed, by series length. */
export const HOME_PATTERN: Record<Sport, Record<number, boolean[]>> = {
  basketball: { 5: [true, true, false, false, true], 7: [true, true, false, false, true, false, true] },
  hockey: { 5: [true, true, false, false, true], 7: [true, true, false, false, true, false, true] },
  baseball: { 5: [true, true, false, false, true], 7: [true, true, false, false, false, true, true] },
  football: { 1: [true] },
};

export function standingsOf(games: readonly Pick<PlayedGame, 'home' | 'away' | 'result'>[], teamIds: readonly string[], tiebreak: (team: string) => number, sport: Sport = 'basketball'): StandingRow[] {
  const row = new Map<string, StandingRow & { last: string[] }>(
    teamIds.map((t) => [t, { team: t, w: 0, l: 0, t: 0, otl: 0, pts: 0, pf: 0, pa: 0, home: [0, 0], away: [0, 0], streak: '', last: [] }]),
  );
  const h2h = new Map<string, number>();
  for (const g of games) {
    const { homeScore: hs, awayScore: as } = g.result;
    const h = row.get(g.home)!;
    const a = row.get(g.away)!;
    h.pf += hs; h.pa += as; a.pf += as; a.pa += hs;
    if (hs === as) {
      h.t++; a.t++;
      h.last.push('T'); a.last.push('T');
      continue;
    }
    const homeWon = hs > as;
    const [win, lose] = homeWon ? [h, a] : [a, h];
    win.w++;
    // Hockey: an overtime or shootout loss is its own column and earns a point.
    if (sport === 'hockey' && g.result.ot > 0) lose.otl++;
    else lose.l++;
    if (homeWon) { h.home[0]++; a.away[1]++; } else { a.away[0]++; h.home[1]++; }
    win.last.push('W');
    lose.last.push('L');
    h2h.set(`${win.team}>${lose.team}`, (h2h.get(`${win.team}>${lose.team}`) ?? 0) + 1);
  }
  const rows = [...row.values()];
  for (const r of rows) {
    if (sport === 'hockey') r.pts = r.w * 2 + r.otl;
    const last = r.last.at(-1);
    let n = 0;
    for (let i = r.last.length - 1; i >= 0 && r.last[i] === last; i--) n++;
    r.streak = last ? `${last}${n}` : '';
  }
  // Win % (hockey: points, then wins; football ties count half), then head-to-head among the
  // tied group, then point difference, then a seeded draw.
  const key = (r: StandingRow) => {
    const gp = r.w + r.l + r.t + r.otl;
    if (sport === 'hockey') return r.pts * 1000 + r.w;
    return gp ? (r.w + r.t / 2) / gp : 0;
  };
  const groups = new Map<number, typeof rows>();
  for (const r of rows) groups.set(key(r), [...(groups.get(key(r)) ?? []), r]);
  const ordered: typeof rows = [];
  for (const k of [...groups.keys()].sort((a, b) => b - a)) {
    const group = groups.get(k)!;
    const ids = group.map((r) => r.team);
    const h2hWins = (t: string) => ids.reduce((s, o) => s + (h2h.get(`${t}>${o}`) ?? 0), 0);
    group.sort((a, b) => h2hWins(b.team) - h2hWins(a.team) || b.pf - b.pa - (a.pf - a.pa) || tiebreak(b.team) - tiebreak(a.team));
    ordered.push(...group);
  }
  return ordered.map(({ last: _last, ...r }) => r);
}

/** Players exposed to injury in a game: basketball's eight-man rotation; everyone available elsewhere. */
function exposed(sport: Sport, roster: readonly Player[]): Player[] {
  const avail = roster.filter((p) => p.injuryGames === 0);
  if (sport !== 'basketball') return avail;
  return avail.sort((a, b) => b.overall - a.overall || a.id.localeCompare(b.id)).slice(0, SPORTS_CONFIG.basketball.rotation);
}

/** Plays one full season of a league. */
export function playLeagueSeason(world: World, league: LeagueId, season: number): LeagueSeason {
  const sport = sportOf(league);
  const cal = SPORTS_CONFIG.calendar[sport];
  const fmt = SEASON_FORMAT[sport];
  const inj = SPORTS_CONFIG.injuries;
  const injury = inj[sport];
  const sim = SIMULATORS[sport];
  const seed = world.seed;
  const ids = teamsOf(league).map((t) => t.id);
  const players = world.players.filter((p) => ids.includes(p.teamId)).map((p) => ({ ...p, attrs: { ...p.attrs }, injuryGames: 0 }));
  const rosters = new Map(ids.map((t) => [t, players.filter((p) => p.teamId === t)]));
  const gamesPlayed = new Map(ids.map((t) => [t, 0]));
  const injuries: InjuryEvent[] = [];

  const play = (g: ScheduledGame, week: number, playoff: boolean, neutral = false): PlayedGame => {
    const hr = rosters.get(g.home)!;
    const ar = rosters.get(g.away)!;
    // Exposure is fixed before the game starts.
    const atRisk = new Set([...exposed(sport, hr), ...exposed(sport, ar)].map((p) => p.id));
    const ctx = { neutral, playoff, homeGameNo: gamesPlayed.get(g.home)!, awayGameNo: gamesPlayed.get(g.away)! };
    const out = [...hr, ...ar].filter((p) => p.injuryGames > 0).map((p) => p.id);
    const result = sim(g.id, g.home, g.away, hr, ar, stream(seed, 'game', g.id), ctx);
    for (const team of [g.home, g.away]) {
      gamesPlayed.set(team, gamesPlayed.get(team)! + 1);
      for (const p of rosters.get(team)!) {
        if (p.injuryGames > 0) {
          p.injuryGames--; // sat this one out
          continue;
        }
        // Scripted storylines (src/sports/storylines.ts): hurt in this game, whatever the dice say.
        const story = scriptedInjury(p.id, season);
        if (story && gamesPlayed.get(team) === story.afterGame) {
          p.injuryGames = story.games;
          injuries.push({ playerId: p.id, teamId: team, gameId: g.id, games: story.games });
          continue;
        }
        if (!atRisk.has(p.id)) continue;
        const r = stream(seed, 'injury', p.id, g.id);
        const chance = injury.chance * (p.tag === 'injury_prone' ? inj.injuryProneMultiplier : p.tag === 'iron_man' ? inj.ironManMultiplier : 1);
        if (r.chance(chance)) {
          const games = r.int(injury.min, injury.max);
          p.injuryGames = games;
          injuries.push({ playerId: p.id, teamId: team, gameId: g.id, games });
        }
      }
    }
    return { ...g, week, result, pre: { out, ...ctx } };
  };

  const schedule = seasonSchedule(ids, fmt.meetingsPerOpponent, stream(seed, 'schedule', league, season), `${league}:${season}`, cal.seriesLength);
  const regular = schedule.map((g) => play(g, cal.startWeek + Math.floor(g.round / cal.daysPerWeek), false));
  const coin = (team: string) => stream(seed, 'tiebreak', league, season, team).next();
  const standings = standingsOf(regular, ids, coin, sport);

  // Playoffs: 1 v 4 and 2 v 3, then the final, one week per round.
  const lastWeek = regular.at(-1)!.week;
  const po = SPORTS_CONFIG.playoffs[sport];
  const series = (round: Series['round'], high: string, low: string, bestOf: number, week: number): Series => {
    const games: PlayedGame[] = [];
    const wins: [number, number] = [0, 0];
    const need = Math.ceil(bestOf / 2);
    const neutral = sport === 'football' && round === 'final';
    for (let i = 0; wins[0] < need && wins[1] < need; i++) {
      const highHome = HOME_PATTERN[sport][bestOf][i];
      const [home, away] = highHome ? [high, low] : [low, high];
      const g = play({ id: `${league}:${season}:po:${round}:${high}-${low}:g${i + 1}`, round: -1, home, away }, week, true, neutral);
      games.push(g);
      wins[(g.result.homeScore > g.result.awayScore) === highHome ? 0 : 1]++;
    }
    return { round, high, low, bestOf, games, winner: wins[0] === need ? high : low, wins };
  };
  const seeds = standings.slice(0, SPORTS_CONFIG.playoffs.teams).map((r) => r.team);
  const semi1 = series('semifinal', seeds[0], seeds[3], po.semi, lastWeek + 1);
  const semi2 = series('semifinal', seeds[1], seeds[2], po.semi, lastWeek + 1);
  const finalHigh = seeds.indexOf(semi1.winner) < seeds.indexOf(semi2.winner) ? semi1.winner : semi2.winner;
  const finalLow = finalHigh === semi1.winner ? semi2.winner : semi1.winner;
  const final = series('final', finalHigh, finalLow, po.final, lastWeek + 2);

  // Awards from each player's contribution (`v`): points in basketball; hits, power, runs and
  // RBI in baseball; touchdowns in football; goals and assists in hockey. Kickers excluded.
  const v = (b: { points: number; extra?: Record<string, number> }) => b.extra?.v ?? b.points;
  const totals = new Map<string, { v: number; gp: number }>();
  for (const g of regular) for (const b of g.result.box) {
    const t = totals.get(b.playerId) ?? { v: 0, gp: 0 };
    t.v += v(b);
    t.gp++;
    totals.set(b.playerId, t);
  }
  const wins = new Map(standings.map((r) => [r.team, r.w]));
  const teamOf = new Map(players.map((p) => [p.id, p.teamId]));
  const posOf = new Map(players.map((p) => [p.id, p.pos]));
  const winWeight = { basketball: 0.3, baseball: 0.03, football: 0.25, hockey: 0.02 }[sport];
  const eligible = [...totals].filter(([id, t]) => t.gp >= fmt.gamesPerTeam * 0.6 && posOf.get(id) !== 'K');
  const mvpScore = ([id, t]: [string, { v: number; gp: number }]) => t.v / t.gp + winWeight * (wins.get(teamOf.get(id)!) ?? 0);
  const [mvpId, mvpT] = eligible.sort((a, b) => mvpScore(b) - mvpScore(a) || a[0].localeCompare(b[0]))[0];
  const finalsV = new Map<string, number>();
  for (const g of final.games) for (const b of g.result.box) if (teamOf.get(b.playerId) === final.winner && posOf.get(b.playerId) !== 'K') finalsV.set(b.playerId, (finalsV.get(b.playerId) ?? 0) + v(b));
  const [fmvpId, fmvpV] = [...finalsV].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];

  return {
    league,
    sport,
    season,
    regular,
    standings,
    playoffs: [semi1, semi2, final],
    champion: final.winner,
    awards: { mvp: { playerId: mvpId, perGame: Math.round((mvpT.v / mvpT.gp) * 10) / 10 }, finalsMvp: { playerId: fmvpId, total: Math.round(fmvpV * 10) / 10 } },
    injuries,
    players,
  };
}

/** Phase 2a entry point. */
export const playBasketballSeason = (world: World, season: number) => playLeagueSeason(world, 'ccl', season);

/** Every league's season for a world. */
export function playAllSeasons(world: World, season: number): Record<LeagueId, LeagueSeason> {
  return Object.fromEntries(LEAGUES.map((l) => [l.id, playLeagueSeason(world, l.id, season)])) as Record<LeagueId, LeagueSeason>;
}
