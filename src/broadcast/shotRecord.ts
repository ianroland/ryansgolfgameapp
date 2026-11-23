/**
 * Full-precision shot record (Broadcast Phase 1).
 *
 * A copy of what `simulateShot` already returned — nothing is recomputed.
 * The path is kept as the same 64-bit numbers in a Float64Array (x, y, z
 * triples, hole space in yards: tee at (0,0), +y down the hole, +x to the
 * golfer's right, z height above the flat ground). In memory only: there is
 * no save-schema change in Phase 1.
 */
import { checksum } from '../core/checksum';
import type { ClubId } from '../golf/clubs';
import type { Surface } from '../golf/course';
import type { Vec2 } from '../golf/math';
import type { PathPoint, ShotOutcome, ShotResult } from '../golf/physics';

export interface ShotRecordMeta {
  holeNumber: number;
  holeName: string;
  pin: Vec2;
  club: ClubId;
  putt: boolean;
  /** The ball's position when struck. */
  start: Vec2;
  /** Heading the ball was actually struck on (after stat wobble). */
  shotHeading: number;
}

export interface ShotRecord {
  version: 1;
  meta: ShotRecordMeta;
  /** x, y, z per sample, 60 Hz, exactly as simulated. */
  path: Float64Array;
  landingIndex: number;
  outcome: ShotOutcome;
  end: Vec2;
  nextLie: Vec2;
  endSurface: Surface;
  penaltyStrokes: number;
  carry: number;
  total: number;
  apex: number;
  hitTree: boolean;
  spinBack: number;
  checksum: string;
}

type Unsealed = Omit<ShotRecord, 'checksum'>;

function sealInput(r: Unsealed) {
  return { ...r, path: Array.from(r.path) };
}

export function captureShotRecord(meta: ShotRecordMeta, res: ShotResult): ShotRecord {
  const path = new Float64Array(res.path.length * 3);
  res.path.forEach((p, i) => {
    path[i * 3] = p.x;
    path[i * 3 + 1] = p.y;
    path[i * 3 + 2] = p.z;
  });
  const rec: Unsealed = {
    version: 1,
    meta: { ...meta, pin: { ...meta.pin }, start: { ...meta.start } },
    path,
    landingIndex: res.landingIndex,
    outcome: res.outcome,
    end: { ...res.end },
    nextLie: { ...res.nextLie },
    endSurface: res.endSurface,
    penaltyStrokes: res.penaltyStrokes,
    carry: res.carry,
    total: res.total,
    apex: res.apex,
    hitTree: res.hitTree,
    spinBack: res.spinBack,
  };
  return { ...rec, checksum: checksum(sealInput(rec)) };
}

export function verifyShotRecord(rec: ShotRecord): boolean {
  const { checksum: sum, ...rest } = rec;
  return checksum(sealInput(rest)) === sum;
}

export const sampleCount = (rec: ShotRecord) => rec.path.length / 3;

export function sampleAt(rec: ShotRecord, i: number): PathPoint {
  const k = Math.max(0, Math.min(sampleCount(rec) - 1, i)) * 3;
  return { x: rec.path[k], y: rec.path[k + 1], z: rec.path[k + 2] };
}

/** Rebuilds the engine's ShotResult from a record (playback only; nothing is simulated). */
export function recordToShotResult(rec: ShotRecord): ShotResult {
  const n = sampleCount(rec);
  const path: PathPoint[] = [];
  for (let i = 0; i < n; i++) path.push(sampleAt(rec, i));
  return {
    path,
    landingIndex: rec.landingIndex,
    outcome: rec.outcome,
    end: { ...rec.end },
    nextLie: { ...rec.nextLie },
    endSurface: rec.endSurface,
    penaltyStrokes: rec.penaltyStrokes,
    carry: rec.carry,
    total: rec.total,
    apex: rec.apex,
    hitTree: rec.hitTree,
    spinBack: rec.spinBack,
  };
}

/**
 * JSON form. Doubles round-trip exactly through JSON except negative zero,
 * which JSON writes as 0 — so −0 is written as the string "-0" and restored.
 */
const NEG_ZERO = '-0';

export function recordToJSON(rec: ShotRecord): string {
  return JSON.stringify({ ...rec, path: Array.from(rec.path) }, (_k, v) => (typeof v === 'number' && Object.is(v, -0) ? NEG_ZERO : v));
}

export function recordFromJSON(json: string): ShotRecord {
  const o = JSON.parse(json, (_k, v) => (v === NEG_ZERO ? -0 : v)) as Omit<ShotRecord, 'path'> & { path: number[] };
  return { ...o, path: Float64Array.from(o.path) };
}
