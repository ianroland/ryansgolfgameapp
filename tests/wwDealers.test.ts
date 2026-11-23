/**
 * Waifu and Winston: dialogue drafts wired to events (anti-repeat, quiet mode, no
 * accent writing), and the cut sprite layers (transparent, the size the layout expects).
 */
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  COOLDOWN, pickLine, WAIFU_EVENTS, WAIFU_FACE, WAIFU_POSE, WINSTON_EVENTS, WINSTON_FACE, WINSTON_POSE, WW_DIALOGUE,
} from '../src/casino/wwDialogue';
import { seededInt } from '../src/casino/random';
import meta from '../src/assets/casino/ww/ww_meta.json';
import { decodePng } from './png';

describe('dealer dialogue', () => {
  it('every event the tables raise has lines, and every line is still a draft', () => {
    for (const e of WAIFU_EVENTS) expect(WW_DIALOGUE.waifu.lines[e]?.length, e).toBeGreaterThan(0);
    for (const e of WINSTON_EVENTS) expect(WW_DIALOGUE.winston.lines[e]?.length, e).toBeGreaterThan(0);
    for (const who of ['waifu', 'winston'] as const)
      for (const lines of Object.values(WW_DIALOGUE[who].lines)) for (const l of lines) expect(l.status).toBe('draft');
  });
  it('no phonetic accent or patois in either dealer’s lines', () => {
    const all = Object.values(WW_DIALOGUE.winston.lines).flat().concat(Object.values(WW_DIALOGUE.waifu.lines).flat()).map((l) => l.text);
    for (const t of all) expect(t).not.toMatch(/\b(mon|irie|yuh|di|wah|seh|bredda|ting)\b/i);
  });
  it('faces and poses exist on the sprite sheets for every event', () => {
    for (const e of WAIFU_EVENTS) {
      expect(meta.waifu_faces.faces).toContain(WAIFU_FACE[e]);
      expect(meta).toHaveProperty(`waifu_${WAIFU_POSE[e]}`);
    }
    for (const e of WINSTON_EVENTS) {
      expect(meta.winston_faces.faces).toContain(WINSTON_FACE[e]);
      expect(meta).toHaveProperty(`winston_${WINSTON_POSE[e]}`);
    }
  });
  it('anti-repeat: never the same line twice running, and recent lines skipped when there are alternatives', () => {
    const rand = seededInt(5);
    const recent: string[] = [];
    for (let i = 0; i < 200; i++) {
      const l = pickLine('winston', 'decision', recent, 'normal', rand)!;
      if (recent.length) expect(l.id).not.toBe(recent[recent.length - 1]);
      expect(recent.slice(-COOLDOWN)).not.toContain(l.id); // 3 lines, cooldown 4: always the one not just used… unless all are recent
      recent.push(l.id);
      recent.splice(0, Math.max(0, recent.length - 2));
    }
  });
  it('quiet mode keeps results and notices, drops chatter', () => {
    expect(pickLine('waifu', 'welcome', [], 'quiet')).toBeNull();
    expect(pickLine('waifu', 'bet', [], 'quiet')).toBeNull();
    expect(pickLine('winston', 'decision', [], 'quiet')).toBeNull();
    expect(pickLine('waifu', 'banker_win', [], 'quiet')).not.toBeNull();
    expect(pickLine('waifu', 'shuffle', [], 'quiet')).not.toBeNull();
    expect(pickLine('winston', 'insufficient_funds', [], 'quiet')).not.toBeNull();
  });
});

describe('sprite layers', () => {
  const dir = join(__dirname, '../src/assets/casino/ww');
  const files = ['waifu_idle', 'waifu_deal', 'waifu_present', 'waifu_think', 'winston_idle', 'winston_present', 'winston_point', 'winston_think', 'baccarat_felt', 'threecard_felt', 'chip_tray', 'shoe_red', 'shoe_blue'];
  it('each layer is its own transparent PNG, matching the layout metadata', () => {
    for (const f of files) {
      const png = decodePng(join(dir, `${f}.png`));
      expect([png.width, png.height], f).toEqual((meta as unknown as Record<string, number[]>)[f]);
      const a = (x: number, y: number) => png.data[(y * png.width + x) * 4 + 3];
      // Transparent corners: no background box baked in.
      expect(a(0, 0), f).toBe(0);
      expect(a(png.width - 1, 0), f).toBe(0);
    }
  });
  it('portrait strips have eight faces each', () => {
    for (const who of ['waifu', 'winston'] as const) {
      const m = meta[`${who}_faces`];
      const png = decodePng(join(dir, `${who}_faces.png`));
      expect(m.faces).toHaveLength(8);
      expect(png.width).toBe(m.cell[0] * 8);
      expect(png.height).toBe(m.cell[1]);
    }
  });
});
