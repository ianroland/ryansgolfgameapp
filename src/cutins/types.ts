/**
 * CI-1 · Competitor moments: shared types.
 *
 * Moments are structured facts read from already-revealed tournament scores.
 * They carry ids, enums and numbers only: no prose, no names, no footage.
 * See "Live Tournament Cut-Ins — CI-1 Specification (Revision 2)" and
 * "CI-1 Revision 3 — Broadcast Intelligence Tuning Specification".
 */
import type { TourId } from '../career/config';

export type MomentType =
  | 'ACE'
  | 'ALBATROSS'
  | 'LEAD_CHANGE'
  | 'EAGLE'
  | 'LEADER_STUMBLE'
  | 'RIVAL_SWING'
  | 'HOT_RUN';

/**
 * What the simulation actually proves about a moment.
 * - `tee_shot_holed`: a verified score of 1. Says nothing about trajectory.
 * - `score_only`: a stroke count against par. Says nothing about how the ball got in.
 * - `standings`: leaderboard facts (positions, totals, margins).
 */
export type Evidence = 'tee_shot_holed' | 'score_only' | 'standings';

export type ProfileId = 'off' | 'balanced' | 'fullTv';

/** Revision 3: thresholds and caps depend on the event (regular/special) and the round (early/final). */
export type BroadcastContext = 'regEarly' | 'regFinal' | 'spcEarly' | 'spcFinal';

export interface Moment {
  /** `<tournamentId>:r<round>:<type>:<golferId>:h<hole>`, round and hole 1-based. */
  momentId: string;
  type: MomentType;
  evidence: Evidence[];
  tour: TourId;
  tournamentId: string;
  /** 1-based round. */
  round: number;
  /** 1-based hole. For LEAD_CHANGE and LEADER_STUMBLE, the boundary hole q. */
  hole: number;
  golferId: string;
  /** Scoring moments only: the verified strokes on `hole`, and its par. */
  strokes?: number;
  par?: number;
  /** Tournament total to par at the boundary. */
  totalToPar: number;
  /** Leaderboard position at the boundary (ties share the best position). */
  position: number;
  tied: boolean;
  /** Other tags the same golfer earned in the same span (merged away). */
  alsoTags: MomentType[];
}

export type SuppressReason =
  | 'below_threshold'
  | 'gate'
  | 'suppressed_cap'
  | 'suppressed_cooldown'
  /** Revision 3: a later slot is kept for the last holes of the round. */
  | 'late_reserve'
  /** Passed every rule but another candidate won this boundary. */
  | 'lost_tiebreak';

export interface Candidate {
  moment: Moment;
  /** Integer score in quarter-points: S × 4. */
  s4: number;
  exceptional: boolean;
}

export interface Decision {
  /** Boundary: holes revealed so far this round (1–H). */
  q: number;
  /** Previous boundary this round (0 at round start). */
  p: number;
  candidates: Candidate[];
  /** momentId of the selected candidate, if any. */
  selected: string | null;
  suppressed: { momentId: string; reason: SuppressReason }[];
}

/**
 * Everything the detector may see: the current round revealed through hole
 * `q`, never beyond. Built by `revealSnapshot`, the only CI-1 function that
 * reads game state.
 */
export interface RevealSnapshot {
  tournamentId: string;
  tour: TourId;
  special: boolean;
  /** 0-based current round, and the event's round count. */
  round: number;
  rounds: number;
  isFinal: boolean;
  pars: number[];
  /** Holes revealed this round. */
  q: number;
  /** Boundaries reached this round, ascending, each ≤ q. */
  boundaries: number[];
  ryanId: string;
  rivalId: string;
  /** Golfers still in the field this round (Ryan included if he is). */
  alive: string[];
  /** Total to par from completed rounds, per alive golfer. */
  prior: Record<string, number>;
  /** This round's strokes per alive golfer, holes 1…q only. */
  holes: Record<string, number[]>;
}
