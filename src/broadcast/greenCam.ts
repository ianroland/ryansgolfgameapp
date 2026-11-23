/**
 * Green-side camera placement (Broadcast Phase 1). Pure: no Phaser, no physics.
 *
 * The camera stands beyond the pin, on (or 30° off) the line the ball is
 * travelling, and looks back at the pin — so the incoming ball flies towards
 * it and lands in front of the flag. Every placement is checked against the
 * renderer's limits; if no safe spot exists the director keeps Ball Follow.
 */
import { corridorLine, type HoleDef } from '../golf/course';
import { DEG, dirFromHeading, headingTo, rightOf, type Vec2 } from '../golf/math';
import type { GreenCamAngle, GreenCamCandidate } from './config';

export interface CamPose {
  x: number;
  y: number;
  h: number;
  heading: number;
}

/** Height above the ground and distance to the pin, in yards (height study, Phase 1 plan). */
export const GREEN_CAM: Record<GreenCamCandidate, { h: number; d: number; label: string }> = {
  A: { h: 0.6, d: 7.3, label: 'A · Cup Cam' },
  B: { h: 1.2, d: 8, label: 'B · Low green-side' },
  C: { h: 2.0, d: 10, label: 'C · Green-side' },
  D: { h: 3.3, d: 14, label: 'D · Aim-height baseline' },
};

/** Must match RoundScene's projection. */
export const SCREEN = { W: 960, H: 540, HORIZON: 188, FOCAL: 540, NEAR: 0.6 } as const;
/** The flag billboard is 2.8 yards tall. */
export const FLAG_HEIGHT = 2.8;
/** Screen safe area for the pin: between the portrait panel and the minimap. */
export const PIN_SAFE_X: [number, number] = [130, 800];
export const FLAG_TOP_MIN_Y = 24;
/** The ground renderer rasterises the corridor's bounding box plus this margin (yards). */
const RASTER_MARGIN = 12;

export function project(cam: CamPose, x: number, y: number, z: number) {
  const f = dirFromHeading(cam.heading);
  const r = rightOf(f);
  const rx = x - cam.x;
  const ry = y - cam.y;
  const d = rx * f.x + ry * f.y;
  if (d < SCREEN.NEAR) return null;
  const lx = rx * r.x + ry * r.y;
  return { x: SCREEN.W / 2 + (lx * SCREEN.FOCAL) / d, y: SCREEN.HORIZON + ((cam.h - z) * SCREEN.FOCAL) / d, d, s: SCREEN.FOCAL / d };
}

function distToSegment(p: Vec2, a: Vec2, b: Vec2) {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const L = vx * vx + vy * vy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / L));
  return Math.hypot(p.x - (a.x + vx * t), p.y - (a.y + vy * t));
}

/** Why a placement was refused (null = safe). */
export function placementProblem(hole: HoleDef, cam: CamPose): string | null {
  const cl = corridorLine(hole);
  const m = hole.corridorHalfWidth + RASTER_MARGIN;
  const minX = Math.min(...cl.map((p) => p.x)) - m;
  const maxX = Math.max(...cl.map((p) => p.x)) + m;
  const minY = Math.min(...cl.map((p) => p.y)) - m;
  const maxY = Math.max(...cl.map((p) => p.y)) + m;
  if (cam.x < minX || cam.x > maxX || cam.y < minY || cam.y > maxY) return 'outside raster';
  for (const t of hole.trees) {
    if (Math.hypot(t.x - cam.x, t.y - cam.y) < 6) return 'tree within 6 yd';
    if (distToSegment(t, cam, hole.pin) < t.r + 0.5) return 'tree between camera and pin';
  }
  const pin = project(cam, hole.pin.x, hole.pin.y, 0);
  const top = project(cam, hole.pin.x, hole.pin.y, FLAG_HEIGHT);
  if (!pin || !top) return 'pin behind camera';
  if (pin.x < PIN_SAFE_X[0] || pin.x > PIN_SAFE_X[1]) return 'pin outside safe area';
  if (top.y < FLAG_TOP_MIN_Y) return 'flag top above frame';
  return null;
}

/** Candidate pose for one side (sign +1 / −1 for the 30° offset). */
export function greenCamPose(hole: HoleDef, from: Vec2, candidate: GreenCamCandidate, angle: GreenCamAngle, sign = 1): CamPose {
  const { h, d } = GREEN_CAM[candidate];
  const travel = headingTo(from, hole.pin);
  const off = angle === 'offset30' ? 30 * DEG * sign : 0;
  const dir = dirFromHeading(travel + off);
  const x = hole.pin.x + dir.x * d;
  const y = hole.pin.y + dir.y * d;
  return { x, y, h, heading: headingTo({ x, y }, hole.pin) };
}

/** A safe green-side pose, trying the mirrored 30° side if needed; null = keep Ball Follow. */
export function placeGreenCam(hole: HoleDef, from: Vec2, candidate: GreenCamCandidate, angle: GreenCamAngle): CamPose | null {
  const signs = angle === 'offset30' ? [1, -1] : [1];
  for (const s of signs) {
    const pose = greenCamPose(hole, from, candidate, angle, s);
    if (!placementProblem(hole, pose)) return pose;
  }
  return null;
}
