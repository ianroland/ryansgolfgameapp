/**
 * CI-1 scoring in integer quarter-points (Revision 3, item 6):
 *   S4 = B · e · r + 4 · (A_late + A_prox − P_repeat + A_kayla + A_contender)
 * with e, r ∈ {2, 3} standing for ×1 and ×1.5. S = S4 / 4 is for reports only;
 * every comparison uses S4. No floating point, no division.
 */
import { E_REGULAR, E_SPECIAL, KAYLA_TOP, LATE_BONUS, LATE_HOLES, PROFILES, PROX_BONUS, PROX_WINDOW, R_FINAL, R_OTHER, REPEAT_PENALTY } from './constants';
import type { Moment, ProfileId } from './types';

export interface ScoreCtx {
  profile: ProfileId;
  special: boolean;
  isFinal: boolean;
  /** Holes per round. */
  holesPerRound: number;
  ryanAlive: boolean;
  /** Ryan's total to par at the boundary. */
  ryanTotalToPar: number;
  /** Lowest total to par on the board at the boundary, Ryan included. */
  lead: number;
  /** Kayla Brooks, the snapshot's rival. */
  rivalId: string;
  /** The golfer is already in this round's plan. */
  repeat: boolean;
}

export interface ScoreTerms {
  base: number;
  e: number;
  r: number;
  late: number;
  prox: number;
  repeat: number;
  kayla: number;
  contender: number;
  s4: number;
}

export type ScoredMoment = Pick<Moment, 'type' | 'hole' | 'totalToPar' | 'golferId' | 'position' | 'strokes' | 'par'>;

/** K2 "independently significant": decided by stroke count and type only. */
export function isSignificant(m: Pick<Moment, 'type' | 'strokes' | 'par'>): boolean {
  if (m.type === 'ACE' || m.type === 'ALBATROSS' || m.type === 'EAGLE' || m.type === 'LEADER_STUMBLE') return true;
  return m.type === 'RIVAL_SWING' && m.strokes !== undefined && m.par !== undefined && Math.abs(m.strokes - m.par) >= 2;
}

/** Revision 3, item 8 (K2, approved as D1): when Kayla's moment earns the Kayla bonus. */
export function kaylaEligible(m: ScoredMoment, ctx: Pick<ScoreCtx, 'ryanAlive' | 'ryanTotalToPar'>): boolean {
  return m.position <= KAYLA_TOP || isProximate(m.totalToPar, ctx) || isSignificant(m);
}

export function scoreTerms(m: ScoredMoment, ctx: ScoreCtx): ScoreTerms {
  const profile = PROFILES[ctx.profile];
  const base = profile.base[m.type];
  const e = ctx.special ? E_SPECIAL : E_REGULAR;
  const r = ctx.isFinal ? R_FINAL : R_OTHER;
  const late = ctx.isFinal && m.hole > ctx.holesPerRound - LATE_HOLES ? LATE_BONUS : 0;
  const prox = isProximate(m.totalToPar, ctx) ? PROX_BONUS : 0;
  const repeat = ctx.repeat ? REPEAT_PENALTY : 0;
  const kayla = profile.kaylaBonus && m.golferId === ctx.rivalId && kaylaEligible(m, ctx) ? profile.kaylaBonus : 0;
  const contender = profile.contender.bonus && m.totalToPar - ctx.lead <= profile.contender.window ? profile.contender.bonus : 0;
  return { base, e, r, late, prox, repeat, kayla, contender, s4: base * e * r + 4 * (late + prox - repeat + kayla + contender) };
}

export function isProximate(totalToPar: number, ctx: Pick<ScoreCtx, 'ryanAlive' | 'ryanTotalToPar'>): boolean {
  return ctx.ryanAlive && Math.abs(totalToPar - ctx.ryanTotalToPar) <= PROX_WINDOW;
}

export function score4(m: ScoredMoment, ctx: ScoreCtx): number {
  return scoreTerms(m, ctx).s4;
}
