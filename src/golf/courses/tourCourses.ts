/**
 * The tour's other venues: five original 9-hole courses, each with its own
 * character, scenery and difficulty. Built from compact specs (see build.ts).
 */
import type { CourseDef } from '../course';
import { buildHole, type HoleSpec } from './build';

const course = (c: Omit<CourseDef, 'holes'> & { specs: HoleSpec[] }): CourseDef => {
  const { specs, ...rest } = c;
  return { ...rest, holes: specs.map((s, i) => buildHole(i + 1, s)) };
};

/** Seaside links: wide, windswept, pot bunkers, the Pacific down one side. */
export const PACIFIC_BLUFFS: CourseDef = course({
  id: 'course_pacific_bluffs',
  name: 'Pacific Bluffs Links',
  location: 'Central Coast, California',
  blurb: 'Clifftop links. Firm fescue, pot bunkers and the ocean all day.',
  difficulty: 0.5,
  windiness: 1.45,
  theme: {
    backdrops: ['coast'],
    sky: 0xe6edf2,
    haze: [168, 190, 172],
    grade: { rough: [196, 180, 104, 0.6], deep: [176, 160, 98, 0.65], fairway: [140, 186, 86, 0.18] },
  },
  specs: [
    {
      par: 4, name: 'Sea Breeze', path: [[0, 180], [-14, 368]], width: 50, slope: [0.16, -0.18],
      bunkers: [{ at: 232, off: 16, rx: 5, ry: 4 }, { at: 248, off: -21, rx: 5, ry: 4 }, { g: 150, rx: 5, ry: 4 }, { g: -120, rx: 4, ry: 5 }],
      water: [{ side: 1, from: 120, to: 390, off: 54, hw: 12 }],
      trees: { kinds: ['pine'], seed: 1101, spacing: 60, sides: ['L'] },
    },
    {
      par: 4, name: 'Fescue Ridge', path: [[10, 200], [30, 334]], width: 48, fairway: 15, slope: [-0.2, 0.1],
      bunkers: [{ at: 214, off: 0, rx: 5, ry: 4 }, { at: 268, off: -18, rx: 6, ry: 4 }, { g: 170, rx: 6, ry: 3.5 }, { g: 70, rx: 4, ry: 5 }],
      trees: null,
    },
    {
      par: 3, name: 'Cliffside', path: [[6, 162]], width: 46, green: [13, 11], slope: [0.22, 0],
      water: [{ cross: [28, 118] }],
      bunkers: [{ g: -80, rx: 4, ry: 6 }, { g: 30, rx: 5, ry: 4 }],
      trees: null,
    },
    {
      par: 5, name: 'Long Shore', path: [[0, 240], [30, 400], [20, 514]], width: 50, slope: [0.12, 0.2],
      bunkers: [{ at: 262, off: 19, rx: 6, ry: 5 }, { at: 440, off: -6, rx: 4, ry: 4 }, { at: 452, off: 12, rx: 4, ry: 4 }, { g: 120, rx: 5, ry: 4 }],
      water: [{ side: -1, from: 290, to: 520, off: 52, hw: 12 }],
      trees: { kinds: ['pine'], seed: 1104, spacing: 55, sides: ['R'] },
    },
    {
      par: 4, name: 'The Dunes', path: [[-20, 220], [-10, 392]], width: 48, slope: [-0.14, -0.22],
      bunkers: [
        { at: 205, off: 20, rx: 6, ry: 5 }, { at: 226, off: -10, rx: 4, ry: 4 }, { at: 300, off: 22, rx: 7, ry: 5 },
        { g: 160, rx: 5, ry: 4 }, { g: -160, rx: 5, ry: 4 }, { g: 90, rx: 4, ry: 6 },
      ],
      trees: null,
    },
    {
      par: 3, name: 'Postage Stamp', path: [[0, 134]], width: 40, green: [10, 9], slope: [0, -0.3],
      bunkers: [{ g: 180, rx: 6, ry: 3, gap: 2 }, { g: 90, rx: 3.5, ry: 5 }, { g: -90, rx: 3.5, ry: 5 }, { g: 0, rx: 6, ry: 3 }],
      trees: null,
    },
    {
      par: 4, name: "Gull's Point", path: [[0, 228], [72, 376]], width: 50, slope: [0.2, 0.12],
      water: [{ at: 300, off: 48, rx: 18, ry: 32 }],
      bunkers: [{ at: 236, off: -22, rx: 6, ry: 5 }, { g: -100, rx: 4, ry: 6 }, { g: 160, rx: 5, ry: 3.5 }],
      trees: { kinds: ['pine'], seed: 1107, spacing: 50, sides: ['L'] },
    },
    {
      par: 5, name: 'Headland', path: [[-10, 258], [-40, 420], [-30, 498]], width: 50, slope: [-0.18, 0.16],
      bunkers: [{ cross: [298, 312] }, { at: 250, off: 20, rx: 6, ry: 5 }, { g: 140, rx: 5, ry: 4 }, { g: -140, rx: 5, ry: 4 }],
      water: [{ side: 1, from: 330, to: 505, off: 54, hw: 12 }],
      trees: null,
    },
    {
      par: 4, name: 'Lighthouse', path: [[0, 418]], width: 48, slope: [0.1, -0.24],
      bunkers: [{ at: 238, off: -20, rx: 7, ry: 5 }, { at: 262, off: 16, rx: 5, ry: 4 }, { g: 160, rx: 6, ry: 4 }, { g: -110, rx: 4, ry: 5 }],
      water: [{ side: 1, from: 90, to: 440, off: 52, hw: 12 }],
      trees: { kinds: ['pine'], seed: 1109, spacing: 60, sides: ['L'] },
    },
  ],
});

