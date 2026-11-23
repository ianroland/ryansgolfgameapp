/**
 * Casino art checks (Stage 2). These verify the shipped PNGs themselves, not
 * how they look in a browser: clean 0/255 alpha, transparent corners on cut-out
 * sprites, and real see-through reel windows in the slot cabinet so the live
 * reels underneath stay visible.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodePng } from './png';

const DIR = join(__dirname, '../src/assets/casino');
type Box = [number, number, number, number];
interface Entry { file: string; w: number; h: number; windows?: Box[]; buttons?: Box[]; at?: [number, number] }
const manifest = JSON.parse(readFileSync(join(DIR, 'casino.json'), 'utf8')) as Record<string, Entry>;

const alphaAt = (img: ReturnType<typeof decodePng>, x: number, y: number) => img.data[(y * img.width + x) * 4 + 3];

describe('casino art', () => {
  it('lists the pieces the casino screens use', () => {
    for (const key of ['cabinet', 'cabinet_lever', 'blackjack_table', 'craps_table', 'dealer_blackjack', 'dealer_craps', 'casino_exterior', 'casino_logo', 'chip_5', 'chip_25', 'chip_100', 'chip_500']) {
      expect(manifest[key], key).toBeDefined();
    }
    for (const sym of ['seven', 'trophy', 'flag', 'cherry', 'bell', 'bar', 'diamond']) expect(manifest[`sym_${sym}`], sym).toBeDefined();
  });

  for (const [key, e] of Object.entries(manifest)) {
    it(`${key}: size matches the manifest and alpha is clean 0/255`, () => {
      const img = decodePng(join(DIR, e.file));
      expect([img.width, img.height]).toEqual([e.w, e.h]);
      let soft = 0;
      for (let i = 3; i < img.data.length; i += 4) if (img.data[i] !== 0 && img.data[i] !== 255) soft++;
      expect(soft).toBe(0);
      if (key !== 'casino_exterior') expect(alphaAt(img, 0, 0)).toBe(0);
    });
  }

  it('slot cabinet reel windows are see-through holes', () => {
    const cab = manifest.cabinet;
    const img = decodePng(join(DIR, cab.file));
    expect(cab.windows).toHaveLength(3);
    for (const [x, y, w, h] of cab.windows!) {
      // Inner box (12% inset) must be fully transparent; the frame around it must not be.
      const ix = Math.round(w * 0.12);
      const iy = Math.round(h * 0.12);
      for (let yy = y + iy; yy < y + h - iy; yy++) for (let xx = x + ix; xx < x + w - ix; xx++) expect(alphaAt(img, xx, yy)).toBe(0);
      expect(alphaAt(img, x + Math.round(w / 2), Math.max(0, y - 12))).toBe(255);
    }
  });

  it('cabinet button hotspots sit on painted (opaque) buttons', () => {
    const cab = manifest.cabinet;
    const img = decodePng(join(DIR, cab.file));
    expect(cab.buttons).toHaveLength(3);
    for (const [x, y, w, h] of cab.buttons!) expect(alphaAt(img, x + Math.round(w / 2), y + Math.round(h / 2))).toBe(255);
  });
});
