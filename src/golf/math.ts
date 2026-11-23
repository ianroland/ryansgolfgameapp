/** Small geometry + RNG helpers for the golf simulation (units: yards). */

export interface Vec2 {
  x: number;
  y: number;
}

export const v2 = (x: number, y: number): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, k: number): Vec2 => ({ x: a.x * k, y: a.y * k });
export const dot = (a: Vec2, b: Vec2) => a.x * b.x + a.y * b.y;
export const len = (a: Vec2) => Math.hypot(a.x, a.y);
export const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);
export const norm = (a: Vec2): Vec2 => {
  const l = len(a) || 1;
  return { x: a.x / l, y: a.y / l };
};
/** Heading convention: 0 = +y (down the hole), positive = clockwise toward +x. */
export const dirFromHeading = (h: number): Vec2 => ({ x: Math.sin(h), y: Math.cos(h) });
export const headingTo = (from: Vec2, to: Vec2) => Math.atan2(to.x - from.x, to.y - from.y);
/** Right-hand perpendicular of a heading direction. */
export const rightOf = (d: Vec2): Vec2 => ({ x: d.y, y: -d.x });
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const DEG = Math.PI / 180;

export function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const ab = sub(b, a);
  const t = clamp(dot(sub(p, a), ab) / (dot(ab, ab) || 1), 0, 1);
  return dist(p, add(a, scale(ab, t)));
}

export function distToPolyline(p: Vec2, pts: Vec2[]): number {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) best = Math.min(best, distToSegment(p, pts[i], pts[i + 1]));
  return pts.length === 1 ? dist(p, pts[0]) : best;
}

/** Closest point on polyline and its arc-length position. */
export function projectOnPolyline(p: Vec2, pts: Vec2[]): { point: Vec2; along: number } {
  let best = { point: pts[0], along: 0, d: Infinity };
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const ab = sub(pts[i + 1], a);
    const L = len(ab);
    const t = clamp(dot(sub(p, a), ab) / (L * L || 1), 0, 1);
    const q = add(a, scale(ab, t));
    const d = dist(p, q);
    if (d < best.d) best = { point: q, along: acc + t * L, d };
    acc += L;
  }
  return { point: best.point, along: best.along };
}

export function pointAlongPolyline(pts: Vec2[], along: number): Vec2 {
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const L = dist(pts[i], pts[i + 1]);
    if (acc + L >= along) return add(pts[i], scale(sub(pts[i + 1], pts[i]), (along - acc) / (L || 1)));
    acc += L;
  }
  return pts[pts.length - 1];
}

export function polylineLength(pts: Vec2[]) {
  let L = 0;
  for (let i = 0; i < pts.length - 1; i++) L += dist(pts[i], pts[i + 1]);
  return L;
}

/** Polygon outline of a polyline buffered by halfWidth (with rounded ends). */
export function stripPolygon(pts: Vec2[], halfWidth: number, capSegments = 6): Vec2[] {
  const left: Vec2[] = [];
  const right: Vec2[] = [];
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    const d = norm(sub(next, prev));
    const n = { x: -d.y, y: d.x };
    left.push(add(pts[i], scale(n, halfWidth)));
    right.push(add(pts[i], scale(n, -halfWidth)));
  }
  const cap = (center: Vec2, from: Vec2, sign: number) => {
    const out: Vec2[] = [];
    const a0 = Math.atan2(from.y - center.y, from.x - center.x);
    for (let k = 1; k < capSegments; k++) {
      const a = a0 + (sign * Math.PI * k) / capSegments;
      out.push({ x: center.x + Math.cos(a) * halfWidth, y: center.y + Math.sin(a) * halfWidth });
    }
    return out;
  };
  const endCap = cap(pts[pts.length - 1], left[left.length - 1], -1);
  const startCap = cap(pts[0], right[0], -1);
  return [...left, ...endCap, ...right.reverse(), ...startCap];
}

export interface Ellipse {
  x: number;
  y: number;
  rx: number;
  ry: number;
  /** radians */
  rot?: number;
}

export function inEllipse(p: Vec2, e: Ellipse, grow = 0): boolean {
  const c = Math.cos(-(e.rot ?? 0));
  const s = Math.sin(-(e.rot ?? 0));
  const dx = p.x - e.x;
  const dy = p.y - e.y;
  const lx = dx * c - dy * s;
  const ly = dx * s + dy * c;
  return (lx * lx) / ((e.rx + grow) ** 2) + (ly * ly) / ((e.ry + grow) ** 2) <= 1;
}

export function ellipsePolygon(e: Ellipse, grow = 0, n = 28): Vec2[] {
  const c = Math.cos(e.rot ?? 0);
  const s = Math.sin(e.rot ?? 0);
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const lx = Math.cos(a) * (e.rx + grow);
    const ly = Math.sin(a) * (e.ry + grow);
    return { x: e.x + lx * c - ly * s, y: e.y + lx * s + ly * c };
  });
}

export function inPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number) {
  let t = seed >>> 0;
  const next = () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (lo: number, hi: number) => lo + (hi - lo) * next(),
    /** Approximately normal (mean 0, sd 1). */
    gauss: () => {
      let s = 0;
      for (let i = 0; i < 6; i++) s += next();
      return (s - 3) / Math.sqrt(0.5);
    },
    int: (lo: number, hi: number) => Math.floor(lo + (hi - lo + 1) * next()),
  };
}
export type Rng = ReturnType<typeof rng>;

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
