/**
 * The right-wheel roulette table: every clickable bet area sits on the right
 * part of the actual artwork. Checked against the art's own pixels, so a box
 * that drifts onto the wrong number (or a neighbouring cell) fails here.
 */
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { colorOf, RED } from '../src/casino/roulette';
import { ALL_SPOTS, MONIQUE_AT, RT, spotBox, WHEEL_AT, type Box } from '../src/ui/casino/rouletteLayout';
import { decodePng } from './png';

const art = decodePng(join(__dirname, '../src/assets/casino/roulette_table_rw.png'));
const px = (x: number, y: number) => {
  const i = (Math.round(y) * art.width + Math.round(x)) * 4;
  return [art.data[i], art.data[i + 1], art.data[i + 2], art.data[i + 3]];
};
/** The cell's background colour: sample near the four corners, away from the number glyph. */
function cellColour([x, y, w, h]: Box, pts = [[0.12, 0.15], [0.88, 0.15], [0.12, 0.85], [0.88, 0.85]]): 'red' | 'black' | 'green' | 'other' {
  const votes = { red: 0, black: 0, green: 0, other: 0 };
  for (const [fx, fy] of pts) {
    const [r, g, b] = px(x + w * fx, y + h * fy);
    if (r > 140 && g < 70 && b < 70) votes.red++;
    else if (r < 50 && g < 50 && b < 50) votes.black++;
    else if (g > r + 20 && g > b) votes.green++;
    else votes.other++;
  }
  return (Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0]) as 'red';
}

describe('roulette table layout (right-wheel table)', () => {
  it('the art is the right-wheel table, keyed, at its measured size', () => {
    expect([art.width, art.height]).toEqual([RT.w, RT.h]);
    expect(px(5, 5)[3]).toBe(0); // background keyed out
    expect(px(WHEEL_AT.x, WHEEL_AT.y)[3]).toBe(255); // the wheel is on the right
    expect(WHEEL_AT.x).toBeGreaterThan(RT.w * 0.7);
  });

  it('every bet has exactly one box, inside the table, and no two boxes overlap', () => {
    expect(new Set(ALL_SPOTS).size).toBe(49);
    const boxes = ALL_SPOTS.map((s) => [s, spotBox(s)] as const);
    for (const [s, [x, y, w, h]] of boxes) {
      expect(w, s).toBeGreaterThan(40);
      expect(h, s).toBeGreaterThan(40);
      expect(x + w, s).toBeLessThan(1200); // the grid is left of the wheel
      expect(px(x + w / 2, y + h / 2)[3], s).toBe(255);
    }
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const [a, A] = boxes[i];
        const [b, B] = boxes[j];
        const overlap = A[0] < B[0] + B[2] && B[0] < A[0] + A[2] && A[1] < B[1] + B[3] && B[1] < A[1] + A[3];
        expect(overlap, `${a} overlaps ${b}`).toBe(false);
      }
  });

  it('each number box sits on a cell of that number\'s colour in the art (0 green, reds red, blacks black)', () => {
    for (let n = 0; n <= 36; n++) {
      const want = n === 0 ? 'green' : RED.has(n) ? 'red' : 'black';
      expect(colorOf(n)).toBe(want);
      // Zero is a slanted pentagon inside its box: sample its inner edge rather than the box corners.
      const pts = n === 0 ? [[0.8, 0.12], [0.8, 0.88], [0.75, 0.3], [0.75, 0.7]] : undefined;
      expect(cellColour(spotBox(`n${n}` as 'n0'), pts), `number ${n}`).toBe(want);
    }
  });

  it('numbers run in the standard layout: 1 bottom-left, 36 top-right, columns of three', () => {
    const c = (n: number) => { const [x, y, w, h] = spotBox(`n${n}` as 'n1'); return [x + w / 2, y + h / 2]; };
    expect(c(1)[0]).toBeLessThan(c(4)[0]);
    expect(c(1)[1]).toBeGreaterThan(c(2)[1]);
    expect(c(2)[1]).toBeGreaterThan(c(3)[1]);
    expect(c(34)[0]).toBeGreaterThan(c(31)[0]);
    expect(c(36)[1]).toBeLessThan(c(34)[1]);
    expect(spotBox('n0')[0]).toBeLessThan(spotBox('n1')[0]); // zero on the far left
    for (const [col, row] of [['col3', 3], ['col2', 2], ['col1', 1]] as const) {
      const [x, y, , h] = spotBox(col);
      expect(x).toBeGreaterThan(spotBox(`n${33 + row}` as 'n36')[0]); // right of 34/35/36
      expect(Math.abs(y + h / 2 - c(33 + row)[1])).toBeLessThan(6); // same row as its last number
    }
  });

  it('outside bets: dozens left to right, then 1–18, EVEN, red, black, ODD, 19–36 (the red diamond box is red)', () => {
    const xs = (ids: string[]) => ids.map((s) => spotBox(s as 'red')[0]);
    const dz = xs(['dozen1', 'dozen2', 'dozen3']);
    expect(dz).toEqual([...dz].sort((a, b) => a - b));
    const out = xs(['low', 'even', 'red', 'black', 'odd', 'high']);
    expect(out).toEqual([...out].sort((a, b) => a - b));
    const centre = (s: string) => { const [x, y, w, h] = spotBox(s as 'red'); return px(x + w / 2, y + h / 2); };
    const [r, g, b] = centre('red');
    expect(r > 150 && g < 80 && b < 80).toBe(true);
    const [r2, g2, b2] = centre('black');
    expect(r2 + g2 + b2).toBeLessThan(150);
    expect(spotBox('dozen1')[1]).toBeGreaterThan(spotBox('n1')[1]);
    expect(spotBox('low')[1]).toBeGreaterThan(spotBox('dozen1')[1]);
  });

  it('Monique stands left of the wheel centre and never covers the betting grid', () => {
    const headX = MONIQUE_AT.left + MONIQUE_AT.w * 0.51;
    expect(headX).toBeLessThan(WHEEL_AT.x);
    expect(headX).toBeGreaterThan(WHEEL_AT.x - WHEEL_AT.rx);
    const gridRight = Math.max(...ALL_SPOTS.map((s) => spotBox(s)[0] + spotBox(s)[2]));
    // Her reaching arm (right quarter of her cell) is the only part drawn in front of the table.
    expect(MONIQUE_AT.left + MONIQUE_AT.w * 0.44).toBeGreaterThan(gridRight);
  });
});
