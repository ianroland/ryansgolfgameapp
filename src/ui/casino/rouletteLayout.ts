/**
 * Where everything sits on the right-wheel roulette table art (src/assets/casino/
 * roulette_table_rw.png, 1774 x 865). Every box was measured from the gold grid
 * lines in the art itself, not mirrored from the old left-wheel table.
 * Presentation only: which spot a box places a bet on is fixed by its id, and
 * bets, odds and payouts live in src/casino/roulette.ts, untouched.
 */
import type { RouletteSpot } from '../../casino/roulette';

export const RT = { w: 1774, h: 865 };

export type Box = [number, number, number, number];

/**
 * The number grid leans very slightly (about 4 px across three rows), so each
 * row has its own measured cell edges: 12 number columns, then the "2 to 1" box.
 * Rows: top = 3, 6 … 36; middle = 2, 5 … 35; bottom = 1, 4 … 34.
 */
const ROWS: { y0: number; y1: number; edges: number[] }[] = [
  { y0: 199, y1: 268, edges: [213, 286.5, 360.5, 433.5, 506.5, 578.5, 651.5, 724, 795.5, 867.5, 940, 1011.5, 1087, 1176] },
  { y0: 270, y1: 341, edges: [208.5, 283.5, 358, 432.5, 506, 578.5, 650.5, 724.5, 797, 870.5, 942.5, 1015.5, 1090, 1176] },
  { y0: 343, y1: 416, edges: [205, 281.5, 355.5, 430.5, 504.5, 577.5, 651.5, 725, 798.5, 872, 945.5, 1019.5, 1094.5, 1175.5] },
];
/** Zero: the green pentagon left of the grid, spanning all three rows. */
const ZERO: Box = [143, 199, 62, 217];
/** The pentagon's shape inside ZERO's box, so only the painted zero takes the bet. */
export const ZERO_CLIP = 'polygon(68% 0, 100% 0, 100% 100%, 74% 100%, 0 50%)';
/** Dozens row and the even-money row: measured edges. */
const DOZENS = { y0: 418, y1: 477, edges: [200, 504, 802, 1103] };
const OUTSIDE = { y0: 479, y1: 544, edges: [192, 354.5, 503, 652.5, 805.5, 947.5, 1113] };
const OUTSIDE_ORDER = ['low', 'even', 'red', 'black', 'odd', 'high'] as const;

/** Shrinks a cell inside its gold lines so neighbouring boxes never touch. */
const cell = (x0: number, x1: number, y0: number, y1: number, pad = 3): Box => [x0 + pad, y0 + pad, x1 - x0 - pad * 2, y1 - y0 - pad * 2];

export function spotBox(spot: RouletteSpot): Box {
  if (spot.startsWith('n')) {
    const n = Number(spot.slice(1));
    if (n === 0) return ZERO;
    const r = ROWS[n % 3 === 0 ? 0 : n % 3 === 2 ? 1 : 2];
    const i = Math.ceil(n / 3) - 1;
    return cell(r.edges[i], r.edges[i + 1], r.y0, r.y1);
  }
  const col = ({ col3: 0, col2: 1, col1: 2 } as Record<string, number>)[spot];
  if (col !== undefined) {
    const r = ROWS[col];
    return cell(r.edges[12], r.edges[13], r.y0, r.y1);
  }
  const dz = ({ dozen1: 0, dozen2: 1, dozen3: 2 } as Record<string, number>)[spot];
  if (dz !== undefined) return cell(DOZENS.edges[dz], DOZENS.edges[dz + 1], DOZENS.y0, DOZENS.y1);
  const i = OUTSIDE_ORDER.indexOf(spot as (typeof OUTSIDE_ORDER)[number]);
  if (i < 0) throw new Error(`No box for roulette spot ${spot}`);
  return cell(OUTSIDE.edges[i], OUTSIDE.edges[i + 1], OUTSIDE.y0, OUTSIDE.y1);
}

export const ALL_SPOTS: RouletteSpot[] = [
  ...Array.from({ length: 37 }, (_, n) => `n${n}` as RouletteSpot),
  'col1', 'col2', 'col3', 'dozen1', 'dozen2', 'dozen3', 'low', 'even', 'red', 'black', 'odd', 'high',
];

/**
 * The wheel on the art (right side): centre and the ball track's radii. The art
 * is drawn in perspective, so the track is an ellipse (ry / rx).
 */
export const WHEEL_AT = { x: 1452, y: 332, rx: 160, ry: 128 };

/**
 * Madame Monique behind the table, slightly left of the wheel's centre, so her
 * right-reaching spin arm ends on the wheel's far rim. Table-image pixels; her
 * 200 x 210 sprite cell is drawn at 2.2x. Placed so the hand in her fullest
 * reach (frame 9, cell x 181, y ~158) lands on the far rim at (1510, 146).
 */
export const MONIQUE_AT = { left: 1112, top: -202, w: 440, h: 462 };
