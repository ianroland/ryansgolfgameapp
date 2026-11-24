/**
 * The real sportsbook board (pure). Games, results and standings come from the deterministic
 * engine for a world seed and career season; lines come from shadow simulations of each game on
 * its real pre-game lineups (separate RNG streams, so they never touch the real result).
 *
 * Calendar: career season S is sports year 2026 + S; a game in week W is open for betting while
 * the career is at or before week W, and final once the career has advanced past week W.
 * Nothing here reads NPC, drink, tip, golf or casino state (boundary-tested).
 */
import { DEMO_MARGIN, LEAGUES, leagueById, teamsOf, toAmerican, type DemoGame, type DemoLine, type LeagueId } from './demo';
import { SPORTS_CONFIG } from './config';
import { stream } from './rng';
import { historyWorld } from './liveRosters';
import { stateFor, type EvolveRef } from './universe/chain';
import { worldFromState } from './universe/model';
import { createWorld, playLeagueSeason, SIMULATORS, sportOf, standingsOf, type LeagueSeason, type PlayedGame, type StandingRow, type World } from './season';

export const SHADOW_RUNS = 60;
export const BOOK_MARGIN = DEMO_MARGIN;

/** A bettable game: the demo board's shape plus where it sits on the calendar. */
export interface BookGame extends DemoGame {
  season: number;
  week: number;
  /** 0-based day in the week (regular season) or game number in a series (playoffs). */
  day: number;
  playoff: boolean;
  neutral: boolean;
  /** Short label, e.g. "Week 4 · Tue" or "Final · Game 3". */
  when: string;
}

/**
 * Which world a save's sports run in. A plain seed is the original generated world (every
 * season, as before Phase D part 2). `{ seed, historyFrom }` (v2) uses the fixed 2027 carry-over
 * rosters from `historyFrom` on. `{ seed, historyFrom, evolveFrom }` (v3, Phase D part 3) also
 * runs a yearly off-season: from `evolveFrom` on, every season's rosters come from the one before
 * (aging, retirements, drafts; universe/chain.ts). Each season keeps its own rosters for good, so
 * a ticket is always graded on the version it was priced on.
 */
export type WorldRef = number | { seed: number; historyFrom: number; evolveFrom?: number };
export const seedOf = (ref: WorldRef) => (typeof ref === 'number' ? ref : ref.seed);
export function rostersFor(ref: WorldRef, season: number): 'generated' | 'history' | 'evolved' {
  if (typeof ref === 'number' || season < ref.historyFrom) return 'generated';
  return ref.evolveFrom !== undefined && season >= ref.evolveFrom ? 'evolved' : 'history';
}
const keyOf = (ref: WorldRef, season: number) => {
  const mode = rostersFor(ref, season);
  return mode === 'evolved' ? `${seedOf(ref)}:${season}:evolved:${(ref as EvolveRef).historyFrom}:${(ref as EvolveRef).evolveFrom}` : `${seedOf(ref)}:${season}:${mode}`;
};
/** The live players for a season of this world (engine players with that season's ratings). */
function worldFor(ref: WorldRef, season: number): World {
  const seed = seedOf(ref);
  const mode = rostersFor(ref, season);
  if (mode === 'generated') return createWorld(seed);
  if (mode === 'history') return historyWorld(seed);
  const r = ref as EvolveRef;
  return worldFromState(stateFor(r, season, (s) => seasonOf(r, s)), seed);
}
const versions = new Map<string, string>();
/** A short fingerprint of a season's rosters and ratings: tickets record it, settlement checks it. */
export function rosterVersion(ref: WorldRef, season: number): string {
  const k = keyOf(ref, season);
  let v = versions.get(k);
  if (!v) {
    let h = 2166136261;
    const text = seasonOf(ref, season).world.players.map((p) => `${p.id}|${p.teamId}|${p.pos}|${p.overall}`).sort().join(';');
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    v = (h >>> 0).toString(36);
    versions.set(k, v);
    if (versions.size > 50) versions.delete(versions.keys().next().value!);
  }
  return v;
}