/** Desert resort: palms, waste sand, resort lakes and wide landing areas. */
export const DESERT_PALMS: CourseDef = course({
  id: 'course_desert_palms',
  name: 'Desert Palms Resort',
  location: 'Coachella Valley, California',
  blurb: 'Resort golf under the mountains. Wide, but the lakes are thirsty.',
  difficulty: -0.3,
  windiness: 0.85,
  theme: {
    backdrops: ['mountains', 'mountains', 'coast'],
    sky: 0xffc891,
    haze: [204, 176, 128],
    grade: { rough: [208, 182, 118, 0.62], deep: [216, 184, 128, 0.78], sand: [238, 216, 170, 0.35], water: [50, 176, 200, 0.4] },
  },
  specs: [
    {
      par: 5, name: 'Oasis', path: [[0, 250], [-30, 420], [-20, 508]], width: 50, fairway: 19, slope: [0.14, 0.2],
      bunkers: [{ at: 270, off: 22, rx: 8, ry: 6 }, { at: 430, off: -4, rx: 5, ry: 4 }, { g: -120, rx: 5, ry: 5 }],
      water: [{ g: 95, rx: 13, ry: 18, gap: 4 }],
      trees: { kinds: ['palm'], seed: 2101, spacing: 22, jitter: 2 },
    },
    {
      par: 3, name: 'Mirage', path: [[-4, 158]], width: 44, slope: [-0.2, 0.08],
      water: [{ at: 106, off: 0, rx: 24, ry: 18 }],
      bunkers: [{ g: -70, rx: 4, ry: 6 }, { g: 160, rx: 6, ry: 3 }],
      trees: { kinds: ['palm'], seed: 2102, spacing: 24, from: 60 },
    },
    {
      par: 4, name: 'Saguaro', path: [[24, 230], [40, 380]], width: 48, fairway: 19, slope: [0.24, -0.1],
      bunkers: [{ side: -1, from: 150, to: 300, off: 27, hw: 7 }, { g: 150, rx: 6, ry: 4 }, { g: 60, rx: 4, ry: 5 }],
      trees: { kinds: ['palm'], seed: 2103, spacing: 26, sides: ['R'] },
    },
    {
      par: 4, name: 'Palm Canyon', path: [[0, 346]], width: 38, slope: [0, -0.28],
      bunkers: [{ at: 250, off: -19, rx: 6, ry: 5 }, { g: 120, rx: 4, ry: 5 }, { g: -120, rx: 4, ry: 5 }],
      trees: { kinds: ['palm'], seed: 2104, spacing: 16, jitter: 1 },
    },
    {
      par: 3, name: 'Sidewinder', path: [[8, 184]], width: 44, green: [15, 12], slope: [0.18, 0.18],
      bunkers: [{ g: 140, rx: 6, ry: 4 }, { g: -140, rx: 6, ry: 4 }, { g: 0, rx: 9, ry: 3 }],
      trees: { kinds: ['palm'], seed: 2105, spacing: 24 },
    },
    {
      par: 4, name: 'Dry Lake', path: [[-10, 240], [-60, 390]], width: 48, slope: [-0.1, 0.24],
      water: [{ at: 262, off: -36, rx: 18, ry: 26 }],
      bunkers: [{ at: 230, off: 22, rx: 7, ry: 5 }, { g: 90, rx: 4, ry: 6 }],
      trees: { kinds: ['palm'], seed: 2106, spacing: 24, sides: ['R'] },
    },
    {
      par: 5, name: 'Sun Valley', path: [[20, 260], [0, 420], [-10, 528]], width: 50, fairway: 19, slope: [0.12, -0.2],
      bunkers: [{ cross: [330, 344] }, { at: 255, off: -22, rx: 7, ry: 5 }, { g: 140, rx: 5, ry: 4 }],
      water: [{ g: -100, rx: 12, ry: 16, gap: 4 }],
      trees: { kinds: ['palm'], seed: 2107, spacing: 24 },
    },
    {
      par: 4, name: 'Coyote Wash', path: [[10, 200], [0, 362]], width: 46, slope: [-0.22, 0],
      water: [{ side: 1, from: 180, to: 372, off: 34, hw: 8 }],
      bunkers: [{ at: 228, off: -20, rx: 6, ry: 5 }, { g: -150, rx: 5, ry: 4 }],
      trees: { kinds: ['palm'], seed: 2108, spacing: 24, sides: ['L'] },
    },
    {
      par: 4, name: 'Clubhouse Lake', path: [[0, 250], [-20, 410]], width: 48, slope: [0.16, 0.22],
      water: [{ at: 352, off: -22, rx: 16, ry: 18 }],
      bunkers: [{ at: 246, off: 20, rx: 7, ry: 5 }, { g: 110, rx: 4, ry: 6 }, { g: 10, rx: 7, ry: 3 }],
      trees: { kinds: ['palm'], seed: 2109, spacing: 22, sides: ['R'] },
    },
  ],
});

