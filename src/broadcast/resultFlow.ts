/**
 * How the `result` phase is left (Broadcast Phase 1, resolution 1). Pure.
 *
 * With no replay due this is exactly Classic's rule: leave when the hold time
 * is up, or on a Swing tap after 0.4 s. The replay is a sub-state INSIDE
 * `result`; every exit goes through one guarded `leave`, so `afterResult`
 * runs once per shot.
 */

export interface ResultInput {
  phaseT: number;
  /** Hold time: 1.5 s, or 2.2 s when holed. */
  wait: number;
  tappedSwing: boolean;
  replaying: boolean;
  replayDone: boolean;
  /** A replay is wanted for this shot (developer flag on, approach shot). */
  replayDue: boolean;
}

export type ResultAction = 'none' | 'leave' | 'startReplay' | 'skipReplay' | 'endReplay';

export const TAP_LOCKOUT_SEC = 0.4;

export function resultStep(s: ResultInput): ResultAction {
  if (s.replaying) {
    if (s.tappedSwing) return 'skipReplay';
    if (s.replayDone) return 'endReplay';
    return 'none';
  }
  // A tap during the live hold continues (and cancels any pending replay).
  if (s.phaseT > TAP_LOCKOUT_SEC && s.tappedSwing) return 'leave';
  if (s.phaseT >= s.wait) return s.replayDue ? 'startReplay' : 'leave';
  return 'none';
}

/** Lets `afterResult` run at most once per shot. */
export class ResultGate {
  private shot = 0;
  private leftShot = -1;

  /** Call when a new shot is struck. */
  newShot() {
    this.shot += 1;
  }

  /** Runs `fn` only the first time it's called for the current shot. Returns whether it ran. */
  leave(fn: () => void): boolean {
    if (this.leftShot === this.shot) return false;
    this.leftShot = this.shot;
    fn();
    return true;
  }
}