// ── Season results (memoized; a season for all four leagues takes ~70 ms) ──
const seasonCache = new Map<string, { world: World; leagues: Record<LeagueId, LeagueSeason> }>();
export function seasonOf(ref: WorldRef, season: number) {
  const k = keyOf(ref, season);
  let v = seasonCache.get(k);
  if (!v) {
    const world = worldFor(ref, season);
    const leagues = Object.fromEntries(LEAGUES.map((l) => [l.id, playLeagueSeason(world, l.id, season)])) as Record<LeagueId, LeagueSeason>;
    v = { world, leagues };
    seasonCache.set(k, v);
    if (seasonCache.size > 3) seasonCache.delete(seasonCache.keys().next().value!);
  }
  return v;
}

export const gamesOf = (s: LeagueSeason): PlayedGame[] => [...s.regular, ...s.playoffs.flatMap((x) => x.games)];

const DAY_NAMES: Record<number, string[]> = { 1: ['Sat'], 2: ['Tue', 'Fri'], 3: ['Tue', 'Thu', 'Sat'] };
function placeOf(league: LeagueId, g: PlayedGame): { day: number; when: string } {
  const sport = sportOf(league);
  if (g.pre.playoff) {
    const n = Number(/:g(\d+)$/.exec(g.id)?.[1] ?? 1);
    const round = g.id.includes(':po:final:') ? 'Final' : 'Semifinal';
    return { day: n - 1, when: `${round} · Game ${n}` };
  }
  const per = SPORTS_CONFIG.calendar[sport].daysPerWeek;
  const day = g.round % per;
  return { day, when: `Week ${g.week} · ${DAY_NAMES[per]?.[day] ?? `Day ${day + 1}`}` };
}

/** Find one game (with its league) in a season. */
export function findGame(seed: WorldRef, season: number, gameId: string): { league: LeagueId; game: PlayedGame } | null {
  const league = gameId.split(':')[0] as LeagueId;
  const s = seasonOf(seed, season).leagues[league];
  const game = s ? gamesOf(s).find((g) => g.id === gameId) : undefined;
  return game ? { league, game } : null;
}

// ── Pricing ──
const priceCache = new Map<string, DemoLine[] & { pHome: number }>();
const median = (xs: number[]) => {
  const a = [...xs].sort((x, y) => x - y);
  return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
};
const half = (x: number) => Math.round(x * 2) / 2;
const priced = (p: number) => toAmerican(Math.min(0.97, Math.max(0.03, p) * (1 + BOOK_MARGIN / 2)));

/** Lines for one game, from SHADOW_RUNS simulations on the real pre-game lineups. */
export function priceGame(ref: WorldRef, season: number, league: LeagueId, g: PlayedGame): DemoLine[] & { pHome: number } {
  const k = `${keyOf(ref, season)}:${g.id}`;
  const seed = seedOf(ref);
  const hit = priceCache.get(k);
  if (hit) return hit;
  const sport = sportOf(league);
  const { world } = seasonOf(ref, season);
  const out = new Set(g.pre.out);
  const roster = (team: string) => world.players.filter((p) => p.teamId === team).map((p) => ({ ...p, injuryGames: out.has(p.id) ? 1 : 0 }));
  const hr = roster(g.home);
  const ar = roster(g.away);
  const ctx = { neutral: g.pre.neutral, playoff: g.pre.playoff, homeGameNo: g.pre.homeGameNo, awayGameNo: g.pre.awayGameNo };
  let hw = 0;
  let aw = 0;
  const margins: number[] = [];
  const totals: number[] = [];
  for (let i = 0; i < SHADOW_RUNS; i++) {
    const r = SIMULATORS[sport](g.id, g.home, g.away, hr, ar, stream(seed, 'shadow', g.id, i), ctx);
    if (r.homeScore > r.awayScore) hw++;
    else if (r.awayScore > r.homeScore) aw++;
    margins.push(r.homeScore - r.awayScore);
    totals.push(r.homeScore + r.awayScore);
  }
  // Win chance among decided games (a football tie pushes the moneyline), lightly smoothed.
  const pHome = (hw + 1) / (hw + aw + 2);
  const L = leagueById(league);
  const lines: DemoLine[] = [
    { market: 'moneyline', side: 'home', point: null, american: priced(pHome) },
    { market: 'moneyline', side: 'away', point: null, american: priced(1 - pHome) },
  ];
  if (L.fixedSpread) {
    // Run line / puck line: the favourite gives 1.5, priced from how often it wins by 2+.
    const homeFav = pHome >= 0.5;
    const favCover = margins.filter((m) => (homeFav ? m : -m) >= 2).length;
    const pc = (favCover + 1) / (SHADOW_RUNS + 2);
    const fs = L.fixedSpread;
    lines.push(
      { market: 'spread', side: 'home', point: homeFav ? -fs : fs, american: priced(homeFav ? pc : 1 - pc) },
      { market: 'spread', side: 'away', point: homeFav ? fs : -fs, american: priced(homeFav ? 1 - pc : pc) },
    );
  } else {
    const m = half(median(margins));
    const pt = m === 0 ? 0.5 : m; // never a pick'em spread of 0
    lines.push(
      { market: 'spread', side: 'home', point: -pt, american: -110 },
      { market: 'spread', side: 'away', point: pt, american: -110 },
    );
  }
  const t = Math.max(0.5, half(median(totals)));
  lines.push({ market: 'total', side: 'over', point: t, american: -110 }, { market: 'total', side: 'under', point: t, american: -110 });
  const res = Object.assign(lines, { pHome });
  priceCache.set(k, res);
  if (priceCache.size > 400) priceCache.delete(priceCache.keys().next().value!);
  return res;
}

