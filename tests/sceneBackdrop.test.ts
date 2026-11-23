/** Rotating scenery: four scenes, each a full-page background and a matching header strip, at their real sizes. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const webpSize = (file: string) => {
  const b = readFileSync(join(__dirname, '../src/assets/backgrounds', file));
  // VP8X header: canvas width/height minus one, 24-bit little-endian at bytes 24 and 27.
  if (b.toString('ascii', 12, 16) === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  if (b.toString('ascii', 12, 16) === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  const bits = b.readUInt32LE(21);
  return [1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff)];
};

describe('scene backdrops', () => {
  it('four scenes in order, synced page and header art, 90 s rotation with a 1 s crossfade', async () => {
    const { SCENES, ROTATE_MS, FADE_MS } = await import('../src/ui/SceneBackdrop');
    expect(SCENES.map((s) => s.id)).toEqual(['city_sunset', 'desert_palms', 'coastal_classic', 'casino_night']);
    expect(ROTATE_MS).toBe(90_000);
    expect(FADE_MS).toBe(1000);
    for (const id of SCENES.map((s) => s.id)) {
      expect(webpSize(`bg_${id}.webp`)).toEqual([1920, 1080]);
      expect(webpSize(`header_${id}.webp`)).toEqual([1920, 300]);
    }
  });
});
