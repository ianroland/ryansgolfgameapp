/**
 * Phase B: deterministic historical games and playoffs (generated, proposed canon).
 *
 * For a league season it builds today's schedule, decides every game's winner so each team
 * finishes with exactly its approved record (a b-matching over the schedule), then simulates
 * each game with the live engine on the historical rosters until the simulation produces that
 * winner, so scores and box scores are real engine games. Playoffs follow the stored seeds
 * (1 v 4, 2 v 3) and the ledger's champion and runner-up, with the anchor events as hard
 * constraints. Nothing is stored: the same inputs always give the same games.
 */
import { SPORTS_CONFIG } from '../config';
import { leagueById, SEASON_FORMAT, type LeagueId, type Sport } from '../demo';
import type { Player } from '../players';
import { stream, type Rng } from '../rng';
import { seasonSchedule } from '../schedule';
import { HOME_PATTERN, SIMULATORS } from '../season';
import type { GameResult } from '../sim';
import type { HistoryData, HSeason } from './data';
import { HISTORY_SEED, historyRoster } from './rosters';

export interface HGame {
  id: string;
  league: LeagueId;
  year: number;
  /** Regular-season day (0-based) or game number in the series (playoffs). */
  day: number;
  playoff: boolean;
  round?: 'semifinal' | 'final';
  seriesId?: string;
  home: string;
  away: string;
  winner: string;
  loser: string;
  result: GameResult;
  /** Anchor events this game carries (e.g. fhl-1989-001). */
  events: string[];
  provenance: 'generated';
}
export interface HSeries {
  id: string;
  round: 'semifinal' | 'final';
  high: string;
  low: string;
  bestOf: number;
  winner: string;
  loser: string;
  wins: Record<string, number>;
  games: HGame[];
}
export interface HistorySeason {
  season: HSeason;
  regular: HGame[];
  playoffs: HSeries[];
  /** Simulation attempts used (for diagnostics). */
  attempts: number;
}

/** Anchor constraints from the bible (owner-approved). */
interface SeriesAnchor {
  /** Winner of each game from the series winner's point of view (true = series winner won). */
  pattern?: boolean[];
  /** Exact series length. */
  length?: number;
  /** Game indexes (0-based) that go to overtime / exactly n overtime periods. */
  overtime?: number[];
  /** Exact final score [winner, loser] for a single game. */
  score?: [number, number];
  /** One game won by the series winner in exactly `periods` overtime periods. */
  marathon?: { periods: number; event: string };
  events: string[];
}
export const SERIES_ANCHORS: Record<string, SeriesAnchor> = {
  // Boston led 3-1, Phoenix won the last three.
  'gdc-1998:final': { pattern: [false, true, false, false, true, true, true], events: ['gdc-1998-001'] },
  // Seven games, four overtimes, Bozeman won Game 7.
  'fhl-2002:final': { pattern: [true, false, false, true, true, false, true], overtime: [1, 3, 4, 6], events: ['fhl-2002-001'] },
  // Burlington in six.
  'fhl-2019:final': { length: 6, events: ['fhl-2019-001'] },
  // Oklahoma City 24, New Orleans 20.
  'igl-1994:final': { score: [24, 20], events: ['igl-1994-001'] },
  // Anchorage beat Buffalo in a triple-overtime playoff game (Soren's 71 saves: Phase C).
  'fhl-1989:semifinal:fhl_polars': { marathon: { periods: 3, event: 'fhl-1989-001' }, events: ['fhl-1989-001'] },
  'ccl-1987:final': { events: ['ccl-1987-001'] },
  'ccl-1988:final': { events: ['ccl-1987-001'] },
  'ccl-1989:final': { events: ['ccl-1987-001'] },
  'ccl-1996:final': { events: ['ccl-1996-001'] },
  'igl-1985:final': { events: ['igl-1985-001'] },
  'igl-2016:final': { events: ['igl-2016-001'] },
};

const MAX_ATTEMPTS = 400;
const MAX_ANCHOR_ATTEMPTS = 60_000;

/**
 * Picks each game's winner so every team ends on exactly its target wins. Starts from a seeded,
 * strength-weighted guess and repairs it with augmenting paths (b-matching); always succeeds
 * when the targets are realisable on the schedule, which the reconciliation guaranteed.
 */
