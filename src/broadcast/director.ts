/**
 * Broadcast Phase 1 director — the proof-of-concept rule only:
 *   Ball Follow after impact, a cut to the green-side camera 0.8 s before an
 *   approach lands, then (developer mode) an instant replay of the recorded
 *   trajectory. It never touches the shot: it reads a ShotRecord and returns
 *   camera poses and replay frames.
 */
import { dist, type Vec2 } from '../golf/math';
import type { HoleDef } from '../golf/course';
import type { BroadcastConfig } from './config';
import { placeGreenCam, type CamPose } from './greenCam';
import { landingCutIndex, LEAD_IN_SEC, planReplay, replayFrameAt, type ReplayFrame, type ReplayPlan } from './replayPlayer';
import { sampleAt, type ShotRecord } from './shotRecord';

/** An approach lands within this distance of the pin (yards). */
export const APPROACH_RADIUS = 40;

export function isApproach(rec: ShotRecord): boolean {
  if (rec.meta.putt) return false;
  const land = sampleAt(rec, rec.landingIndex);
  return dist(land, rec.meta.pin) <= APPROACH_RADIUS;
}

export class PocDirector {
  record: ShotRecord | null = null;
  green: CamPose | null = null;
  private greenLive = false;
  private plan: ReplayPlan | null = null;
  private t = 0;

  constructor(readonly config: BroadcastConfig) {}

  onShot(rec: ShotRecord, hole: HoleDef) {
    this.record = rec;
    this.greenLive = false;
    this.plan = null;
    this.t = 0;
    const from: Vec2 = rec.meta.start;
    this.green = isApproach(rec) ? placeGreenCam(hole, from, this.config.candidate, this.config.angle) : null;
  }

  /** Camera after impact (flight and the live hold), or null to keep Classic's follow camera. */
  liveCamera(flightIdx: number): CamPose | null {
    if (!this.record || !this.green) return null;
    if (!this.greenLive && flightIdx >= landingCutIndex(this.record)) this.greenLive = true;
    return this.greenLive ? { ...this.green } : null;
  }

  /** Whether the green-side camera has taken over the live shot. */
  get greenOnAir(): boolean {
    return this.greenLive;
  }

  get replayDue(): boolean {
    return !!(this.config.replayApproaches && this.record && isApproach(this.record));
  }

  get replaying(): boolean {
    return this.plan !== null;
  }

  startReplay() {
    if (!this.record) return;
    this.plan = planReplay(this.record, this.green);
    this.t = 0;
  }

  /** Advances replay time and returns the frame to draw. */
  advance(dt: number): ReplayFrame | null {
    if (!this.record || !this.plan) return null;
    this.t += dt;
    return replayFrameAt(this.record, this.plan, this.t);
  }

  frame(): ReplayFrame | null {
    return this.record && this.plan ? replayFrameAt(this.record, this.plan, this.t) : null;
  }

  /** Seconds since the replayed impact (for the golfer's follow-through pose). */
  get replaySince(): number {
    return this.plan ? Math.max(0, this.t - LEAD_IN_SEC) : 0;
  }

  stopReplay() {
    this.plan = null;
    this.t = 0;
  }
}
