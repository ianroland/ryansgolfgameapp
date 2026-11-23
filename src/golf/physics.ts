/**
 * Ball simulation: flight (gravity, linear air drag relative to wind, curve),
 * tree strikes, bounces, rolling with surface friction and green slope,
 * cup capture/lip-outs, water and out-of-bounds.
 *
 * Shots are simulated in full up front; the renderer replays `path`.
 * The same function drives the player and the AI, so both obey one set of rules.
 */
import { CLUB_BY_ID, type ClubId } from './clubs';
import { surfaceAt, type HoleDef, type Surface } from './course';
import { add, DEG, dirFromHeading, dist, len, lerp, norm, rightOf, scale, sub, type Rng, type Vec2 } from './math';

export const GRAVITY = 10.73; // yd/s²
export const AIR_DRAG = 0.1; // 1/s, linear, relative to air
/** Arcade wind strength multiplier (wind matters more than real life). */
export const WIND_FACTOR = 2.2;
export const CURVE_ACCEL = 1.8; // yd/s² per curve step
export const MAX_CURVE = 3;
export const CUP_CAPTURE = 0.16; // yd
export const CUP_MAX_SPEED = 3.0; // yd/s
const DT = 1 / 120;
const MPH_TO_YDS = 0.4889;

interface SurfaceProps {
  bounce: number; // vertical restitution
  /** Horizontal speed kept on the first (pitch-mark) impact. */
  impact: number;
  keep: number; // horizontal speed kept on later bounces
  roll: number; // rolling deceleration yd/s²
}
export const SURFACES: Record<Exclude<Surface, 'water' | 'ob'>, SurfaceProps> = {
  green: { bounce: 0.16, impact: 0.2, keep: 0.6, roll: 1.25 },
  fringe: { bounce: 0.18, impact: 0.28, keep: 0.55, roll: 2.6 },
  fairway: { bounce: 0.28, impact: 0.4, keep: 0.6, roll: 6.5 },
  tee: { bounce: 0.28, impact: 0.4, keep: 0.6, roll: 6.5 },
  rough: { bounce: 0.14, impact: 0.3, keep: 0.4, roll: 9 },
  bunker: { bounce: 0.02, impact: 0.05, keep: 0.08, roll: 32 },
};

/** How much backspin each club can put on the ball (wedges zip back, woods don't). */
const CLUB_SPIN: Record<ClubId, number> = { DR: 0, '3W': 0, '3I': 0.08, '5I': 0.18, '7I': 0.3, '9I': 0.5, PW: 0.7, SW: 1, PT: 0 };
/** Clean contact spins; grass between ball and face (rough) kills it; sand gives some. */
const LIE_SPIN: Partial<Record<Surface, number>> = { tee: 1, fairway: 1, fringe: 0.9, green: 1, rough: 0.3, bunker: 0.6 };
/** How well the landing surface grabs a spinning ball. */
const GRAB: Partial<Record<Surface, number>> = { green: 1, fringe: 0.75, fairway: 0.4, tee: 0.4, rough: 0.1, bunker: 0 };
/** Fraction of landing speed that comes back as spin-back on a perfect wedge. */
export const SPIN_BACK = 0.25;

/** Effect of the lie on a full shot. */
export const LIE_EFFECT: Record<Surface, { power: number; spreadDeg: number; powerSpread: number; label: string }> = {
  tee: { power: 1, spreadDeg: 0, powerSpread: 0, label: 'Tee' },
  fairway: { power: 1, spreadDeg: 0, powerSpread: 0, label: 'Fairway' },
  fringe: { power: 0.97, spreadDeg: 0.3, powerSpread: 0.01, label: 'Fringe' },
  green: { power: 1, spreadDeg: 0, powerSpread: 0, label: 'Green' },
  rough: { power: 0.86, spreadDeg: 1.6, powerSpread: 0.04, label: 'Rough' },
  bunker: { power: 0.62, spreadDeg: 2.4, powerSpread: 0.06, label: 'Bunker' },
  water: { power: 1, spreadDeg: 0, powerSpread: 0, label: 'Water' },
  ob: { power: 1, spreadDeg: 0, powerSpread: 0, label: 'OB' },
};

export interface Wind {
  /** Direction the wind blows TOWARD (heading convention). */
  heading: number;
  mph: number;
}
export const windVector = (w: Wind): Vec2 => scale(dirFromHeading(w.heading), w.mph * MPH_TO_YDS);

export interface ShotInput {
  start: Vec2;
  heading: number;
  club: ClubId;
  /** 0..1 */
  power: number;
  /** 0..1, 0.5 = stock trajectory. Ignored for putts. */
  height: number;
  /** -3 (hook/draw, curves left) .. +3 (slice/fade, curves right). */
  curve: number;
  /** -1 backspin, 0 none, +1 topspin. */
  spin: -1 | 0 | 1;
  wind: Wind;
  lie: Surface;
  /** Golfer power stat multiplier on carry (1 = neutral). */
  strength?: number;
  /** For putts: flat-green length of a 100% putt. */
  puttScale?: number;
  rng?: Rng;
}

