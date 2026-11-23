/**
 * Course scenery alpha layer (opt-in, decorative only).
 *
 * A second, separate scenery layer drawn with the round's existing camera
 * projection, from the "course sprites alpha" pack (cleaned: the light-grey
 * checkerboard fringe was peeled off every outline, see tools/clean_course_sprites.py).
 *
 * Rules:
 * - Visual only. Nothing here is read by physics, lies, terrain, collisions,
 *   scoring, the minimap or the save. Physics trees stay HoleDef.trees (and
 *   their existing art in scenery.ts).
 * - Placed only on rough or out of bounds, well clear of fairways, greens,
 *   fringes, bunkers, water and the tee, and clear of the existing trees.
 * - Deterministic per course + hole (the seed never changes with redraws,
 *   reloads or shots; the pin moving between rounds doesn't move it either).
 * - The bunker, pond, bridge and flagstick sprites are not used: hazards come
 *   from the authoritative terrain and the existing flag stays the only flag.
 * - Opt-in: only holes listed in ENABLED get the layer (one test hole for now).
 */
import { corridorLine, shapePolygon, surfaceAt, type HoleDef } from '../golf/course';
import { distToPolyline, hashString, inEllipse, norm, pointAlongPolyline, polylineLength, rng, sub, type Vec2 } from '../golf/math';
import pine from '../assets/course_alpha/pine_tree.png';
import oak from '../assets/course_alpha/oak_tree.png';
import palm from '../assets/course_alpha/palm_tree.png';
import cypress from '../assets/course_alpha/cypress_tree.png';
import shrub from '../assets/course_alpha/pink_flowering_shrub.png';
import flowerbed from '../assets/course_alpha/purple_flowerbed.png';
import reeds from '../assets/course_alpha/pond_reeds.png';
import rocks from '../assets/course_alpha/rock_cluster.png';
import sign from '../assets/course_alpha/wooden_course_sign.png';
import bench from '../assets/course_alpha/course_bench.png';
import cart from '../assets/course_alpha/golf_cart.png';
import cactus from '../assets/course_alpha/desert_cactus.png';

/** Accepted sprites: texture url, pixel size, and real-world height in yards (bottom-centre anchor). */
export const ALPHA_SPRITES = {
  pine_tree: { url: pine, w: 216, h: 300, yards: 12 },
  oak_tree: { url: oak, w: 297, h: 283, yards: 10.5 },
  palm_tree: { url: palm, w: 246, h: 299, yards: 13 },
  cypress_tree: { url: cypress, w: 172, h: 300, yards: 11 },
  pink_flowering_shrub: { url: shrub, w: 272, h: 212, yards: 1.6 },
  purple_flowerbed: { url: flowerbed, w: 286, h: 163, yards: 0.8 },
  pond_reeds: { url: reeds, w: 266, h: 262, yards: 1.7 },
  rock_cluster: { url: rocks, w: 288, h: 145, yards: 1.1 },
  wooden_course_sign: { url: sign, w: 295, h: 223, yards: 1.9 },
  course_bench: { url: bench, w: 291, h: 165, yards: 1.0 },
  golf_cart: { url: cart, w: 297, h: 243, yards: 2.0 },
  desert_cactus: { url: cactus, w: 259, h: 272, yards: 3.2 },
} as const;
export type AlphaSpriteId = keyof typeof ALPHA_SPRITES;

/** Pack sprites deliberately not used on the course (see the header). */
export const ALPHA_REJECTED = ['sand_bunker_decorative', 'lily_pond_decorative', 'wooden_bridge', 'red_flagstick'] as const;

/** Holes with the layer switched on: `${courseId}:${holeNumber}`. */
export const ENABLED = new Set<string>(['course_dry_creek_muni:2']);
export const alphaSceneryOn = (courseId: string | undefined, hole: HoleDef) => !!courseId && ENABLED.has(`${courseId}:${hole.number}`);

export interface AlphaProp {
  id: AlphaSpriteId;
  x: number;
  y: number;
  /** Height in yards (the sprite's yards, varied a little per prop). */
  h: number;
}

/** Closest a scenery prop may be to the camera before it is skipped (no giant foreground objects). */
export const ALPHA_NEAR_YARDS = 14;

/** Where nothing decorative may stand: playable surfaces, plus a margin around them. */
function clearOfPlay(h: HoleDef, p: Vec2, margin: number): boolean {
  const s = surfaceAt(h, p);
  if (s !== 'rough' && s !== 'ob') return false;
  if (inEllipse(p, h.green, 6 + margin)) return false;
  if (Math.abs(p.x) <= 8 + margin && p.y >= -8 && p.y <= 8 + margin) return false; // tee box
  for (const w of h.water) {
    const poly = shapePolygon(w);
    if (poly.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 1.2)) return false;
  }
  return true;
}