export function assignWinners(games: { home: string; away: string }[], target: Record<string, number>, r: Rng): string[] {
  const cap = { ...target };
  const winner: (string | null)[] = games.map(() => null);
  const byTeam = new Map<string, number[]>();
  games.forEach((g, i) => {
    for (const t of [g.home, g.away]) byTeam.set(t, [...(byTeam.get(t) ?? []), i]);
  });
  const total = Object.values(target).reduce((a, b) => a + b, 0);
  const share = (t: string) => target[t] / Math.max(1, total);
  // Greedy first pass in a seeded order.
  const order = games.map((_, i) => i).sort(() => r.next() - 0.5);
  for (const i of order) {
    const { home, away } = games[i];
    const pHome = share(home) / (share(home) + share(away) || 1);
    const first = r.chance(pHome) ? home : away;
    const second = first === home ? away : home;
    if (cap[first] > 0) { winner[i] = first; cap[first]--; }
    else if (cap[second] > 0) { winner[i] = second; cap[second]--; }
  }
  // Repair with augmenting paths: an unassigned game takes a team; if that team is full, one of
  // its wins passes to that game's other team, and so on until a team with room is reached.
  for (let i = 0; i < games.length; i++) {
    if (winner[i] !== null) continue;
    const prevTeam = new Map<string, number>(); // team reached → game we came from
    const prevGame = new Map<number, string>(); // game reached → team we came from
    const queue: number[] = [i];
    const seenGames = new Set([i]);
    let end: string | null = null;
    while (queue.length && !end) {
      const g = queue.shift()!;
      for (const t of [games[g].home, games[g].away]) {
        if (prevTeam.has(t) || t === prevGame.get(g)) continue;
        prevTeam.set(t, g);
        if (cap[t] > 0) { end = t; break; }
        for (const j of byTeam.get(t)!) {
          if (winner[j] === t && !seenGames.has(j)) {
            seenGames.add(j);
            prevGame.set(j, t);
            queue.push(j);
          }
        }
      }
    }
    if (!end) throw new Error('Records are not realisable on this schedule');
    cap[end]--;
    // Walk back: each game on the path is now won by the team after it.
    let t: string | undefined = end;
    while (t !== undefined) {
      const g: number = prevTeam.get(t)!;
      const from = prevGame.get(g);
      winner[g] = t;
      t = from;
    }
  }
  return winner as string[];
}

function simulateAs(sport: Sport, id: string, home: string, away: string, hr: Player[], ar: Player[], ctx: { neutral: boolean; playoff: boolean; homeGameNo: number; awayGameNo: number },
  ok: (r: GameResult) => boolean, limit: number): { result: GameResult; tries: number } {
  for (let k = 0; k < limit; k++) {
    const res = SIMULATORS[sport](id, home, away, hr, ar, stream(HISTORY_SEED, 'game', id, k), ctx);
    if (ok(res)) return { result: res, tries: k + 1 };
  }
  throw new Error(`No simulation of ${id} met its constraints in ${limit} tries`);
}

const LOSER_WINS: Record<number, number[]> = { 1: [1], 5: [0.3, 0.4, 0.3], 7: [0.15, 0.3, 0.3, 0.25] };

