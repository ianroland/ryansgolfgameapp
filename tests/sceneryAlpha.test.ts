/** Course scenery alpha layer: decorative only, opt-in, deterministic, never on playable ground. */
import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/golf/courses';
import { shapePolygon, surfaceAt } from '../src/golf/course';
import { ALPHA_REJECTED, ALPHA_SPRITES, buildAlphaScenery, ENABLED } from '../src/game/sceneryAlpha';
import { decodePng } from './png';
import { join } from 'node:path';

const dryCreek = COURSES.find((c) => c.id === 'course_dry_creek_muni')!;

describe('alpha scenery layer', () => {
  it('is opt-in: only the test hole (Dry Creek 2) gets props; every other hole and course gets none', () => {
    expect([...ENABLED]).toEqual(['course_dry_creek_muni:2']);
    for (const c of COURSES) for (const h of c.holes) {
      const props = buildAlphaScenery(h, c.id);
      expect(props.length > 0, `${c.id}:${h.number}`).toBe(c.id === dryCreek.id && h.number === 2);
    }
    expect(buildAlphaScenery(dryCreek.holes[1], undefined)).toEqual([]);
  });

  it('is deterministic and leaves the hole (terrain, trees, pin) untouched', () => {
    const h = dryCreek.holes[1];
    const before = JSON.stringify(h);
    const a = buildAlphaScenery(h, dryCreek.id);
    expect(buildAlphaScenery(h, dryCreek.id)).toEqual(a);
    expect(JSON.stringify(h)).toBe(before);
    // The pin moving between rounds doesn't move the scenery.
    expect(buildAlphaScenery({ ...h, pin: { x: h.pin.x + 4, y: h.pin.y - 3 } }, dryCreek.id)).toEqual(a);
  });

  it('never stands on fairway, green, fringe, bunker, water or tee, and keeps clear of physics trees', () => {
    const h = dryCreek.holes[1];
    const props = buildAlphaScenery(h, dryCreek.id);
    expect(props.length).toBeGreaterThan(15);
    for (const p of props) {
      expect(['rough', 'ob'], `${p.id} at ${p.x},${p.y}`).toContain(surfaceAt(h, p));
      for (const w of h.water) expect(shapePolygon(w).every((q) => Math.hypot(q.x - p.x, q.y - p.y) >= 1.2)).toBe(true);
    }
    const trees = props.filter((p) => /tree/.test(p.id));
    for (const t of trees) for (const pt of h.trees) expect(Math.hypot(pt.x - t.x, pt.y - t.y)).toBeGreaterThan(pt.r + 5);
    // No rejected sprite (bunker, pond, bridge, second flagstick) is ever used.
    for (const p of props) expect(ALPHA_REJECTED as readonly string[]).not.toContain(p.id);
  });

  it('every accepted sprite is cleaned: binary alpha, no light-grey checkerboard fringe on its outline', () => {
    for (const id of Object.keys(ALPHA_SPRITES)) {
      const img = decodePng(join(__dirname, `../src/assets/course_alpha/${id}.png`));
      const { width: W, height: H, data } = img;
      const a = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : data[(y * W + x) * 4 + 3]);
      let soft = 0, fringe = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        if (data[i + 3] && data[i + 3] !== 255) soft++;
        if (!data[i + 3]) continue;
        const edge = !a(x + 1, y) || !a(x - 1, y) || !a(x, y + 1) || !a(x, y - 1);
        const mx = Math.max(data[i], data[i + 1], data[i + 2]), mn = Math.min(data[i], data[i + 1], data[i + 2]);
        if (edge && mx - mn < 18 && mn > 140) fringe++;
      }
      expect(soft, id).toBe(0);
      expect(fringe, id).toBe(0);
      expect([W, H]).toEqual([ALPHA_SPRITES[id as keyof typeof ALPHA_SPRITES].w, ALPHA_SPRITES[id as keyof typeof ALPHA_SPRITES].h]);
    }
  });
});