/** Northern lakes: pines, lots of water and tree-lined corridors. */
export const LAKESIDE_PINES: CourseDef = course({
  id: 'course_lakeside_pines',
  name: 'Lakeside Pines CC',
  location: 'Lake Country',
  blurb: 'Pine-lined holes and water on six of nine. Keep it dry.',
  difficulty: 0.3,
  windiness: 1,
  theme: {
    backdrops: ['mountains'],
    haze: [140, 182, 146],
    grade: { rough: [52, 112, 62, 0.3], deep: [40, 92, 54, 0.45], water: [36, 92, 156, 0.35] },
  },
  specs: [
    {
      par: 4, name: 'North Shore', path: [[6, 376]], width: 46, slope: [-0.16, -0.18],
      water: [{ side: -1, from: 60, to: 390, off: 38, hw: 11 }],
      bunkers: [{ at: 246, off: 20, rx: 6, ry: 5 }, { g: 110, rx: 4, ry: 6 }],
      trees: { kinds: ['pine'], seed: 3101, spacing: 20, sides: ['R'] },
    },
    {
      par: 3, name: 'Island Green', path: [[0, 146]], width: 44, green: [13, 11], slope: [0.2, 0.1],
      water: [{ cross: [30, 126] }, { g: 0, rx: 22, ry: 7, gap: 4 }, { g: 90, rx: 6, ry: 14, gap: 4 }, { g: -90, rx: 6, ry: 14, gap: 4 }],
      bunkers: [{ g: 40, rx: 3, ry: 3, gap: 1 }],
      trees: { kinds: ['pine'], seed: 3102, spacing: 26, to: 40 },
    },
    {
      par: 4, name: 'Timberline', path: [[-15, 240], [10, 388]], width: 38, fairway: 16, slope: [0.2, -0.12],
      bunkers: [{ at: 252, off: 15, rx: 5, ry: 4 }, { g: -130, rx: 5, ry: 4 }],
      trees: { kinds: ['pine'], seed: 3103, spacing: 16, jitter: 2 },
    },
    {
      par: 5, name: 'Long Lake', path: [[0, 260], [35, 420], [30, 514]], width: 46, slope: [-0.12, 0.22],
      water: [{ cross: [300, 326] }, { g: 100, rx: 10, ry: 14, gap: 4 }],
      bunkers: [{ at: 248, off: -20, rx: 6, ry: 5 }, { g: -150, rx: 6, ry: 4 }],
      trees: { kinds: ['pine'], seed: 3104, spacing: 20 },
    },
    {
      par: 4, name: 'Loon Call', path: [[30, 200], [50, 350]], width: 44, slope: [0.22, 0.1],
      water: [{ at: 320, off: -28, rx: 13, ry: 18 }],
      bunkers: [{ at: 215, off: 22, rx: 6, ry: 5 }, { g: 120, rx: 5, ry: 4 }],
      trees: { kinds: ['pine'], seed: 3105, spacing: 20 },
    },
    {
      par: 4, name: 'Birch Bend', path: [[0, 212], [-70, 380]], width: 44, slope: [-0.2, 0.16],
      bunkers: [{ at: 240, off: 22, rx: 7, ry: 5 }, { g: 140, rx: 5, ry: 4 }],
      trees: { kinds: ['pine', 'eucalyptus'], seed: 3106, spacing: 20 },
      extraTrees: [[175, -26, 'pine', 1.2], [190, -36, 'eucalyptus', 1.1], [205, -30, 'pine', 1.1]],
    },
    {
      par: 3, name: 'Boathouse', path: [[-6, 176]], width: 44, slope: [-0.24, 0],
      water: [{ side: 1, from: 50, to: 196, off: 25, hw: 11 }],
      bunkers: [{ g: -80, rx: 4, ry: 6 }, { g: 170, rx: 6, ry: 3 }],
      trees: { kinds: ['pine'], seed: 3107, spacing: 22, sides: ['L'] },
    },
    {
      par: 4, name: 'Ridge Run', path: [[-12, 250], [-6, 402]], width: 42, slope: [0.1, -0.26],
      bunkers: [{ at: 238, off: -18, rx: 6, ry: 5 }, { at: 262, off: 18, rx: 6, ry: 5 }, { g: 120, rx: 4, ry: 5 }, { g: -120, rx: 4, ry: 5 }],
      trees: { kinds: ['pine'], seed: 3108, spacing: 18 },
    },
    {
      par: 4, name: 'The Dock', path: [[0, 260], [24, 428]], width: 46, slope: [0.16, 0.2],
      water: [{ cross: [384, 398] }],
      bunkers: [{ at: 246, off: -20, rx: 6, ry: 5 }, { g: 30, rx: 6, ry: 4 }],
      trees: { kinds: ['pine'], seed: 3109, spacing: 20 },
    },
  ],
});

