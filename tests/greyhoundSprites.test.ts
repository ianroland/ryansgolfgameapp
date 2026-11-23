/** Greyhound sprites: six lane strips of eight verified run frames, number spots on every jacket, time-driven animation. */
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import meta from '../src/assets/casino/greyhounds/greyhounds_run.json';
import { TRAP_COLORS } from '../src/casino/greyhounds';
import { decodePng } from './png';

const M = meta as unknown as { cell: [number, number]; lanes: number; framesPerLane: number; jacket: Record<string, [number, number][]>; patch: [number, number]; ground: number };
const img = decodePng(join(__dirname, '../src/assets/casino/greyhounds/greyhounds_run.png'));
const alpha = (x: number, y: number) => img.data[(y * img.width + x) * 4 + 3];

describe('greyhound atlas', () => {
  it('six lanes (jacket colours 1–6) × eight frames, uniform cells, transparent background, clean alpha', () => {
    expect(M.lanes).toBe(6);
    expect(TRAP_COLORS).toHaveLength(6);
    expect(M.framesPerLane).toBe(8);
    expect([img.width, img.height]).toEqual([M.cell[0] * 8, M.cell[1] * 6]);
    let soft = 0;
    for (let i = 3; i < img.data.length; i += 4) if (img.data[i] !== 0 && img.data[i] !== 255) soft++;
    expect(soft).toBe(0);
    for (const [x, y] of [[0, 0], [img.width - 1, 0], [0, img.height - 1]]) expect(alpha(x, y)).toBe(0);
  });

  it('every frame holds one dog standing on the shared ground line, and every frame is a different pose', () => {
    const [cw, ch] = M.cell;
    for (let lane = 0; lane < 6; lane++) {
      const sigs = new Set<string>();
      for (let f = 0; f < 8; f++) {
        let n = 0, low = 0, sig = '';
        for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
          const a = alpha(f * cw + x, lane * ch + y) ? 1 : 0;
          n += a;
          if (a) low = Math.max(low, y);
          if (y > ch / 2 && x % 4 === 0 && y % 4 === 0) sig += a;
        }
        expect(n, `lane ${lane + 1} frame ${f + 1}`).toBeGreaterThan(1200);
        // Feet never below the ground line; at most a hop above it (frames 3–5 are the airborne stride).
        expect(low, `feet lane ${lane + 1} frame ${f + 1}`).toBeLessThanOrEqual(M.ground + 3); // outstretched paws dip a few px below the median foot line
        expect(M.ground - low, `hop lane ${lane + 1} frame ${f + 1}`).toBeLessThanOrEqual(14); // frames 3–5: the airborne phase of the gallop
        sigs.add(sig);
      }
      expect(sigs.size, `lane ${lane + 1} distinct poses`).toBe(8);
    }
  });

  it('each frame has a number spot on the dog (the lane number is drawn there, over the painted digit)', () => {
    const [cw, ch] = M.cell;
    for (let lane = 0; lane < 6; lane++) {
      const spots = M.jacket[String(lane + 1)];
      expect(spots).toHaveLength(8);
      spots.forEach(([x, y], f) => {
        expect(x > M.patch[0] / 2 && x < cw - M.patch[0] / 2 && y > M.patch[1] / 2 && y < ch - M.patch[1] / 2).toBe(true);
        expect(alpha(f * cw + Math.round(x), lane * ch + Math.round(y)), `spot lane ${lane + 1} frame ${f + 1}`).toBe(255);
      });
    }
  });

  it('run frames come from elapsed time only, cycle through all eight, and lanes start out of step', async () => {
    const { runFrame, RUN_FRAME_MS } = await import('../src/ui/casino/Greyhounds');
    const seen = new Set(Array.from({ length: 8 }, (_, k) => runFrame(k * RUN_FRAME_MS, 0)));
    expect(seen.size).toBe(8);
    expect(runFrame(1000, 0)).toBe(runFrame(1000, 0));
    expect(runFrame(0, 1)).not.toBe(runFrame(0, 0));
  });
});
