/**
 * The sports world and a full basketball season (Phase 2a): world creation from a seed, the
 * balanced schedule, every game, injuries, standings with tiebreakers, a top-4 playoff
 * (best-of-5 semifinals, best-of-7 final) and awards. Pure and deterministic: the same seed
 * and season always give the same results. Nothing here is saved yet (Phase 4).
 */
import { playBasketball, type GameResult } from './basketball';
import { SPORTS_CONFIG } from './config';
import { SEASON_FORMAT, teamsOf, type LeagueId } from './demo';
import { generateBasketballRoster, makeNameGen, type Player } from './players';
import { stream } from './rng';
import { seasonSchedule, type ScheduledGame } from './schedule';

const LEAGUE: LeagueId = 'ccl';

export interface World {
  seed: number;
  /** Hidden team quality used at generation (overall points vs league average). */
  quality: Record<string, number>;
  players: Player[];
}

/** A new world: basketball rosters for the eight CCL franchises. */
export function createWorld(seed: number): World {
  const names = makeNameGen(stream(seed, 'names'));
  const quality: Record<string, number> = {};
  const players: Player[] = [];
  for (const t of teamsOf(LEAGUE)) {
    quality[t.id] = Math.round(stream(seed, 'team-quality', t.id).normal() * SPORTS_CONFIG.basketball.teamSpread * 10) / 10;
    players.push(...generateBasketballRoster(t.id, quality[t.id], stream(seed, 'roster', t.id), names, `p_${t.id}`));
  }
  return { seed, quality, players };
}

export interface PlayedGame extends ScheduledGame {
  week: number;
  result: GameResult;
}

