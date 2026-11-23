/**
 * Hole builder: turns a compact, readable spec into a full HoleDef.
 *
 * Positions are given relative to the hole's centerline ("80 yards along,
 * 20 right"), so the fairway, hazards and trees always follow the hole's
 * shape, doglegs included. Coordinates: tee at (0,0), +y down the hole,
 * +x to the golfer's right.
 */
import { inShape, makeTree, treeLines, type HoleDef, type Shape, type TreeKind } from '../course';
import { add, headingTo, inEllipse, norm, pointAlongPolyline, polylineLength, rightOf, scale, sub, type Vec2 } from '../math';

/** An ellipse at a point along the hole: `off` > 0 is right of the centerline. */
export interface AlongFeature {
  at: number;
  off: number;
  /** Across the hole. */
  rx: number;
  /** Along the hole. */
  ry: number;
  /** Extra rotation (radians) on top of following the hole. */
  rot?: number;
}
/** A greenside feature: `g` in degrees around the green (0 = behind, 90 = right, 180 = front, -90 = left). */
export interface GreenFeature {
  g: number;
  rx: number;
  ry: number;
  /** Gap from the green's edge, yards. */
  gap?: number;
}
/** A hazard straight across the corridor between two distances. */
export interface CrossFeature {
  cross: [number, number];
}
/** A band along one side of the hole. */
export interface SideFeature {
  side: 1 | -1;
  from: number;
  to: number;
  /** Distance of the band's middle from the centerline. */
  off: number;
  hw: number;
}
export type Feature = AlongFeature | GreenFeature | CrossFeature | SideFeature;

export interface HoleSpec {
  par: 3 | 4 | 5;
  name: string;
  /** Turning points after the tee; the last one is the middle of the green. */
  path: [number, number][];
  /** Corridor half-width (in-bounds), default 44. */
  width?: number;
  /** Fairway half-width, default 17 (par 3s get a short apron instead). */
  fairway?: number;
  /** Where the fairway starts (yards from the tee), default 40. */
  fairwayFrom?: number;
  /** Extra stretches without fairway (cross hazards add their own). */
  gaps?: [number, number][];
  /** Green radii [across, along, extra rotation]. Default 14 × 12. */
  green?: [number, number, number?];
  /** Downhill pull on the green (yd/s²), [x, y]. */
  slope: [number, number];
  /** Pin offset from the middle of the green. */
  pin?: [number, number];
  bunkers?: Feature[];
  water?: Feature[];
  trees?: {
    kinds: TreeKind[];
    seed: number;
    /** Distance from the centerline, default corridor width - 6. */
    offset?: number;
    spacing?: number;
    sides?: ('L' | 'R')[];
    from?: number;
    to?: number;
    jitter?: number;
  } | null;
  /** Single trees: [along, off, kind, size]. */
  extraTrees?: [number, number, TreeKind, number?][];
}

const line = (pts: [number, number][]): Vec2[] => [{ x: 0, y: 0 }, ...pts.map(([x, y]) => ({ x, y }))];

/** Point and unit direction at a distance along a polyline. */
function frame(cl: Vec2[], along: number) {
  const L = polylineLength(cl);
  const a = Math.max(0, Math.min(L, along));
  const p = pointAlongPolyline(cl, a);
  const q = pointAlongPolyline(cl, Math.min(L, a + 1));
  const p0 = a + 1 > L ? pointAlongPolyline(cl, L - 1) : p;
  const d = norm(sub(a + 1 > L ? p : q, p0));
  return { p, d };
}

function at(cl: Vec2[], along: number, off: number): Vec2 {
  const { p, d } = frame(cl, along);
  return add(p, scale(rightOf(d), off));
}

/** Sub-polyline between two distances (includes the corners in between). */
function slice(cl: Vec2[], from: number, to: number): Vec2[] {
  const out = [pointAlongPolyline(cl, from)];
  let acc = 0;
  for (let i = 0; i < cl.length - 1; i++) {
    acc += Math.hypot(cl[i + 1].x - cl[i].x, cl[i + 1].y - cl[i].y);
    if (acc > from + 0.5 && acc < to - 0.5) out.push(cl[i + 1]);
  }
  out.push(pointAlongPolyline(cl, to));
  return out;
}