/** City parkland: tight, tree-lined and well bunkered, skyline views. */
export const SKYLINE_NATIONAL: CourseDef = course({
  id: 'course_skyline_national',
  name: 'Skyline National',
  location: 'Bay City',
  blurb: 'Old-school city parkland. Tight lines between big trees.',
  difficulty: 0.3,
  windiness: 0.9,
  theme: {
    backdrops: ['city'],
    haze: [160, 196, 150],
    grade: { fairway: [72, 176, 72, 0.22], green: [80, 196, 92, 0.18] },
  },
  specs: [
    {
      par: 4, name: 'Uptown', path: [[-4, 372]], width: 40, slope: [0.14, -0.2],
      bunkers: [{ at: 238, off: -17, rx: 6, ry: 5 }, { at: 252, off: 17, rx: 6, ry: 5 }, { g: 140, rx: 5, ry: 4 }],
      trees: { kinds: ['eucalyptus', 'pine'], seed: 4101, spacing: 18 },
    },
    {
      par: 4, name: 'The Avenue', path: [[30, 238], [20, 394]], width: 40, slope: [-0.18, 0.12],
      bunkers: [{ at: 260, off: -18, rx: 6, ry: 5 }, { g: -120, rx: 4, ry: 6 }, { g: 150, rx: 6, ry: 3 }],
      trees: { kinds: ['eucalyptus'], seed: 4102, spacing: 18 },
      extraTrees: [[230, 28, 'eucalyptus', 1.25]],
    },
    {
      par: 5, name: 'Metro Line', path: [[-25, 250], [0, 420], [10, 534]], width: 42, slope: [0.2, 0.16],
      water: [{ at: 430, off: 27, rx: 12, ry: 22 }],
      bunkers: [{ at: 270, off: 20, rx: 6, ry: 5 }, { g: -130, rx: 5, ry: 4 }, { g: 170, rx: 6, ry: 3 }],
      trees: { kinds: ['eucalyptus', 'pine'], seed: 4103, spacing: 20 },
    },
    {
      par: 3, name: 'Rooftop', path: [[4, 154]], width: 40, green: [12, 10], slope: [-0.26, -0.1],
      bunkers: [{ g: 180, rx: 9, ry: 3, gap: 2 }, { g: 90, rx: 4, ry: 6 }, { g: -90, rx: 4, ry: 6 }],
      trees: { kinds: ['eucalyptus'], seed: 4104, spacing: 22 },
    },
    {
      par: 4, name: 'Overpass', path: [[0, 200], [55, 332]], width: 42, slope: [0.24, 0],
      bunkers: [{ at: 230, off: -20, rx: 7, ry: 5 }, { g: 110, rx: 4, ry: 5 }],
      trees: { kinds: ['eucalyptus'], seed: 4105, spacing: 18 },
      extraTrees: [[180, 28, 'eucalyptus', 1.3], [196, 34, 'pine', 1.1]],
    },
    {
      par: 4, name: 'Central Park', path: [[8, 408]], width: 42, slope: [-0.12, -0.24],
      water: [{ at: 300, off: -22, rx: 12, ry: 14 }],
      bunkers: [{ at: 246, off: 18, rx: 6, ry: 5 }, { g: 140, rx: 5, ry: 4 }, { g: -150, rx: 5, ry: 4 }],
      trees: { kinds: ['eucalyptus', 'pine'], seed: 4106, spacing: 18 },
    },
    {
      par: 3, name: 'Fountain', path: [[-6, 188]], width: 42, green: [15, 12], slope: [0.2, 0.14],
      water: [{ g: -150, rx: 14, ry: 9, gap: 4 }],
      bunkers: [{ g: 120, rx: 5, ry: 4 }, { g: 20, rx: 6, ry: 3 }],
      trees: { kinds: ['eucalyptus'], seed: 4107, spacing: 22 },
    },
    {
      par: 5, name: 'Broadway', path: [[0, 506]], width: 40, slope: [0, 0.26],
      bunkers: [{ at: 250, off: -17, rx: 6, ry: 5 }, { at: 360, off: 15, rx: 6, ry: 5 }, { at: 430, off: -14, rx: 5, ry: 4 }, { g: 120, rx: 4, ry: 5 }, { g: -120, rx: 4, ry: 5 }],
      trees: { kinds: ['eucalyptus', 'pine'], seed: 4108, spacing: 18 },
    },
    {
      par: 4, name: 'Penthouse', path: [[-20, 250], [-10, 424]], width: 42, slope: [-0.16, -0.2],
      bunkers: [{ at: 240, off: 19, rx: 7, ry: 5 }, { g: 160, rx: 5, ry: 3.5 }, { g: -160, rx: 5, ry: 3.5 }, { g: 80, rx: 4, ry: 5 }],
      trees: { kinds: ['eucalyptus'], seed: 4109, spacing: 18 },
    },
  ],
});

