/**
 * CI-1 constants, as approved in Revision 2, the CI-1 authorization
 * (Decisions A–D) and "CI-1 Revision 3 — Broadcast Intelligence Tuning
 * Specification" (2026-11-22; author decisions D1 = K2, D2 = external parity
 * script). Changing any value here is a rules change and needs author approval.
 */
import type { BroadcastContext, Evidence, MomentType, ProfileId } from './types';

/** The CI-1 base scores. Profiles start from this table (Revision 3, item 6). */
export const BASE: Record<MomentType, number> = {
  ACE: 15,
  ALBATROSS: 15,
  LEAD_CHANGE: 10,
  EAGLE: 7,
  LEADER_STUMBLE: 6,
  RIVAL_SWING: 5,
  HOT_RUN: 5,
};

/** Highest priority first. Used for merging and tie-breaks. */
export const TYPE_PRIORITY: MomentType[] = ['ACE', 'ALBATROSS', 'LEAD_CHANGE', 'EAGLE', 'LEADER_STUMBLE', 'RIVAL_SWING', 'HOT_RUN'];

export const EXCEPTIONAL: ReadonlySet<MomentType> = new Set<MomentType>(['ACE', 'ALBATROSS']);

export const EVIDENCE: Record<MomentType, Evidence[]> = {
  ACE: ['tee_shot_holed'],
  ALBATROSS: ['score_only'],
  LEAD_CHANGE: ['standings'],
  EAGLE: ['score_only'],
  LEADER_STUMBLE: ['score_only', 'standings'],
  RIVAL_SWING: ['score_only'],
  HOT_RUN: ['score_only'],
};

/** Multipliers in halves: 2 = ×1, 3 = ×1.5. */
export const E_SPECIAL = 3;
export const E_REGULAR = 2;
export const R_FINAL = 3;
export const R_OTHER = 2;

export const LATE_HOLES = 3;
export const LATE_BONUS = 3;
export const PROX_WINDOW = 2;
export const PROX_BONUS = 2;
export const REPEAT_PENALTY = 4;
export const GATE_TOP = 10;
export const RIVAL_WINDOW = 3;
export const HOT_RUN_LENGTH = 3;

/** Revision 3, item 8 (K2): Kayla's bonus needs a top-10 position, Ryan within PROX_WINDOW, or a significant score. */
export const KAYLA_TOP = 10;

/** Round length the per-context caps are written for (every course has 9 holes). */
export const CAP_HOLES = 9;

export interface Profile {
  id: ProfileId;
  /** Threshold in whole points per context; compared as S4 ≥ 4 × threshold. */
  threshold: Record<BroadcastContext, number>;
  /** Cap per 9-hole round per context; for H holes, floor(cap × H / 9). */
  cap: Record<BroadcastContext, number>;
  /** Minimum revealed holes between a selection and a later non-exceptional one. */
  cooldown: number;
  /** Base score per type. Exceptional types stay 15. */
  base: Record<MomentType, number>;
  /** Bonus for a subject within `window` strokes of the lead, in every round. */
  contender: { bonus: number; window: number };
  /** Bonus for Kayla when K2-eligible (item 8). */
  kaylaBonus: number;
  /** Ryan-far filter: active in non-final rounds when Ryan is this far behind the lead. Null = never. */
  ryanFarGap: number | null;
  /** After the first selection, non-exceptional selections only on the last LATE_HOLES boundaries. */
  lateReserve: boolean;
  /** In special events, positions up to this pass the gate while the Ryan-far filter is active (M3). */
  majorTopExempt: number;
}

const ctx4 = (regEarly: number, regFinal: number, spcEarly: number, spcFinal: number): Record<BroadcastContext, number> => ({ regEarly, regFinal, spcEarly, spcFinal });

export const PROFILES: Record<ProfileId, Profile> = {
  off: {
    id: 'off',
    threshold: ctx4(0, 0, 0, 0),
    cap: ctx4(0, 0, 0, 0),
    cooldown: 0,
    base: BASE,
    contender: { bonus: 0, window: 0 },
    kaylaBonus: 0,
    ryanFarGap: null,
    lateReserve: false,
    majorTopExempt: 0,
  },
  /** Revision 3: B2 Balanced Television, K2 + M3. */
  balanced: {
    id: 'balanced',
    threshold: ctx4(14, 14, 14, 13),
    cap: ctx4(1, 2, 1, 2),
    cooldown: 3,
    base: { ...BASE, LEADER_STUMBLE: 8, HOT_RUN: 6 },
    contender: { bonus: 2, window: 2 },
    kaylaBonus: 2,
    ryanFarGap: 6,
    lateReserve: true,
    majorTopExempt: 3,
  },
  /** Revision 3: C3 Dramatic Broadcast, K2 + M3. */
  fullTv: {
    id: 'fullTv',
    threshold: ctx4(13, 12, 12, 11),
    cap: ctx4(1, 2, 2, 3),
    cooldown: 2,
    base: { ...BASE, EAGLE: 8, LEADER_STUMBLE: 9, HOT_RUN: 7 },
    contender: { bonus: 3, window: 3 },
    kaylaBonus: 2,
    ryanFarGap: 8,
    lateReserve: true,
    majorTopExempt: 3,
  },
};

/** Decision A: Balanced is the default. */
export const DEFAULT_PROFILE: ProfileId = 'balanced';

/** Decision B: the exceptional override stays off. */
export const EXCEPTIONAL_OVERRIDE = false;

export function contextOf(special: boolean, isFinal: boolean): BroadcastContext {
  return special ? (isFinal ? 'spcFinal' : 'spcEarly') : isFinal ? 'regFinal' : 'regEarly';
}

export function capFor(profile: ProfileId, context: BroadcastContext, holesPerRound: number): number {
  return Math.floor((PROFILES[profile].cap[context] * holesPerRound) / CAP_HOLES);
}

/** Device-only presentation log (not a save; see presentationLog.ts). */
export const LOG_KEY = 'ryans-road.cutins.presented';
export const LOG_LIMIT = 200;
