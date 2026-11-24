/**
 * The reconciled history dataset (sports-lore v0.4, reconciled by scripts/history/reconcile_v04.py
 * with the owner's decisions of 2026-11-23). Proposed canon: team records, champions and rosters
 * are draft; games and stats are generated from them (Phase B/C).
 */
import type { LeagueId } from '../demo';

/** Compact player profile. */
export interface HPlayer {
  /** Stable id (v0.4). */
  i: string;
  /** Name (duplicates renamed, anchors untouched). */
  n: string;
  l: LeagueId;
  /** v0.4 position (baseball OF/P; basketball G/F/C; hockey LW/RW). */
  p: string;
  /** Debut and final year. */
  d: number;
  f: number;
  /** Birth year (generated, D8). */
  b: number;
  /** Historical anchor (named in the bible). */
  a?: 1;
  /** Career segments: [team, from, through]. */
  s: [string, number, number][];
}

export interface HSeason {
  id: string;
  league: LeagueId;
  year: number;
  /** Regular-season games per team. */
  games: number;
  /** Team → [wins, losses] (hockey losses include overtime losses), in seed order. */
  records: Record<string, [number, number]>;
  /** Playoff seeds 1-4 (ties broken by the stored order). */
  seeds: string[];
  champion: string;
  runnerUp: string;
  /** previous_anchor | new_proposal | inference_proposed | owner_decision | simulated (2026 on) */
  origin: string;
  /** True if the record was adjusted to fit the playoff format (changes.json). */
  adjusted: boolean;
  /** Team → indexes into the players list. */
  rosters: Record<string, number[]>;
  /**
   * Simulated seasons only: team strength (overall points) used to build the rosters, fixed
   * before the season is played. Ledger seasons derive it from the approved record instead.
   */
  offsets?: Record<string, number>;
}

export interface HistoryData {
  players: HPlayer[];
  seasons: HSeason[];
}

let cache: Promise<HistoryData> | null = null;
/** Loads the dataset on demand (about 0.8 MB, kept out of the game's first load). */
export function loadHistoryData(): Promise<HistoryData> {
  cache ??= Promise.all([import('./data/players.json'), import('./data/seasons.json')]).then(([p, s]) => ({
    players: (p.default as unknown as { players: HPlayer[] }).players,
    seasons: (s.default as unknown as { seasons: HSeason[] }).seasons,
  }));
  return cache;
}

export const seasonById = (d: HistoryData, league: LeagueId, year: number) => d.seasons.find((s) => s.league === league && s.year === year) ?? null;

/** Awards, leaders, record books, drafts, transactions and Hall of Fame (Phase D, generated). */
export type HistoryHonors = typeof import('./data/honors.json');
let honorsCache: Promise<HistoryHonors> | null = null;
export function loadHistoryHonors(): Promise<HistoryHonors> {
  honorsCache ??= import('./data/honors.json').then((m) => m.default as unknown as HistoryHonors);
  return honorsCache;
}
