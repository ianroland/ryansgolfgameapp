/** Video poker & keno art: every piece a casino theme names was cut and is on disk, with the metadata it needs. */
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import META from '../src/assets/casino/machines/machines.json';
import { BALLS, MACHINE_THEMES, METER_BET, METER_WIN, PANEL_BG } from '../src/ui/casino/machineThemes';
import { LOCATIONS } from '../src/expansion/locations';

const meta = META as Record<string, { w: number; h: number; slice?: number[]; fill?: boolean; box?: number[]; frames?: number; frame_w?: number; cols?: number; rows?: number; values_x?: number[]; rows_y?: number[] }>;
const pieces = (o: unknown): string[] => (typeof o === 'string' ? [o] : Array.isArray(o) ? o.flatMap(pieces) : o && typeof o === 'object' ? Object.values(o).flatMap(pieces) : []);

describe('machine art', () => {
  it('every piece named by a theme exists, for every casino', () => {
    for (const l of LOCATIONS) {
      const t = MACHINE_THEMES[l.id];
      for (const p of [...pieces(t), BALLS, METER_BET, METER_WIN]) {
        expect(meta[p], p).toBeDefined();
        expect(existsSync(`src/assets/casino/machines/${p}.webp`), p).toBe(true);
      }
    }
  });

  it('frames, atlases, meters and sparkles carry their layout data', () => {
    for (const t of Object.values(MACHINE_THEMES)) {
      for (const f of [t.vp.screen, t.keno.paycard, t.keno.board, 'frame' in t.vp.paytable ? t.vp.paytable.frame : null].filter(Boolean) as string[]) {
        expect(meta[f].slice, f).toHaveLength(4);
        if (!meta[f].fill) expect(PANEL_BG[f as keyof typeof PANEL_BG], `${f} needs a panel colour`).toBeTruthy();
      }
      expect(meta[t.vp.cards]).toMatchObject({ cols: 13, rows: 4 });
      for (const s of [t.vp.sparkles, t.keno.sparkles]) expect(meta[s].frames! * meta[s].frame_w!).toBe(meta[s].w);
      if ('art' in t.vp.paytable) expect(meta[t.vp.paytable.art].rows_y).toHaveLength(10); // nine hands
    }
    expect(meta[BALLS]).toMatchObject({ cols: 10, rows: 8 });
    for (const m of [METER_BET, METER_WIN]) expect(meta[m].box).toHaveLength(4);
  });

  it('the floor lists one machine for both games', () => {
    const dp = LOCATIONS.find((l) => l.id === 'desert_palms')!;
    expect(dp.games.filter((g) => g.id === 'machines')).toEqual([{ id: 'machines', label: 'Video Poker & Keno' }]);
  });
});
