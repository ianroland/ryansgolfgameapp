/**
 * Instant-replay playhead (Broadcast Phase 1). Pure and frame-rate independent:
 * every frame is a function of replay time only. It reads the stored path and
 * never simulates anything; slow motion interpolates between stored samples,
 * and the final frame is always the last stored sample.
 */
import { dirFromHeading } from '../golf/math';
import type { CamPose } from './greenCam';
import { sampleAt, sampleCount, type ShotRecord } from './shotRecord';

/** Live flight plays 1.7 samples per 60 Hz frame (RoundScene), i.e. 102 samples/s = "1×". */
export const LIVE_SAMPLES_PER_SEC = 1.7 * 60;
/** The green-side cut starts this many samples (0.8 s at 60 Hz) before landing. */
export const LANDING_LEAD_SAMPLES = 48;
export const LEAD_IN_SEC = 0.25;
export const HOLD_SEC = 0.5;
export const LEAD_OUT_SEC = 0.25;
export const SLOW_RATE = 0.5;

export type ReplaySegment = 'in' | 'follow' | 'green' | 'hold' | 'out';

export interface ReplayPlan {
  /** Smoothed follow-camera track, one pose per 1/60 s of the follow segment (precomputed, so frames stay a pure function of time). */
  follow: CamPose[];
  last: number;
  /** Sample index where the green-side camera takes over (= last when there is none). */
  cutIdx: number;
  green: CamPose | null;
  followSec: number;
  greenSec: number;
  totalSec: number;
}

export interface ReplayFrame {
  segment: ReplaySegment;
  /** Fractional sample index into the stored path. */
  idx: number;
  pos: { x: number; y: number; z: number };
  cam: CamPose;
  /** 0..1 letterbox / REPLAY-bug presence. */
  overlay: number;
  done: boolean;
}

export function landingCutIndex(rec: ShotRecord): number {
  return Math.max(0, Math.min(sampleCount(rec) - 1, rec.landingIndex - LANDING_LEAD_SAMPLES));
}

/** Seconds the live follow camera holds still after impact (RoundScene.followCamera, non-putts). */
export const FOLLOW_HOLD_SEC = 0.5;
const TRACK_HZ = 60;

/**
 * The same chase the live follow camera does — start behind the ball at aim
 * height, hold for the follow-through, then ease towards the target at
 * k = dt × 4.5 — stepped at a fixed 60 Hz so the result never depends on the
 * player's frame rate.
 */
export function followTrack(rec: ShotRecord, seconds: number): CamPose[] {
  const d = dirFromHeading(rec.meta.shotHeading);
  const putt = rec.meta.putt;
  const back0 = putt ? 6.2 : 7.4;
  let cam: CamPose = { x: rec.meta.start.x - d.x * back0, y: rec.meta.start.y - d.y * back0, h: putt ? 2.8 : 3.3, heading: rec.meta.shotHeading };
  const out: CamPose[] = [{ ...cam }];
  const n = Math.ceil(seconds * TRACK_HZ) + 1;
  const dt = 1 / TRACK_HZ;
  const k = Math.min(1, dt * 4.5);
  for (let i = 1; i <= n; i++) {
    const t = i * dt;
    if (putt || t >= FOLLOW_HOLD_SEC) {
      const target = followPose(rec, positionAt(rec, t * LIVE_SAMPLES_PER_SEC));
      cam = { x: cam.x + (target.x - cam.x) * k, y: cam.y + (target.y - cam.y) * k, h: cam.h + (target.h - cam.h) * k, heading: cam.heading + (target.heading - cam.heading) * k };
    }
    out.push({ ...cam });
  }
  return out;
}

export function planReplay(rec: ShotRecord, green: CamPose | null): ReplayPlan {
  const last = sampleCount(rec) - 1;
  const cutIdx = green ? landingCutIndex(rec) : last;
  const followSec = cutIdx / LIVE_SAMPLES_PER_SEC;
  const greenSec = green ? (last - cutIdx) / (LIVE_SAMPLES_PER_SEC * SLOW_RATE) : 0;
  return {
    follow: followTrack(rec, followSec),
    last,
    cutIdx,
    green,
    followSec,
    greenSec,
    totalSec: LEAD_IN_SEC + followSec + greenSec + HOLD_SEC + LEAD_OUT_SEC,
  };
}

/** Linear interpolation between stored samples; integer indices return the stored sample exactly. */
export function positionAt(rec: ShotRecord, idx: number) {
  const n = sampleCount(rec);
  const c = Math.max(0, Math.min(n - 1, idx));
  const i = Math.floor(c);
  const f = c - i;
  const a = sampleAt(rec, i);
  if (f === 0 || i >= n - 1) return a;
  const b = sampleAt(rec, i + 1);
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f };
}

/** Today's follow-camera target, without smoothing (so the replay stays a pure function of time). */
export function followPose(rec: ShotRecord, pos: { x: number; y: number; z: number }): CamPose {
  const d = dirFromHeading(rec.meta.shotHeading);
  const back = rec.meta.putt ? 6 : 14;
  return { x: pos.x - d.x * back, y: pos.y - d.y * back, h: (rec.meta.putt ? 2.6 : 4.5) + pos.z * 0.55, heading: rec.meta.shotHeading };
}

export function replayFrameAt(rec: ShotRecord, plan: ReplayPlan, t: number): ReplayFrame {
  const time = Math.max(0, t);
  let rest = time;
  const frame = (segment: ReplaySegment, idx: number, overlay: number, done = false): ReplayFrame => {
    const pos = positionAt(rec, idx);
    const onGreen = plan.green && idx >= plan.cutIdx && (segment === 'green' || segment === 'hold' || segment === 'out');
    const ti = Math.min(plan.follow.length - 1, Math.max(0, Math.floor((idx / LIVE_SAMPLES_PER_SEC) * TRACK_HZ)));
    return { segment, idx, pos, cam: onGreen ? { ...plan.green! } : { ...plan.follow[ti] }, overlay, done };
  };
  if (rest < LEAD_IN_SEC) return frame('in', 0, rest / LEAD_IN_SEC);
  rest -= LEAD_IN_SEC;
  if (rest < plan.followSec) return frame('follow', rest * LIVE_SAMPLES_PER_SEC, 1);
  rest -= plan.followSec;
  if (rest < plan.greenSec) return frame('green', plan.cutIdx + rest * LIVE_SAMPLES_PER_SEC * SLOW_RATE, 1);
  rest -= plan.greenSec;
  if (rest < HOLD_SEC) return frame('hold', plan.last, 1);
  rest -= HOLD_SEC;
  if (rest < LEAD_OUT_SEC) return frame('out', plan.last, 1 - rest / LEAD_OUT_SEC);
  return frame('out', plan.last, 0, true);
}
