/**
 * Course model. Hole coordinates are yards: tee at (0,0), +y down the hole,
 * +x to the golfer's right. The ground is flat; greens carry a slope vector
 * that only affects rolling.
 */
import {
  add,
  distToPolyline,
  ellipsePolygon,
  inEllipse,
  inPolygon,
  norm,
  polylineLength,
  projectOnPolyline,
  rng,
  scale,
  stripPolygon,
  sub,
  type Ellipse,
  type Vec2,
} from './math';

export type Surface = 'tee' | 'fairway' | 'rough' | 'green' | 'fringe' | 'bunker' | 'water' | 'ob';

export type Shape =
  | ({ type: 'ellipse' } & Ellipse)
  | { type: 'strip'; pts: Vec2[]; hw: number }
  | { type: 'poly'; pts: Vec2[] };

export type TreeKind = 'palm' | 'eucalyptus' | 'pine';
export interface TreeDef {
  x: number;
  y: number;
  kind: TreeKind;
  /** Canopy radius (yards). */
  r: number;
  /** Total height (yards). */
  h: number;
}

export interface HoleDef {
  number: number;
  par: number;
  name: string;
  pin: Vec2;
  /** Path from the tee down the hole; also defines the in-bounds corridor. */
  centerline: Vec2[];
  corridorHalfWidth: number;
  fairways: Shape[];
  green: Ellipse;
  /** Constant acceleration on the green, yd/s² (downhill direction). */
  greenSlope: Vec2;
  bunkers: Shape[];
  water: Shape[];
  trees: TreeDef[];
}

export type BackdropId = 'coast' | 'city' | 'mountains';

/** How a course looks: backdrop panoramas, sky tint and ground colour grade. */
export interface CourseTheme {
  /** Backdrop per hole (cycled). */
  backdrops: BackdropId[];
  /** Multiply tint for the backdrop (0xRRGGBB), default none. */
  sky?: number;
  /** Per-surface colour grade: blend toward [r, g, b] (0-255, brightness kept) by `amount` (0-1). */
  grade?: Partial<Record<'rough' | 'deep' | 'fairway' | 'green' | 'sand' | 'water', [number, number, number, number]>>;
  /** Far-distance haze colour (match the tinted backdrop's base). */
  haze?: [number, number, number];
}

export interface CourseDef {
  id: string;
  name: string;
  location: string;
  /** One line for menus: the course's character. */
  blurb?: string;
  /** Strokes per 9 holes over (+) or under (-) a typical course, for simulated scores. */
  difficulty?: number;
  /** Wind multiplier (links blow, valleys are sheltered). Default 1. */
  windiness?: number;
  theme?: CourseTheme;
  holes: HoleDef[];
}

export const TEE: Vec2 = { x: 0, y: 0 };
export const FRINGE_WIDTH = 2.2;

export function inShape(p: Vec2, s: Shape): boolean {
  if (s.type === 'ellipse') return inEllipse(p, s);
  if (s.type === 'strip') return distToPolyline(p, s.pts) <= s.hw;
  return inPolygon(p, s.pts);
}

export function shapePolygon(s: Shape): Vec2[] {
  if (s.type === 'ellipse') return ellipsePolygon(s);
  if (s.type === 'strip') return stripPolygon(s.pts, s.hw);
  return s.pts;
}

/** Corridor polyline extended behind the tee and past the green. */
export function corridorLine(h: HoleDef): Vec2[] {
  const pts = h.centerline;
  const first = norm(sub(pts[1], pts[0]));
  const last = norm(sub(pts[pts.length - 1], pts[pts.length - 2]));
  return [add(pts[0], scale(first, -22)), ...pts, add(pts[pts.length - 1], scale(last, 34))];
}

export function surfaceAt(h: HoleDef, p: Vec2): Surface {
  if (distToPolyline(p, corridorLine(h)) > h.corridorHalfWidth) return 'ob';
  if (h.water.some((s) => inShape(p, s))) return 'water';
  if (h.bunkers.some((s) => inShape(p, s))) return 'bunker';
  if (inEllipse(p, h.green)) return 'green';
  if (inEllipse(p, h.green, FRINGE_WIDTH)) return 'fringe';
  if (Math.abs(p.x) <= 5 && p.y >= -5 && p.y <= 5) return 'tee';
  if (h.fairways.some((s) => inShape(p, s))) return 'fairway';
  return 'rough';
}

/** Official yardage: along the centerline to the pin's projection. */
export function holeYardage(h: HoleDef): number {
  return Math.round(projectOnPolyline(h.pin, h.centerline).along + 0.5);
}

export function coursePar(c: CourseDef) {
  return c.holes.reduce((s, h) => s + h.par, 0);
}

/** Deterministic tree lines along both edges of the corridor. */
export function treeLines(
  centerline: Vec2[],
  offset: number,
  opts: { seed: number; spacing?: number; from?: number; to?: number; sides?: ('L' | 'R')[]; kinds?: TreeKind[]; jitter?: number },
): TreeDef[] {
  const r = rng(opts.seed);
  const out: TreeDef[] = [];
  const L = polylineLength(centerline);
  const spacing = opts.spacing ?? 26;
  const kinds = opts.kinds ?? ['palm', 'eucalyptus', 'pine'];
  for (const side of opts.sides ?? ['L', 'R']) {
    for (let a = opts.from ?? 20; a <= Math.min(L, opts.to ?? L); a += spacing * r.range(0.75, 1.3)) {
      // position along the line
      let acc = 0;
      for (let i = 0; i < centerline.length - 1; i++) {
        const seg = sub(centerline[i + 1], centerline[i]);
        const sl = Math.hypot(seg.x, seg.y);
        if (acc + sl >= a) {
          const t = (a - acc) / sl;
          const base = add(centerline[i], scale(seg, t));
          const d = norm(seg);
          const n = { x: -d.y, y: d.x };
          const o = (side === 'L' ? 1 : -1) * (offset + r.range(-(opts.jitter ?? 4), opts.jitter ?? 4));
          const kind = kinds[r.int(0, kinds.length - 1)];
          const p = add(base, scale(n, -o)); // L = -x side
          out.push(makeTree(p.x, p.y, kind, r.range(0.85, 1.2)));
          break;
        }
        acc += sl;
      }
    }
  }
  return out;
}

export function makeTree(x: number, y: number, kind: TreeKind, k = 1): TreeDef {
  if (kind === 'palm') return { x, y, kind, r: 3.2 * k, h: 15 * k };
  if (kind === 'eucalyptus') return { x, y, kind, r: 5.5 * k, h: 13 * k };
  return { x, y, kind, r: 4 * k, h: 11 * k };
}