export interface PathPoint {
  x: number;
  y: number;
  z: number;
}

export type ShotOutcome = 'rest' | 'holed' | 'water' | 'ob';

export interface ShotResult {
  /** Sampled at 60 Hz. */
  path: PathPoint[];
  /** Index in `path` where the ball first lands (or path length for putts). */
  landingIndex: number;
  outcome: ShotOutcome;
  /** Where the ball finished (or entered the hazard). */
  end: Vec2;
  /** Where play continues from (start spot again after water/OB). */
  nextLie: Vec2;
  endSurface: Surface;
  penaltyStrokes: number;
  carry: number;
  total: number;
  apex: number;
  hitTree: boolean;
  /** Yards the ball drew back after checking (backspin). */
  spinBack: number;
}

function launchAngle(club: ClubId, height: number) {
  return CLUB_BY_ID[club].launchDeg * lerp(0.62, 1.38, height) * DEG;
}

/** Carry of a no-wind, no-curve flight with launch speed v at angle theta. */
function carryFor(v: number, theta: number): number {
  let vx = v * Math.cos(theta);
  let vz = v * Math.sin(theta);
  let x = 0;
  let z = 0;
  for (let i = 0; i < 4000; i++) {
    vx -= AIR_DRAG * vx * DT;
    vz -= (GRAVITY + AIR_DRAG * vz) * DT;
    x += vx * DT;
    z += vz * DT;
    if (z <= 0 && vz < 0) return x;
  }
  return x;
}

const speedCache = new Map<string, number>();
/** Launch speed that carries `target` yards at angle theta in still air. */
export function launchSpeedFor(target: number, theta: number): number {
  const key = `${target.toFixed(1)}|${theta.toFixed(4)}`;
  const hit = speedCache.get(key);
  if (hit) return hit;
  let lo = 1;
  let hi = 200;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (carryFor(mid, theta) < target) lo = mid;
    else hi = mid;
  }
  const v = (lo + hi) / 2;
  if (speedCache.size > 5000) speedCache.clear();
  speedCache.set(key, v);
  return v;
}

/** Nominal carry for a club at power, from a lie, for a golfer. */
export function nominalCarry(club: ClubId, power: number, lie: Surface, strength = 1) {
  const effect = club === 'SW' && lie === 'bunker' ? 0.9 : LIE_EFFECT[lie].power;
  return CLUB_BY_ID[club].carry * power * effect * strength;
}