/** The decorative props for a hole (empty unless the hole is enabled). Deterministic. */
export function buildAlphaScenery(h: HoleDef, courseId: string | undefined): AlphaProp[] {
  if (!alphaSceneryOn(courseId, h)) return [];
  const r = rng(hashString(`alpha-scenery-${courseId}-${h.number}`));
  const out: AlphaProp[] = [];
  const add = (id: AlphaSpriteId, p: Vec2, k = 1) => out.push({ id, x: p.x, y: p.y, h: ALPHA_SPRITES[id].yards * k });
  const cl = corridorLine(h);
  const L = polylineLength(cl);
  const at = (a: number, off: number): Vec2 => {
    const p = pointAlongPolyline(cl, Math.max(0, Math.min(L, a)));
    const q = pointAlongPolyline(cl, Math.min(L, a + 1));
    const d = norm(sub(q, p));
    return { x: p.x + d.y * off, y: p.y - d.x * off };
  };
  const nearTree = (p: Vec2, gap: number) => h.trees.some((t) => Math.hypot(t.x - p.x, t.y - p.y) < t.r + gap);

  // 1. A back line of trees out of bounds on both sides (well past the corridor edge).
  const trees: AlphaSpriteId[] = ['pine_tree', 'cypress_tree', 'oak_tree', 'pine_tree', 'palm_tree'];
  for (const side of [-1, 1]) {
    for (let a = 20; a < L + 30; a += r.range(24, 38)) {
      const p = at(a, side * (h.corridorHalfWidth + r.range(14, 26)));
      if (!clearOfPlay(h, p, 4) || nearTree(p, 6)) continue;
      add(trees[Math.floor(r.range(0, trees.length))], p, r.range(0.85, 1.15));
    }
  }

  // 2. Beyond the green: a few trees and a flowering shrub framing it from behind.
  const end = cl[cl.length - 1];
  const dir = norm(sub(end, cl[cl.length - 2]));
  const backDist = Math.max(h.green.rx, h.green.ry) + 26;
  for (const [lat, id, k] of [[-14, 'oak_tree', 1], [0, 'cypress_tree', 1.05], [15, 'pine_tree', 0.95]] as const) {
    const p = { x: h.green.x + dir.x * (backDist + Math.abs(lat) * 0.3) - dir.y * lat, y: h.green.y + dir.y * (backDist + Math.abs(lat) * 0.3) + dir.x * lat };
    if (clearOfPlay(h, p, 4) && !nearTree(p, 5)) add(id, p, k);
  }
  const sh = { x: h.green.x + dir.x * (Math.max(h.green.rx, h.green.ry) + 12) + dir.y * 9, y: h.green.y + dir.y * (Math.max(h.green.rx, h.green.ry) + 12) - dir.x * 9 };
  if (clearOfPlay(h, sh, 2)) add('pink_flowering_shrub', sh);

  // 3. Around the tee: the course sign, a cart on the path and a flower bed, all off the tee box.
  for (const [id, p] of [
    ['wooden_course_sign', { x: -15, y: 14 }],
    ['golf_cart', { x: 19, y: 16 }],
    ['purple_flowerbed', { x: -12, y: 22 }],
    ['course_bench', { x: 16, y: 26 }],
  ] as const) {
    if (clearOfPlay(h, p, 0)) add(id, p);
  }

  // 4. Water banks: reeds and rocks just outside the authoritative water shape (never on it).
  for (const w of h.water) {
    const poly = shapePolygon(w);
    const c = poly.reduce((s, q) => ({ x: s.x + q.x / poly.length, y: s.y + q.y / poly.length }), { x: 0, y: 0 });
    for (let k = 0; k < 5; k++) {
      const q = poly[Math.floor(r.range(0, poly.length))];
      const o = norm(sub(q, c));
      const p = { x: q.x + o.x * 2.4, y: q.y + o.y * 2.4 };
      if (clearOfPlay(h, p, 0)) add(k % 3 === 2 ? 'rock_cluster' : 'pond_reeds', p, r.range(0.85, 1.1));
    }
  }

  // 5. A few shrubs and rocks along the out-of-bounds line.
  for (const side of [-1, 1]) {
    for (let a = 40; a < L; a += r.range(45, 70)) {
      const p = at(a, side * (h.corridorHalfWidth + r.range(3, 8)));
      if (clearOfPlay(h, p, 2) && !nearTree(p, 3)) add(r.next() < 0.6 ? 'pink_flowering_shrub' : 'rock_cluster', p, r.range(0.85, 1.15));
    }
  }
  // Keep props apart from each other (no stacking).
  const kept: AlphaProp[] = [];
  for (const p of out) if (!kept.some((k) => Math.hypot(k.x - p.x, k.y - p.y) < 3)) kept.push(p);
  return kept;
}

/** Out-of-play distance check used by tests: how far a prop is from the in-bounds corridor centreline. */
export const corridorDistance = (h: HoleDef, p: Vec2) => distToPolyline(p, corridorLine(h));