export interface StandingRow {
  team: string;
  w: number;
  l: number;
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

export interface BasketballSeason {
  league: LeagueId;
  season: number;
  regular: PlayedGame[];
  standings: StandingRow[];
  playoffs: Series[];
  champion: string;
  awards: { mvp: { playerId: string; ppg: number }; finalsMvp: { playerId: string; points: number } };
  injuries: InjuryEvent[];
  /** Player state at the end of the season (injuries carried). */
  players: Player[];
}

const HOME_PATTERN: Record<number, boolean[]> = {
  5: [true, true, false, false, true],
  7: [true, true, false, false, true, false, true],
};

export function standingsOf(games: readonly PlayedGame[], teamIds: readonly string[], tiebreak: (team: string) => number): StandingRow[] {
  const row = new Map<string, StandingRow & { last: string[] }>(
    teamIds.map((t) => [t, { team: t, w: 0, l: 0, pf: 0, pa: 0, home: [0, 0], away: [0, 0], streak: '', last: [] }]),
  );
  const h2h = new Map<string, number>();
  for (const g of games) {
    const { homeScore: hs, awayScore: as } = g.result;
    const homeWon = hs > as;
    const h = row.get(g.home)!;
    const a = row.get(g.away)!;
    h.pf += hs; h.pa += as; a.pf += as; a.pa += hs;
    if (homeWon) { h.w++; a.l++; h.home[0]++; a.away[1]++; } else { a.w++; h.l++; a.away[0]++; h.home[1]++; }
    h.last.push(homeWon ? 'W' : 'L');
    a.last.push(homeWon ? 'L' : 'W');
    const winner = homeWon ? g.home : g.away;
    const loser = homeWon ? g.away : g.home;
    h2h.set(`${winner}>${loser}`, (h2h.get(`${winner}>${loser}`) ?? 0) + 1);
  }
  const rows = [...row.values()];
  for (const r of rows) {
    const last = r.last.at(-1);
    let n = 0;
    for (let i = r.last.length - 1; i >= 0 && r.last[i] === last; i--) n++;
    r.streak = last ? `${last}${n}` : '';
  }
  // Win %, then head-to-head among the tied group, then point difference, then a seeded draw.
  const pct = (r: StandingRow) => (r.w + r.l ? r.w / (r.w + r.l) : 0);
  const byWins = new Map<number, typeof rows>();
  for (const r of rows) byWins.set(pct(r), [...(byWins.get(pct(r)) ?? []), r]);
  const ordered: typeof rows = [];
  for (const p of [...byWins.keys()].sort((a, b) => b - a)) {
    const group = byWins.get(p)!;
    const ids = group.map((r) => r.team);
    const h2hWins = (t: string) => ids.reduce((s, o) => s + (h2h.get(`${t}>${o}`) ?? 0), 0);
    group.sort((a, b) => h2hWins(b.team) - h2hWins(a.team) || b.pf - b.pa - (a.pf - a.pa) || tiebreak(b.team) - tiebreak(a.team));
    ordered.push(...group);
  }
  return ordered.map(({ last: _last, ...r }) => r);
}

/** Plays one full basketball season for a world. */
export function playBasketballSeason(world: World, season: number): BasketballSeason {
  const C = SPORTS_CONFIG.basketball;
  const cal = SPORTS_CONFIG.calendar.basketball!;
  const fmt = SEASON_FORMAT.basketball;
  const seed = world.seed;
  const ids = teamsOf(LEAGUE).map((t) => t.id);
  const players = world.players.map((p) => ({ ...p, attrs: { ...p.attrs }, injuryGames: 0 }));
  const roster = (team: string) => players.filter((p) => p.teamId === team);
  const injuries: InjuryEvent[] = [];

  const play = (g: ScheduledGame, week: number): PlayedGame => {
    // Who takes the floor is fixed before tip-off: the best available players.
    const rotation = new Set(
      [g.home, g.away].flatMap((team) =>
        roster(team).filter((p) => p.injuryGames === 0).sort((a, b) => b.overall - a.overall || a.id.localeCompare(b.id)).slice(0, C.rotation).map((p) => p.id),
      ),
    );
    const result = playBasketball(g.id, g.home, g.away, roster(g.home), roster(g.away), stream(seed, 'game', g.id));
    for (const team of [g.home, g.away]) {
      for (const p of roster(team)) {
        if (p.injuryGames > 0) {
          p.injuryGames--; // sat this one out
          continue;
        }
        if (!rotation.has(p.id)) continue;
        const r = stream(seed, 'injury', p.id, g.id);
        const chance = C.injuryChance * (p.tag === 'injury_prone' ? C.injuryProneMultiplier : p.tag === 'iron_man' ? 0.4 : 1);
        if (r.chance(chance)) {
          const games = r.int(C.injuryGames.min, C.injuryGames.max);
          p.injuryGames = games;
          injuries.push({ playerId: p.id, teamId: team, gameId: g.id, games });
        }
      }
    }
    return { ...g, week, result };
  };

  const schedule = seasonSchedule(ids, fmt.meetingsPerOpponent, stream(seed, 'schedule', LEAGUE, season), `${LEAGUE}:${season}`);
  const regular = schedule.map((g) => play(g, cal.startWeek + Math.floor(g.round / cal.roundsPerWeek)));
  const coin = (team: string) => stream(seed, 'tiebreak', LEAGUE, season, team).next();
  const standings = standingsOf(regular, ids, coin);

  // Playoffs: 1 v 4 and 2 v 3, then the final. The higher seed hosts games 1, 2, 5 (and 7).
  const lastWeek = regular.at(-1)!.week;
  const series = (round: Series['round'], high: string, low: string, bestOf: number, week: number): Series => {
    const games: PlayedGame[] = [];
    const wins: [number, number] = [0, 0];
    const need = Math.ceil(bestOf / 2);
    for (let i = 0; wins[0] < need && wins[1] < need; i++) {
      const highHome = HOME_PATTERN[bestOf][i];
      const [home, away] = highHome ? [high, low] : [low, high];
      const g = play({ id: `${LEAGUE}:${season}:po:${round}:${high}-${low}:g${i + 1}`, round: -1, home, away }, week);
      games.push(g);
      const homeWon = g.result.homeScore > g.result.awayScore;
      const highWon = homeWon === highHome;
      wins[highWon ? 0 : 1]++;
    }
    return { round, high, low, bestOf, games, winner: wins[0] === need ? high : low, wins };
  };
  const seeds = standings.slice(0, SPORTS_CONFIG.playoffs.teams).map((r) => r.team);
  const po = SPORTS_CONFIG.playoffs.basketball;
  const semi1 = series('semifinal', seeds[0], seeds[3], po.semi, lastWeek + 1);
  const semi2 = series('semifinal', seeds[1], seeds[2], po.semi, lastWeek + 1);
  const finalHigh = seeds.indexOf(semi1.winner) < seeds.indexOf(semi2.winner) ? semi1.winner : semi2.winner;
  const finalLow = finalHigh === semi1.winner ? semi2.winner : semi1.winner;
  const final = series('final', finalHigh, finalLow, po.final, lastWeek + 2);

  // Awards. MVP: points per game, nudged by team success; at least 60% of games played.
  const totals = new Map<string, { pts: number; gp: number }>();
  for (const g of regular) for (const b of g.result.box) {
    const t = totals.get(b.playerId) ?? { pts: 0, gp: 0 };
    t.pts += b.points;
    t.gp++;
    totals.set(b.playerId, t);
  }
  const wins = new Map(standings.map((r) => [r.team, r.w]));
  const teamOf = new Map(players.map((p) => [p.id, p.teamId]));
  const eligible = [...totals].filter(([, t]) => t.gp >= fmt.gamesPerTeam * 0.6);
  const mvpScore = ([id, t]: [string, { pts: number; gp: number }]) => t.pts / t.gp + 0.3 * (wins.get(teamOf.get(id)!) ?? 0);
  const [mvpId, mvpT] = eligible.sort((a, b) => mvpScore(b) - mvpScore(a) || a[0].localeCompare(b[0]))[0];
  const finalsPts = new Map<string, number>();
  for (const g of final.games) for (const b of g.result.box) if (teamOf.get(b.playerId) === final.winner) finalsPts.set(b.playerId, (finalsPts.get(b.playerId) ?? 0) + b.points);
  const [fmvpId, fmvpPts] = [...finalsPts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];

  return {
    league: LEAGUE,
    season,
    regular,
    standings,
    playoffs: [semi1, semi2, final],
    champion: final.winner,
    awards: { mvp: { playerId: mvpId, ppg: Math.round((mvpT.pts / mvpT.gp) * 10) / 10 }, finalsMvp: { playerId: fmvpId, points: fmvpPts } },
    injuries,
    players,
  };
}