export function simulateShot(hole: HoleDef, input: ShotInput): ShotResult {
  const isPutt = input.club === 'PT';
  const r = input.rng;
  const lie = LIE_EFFECT[input.lie];
  const heading = input.heading + (isPutt || !r ? 0 : r.gauss() * lie.spreadDeg * DEG);
  const dir = dirFromHeading(heading);
  const wind = isPutt ? { x: 0, y: 0 } : scale(windVector(input.wind), WIND_FACTOR);

  const path: PathPoint[] = [];
  let p: Vec2 = { ...input.start };
  let z = 0;
  let vh: Vec2;
  let vz = 0;
  let rolling = isPutt;
  let landed = isPutt;
  let landingIndex = isPutt ? 0 : -1;
  let firstBounce = true;
  /** Backward speed waiting to bite once the ball settles (yd/s). */
  let spinBackSpeed = 0;
  let maxAlong = 0;
  const along = (q: Vec2) => (q.x - input.start.x) * dir.x + (q.y - input.start.y) * dir.y;
  let apex = 0;
  let hitTree = false;
  const treesHit = new Set<number>();
  let step = 0;
  const record = () => {
    if (step % 2 === 0) path.push({ x: p.x, y: p.y, z });
    step++;
    maxAlong = Math.max(maxAlong, along(p));
  };

  if (isPutt) {
    const flat = Math.max(0, input.power) * (input.puttScale ?? 16);
    const v0 = Math.sqrt(2 * SURFACES.green.roll * flat);
    vh = scale(dir, v0);
  } else {
    const theta = launchAngle(input.club, input.height);
    const powerNoise = r ? 1 + r.gauss() * lie.powerSpread : 1;
    const carry = nominalCarry(input.club, input.power, input.lie, input.strength) * powerNoise;
    const v0 = launchSpeedFor(Math.max(1, carry), theta);
    vh = scale(dir, v0 * Math.cos(theta));
    vz = v0 * Math.sin(theta);
  }

  const finish = (outcome: ShotOutcome, surface: Surface): ShotResult => {
    path.push({ x: p.x, y: p.y, z: Math.max(0, z) });
    const penalty = outcome === 'water' || outcome === 'ob' ? 1 : 0;
    const landing = landingIndex >= 0 ? path[landingIndex] : path[path.length - 1];
    return {
      path,
      landingIndex: landingIndex >= 0 ? landingIndex : path.length - 1,
      outcome,
      end: { ...p },
      nextLie: penalty ? { ...input.start } : { ...p },
      endSurface: surface,
      penaltyStrokes: penalty,
      carry: dist(input.start, landing),
      total: dist(input.start, p),
      apex,
      hitTree,
      spinBack: Math.max(0, maxAlong - along(p)),
    };
  };

  // ── Flight + bounces ──
  for (let i = 0; i < 120 * 30 && !rolling; i++) {
    record();
    const rel = sub(vh, wind);
    const sp = len(vh);
    const side = rightOf(norm(vh));
    const curveA = landed ? 0 : input.curve * CURVE_ACCEL * Math.min(1, sp / 40);
    vh = add(vh, scale(add(scale(rel, -AIR_DRAG), scale(side, curveA)), DT));
    vz -= (GRAVITY + AIR_DRAG * vz) * DT;
    p = add(p, scale(vh, DT));
    z += vz * DT;
    apex = Math.max(apex, z);

    // Trees: canopy or trunk.
    hole.trees.forEach((t, ti) => {
      if (treesHit.has(ti) || z > t.h) return;
      const d = Math.hypot(p.x - t.x, p.y - t.y);
      const canopyBottom = t.kind === 'palm' ? t.h * 0.75 : t.h * 0.3;
      if ((z >= canopyBottom && d < t.r) || d < 0.45) {
        treesHit.add(ti);
        hitTree = true;
        const jitter = r ? r.range(-0.6, 0.6) : 0.3;
        vh = scale({ x: -vh.x * 0.25 + vh.y * jitter * 0.2, y: -vh.y * 0.25 - vh.x * jitter * 0.2 }, 1);
        vz = Math.min(vz, 0) * 0.2;
      }
    });

    if (z <= 0 && vz < 0) {
      z = 0;
      if (!landed) {
        landed = true;
        landingIndex = path.length;
      }
      const s = surfaceAt(hole, p);
      if (s === 'water') return finish('water', s);
      if (s === 'ob') return finish('ob', s);
      if (dist(p, hole.pin) < CUP_CAPTURE * 0.9 && len(vh) < 12) {
        p = { ...hole.pin };
        return finish('holed', 'green');
      }
      const props = SURFACES[s];
      let keep = props.keep;
      if (firstBounce) {
        const heightRoll = lerp(1.3, 0.75, input.height);
        const spinRoll = input.spin === -1 ? 0.35 : input.spin === 1 ? 1.35 : 1;
        keep = Math.min(0.92, props.impact * heightRoll * spinRoll);
        if (input.spin === -1) {
          spinBackSpeed = len(vh) * SPIN_BACK * CLUB_SPIN[input.club] * (LIE_SPIN[input.lie] ?? 0) * (GRAB[s] ?? 0);
        }
        firstBounce = false;
      }
      vz = -vz * props.bounce;
      vh = scale(vh, keep);
      if (vz < 1.2) {
        vz = 0;
        rolling = true;
        // The ball checks, then the backspin bites and draws it back.
        if (spinBackSpeed > 0.3) vh = scale(dir, -spinBackSpeed);
      }
    }
  }

  // ── Roll ──
  let inCupZone = false;
  for (let i = 0; i < 120 * 40; i++) {
    record();
    const s = surfaceAt(hole, p);
    if (s === 'water') return finish('water', s);
    if (s === 'ob') return finish('ob', s);
    const props = SURFACES[s];
    const onGreen = s === 'green' || s === 'fringe';
    const slope = onGreen ? hole.greenSlope : { x: 0, y: 0 };
    const sp = len(vh);

    // Cup.
    // Cup: one capture-or-lip decision per pass over the hole.
    const dPin = dist(p, hole.pin);
    if (dPin < CUP_CAPTURE && !inCupZone) {
      inCupZone = true;
      if (sp < CUP_MAX_SPEED) {
        p = { ...hole.pin };
        return finish('holed', 'green');
      }
      const away = norm(sub(p, hole.pin));
      vh = scale(norm(add(norm(vh), scale(away, 0.6))), sp * 0.75);
    } else if (dPin > CUP_CAPTURE * 1.6) inCupZone = false;

    if (sp < props.roll * DT * 1.5 && Math.hypot(slope.x, slope.y) < props.roll * 0.45) return finish('rest', s);
    const decel = sp > 0 ? scale(norm(vh), -Math.min(sp / DT, props.roll)) : { x: 0, y: 0 };
    vh = add(vh, scale(add(decel, slope), DT));
    p = add(p, scale(vh, DT));
  }
  return finish('rest', surfaceAt(hole, p));
}

/** Flat-green putt power (0..1) needed to roll `d` yards at a given scale. */
export function puttPowerFor(d: number, scaleYds: number) {
  return d / scaleYds;
}
