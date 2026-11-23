/**
 * CI-2 · The only player-facing words a competitor cut-in uses.
 *
 * The seven badge labels are the provisional factual UI labels approved for
 * the CI-2 prototype (author directive, 2026-11-22). Everything else on the
 * card is a verified number, a golfer's name, or existing UI vocabulary
 * (HOLE, PAR, SKIP). No dialogue, no commentary. Changing any string here
 * needs Script Room sign-off.
 */
import type { MomentType } from '../../cutins/types';

export const CUTIN_LABEL: Record<MomentType, string> = {
  LEAD_CHANGE: 'NEW LEADER',
  EAGLE: 'EAGLE',
  ACE: 'HOLE-IN-ONE',
  ALBATROSS: 'ALBATROSS',
  LEADER_STUMBLE: 'LEADER STUMBLES',
  RIVAL_SWING: 'RIVAL WATCH',
  HOT_RUN: 'ON A RUN',
};

/** UI chrome, reused from existing screens. */
export const CUTIN_UI = {
  hole: 'HOLE',
  par: 'PAR',
  skip: 'SKIP',
  round: 'R',
} as const;

/** Leaderboard-style position, as the live leaderboard writes it: "1", "T3". */
export const posLabel = (position: number, tied: boolean) => `${tied ? 'T' : ''}${position}`;
