/**
 * The per-save chain of seasons (Phase D part 3). Season E-1 (the last season on the fixed 2027
 * rosters) is the base; every later season's state is the off-season of the one before:
 *
 *   state(S) = runOffseason(state(S-1), results of season S-1, save seed)      for S >= E
 *
 * Pure and deterministic, so any season can be rebuilt from the save's seed. Saves keep what
 * actually happened in the sportsYears table (SportsUniverseService) and register it here on
 * load, so decades are never rebuilt and a stored past is never replaced.
 */
import seedJson from '../data/universe2027.json';
import type { LeagueId } from '../demo';
import type { LeagueSeason, World } from '../season';
import type { UniverseSeed, UState } from './model';
import { runOffseason, type YearLines, type YearSummary } from './offseason';

export const UNIVERSE = seedJson as unknown as UniverseSeed;
/** Career season S is sports year 2026 + S. */
export const yearOfSeason = (season: number) => 2026 + season;

export interface EvolveRef { seed: number; historyFrom: number; evolveFrom: number }
export const chainKey = (r: EvolveRef) => `${r.seed}:${r.historyFrom}:${r.evolveFrom}`;
export type SeasonResults = (season: number) => { leagues: Record<LeagueId, LeagueSeason>; world: World };
export interface OffseasonOutput { next: UState; summary: YearSummary; lines: YearLines }

const KEEP = 4;
const states = new Map<string, Map<number, UState>>();
const outputs = new Map<string, Map<number, OffseasonOutput>>();
const bounded = <T>(m: Map<number, T>, k: number, v: T) => {
  m.set(k, v);
  while (m.size > KEEP) m.delete(Math.min(...m.keys()));
};
const of = <T>(store: Map<string, Map<number, T>>, key: string) => store.get(key) ?? (store.set(key, new Map()), store.get(key)!);

/** Registers a stored state (the rosters for `season`), e.g. from the save on load. */
export function registerState(ref: EvolveRef, season: number, st: UState) {
  bounded(of(states, chainKey(ref)), season, st);
}
export function forgetChain(ref: EvolveRef) {
  states.delete(chainKey(ref));
  outputs.delete(chainKey(ref));
}

/** The state (players and rosters) for a season. Seasons before E use the shared 2027 start. */
export function stateFor(ref: EvolveRef, season: number, results: SeasonResults): UState {
  if (season < ref.evolveFrom) return UNIVERSE.start;
  const hit = states.get(chainKey(ref))?.get(season);
  if (hit) return hit;
  return processSeason(ref, season - 1, results).next;
}

/** Runs (or recalls) the off-season after `season`. Needs the season complete. */
export function processSeason(ref: EvolveRef, season: number, results: SeasonResults): OffseasonOutput {
  const key = chainKey(ref);
  const hit = outputs.get(key)?.get(season);
  if (hit) return hit;
  const prev = stateFor(ref, season, results);
  const r = results(season);
  const out = runOffseason(prev, { year: yearOfSeason(season), leagues: r.leagues, world: r.world }, ref.seed, UNIVERSE);
  bounded(of(outputs, key), season, out);
  registerState(ref, season + 1, out.next);
  return out;
}