/** Mountain championship course: long, narrow, fast sloping greens. Majors. */
export const HIGHLAND_RIDGE: CourseDef = course({
  id: 'course_highland_ridge',
  name: 'Highland Ridge',
  location: 'High Sierra',
  blurb: 'Championship test at altitude. Long, narrow and slick on the greens.',
  difficulty: 1.8,
  windiness: 1.15,
  theme: {
    backdrops: ['mountains'],
    sky: 0xeaf1ff,
    haze: [150, 178, 156],
    grade: { rough: [70, 120, 84, 0.32], deep: [58, 98, 82, 0.5], green: [96, 184, 120, 0.15] },
  },
  specs: [
    {
      par: 4, name: 'First Ascent', path: [[0, 250], [20, 420]], width: 40, fairway: 15, slope: [0.24, -0.16],
      bunkers: [{ at: 246, off: -17, rx: 6, ry: 5 }, { g: 140, rx: 5, ry: 4 }, { g: -110, rx: 4, ry: 6 }],
      trees: { kinds: ['pine'], seed: 5101, spacing: 16 },
    },
    {
      par: 5, name: 'Switchback', path: [[30, 240], [-10, 420], [0, 548]], width: 42, fairway: 15, slope: [-0.2, 0.22],
      bunkers: [{ cross: [330, 344] }, { at: 236, off: 18, rx: 6, ry: 5 }, { g: 150, rx: 5, ry: 4 }],
      water: [{ side: -1, from: 390, to: 548, off: 32, hw: 7 }],
      trees: { kinds: ['pine'], seed: 5102, spacing: 16, sides: ['R'] },
    },
    {
      par: 4, name: 'Timber', path: [[-30, 260], [-35, 438]], width: 38, fairway: 14, slope: [0.18, 0.2],
      bunkers: [{ at: 270, off: 16, rx: 5, ry: 4 }, { g: -140, rx: 5, ry: 4 }, { g: 100, rx: 4, ry: 6 }],
      trees: { kinds: ['pine'], seed: 5103, spacing: 14, jitter: 2 },
    },
    {
      par: 3, name: 'Glacier', path: [[0, 198]], width: 44, green: [15, 13], slope: [-0.24, -0.16],
      water: [{ cross: [44, 160] }],
      bunkers: [{ g: 100, rx: 4, ry: 6 }, { g: -100, rx: 4, ry: 6 }, { g: 0, rx: 8, ry: 3 }],
      trees: { kinds: ['pine'], seed: 5104, spacing: 22, from: 150 },
    },
    {
      par: 4, name: "Eagle's Nest", path: [[0, 240], [-60, 382]], width: 40, fairway: 15, slope: [-0.26, 0.1],
      bunkers: [{ at: 226, off: 20, rx: 7, ry: 5 }, { at: 250, off: -14, rx: 4, ry: 4 }, { g: 120, rx: 5, ry: 4 }],
      trees: { kinds: ['pine'], seed: 5105, spacing: 15 },
    },
    {
      par: 4, name: 'Avalanche', path: [[6, 452]], width: 40, fairway: 15, slope: [0.12, -0.3],
      bunkers: [{ at: 244, off: -17, rx: 6, ry: 5 }, { at: 262, off: 17, rx: 6, ry: 5 }, { g: 150, rx: 6, ry: 3.5 }, { g: -150, rx: 6, ry: 3.5 }],
      trees: { kinds: ['pine'], seed: 5106, spacing: 15 },
    },
    {
      par: 5, name: 'The Summit', path: [[-20, 280], [25, 450], [20, 558]], width: 42, fairway: 15, slope: [0.2, 0.24],
      water: [{ g: -105, rx: 11, ry: 16, gap: 4 }],
      bunkers: [{ at: 266, off: 20, rx: 6, ry: 5 }, { at: 440, off: -12, rx: 5, ry: 4 }, { g: 130, rx: 5, ry: 4 }],
      trees: { kinds: ['pine'], seed: 5107, spacing: 15 },
    },
    {
      par: 3, name: 'Overlook', path: [[6, 168]], width: 42, green: [12, 11], slope: [0.3, 0],
      bunkers: [{ g: 180, rx: 8, ry: 3 }, { g: 90, rx: 4, ry: 5 }, { g: -90, rx: 4, ry: 5 }, { g: 0, rx: 7, ry: 3 }],
      trees: { kinds: ['pine'], seed: 5108, spacing: 20 },
    },
    {
      par: 4, name: 'Long Way Home', path: [[0, 300], [30, 450]], width: 42, fairway: 15, slope: [-0.18, -0.24],
      water: [{ side: 1, from: 290, to: 470, off: 32, hw: 8 }],
      bunkers: [{ at: 262, off: -18, rx: 7, ry: 5 }, { g: -120, rx: 5, ry: 4 }, { g: 160, rx: 6, ry: 3 }],
      trees: { kinds: ['pine'], seed: 5109, spacing: 16, sides: ['L'] },
    },
  ],
});
