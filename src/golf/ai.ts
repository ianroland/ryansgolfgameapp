/**
 * Shot planning, shared by AI golfers (with human-like error) and by the
 * player's auto-aim/club suggestion (without error).
 */
import { CLUBS, CLUB_BY_ID, puttScaleFor, type ClubId } from './clubs';
import { surfaceAt, type HoleDef, type Surface } from './course';
import {
  AIR_DRAG,
  GRAVITY,
  launchSpeedFor,
  nominalCarry,
  simulateShot,
  SURFACES,
  WIND_FACTOR,
  windVector,
  type ShotInput,
  type Wind,
} from './physics';
import {
  clamp,
  DEG,
  dirFromHeading,
  dist,
  dot,
  headingTo,
  projectOnPolyline,
  pointAlongPolyline,
  polylineLength,
  rightOf,
  type Rng,
  type Vec2,
} from './math';

export interface AiProfile {
  /** Carry multiplier. */
  strength: number;
  aimSdDeg: number;
  powerSd: number;
  /** 0..1 */
  putting: number;
}

export const NEUTRAL_PROFILE: AiProfile = { strength: 1, aimSdDeg: 0, powerSd: 0, putting: 1 };

export function allowedClubs(lie: Surface, isFirstShot: boolean): ClubId[] {
  return CLUBS.filter((c) => c.id !== 'PT' && (!c.teeOnly || (isFirstShot && lie === 'tee'))).map((c) => c.id);
}

export function shouldPutt(hole: HoleDef, pos: Vec2, lie: Surface) {
  return lie === 'green' || (lie === 'fringe' && dist(pos, hole.pin) < 22);
}

/** Planned shot (no execution error). */
export interface Plan {
  club: ClubId;
  heading: number;
  power: number;
  height: number;
  spin: -1 | 0 | 1;
  puttScale?: number;
  target: Vec2;
}

function flightTime(club: ClubId, carry: number) {
  const theta = CLUB_BY_ID[club].launchDeg * DEG;
  const v = launchSpeedFor(Math.max(1, carry), theta);
  return (2 * v * Math.sin(theta)) / GRAVITY;
}

export function planShot(hole: HoleDef, pos: Vec2, lie: Surface, wind: Wind, strength: number, isFirstShot: boolean, compensateWind = true): Plan {
  const dPin = dist(pos, hole.pin);

  if (shouldPutt(hole, pos, lie)) {
    const dir = dirFromHeading(headingTo(pos, hole.pin));
    const slope = hole.greenSlope;
    const a = SURFACES.green.roll;
    const along = dot(slope, dir); // downhill along the line reduces decel
    const flat = (dPin * a) / Math.max(0.3, a - along) + 0.35;
    const t = Math.sqrt((2 * flat) / a);
    const side = rightOf(dir);
    const drift = 0.5 * dot(slope, side) * t * t * 0.55;
    const aim = { x: hole.pin.x - side.x * drift, y: hole.pin.y - side.y * drift };
    const scale = puttScaleFor(flat);
    return { club: 'PT', heading: headingTo(pos, aim), power: clamp(flat / scale, 0, 1), height: 0.5, spin: 0, puttScale: scale, target: hole.pin };
  }

  const clubs = allowedClubs(lie, isFirstShot);
  const maxCarry = Math.max(...clubs.map((c) => nominalCarry(c, 1, lie, strength)));
  const w = windVector(wind);

  // Reachable: go at the pin. Otherwise lay up along the centerline.
  let target = hole.pin;
  if (dPin > maxCarry * 1.08) {
    const here = projectOnPolyline(pos, hole.centerline).along;
    const total = polylineLength(hole.centerline);
    let reach = Math.min(total, here + maxCarry * 1.02);
    // Back off hazards on the layup.
    for (let k = 0; k < 8; k++) {
      const t = pointAlongPolyline(hole.centerline, reach);
      const s = surfaceAt(hole, t);
      if (s !== 'water' && s !== 'bunker' && s !== 'ob') break;
      reach -= 20;
    }
    target = pointAlongPolyline(hole.centerline, reach);
  }

  const d = dist(pos, target);
  const dir = dirFromHeading(headingTo(pos, target));
  const headwind = -dot(w, dir) * WIND_FACTOR; // effective yd/s against
  const goingAtPin = target === hole.pin;
  // Expect some roll: aim carry a bit short of target.
  const carryNeeded = (dt: number, club: ClubId) => dt * (1 - (goingAtPin ? CLUB_BY_ID[club].rollFactor * 0.6 : CLUB_BY_ID[club].rollFactor)) * (1 + headwind * 0.005);

  const sorted = [...clubs].sort((a, b) => nominalCarry(a, 1, lie, strength) - nominalCarry(b, 1, lie, strength));
  let club = sorted[sorted.length - 1];
  for (const c of sorted) {
    if (nominalCarry(c, 1, lie, strength) >= carryNeeded(d, c) * 1.02) {
      club = c;
      break;
    }
  }
  const carry = carryNeeded(d, club);
  const power = clamp(carry / nominalCarry(club, 1, lie, strength), 0.15, 1);

  let heading = headingTo(pos, target);
  if (compensateWind) {
    const T = flightTime(club, carry);
    const cross = dot(w, rightOf(dir));
    const drift = 0.5 * AIR_DRAG * WIND_FACTOR * cross * T * T;
    heading -= Math.atan2(drift, d);
  }
  return { club, heading, power, height: 0.5, spin: goingAtPin && CLUB_BY_ID[club].launchDeg >= 28 ? -1 : 0, target };
}

export function planToInput(plan: Plan, pos: Vec2, lie: Surface, wind: Wind, strength: number, r?: Rng): ShotInput {
  return {
    start: pos,
    heading: plan.heading,
    club: plan.club,
    power: plan.power,
    height: plan.height,
    curve: 0,
    spin: plan.spin,
    wind,
    lie,
    strength,
    puttScale: plan.puttScale,
    rng: r,
  };
}

export const MAX_OVER_PAR = 5;

/** Plays a whole hole for an AI golfer; returns strokes (capped at par + 5). */
export function aiPlayHole(hole: HoleDef, profile: AiProfile, wind: Wind, r: Rng): number {
  let pos: Vec2 = { x: 0, y: 0 };
  let lie: Surface = 'tee';
  let strokes = 0;
  const cap = hole.par + MAX_OVER_PAR;
  while (strokes < cap) {
    const plan = planShot(hole, pos, lie, wind, profile.strength, strokes === 0);
    const isPutt = plan.club === 'PT';
    const skill = isPutt ? 1 - profile.putting : 1;
    const input = planToInput(plan, pos, lie, wind, profile.strength, r);
    input.heading += r.gauss() * (isPutt ? 1.4 * skill : profile.aimSdDeg) * DEG;
    input.power = clamp(input.power * (1 + r.gauss() * (isPutt ? 0.09 * skill : profile.powerSd)), 0.02, 1);
    const res = simulateShot(hole, input);
    strokes += 1 + res.penaltyStrokes;
    if (res.outcome === 'holed') return Math.min(strokes, cap);
    pos = res.nextLie;
    lie = surfaceAt(hole, pos);
  }
  return cap;
}