export function buildHole(number: number, s: HoleSpec): HoleDef {
  const centerline = line(s.path);
  const L = polylineLength(centerline);
  const width = s.width ?? 44;
  const end = frame(centerline, L);
  const hdg = headingTo({ x: 0, y: 0 }, end.d);
  const [grx, gry, grot = 0] = s.green ?? [14, 12];
  const gc = centerline[centerline.length - 1];
  const green = { x: gc.x, y: gc.y, rx: grx, ry: gry, rot: -hdg + grot };

  const gaps: [number, number][] = [...(s.gaps ?? [])];
  const shape = (f: Feature): Shape => {
    if ('cross' in f) {
      const mid = (f.cross[0] + f.cross[1]) / 2;
      const { p, d } = frame(centerline, mid);
      const r = rightOf(d);
      gaps.push([f.cross[0] - 2, f.cross[1] + 2]);
      return { type: 'strip', pts: [add(p, scale(r, -(width + 14))), add(p, scale(r, width + 14))], hw: (f.cross[1] - f.cross[0]) / 2 };
    }
    if ('side' in f) {
      const pts: Vec2[] = [];
      const n = Math.max(1, Math.ceil((f.to - f.from) / 15));
      for (let i = 0; i <= n; i++) pts.push(at(centerline, f.from + ((f.to - f.from) * i) / n, f.side * f.off));
      return { type: 'strip', pts, hw: f.hw };
    }
    if ('g' in f) {
      const ang = (f.g * Math.PI) / 180;
      // Direction from the green's middle, in world space (0 = along the line of play).
      const dir = add(scale(end.d, Math.cos(ang)), scale(rightOf(end.d), Math.sin(ang)));
      const greenR = Math.abs(Math.cos(ang)) * gry + Math.abs(Math.sin(ang)) * grx;
      const featR = Math.abs(Math.cos(ang)) * f.ry + Math.abs(Math.sin(ang)) * f.rx;
      const c = add(gc, scale(dir, greenR + (f.gap ?? 2.5) + featR));
      return { type: 'ellipse', x: c.x, y: c.y, rx: f.rx, ry: f.ry, rot: -hdg };
    }
    const { d } = frame(centerline, f.at);
    const c = at(centerline, f.at, f.off);
    return { type: 'ellipse', x: c.x, y: c.y, rx: f.rx, ry: f.ry, rot: -headingTo({ x: 0, y: 0 }, d) + (f.rot ?? 0) };
  };
  const water = (s.water ?? []).map(shape);
  const bunkers = (s.bunkers ?? []).map(shape);

  // Fairway: follows the centerline up to the front of the green, minus gaps.
  const fairways: Shape[] = [];
  const fwEnd = L - gry - 3;
  if (s.par === 3) {
    const w = s.fairway ?? 9;
    if (w > 0) fairways.push({ type: 'strip', pts: slice(centerline, Math.max(5, L - gry - 28), fwEnd), hw: w });
  } else {
    const w = s.fairway ?? 17;
    let a = s.fairwayFrom ?? 40;
    const sorted = gaps.sort((x, y) => x[0] - y[0]);
    for (const [g0, g1] of [...sorted, [fwEnd, Infinity] as [number, number]]) {
      if (g0 > a + 12) fairways.push({ type: 'strip', pts: slice(centerline, a, Math.min(g0, fwEnd)), hw: w });
      a = Math.max(a, g1);
      if (a >= fwEnd) break;
    }
  }

  const [px, py] = s.pin ?? [0, 0];
  const pin = { x: gc.x + px, y: gc.y + py };

  const hazard = (p: Vec2, pad: number) =>
    water.some((w) => inShape(p, w)) ||
    bunkers.some((b) => inShape(p, b)) ||
    inEllipse(p, green, pad) ||
    fairways.some((f) => inShape(p, f)) ||
    Math.hypot(p.x, p.y) < 14;
  let trees = s.trees
    ? treeLines(centerline, s.trees.offset ?? width - 6, {
        seed: s.trees.seed,
        kinds: s.trees.kinds,
        spacing: s.trees.spacing,
        sides: s.trees.sides,
        from: s.trees.from,
        to: s.trees.to,
        jitter: s.trees.jitter,
      })
    : [];
  for (const [a, off, kind, k] of s.extraTrees ?? []) {
    const p = at(centerline, a, off);
    trees.push(makeTree(p.x, p.y, kind, k ?? 1));
  }
  trees = trees.filter((t) => !hazard(t, 5) && !water.some((w) => inShape(t, w)));

  return {
    number,
    par: s.par,
    name: s.name,
    centerline,
    corridorHalfWidth: width,
    pin,
    green,
    greenSlope: { x: s.slope[0], y: s.slope[1] },
    fairways,
    bunkers,
    water,
    trees,
  };
}