const toBook = (seed: WorldRef, season: number, league: LeagueId, g: PlayedGame): BookGame => {
  const lines = priceGame(seed, season, league, g);
  const { day, when } = placeOf(league, g);
  return { id: g.id, league, home: g.home, away: g.away, when, homeWinProb: lines.pHome, lines: [...lines], season, week: g.week, day, playoff: g.pre.playoff, neutral: g.pre.neutral };
};

/**
 * The board for a league: this week's games, or (between seasons or on an off week) the next
 * week that has games. Only games that haven't been played yet are ever offered.
 */
export function boardFor(seed: WorldRef, season: number, week: number, league: LeagueId): { week: number | null; games: BookGame[] } {
  const all = gamesOf(seasonOf(seed, season).leagues[league]);
  const next = all.filter((g) => g.week >= week).map((g) => g.week);
  if (!next.length) return { week: null, games: [] };
  const w = Math.min(...next);
  return { week: w, games: all.filter((g) => g.week === w).sort((a, b) => placeOf(league, a).day - placeOf(league, b).day || a.id.localeCompare(b.id)).map((g) => toBook(seed, season, league, g)) };
}

/** A bettable game by id: null if unknown or already final for this calendar position. */
export function openGame(seed: WorldRef, season: number, week: number, gameId: string): BookGame | null {
  const f = findGame(seed, season, gameId);
  if (!f || f.game.week < week) return null;
  return toBook(seed, season, f.league, f.game);
}

/** Is a game final at this calendar position? (Played in an earlier week, or an earlier season.) */
export const isFinal = (gameSeason: number, gameWeek: number, season: number, week: number) => gameSeason < season || (gameSeason === season && gameWeek < week);

/** Finals from the most recent played weeks, newest first. */
export function recentFinals(seed: WorldRef, season: number, week: number, league: LeagueId, weeks = 2): (PlayedGame & { when: string })[] {
  const played = gamesOf(seasonOf(seed, season).leagues[league]).filter((g) => g.week < week);
  const lastWeeks = [...new Set(played.map((g) => g.week))].sort((a, b) => b - a).slice(0, weeks);
  return played.filter((g) => lastWeeks.includes(g.week)).sort((a, b) => b.week - a.week || placeOf(league, b).day - placeOf(league, a).day).map((g) => ({ ...g, when: placeOf(league, g).when }));
}

/** Regular-season standings from the games played so far this season. */
export function standingsToDate(ref: WorldRef, season: number, week: number, league: LeagueId): StandingRow[] {
  const s = seasonOf(ref, season).leagues[league];
  const played = s.regular.filter((g) => g.week < week);
  const coin = (team: string) => stream(seedOf(ref), 'tiebreak', league, season, team).next();
  return standingsOf(played, teamsOf(league).map((t) => t.id), coin, sportOf(league));
}
