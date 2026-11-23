import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CARD_LAYOUTS, CARD_SCENES, CRAPS_SCENES, cardSceneFor, crapsSceneFor, type FeltBox } from '../src/expansion/tableThemes';
import { decodePng } from './png';

const CASINOS = ['desert_palms', 'white_buffalo', 'morongo_sky'] as const;

describe('casino card-table scenes', () => {
  it('each casino has one scene, sized as registered, shared by all three card games', () => {
    for (const c of CASINOS) {
      const s = cardSceneFor(c)!;
      expect(s, c).toBeTruthy();
      const png = decodePng(join(__dirname, `../src/assets/casino/tables/${c}/card_scene.png`));
      expect([png.width, png.height], c).toEqual(s.size);
      const [x, y, w, h] = s.felt;
      expect(x >= 0 && y > s.viewTop && x + w <= s.size[0] && y + h <= s.size[1], `${c} felt inside the shown scene`).toBe(true);
    }
    expect(new Set(CASINOS.map((c) => CARD_SCENES[c].url)).size).toBe(3);
  });

  it('every layout box sits inside the felt, and betting zones never overlap', () => {
    const inside = ([cx, cy, w, h]: FeltBox) => cx - w / 2 >= 0 && cx + w / 2 <= 1 && cy - h / 2 >= 0 && cy + h / 2 <= 1;
    const overlap = (a: FeltBox, b: FeltBox) => Math.abs(a[0] - b[0]) * 2 < a[2] + b[2] && Math.abs(a[1] - b[1]) * 2 < a[3] + b[3];
    for (const [game, layout] of Object.entries(CARD_LAYOUTS)) {
      for (const [k, box] of Object.entries(layout)) expect(inside(box as FeltBox), `${game}.${k}`).toBe(true);
    }
    const b = CARD_LAYOUTS.baccarat;
    expect([overlap(b.player, b.tie), overlap(b.tie, b.banker), overlap(b.player, b.banker)]).toEqual([false, false, false]);
    const t = CARD_LAYOUTS.three_card_poker;
    expect([overlap(t.ante, t.play), overlap(t.play, t.pairplus)]).toEqual([false, false]);
  });

  it('only the bets the games support are drawn: no extra zones', () => {
    expect(Object.keys(CARD_LAYOUTS.baccarat).filter((k) => ['player', 'tie', 'banker'].includes(k))).toHaveLength(3);
    expect(Object.keys(CARD_LAYOUTS.three_card_poker).filter((k) => ['ante', 'play', 'pairplus'].includes(k))).toHaveLength(3);
  });
});

describe('casino craps scenes', () => {
  it('each casino has a whole 1672x941 scene with every point box, chip spot and the dice inside it', () => {
    for (const c of CASINOS) {
      const s = crapsSceneFor(c)!;
      expect(s.size).toEqual([1672, 941]);
      const pts = [...Object.values(s.point), ...Object.values(s.spots), s.dice];
      for (const [x, y] of pts) expect(x > 0 && x < 1672 && y > 0 && y < 941, c).toBe(true);
      expect(Object.keys(s.point).map(Number).sort((a, b) => a - b)).toEqual([4, 5, 6, 8, 9, 10]);
      expect(Object.keys(s.spots).sort()).toEqual(['dontPass', 'field', 'odds', 'pass']);
    }
    expect(new Set(CASINOS.map((c) => CRAPS_SCENES[c].url)).size).toBe(3);
  });

  it('masks never cover a supported bet, a point box or the chip spots', () => {
    for (const c of CASINOS) {
      const s = CRAPS_SCENES[c];
      const covered = ([x, y]: [number, number]) => s.veils.some(([vx, vy, vw, vh]) => x >= vx && x <= vx + vw && y >= vy && y <= vy + vh);
      for (const [k, p] of Object.entries(s.spots)) expect(covered(p), `${c} ${k}`).toBe(false);
      for (const [n, p] of Object.entries(s.point)) expect(covered(p), `${c} point ${n}`).toBe(false);
    }
  });
});

describe('table art is presentation only', () => {
  it('no casino rules, money or save code reads the table registry', () => {
    for (const dir of ['../src/casino', '../src/services', '../src/career', '../src/persistence']) {
      const d = join(__dirname, dir);
      for (const f of readdirSync(d).filter((x) => x.endsWith('.ts'))) expect(readFileSync(join(d, f), 'utf8'), f).not.toMatch(/tableThemes|DealerPanel/);
    }
  });

  it('full-body dealer sprites are off at the tables (they live in the dialogue panel)', async () => {
    const { SHOW_TABLE_DEALER_SPRITES } = await import('../src/ui/casino/DealerPanel');
    expect(SHOW_TABLE_DEALER_SPRITES).toBe(false);
  });
});
