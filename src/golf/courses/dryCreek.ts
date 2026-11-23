/**
 * Dry Creek Muni — an original 9-hole Southern California municipal course.
 * Par 35. Palms, eucalyptus, a sandy dry-creek wash, a reservoir and a canal.
 */
import { inShape, makeTree, surfaceAt, treeLines, type CourseDef, type HoleDef } from '../course';

const e = (x: number, y: number, rx: number, ry: number, rot = 0) => ({ type: 'ellipse' as const, x, y, rx, ry, rot });
const strip = (pts: [number, number][], hw: number) => ({ type: 'strip' as const, pts: pts.map(([x, y]) => ({ x, y })), hw });
const poly = (pts: [number, number][]) => ({ type: 'poly' as const, pts: pts.map(([x, y]) => ({ x, y })) });
const line = (pts: [number, number][]) => pts.map(([x, y]) => ({ x, y }));

const h1c = line([[0, 0], [0, 235], [28, 360]]);
const h2c = line([[0, 0], [-8, 165]]);
const h3c = line([[0, 0], [-18, 255], [-12, 405], [24, 518]]);
const h4c = line([[0, 0], [0, 412]]);
const h5c = line([[0, 0], [4, 138]]);
const h6c = line([[0, 0], [0, 195], [-62, 322]]);
const h7c = line([[0, 0], [-6, 250], [0, 396]]);
const h8c = line([[0, 0], [12, 192]]);
const h9c = line([[0, 0], [24, 250], [-8, 420], [0, 506]]);

