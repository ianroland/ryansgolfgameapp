/** Casino dealer art (presentation only): manifests are complete, frames are real, one-shots end, art is clean. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodePng } from './png';

const DIR = join(__dirname, '../src/assets/casino');
type Meta = { cell: [number, number]; headX: number; frames: Record<string, number[]>; heldBack?: Record<string, number[]> };
const PNG: Record<string, string> = { monique: 'monique_table' };
const load = (n: string) => ({ meta: JSON.parse(readFileSync(join(DIR, `${n}.json`), 'utf8')) as Meta, img: decodePng(join(DIR, `${PNG[n] ?? n}.png`)) });

describe('dealer sprites', () => {
  const NEED: Record<string, string[]> = {
    dealer_velvet_anim: ['idle', 'deal', 'win', 'loss', 'special'],
    dealer_craps_anim: ['idle', 'call', 'win', 'loss', 'special'],
    monique: ['idle', 'spin', 'emote'],
  };
  for (const [name, anims] of Object.entries(NEED)) {
    it(`${name}: every animation exists, frames are in the atlas, alpha is clean 0/255`, () => {
      const { meta, img } = load(name);
      const shown = Object.values(meta.frames).flat();
      const held = Object.values(meta.heldBack ?? {}).flat();
      const all = [...new Set([...shown, ...held])];
      for (const a of anims) expect(meta.frames[a]?.length, `${name} ${a}`).toBeGreaterThan(0);
      // Frames with baked-in cards or chips (or Monique's misaligned spin arm) are never shown.
      for (const f of shown) expect(held, `${name} frame ${f} is held back`).not.toContain(f);
      expect(img.width).toBe(meta.cell[0] * all.length);
      let soft = 0;
      for (let i = 3; i < img.data.length; i += 4) if (img.data[i] !== 0 && img.data[i] !== 255) soft++;
      expect(soft).toBe(0);
      // Every frame has a character in it.
      for (const f of all) {
        let opaque = 0;
        for (let y = 0; y < img.height; y += 3) for (let x = f * meta.cell[0]; x < (f + 1) * meta.cell[0]; x += 3) opaque += img.data[(y * img.width + x) * 4 + 3] ? 1 : 0;
        expect(opaque, `${name} frame ${f}`).toBeGreaterThan(200);
      }
    });
  }

  it('one-shot reactions hold their last frame, idle loops; unknown animations fall back to idle', async () => {
    const { dealerFrame, DEALERS, ONE_SHOT_MS } = await import('../src/ui/casino/DealerSprite');
    for (const d of Object.values(DEALERS)) {
      const m = d.meta;
      expect(m.frames).not.toHaveProperty('chips');
      for (const a of ['win', 'loss', 'special'] as const) {
        const f = m.frames[a]!;
        expect(dealerFrame(m, a, 999)).toBe(f[f.length - 1]);
        expect(ONE_SHOT_MS[a]).toBeGreaterThan(0);
      }
      const idle = new Set(Array.from({ length: 60 }, (_, t) => dealerFrame(m, 'idle', t)));
      for (const f of idle) expect(m.frames.idle).toContain(f);
      expect(dealerFrame(m, 'call', 0)).toBeDefined();
      expect(m.heldBack?.chips?.length).toBeGreaterThan(0);
    }
  });
});

describe('baked-in props are held back (author direction 22 Nov)', () => {
  it('Velvet never shows a card in her hand; Monique reaches (right-wheel table) but has no chip animation', () => {
    const v = load('dealer_velvet_anim').meta, mo = load('monique').meta as Meta & { arm: { frames: Record<string, number> } };
    expect(v.heldBack?.card).toEqual([11, 12, 13, 14]);
    expect(v.frames.deal).toEqual([10]);
    expect(mo.frames.spin).toEqual([5, 6, 7, 8, 9, 10, 11, 12, 13]);
    expect(mo.frames).not.toHaveProperty('chips');
    expect(mo.heldBack?.chips?.length).toBe(6);
    // The arm overlay covers exactly the reach frames, and is cut from her own pixels (opaque only where the frame is).
    expect(Object.keys(mo.arm.frames).map(Number)).toEqual([8, 9, 10]);
    const arm = decodePng(join(DIR, 'monique_arm.png')), body = load('monique').img;
    expect(arm.width).toBe(mo.cell[0] * 3);
    for (const [f, slot] of Object.entries(mo.arm.frames)) {
      let shown = 0;
      for (let y = 0; y < arm.height; y++) for (let x = 0; x < mo.cell[0]; x++) {
        const a = arm.data[(y * arm.width + slot * mo.cell[0] + x) * 4 + 3];
        if (!a) continue;
        shown++;
        const bi = (y * body.width + Number(f) * mo.cell[0] + x) * 4;
        for (let k = 0; k < 3; k++) expect(arm.data[(y * arm.width + slot * mo.cell[0] + x) * 4 + k]).toBe(body.data[bi + k]);
      }
      expect(shown, `arm frame ${f}`).toBeGreaterThan(1500);
    }
  });
});
