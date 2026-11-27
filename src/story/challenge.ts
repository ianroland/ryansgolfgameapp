/**
 * Encounter skill challenges: a two-press long-drive meter and a one-press
 * putting meter. Ryan's stats set how far he can hit it and how forgiving the
 * putt is; the player's timing does the rest. "Sim it" plays the same
 * challenge from his stats with a seeded roll (same result every time).
 */
import { effectiveStats } from '../career/stats';
import type { CareerState } from '../career/types';
import { hashString, rng } from '../golf/math';

export interface DriveInput {
  /** Power meter, 0-1. */
  power: number;
  /** Accuracy: how far from the sweet spot, -1 (hook) to 1 (slice). */
  accuracy: number;
}
export interface PuttInput {
  /** Pace meter, 0-1. 0.5 is perfect. */
  pace: number;
}

export interface DriveResult {
  yards: number;
  lie: 'fairway' | 'rough' | 'out of bounds';
  opponentYards: number;
  win: boolean;
}
export interface PuttResult {
  /** How far off the perfect pace (0 = perfect). */
  miss: number;
  window: number;
  win: boolean;
}

/** Ryan's best possible carry-and-roll with his own driver. */
export function maxDrive(c: CareerState): number {
  return Math.round(205 + effectiveStats(c).power * 0.9);
}

/** Biff's gold driver goes a fixed share of Ryan's best: beatable with a good swing. */
export function opponentDrive(c: CareerState): number {
  return Math.round(maxDrive(c) * 0.9);
}

export function judgeDrive(c: CareerState, input: DriveInput): DriveResult {
  const p = Math.max(0, Math.min(1, input.power));
  const off = Math.abs(input.accuracy);
  const lie: DriveResult['lie'] = off <= 0.22 ? 'fairway' : off <= 0.55 ? 'rough' : 'out of bounds';
  const raw = maxDrive(c) * (0.62 + 0.38 * p);
  const yards = lie === 'out of bounds' ? 0 : Math.round(lie === 'rough' ? raw * 0.9 : raw);
  const opponentYards = opponentDrive(c);
  return { yards, lie, opponentYards, win: yards > opponentYards };
}

/** Half-width of the "it drops" pace window: better putters get more room. */
export function puttWindow(c: CareerState): number {
  return 0.05 + effectiveStats(c).putting / 1100;
}

export function judgePutt(c: CareerState, input: PuttInput): PuttResult {
  const miss = Math.abs(input.pace - 0.5);
  const window = puttWindow(c);
  return { miss, window, win: miss <= window };
}

/** Plays the challenge from Ryan's stats (for "Sim it"). Deterministic per encounter and week. */
export function simChallenge(c: CareerState, kind: 'drive' | 'putt', encounterId: string): { input: DriveInput | PuttInput; win: boolean } {
  const s = effectiveStats(c);
  const r = rng(hashString(`challenge:${encounterId}:${c.season}:${c.week}`) ^ Number(c.flags.seed ?? 0));
  if (kind === 'drive') {
    const input = { power: Math.max(0, Math.min(1, 0.62 + s.accuracy / 400 + r.gauss() * 0.14)), accuracy: r.gauss() * 0.32 * (1.2 - s.accuracy / 100) };
    return { input, win: judgeDrive(c, input).win };
  }
  const input = { pace: 0.5 + r.gauss() * (0.15 - s.putting / 900) };
  return { input, win: judgePutt(c, input).win };
}
