/**
 * Course scenery from the course art kit: billboard sprites (trees, bushes,
 * rocks, flags, tee markers, yardage signs, furniture) placed per hole, plus
 * the backdrop panoramas. Purely visual — collisions come from HoleDef.trees.
 */
import * as Phaser from 'phaser';
import courseAtlasUrl from '../assets/course_atlas.png';
import courseMeta from '../assets/course_atlas.json';
import backdropCoast from '../assets/backdrop_coast.png';
import backdropCity from '../assets/backdrop_city.png';
import backdropMountains from '../assets/backdrop_mountains.png';
import tileFairway from '../assets/tiles/fairway.png';
import tileRough from '../assets/tiles/rough.png';
import tileDeep from '../assets/tiles/deep.png';
import tileGreen from '../assets/tiles/green.png';
import tileRough2 from '../assets/tiles/rough2.png';
import tileSand from '../assets/tiles/sand.png';
import tileWater from '../assets/tiles/water.png';
import { corridorLine, holeYardage, shapePolygon, surfaceAt, type HoleDef } from '../golf/course';
import { hashString, norm, pointAlongPolyline, polylineLength, projectOnPolyline, rng, sub, type Vec2 } from '../golf/math';

interface KitFrame {
  x: number;
  y: number;
  w: number;
  h: number;
  ax: number;
  ay: number;
}
const KIT = courseMeta as unknown as { frames: Record<string, KitFrame> };

export type Backdrop = 'coast' | 'city' | 'mountains';

export function preloadCourseArt(scene: Phaser.Scene) {
  scene.load.image('course', courseAtlasUrl);
  scene.load.image('backdrop_coast', backdropCoast);
  scene.load.image('backdrop_city', backdropCity);
  scene.load.image('backdrop_mountains', backdropMountains);
  const tiles: Record<string, string> = { fairway: tileFairway, rough: tileRough, deep: tileDeep, green: tileGreen, rough2: tileRough2, sand: tileSand, water: tileWater };
  for (const [k, url] of Object.entries(tiles)) scene.load.image(`tile_${k}`, url);
}

export function registerCourseFrames(scene: Phaser.Scene) {
  const tex = scene.textures.get('course');
  for (const [name, f] of Object.entries(KIT.frames)) tex.add(name, 0, f.x, f.y, f.w, f.h);
  // The flagstick without its little stand (rows 104+ of flag_red), so the pole goes into the hole.
  const fl = KIT.frames.flag_red;
  tex.add('flag_pole', 0, fl.x, fl.y, fl.w, FLAG_POLE_H);
  for (const k of ['course', 'backdrop_coast', 'backdrop_city', 'backdrop_mountains']) {
    scene.textures.get(k).setFilter(Phaser.Textures.FilterMode.NEAREST);
  }
}

export interface Decor {
  key: string;
  x: number;
  y: number;
  /** On-course height in yards. */
  h: number;
  /** Ground shadow radius (yards), 0 for none. */
  shadow: number;
}

const PALMS = ['palm_0', 'palm_1', 'palm_2', 'palm_3', 'palm_double'];
const OAKS = ['oak_0', 'oak_1', 'oak_2', 'oak_3'];
const PINES = ['pine_0', 'pine_1', 'pine_2', 'pine_3'];
const BUSHES = ['bush_0', 'bush_1', 'bush_2', 'bush_3', 'bush_4'];
const GROUND = ['flower_0', 'flower_1', 'grass_0', 'grass_1'];
const ROCKS = ['rock_0', 'rock_1', 'rock_2'];