/** Generates one historical league season. Deterministic. */
export function historySeason(data: HistoryData, season: HSeason): HistorySeason {
  const lg = season.league;
  const sport = leagueById(lg).sport;
  const teams = Object.keys(season.records);
  const rosters = new Map(teams.map((t) => [t, historyRoster(data, season, t)]));
  const cal = SPORTS_CONFIG.calendar[sport];
  const fmt = SEASON_FORMAT[sport];
  const schedule = seasonSchedule([...teams].sort(), fmt.meetingsPerOpponent, stream(HISTORY_SEED, 'schedule', season.id), `${lg}:h${season.year}`, cal.seriesLength);
  const winners = assignWinners(schedule, Object.fromEntries(teams.map((t) => [t, season.records[t][0]])), stream(HISTORY_SEED, 'winners', season.id));
  const played = new Map(teams.map((t) => [t, 0]));
  let attempts = 0;
  const regular: HGame[] = schedule.map((g, i) => {
    const w = winners[i];
    const ctx = { neutral: false, playoff: false, homeGameNo: played.get(g.home)!, awayGameNo: played.get(g.away)! };
    const { result, tries } = simulateAs(sport, g.id, g.home, g.away, rosters.get(g.home)!, rosters.get(g.away)!, ctx,
      (r) => r.homeScore !== r.awayScore && (r.homeScore > r.awayScore) === (w === g.home), MAX_ATTEMPTS);
    attempts += tries;
    played.set(g.home, played.get(g.home)! + 1);
    played.set(g.away, played.get(g.away)! + 1);
    return { id: g.id, league: lg, year: season.year, day: g.round, playoff: false, home: g.home, away: g.away, winner: w, loser: w === g.home ? g.away : g.home, result, events: [], provenance: 'generated' };
  });

  // Playoffs: 1 v 4 and 2 v 3, then the final. The ledger decides who advances.
  const seedOf = (t: string) => season.seeds.indexOf(t) + 1;
  const po = SPORTS_CONFIG.playoffs[sport];
  const finalists = new Set([season.champion, season.runnerUp]);
  const series = (round: 'semifinal' | 'final', a: string, b: string, winner: string): HSeries => {
    const [high, low] = seedOf(a) < seedOf(b) ? [a, b] : [b, a];
    const loser = winner === a ? b : a;
    const bestOf = round === 'final' ? po.final : po.semi;
    const need = Math.ceil(bestOf / 2);
    const key = round === 'final' ? `${season.id}:final` : `${season.id}:semifinal:${winner}`;
    const anchor = SERIES_ANCHORS[key];
    const r = stream(HISTORY_SEED, 'series', season.id, round, high, low);
    let pattern: boolean[];
    if (anchor?.pattern) pattern = anchor.pattern;
    else {
      const k = anchor?.length ? anchor.length - need : r.weighted(LOSER_WINS[bestOf]);
      // k loser wins among the first need + k - 1 games; the series winner takes the last game.
      const early = Array.from({ length: need - 1 + k }, (_, i) => i < k);
      for (let i = early.length - 1; i > 0; i--) {
        const j = r.int(0, i);
        [early[i], early[j]] = [early[j], early[i]];
      }
      pattern = [...early.map((x) => !x), true];
    }
    const id = `${lg}:h${season.year}:po:${round}:${high}-${low}`;
    const neutral = sport === 'football' && round === 'final';
    const marathonAt = anchor?.marathon ? pattern.findIndex((x) => x) : -1;
    const games: HGame[] = pattern.map((winnerWon, i) => {
      const highHome = HOME_PATTERN[sport][bestOf][i];
      const [home, away] = highHome ? [high, low] : [low, high];
      const w = winnerWon ? winner : loser;
      const gid = `${id}:g${i + 1}`;
      const ctx = { neutral, playoff: true, homeGameNo: played.get(home)!, awayGameNo: played.get(away)! };
      const special = anchor && (anchor.overtime || anchor.score || (anchor.marathon && i === marathonAt));
      const ok = (res: GameResult) => {
        if (res.homeScore === res.awayScore || (res.homeScore > res.awayScore) !== (w === home)) return false;
        if (anchor?.overtime && (anchor.overtime.includes(i) ? !res.ot : res.ot)) return false;
        if (anchor?.score) {
          const ws = w === home ? res.homeScore : res.awayScore;
          const ls = w === home ? res.awayScore : res.homeScore;
          if (ws !== anchor.score[0] || ls !== anchor.score[1]) return false;
        }
        if (anchor?.marathon && i === marathonAt && res.ot !== anchor.marathon.periods) return false;
        return true;
      };
      const { result, tries } = simulateAs(sport, gid, home, away, rosters.get(home)!, rosters.get(away)!, ctx, ok, special ? MAX_ANCHOR_ATTEMPTS : MAX_ATTEMPTS);
      attempts += tries;
      played.set(home, played.get(home)! + 1);
      played.set(away, played.get(away)! + 1);
      const events = anchor ? (anchor.marathon ? (i === marathonAt ? [anchor.marathon.event] : []) : anchor.events) : [];
      return { id: gid, league: lg, year: season.year, day: i, playoff: true, round, seriesId: id, home, away, winner: w, loser: w === home ? away : home, result, events, provenance: 'generated' };
    });
    const wins = { [winner]: pattern.filter(Boolean).length, [loser]: pattern.filter((x) => !x).length };
    return { id, round, high, low, bestOf, winner, loser, wins, games };
  };
  const [s1, s4, s2, s3] = [season.seeds[0], season.seeds[3], season.seeds[1], season.seeds[2]];
  const semiWinner = (a: string, b: string) => (finalists.has(a) ? a : b);
  const semi1 = series('semifinal', s1, s4, semiWinner(s1, s4));
  const semi2 = series('semifinal', s2, s3, semiWinner(s2, s3));
  const final = series('final', season.champion, season.runnerUp, season.champion);
  return { season, regular, playoffs: [semi1, semi2, final], attempts };
}