const LAYOUT: CourseDef = {
  id: 'course_dry_creek_muni',
  name: 'Dry Creek Muni',
  location: 'Southern California',
  blurb: 'Your home muni. Palms, a dry wash, a reservoir and a canal.',
  difficulty: 0,
  theme: { backdrops: ['mountains', 'mountains', 'mountains', 'city', 'city', 'coast', 'coast', 'mountains', 'city'] },
  holes: [
    {
      number: 1, par: 4, name: 'Opening Day',
      centerline: h1c, corridorHalfWidth: 46,
      pin: { x: 33, y: 365 },
      green: { x: 30, y: 362, rx: 14, ry: 12, rot: 0.3 },
      greenSlope: { x: 0.18, y: -0.22 },
      fairways: [strip([[0, 40], [0, 235], [22, 335]], 17)],
      bunkers: [e(-20, 245, 7, 5), e(48, 352, 6, 4.5, 0.5), e(16, 380, 8, 3.5)],
      water: [],
      trees: [...treeLines(h1c, 38, { seed: 101 }), makeTree(31, 238, 'eucalyptus', 1.2)],
    },
    {
      number: 2, par: 3, name: 'Duck Pond',
      centerline: h2c, corridorHalfWidth: 42,
      pin: { x: -5, y: 170 },
      green: { x: -8, y: 166, rx: 13, ry: 11 },
      greenSlope: { x: -0.26, y: 0.08 },
      fairways: [strip([[-4, 110], [-7, 148]], 9)],
      bunkers: [e(8, 177, 6, 4), e(-24, 170, 4, 7)],
      water: [e(-22, 128, 20, 14, 0.2)],
      trees: treeLines(h2c, 36, { seed: 202, spacing: 22 }),
    },
    {
      number: 3, par: 5, name: 'The Wash',
      centerline: h3c, corridorHalfWidth: 50,
      pin: { x: 22, y: 524 },
      green: { x: 25, y: 520, rx: 15, ry: 12, rot: 0.3 },
      greenSlope: { x: 0.2, y: 0.14 },
      fairways: [strip([[-2, 40], [-18, 255], [-15, 290]], 19), strip([[-11, 330], [-12, 405], [18, 500]], 17)],
      bunkers: [strip([[-70, 305], [-15, 312], [40, 300]], 8), e(44, 512, 6, 4), e(8, 537, 7, 3.5, 0.2)],
      water: [],
      trees: treeLines(h3c, 42, { seed: 303 }),
    },
    {
      number: 4, par: 4, name: 'Palm Alley',
      centerline: h4c, corridorHalfWidth: 40,
      pin: { x: -4, y: 418 },
      green: { x: 0, y: 414, rx: 14, ry: 12 },
      greenSlope: { x: 0, y: -0.3 },
      fairways: [strip([[0, 45], [0, 392]], 18)],
      bunkers: [e(-24, 262, 7, 5), e(23, 278, 7, 5), e(-17, 408, 5, 6), e(17, 421, 5, 6)],
      water: [],
      trees: treeLines(h4c, 31, { seed: 404, spacing: 18, kinds: ['palm'], jitter: 1 }),
    },
    {
      number: 5, par: 3, name: 'Over the Reservoir',
      centerline: h5c, corridorHalfWidth: 42,
      pin: { x: 8, y: 142 },
      green: { x: 5, y: 140, rx: 12, ry: 10 },
      greenSlope: { x: 0.3, y: 0 },
      fairways: [strip([[3, 114], [4, 125]], 9)],
      bunkers: [e(-12, 146, 5, 6), e(20, 132, 4, 5)],
      water: [poly([[-45, 38], [45, 32], [48, 108], [-42, 112]])],
      trees: treeLines(h5c, 36, { seed: 505, from: 110, spacing: 20 }),
    },
    {
      number: 6, par: 4, name: 'Dogleg Left',
      centerline: h6c, corridorHalfWidth: 46,
      pin: { x: -62, y: 330 },
      green: { x: -64, y: 326, rx: 13, ry: 11, rot: -0.4 },
      greenSlope: { x: -0.12, y: 0.24 },
      fairways: [strip([[0, 40], [0, 195], [-50, 300]], 17)],
      bunkers: [e(-26, 215, 8, 5), e(-80, 316, 5, 7)],
      water: [],
      trees: [
        ...treeLines(h6c, 38, { seed: 606 }),
        makeTree(-30, 170, 'eucalyptus', 1.2),
        makeTree(-38, 186, 'pine', 1.1),
        makeTree(-23, 182, 'palm'),
        makeTree(-45, 202, 'eucalyptus'),
      ],
    },
    {
      number: 7, par: 4, name: 'The Canal',
      centerline: h7c, corridorHalfWidth: 46,
      pin: { x: 5, y: 402 },
      green: { x: 2, y: 399, rx: 14, ry: 12 },
      greenSlope: { x: 0.25, y: -0.1 },
      fairways: [strip([[0, 40], [-6, 250], [-2, 380]], 17)],
      bunkers: [e(-22, 270, 6, 5), e(-15, 397, 4, 6)],
      water: [strip([[40, 140], [36, 260], [30, 390], [34, 430]], 9)],
      trees: treeLines(h7c, 38, { seed: 707, sides: ['L'] }),
    },
    {
      number: 8, par: 3, name: 'Long Iron',
      centerline: h8c, corridorHalfWidth: 42,
      pin: { x: 16, y: 190 },
      green: { x: 12, y: 194, rx: 14, ry: 12 },
      greenSlope: { x: -0.2, y: -0.2 },
      fairways: [strip([[6, 120], [11, 174]], 12)],
      bunkers: [e(-5, 192, 5, 8), e(30, 198, 5, 7), e(12, 212, 9, 3.5), e(3, 176, 6, 3)],
      water: [],
      trees: treeLines(h8c, 36, { seed: 808, spacing: 22 }),
    },
    {
      number: 9, par: 5, name: 'Home Stretch',
      centerline: h9c, corridorHalfWidth: 50,
      pin: { x: -4, y: 512 },
      green: { x: 0, y: 508, rx: 15, ry: 12 },
      greenSlope: { x: 0.1, y: 0.28 },
      fairways: [strip([[2, 40], [24, 250], [-6, 405]], 18), strip([[-7, 440], [-3, 488]], 10)],
      bunkers: [e(2, 262, 7, 5), e(-20, 515, 5, 6), e(16, 522, 6, 4)],
      water: [e(22, 468, 20, 11)],
      trees: treeLines(h9c, 42, { seed: 909 }),
    },
  ] satisfies HoleDef[],
};


/** No tree may stand in a pond, a bunker or on a green. */
export const DRY_CREEK_MUNI: CourseDef = {
  ...LAYOUT,
  holes: LAYOUT.holes.map((h) => ({
    ...h,
    trees: h.trees.filter((t) => !h.water.some((w) => inShape(t, w)) && !['bunker', 'green'].includes(surfaceAt(h, t))),
  })),
};