export function buildDecor(h: HoleDef): Decor[] {
  const r = rng(hashString(`decor-${h.number}`));
  const pick = <T,>(arr: T[], seed: number) => arr[Math.abs(seed) % arr.length];
  const out: Decor[] = [];

  // Trees (these match the physics trees one-to-one).
  for (const t of h.trees) {
    const seed = Math.round(t.x * 7 + t.y * 13);
    const key = t.kind === 'palm' ? pick(PALMS, seed) : t.kind === 'eucalyptus' ? pick(OAKS, seed) : pick(PINES, seed);
    out.push({ key, x: t.x, y: t.y, h: t.h, shadow: t.r * 0.9 });
  }

  // Tee box: markers and furniture.
  out.push({ key: 'ball_red', x: -4.2, y: 2.5, h: 0.32, shadow: 0.25 });
  out.push({ key: 'ball_red', x: 4.2, y: 2.5, h: 0.32, shadow: 0.25 });
  out.push({ key: 'bench', x: -9.5, y: -5, h: 0.95, shadow: 0.9 });
  out.push({ key: 'cooler', x: -12.5, y: -2.5, h: 1.1, shadow: 0.35 });
  out.push({ key: 'trash', x: 9, y: -5.5, h: 0.95, shadow: 0.35 });
  out.push({ key: pick(BUSHES, h.number), x: -8, y: -11, h: 1.2, shadow: 0 });
  out.push({ key: pick(BUSHES, h.number + 2), x: 8.5, y: -12, h: 1.1, shadow: 0 });
  out.push({ key: pick(GROUND, h.number), x: -7, y: 7, h: 0.6, shadow: 0 });
  out.push({ key: pick(GROUND, h.number + 1), x: 7.5, y: 8, h: 0.6, shadow: 0 });

  // Yardage signs (distance to the pin), in the right rough.
  const pinAlong = projectOnPolyline(h.pin, h.centerline).along;
  for (const [dYds, key] of [[200, 'yard_200'], [150, 'yard_150'], [100, 'yard_100']] as const) {
    const a = pinAlong - dYds;
    if (a < 60 || dYds > holeYardage(h) - 40) continue;
    const p = pointAlongPolyline(h.centerline, a);
    const q = pointAlongPolyline(h.centerline, Math.min(polylineLength(h.centerline), a + 1));
    const d = norm(sub(q, p));
    const off = 22;
    out.push({ key, x: p.x + d.y * off, y: p.y - d.x * off, h: 0.42, shadow: 0 });
  }

  // Rocks around water.
  for (const w of h.water) {
    const poly = shapePolygon(w);
    const c = poly.reduce((s, p) => ({ x: s.x + p.x / poly.length, y: s.y + p.y / poly.length }), { x: 0, y: 0 });
    for (let k = 0; k < 3; k++) {
      const p = poly[Math.floor(r.range(0, poly.length))];
      const out2 = norm(sub(p, c));
      out.push({ key: pick(ROCKS, k + h.number), x: p.x + out2.x * 1.8, y: p.y + out2.y * 1.8, h: r.range(0.6, 1.0), shadow: 0 });
    }
  }

  // Shrubs and flowers along the corridor edges, between the trees.
  const L = polylineLength(h.centerline);
  for (const side of [-1, 1]) {
    for (let a = 30; a < L; a += r.range(28, 46)) {
      const p = pointAlongPolyline(h.centerline, a);
      const q = pointAlongPolyline(h.centerline, Math.min(L, a + 1));
      const d = norm(sub(q, p));
      const off = side * (h.corridorHalfWidth - r.range(3, 9));
      const pos: Vec2 = { x: p.x + d.y * off, y: p.y - d.x * off };
      const isBush = r.next() < 0.6;
      out.push({ key: isBush ? pick(BUSHES, Math.floor(a)) : pick(GROUND, Math.floor(a)), x: pos.x, y: pos.y, h: isBush ? r.range(1, 1.6) : 0.6, shadow: 0 });
    }
  }

  // Behind the green (past the end of the hole, along its last direction).
  const cl = corridorLine(h);
  const end = cl[cl.length - 1];
  const dirEnd = norm(sub(end, cl[cl.length - 2]));
  const back = { x: h.green.x + dirEnd.x * (Math.max(h.green.rx, h.green.ry) + 10), y: h.green.y + dirEnd.y * (Math.max(h.green.rx, h.green.ry) + 10) };
  out.push({ key: pick(BUSHES, h.number + 3), x: back.x - dirEnd.y * 6, y: back.y + dirEnd.x * 6, h: 1.5, shadow: 0 });
  out.push({ key: pick(GROUND, h.number + 2), x: back.x + dirEnd.y * 5, y: back.y - dirEnd.x * 5, h: 0.7, shadow: 0 });

  // Shrubs, flowers and rocks only on rough (never on fairways, greens, sand or water).
  const plant = new Set([...BUSHES, ...GROUND, ...ROCKS]);
  return out.filter((d) => !plant.has(d.key) || ['rough', 'ob'].includes(surfaceAt(h, d)));
}

export const BACKDROP_FOR_HOLE: Backdrop[] = ['mountains', 'mountains', 'mountains', 'city', 'city', 'coast', 'coast', 'mountains', 'city'];

/** Rows of flag_red above its stand. */
export const FLAG_POLE_H = 104;

export function kitFrame(key: string): KitFrame {
  if (key === 'flag_pole') return { ...KIT.frames.flag_red, h: FLAG_POLE_H, ay: FLAG_POLE_H };
  return KIT.frames[key];
}

/** Depth for a world object at distance d (nearer draws on top). */
export const depthFor = (d: number) => 10 + 1000 / (d + 1);
