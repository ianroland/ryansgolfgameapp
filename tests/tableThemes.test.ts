import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CARD_SCENES, CRAPS_SCENES, cardSceneFor, crapsSceneFor, type CardGame, type FeltBox } from '../src/expansion/tableThemes';

const CASINOS = ['desert_palms', 'white_buffalo', 'morongo_sky'] as const;
const GAMES: CardGame[] = ['blackjack', 'three_card_poker', 'baccarat'];

/** Width and height from a WebP header (lossy VP8, lossless VP8L or extended VP8X). */
function webpSize(file: string): [number, number] {
  const b = readFileSync(file);
  const kind = b.toString('ascii', 12, 16);
  if (kind === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  if (kind === 'VP8L') { const v = b.readUInt32LE(21); return [1 + (v & 0x3fff), 1 + ((v >> 14) & 0x3fff)]; }
  return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
}

describe('casino card-table scenes (v2: one per casino and game)', () => {
  it('each casino has a scene for each card game, sized as registered, all different', () => {
    for (const c of CASINOS) for (const g of GAMES) {
      const s = cardSceneFor(c, g)!;
      expect(s, `${c} ${g}`).toBeTruthy();
      expect(webpSize(join(__dirname, `../src/assets/casino/tables/${c}/${g}_scene.webp`)), `${c} ${g}`).toEqual(s.size);
      expect(s.felt).toEqual([0, 0, ...s.size]);
      expect(s.printedZones).toBe(true);
    }
    expect(new Set(CASINOS.flatMap((c) => GAMES.map((g) => CARD_SCENES[c][g].url))).size).toBe(9);
  });

  it('every layout box sits inside the scene, and betting zones never overlap', () => {
    const inside = ([cx, cy, w, h]: FeltBox) => cx - w / 2 >= 0 && cx + w / 2 <= 1 && cy - h / 2 >= 0 && cy + h / 2 <= 1;
    const overlap = (a: FeltBox, b: FeltBox) => Math.abs(a[0] - b[0]) * 2 < a[2] + b[2] && Math.abs(a[1] - b[1]) * 2 < a[3] + b[3];
    for (const c of CASINOS) {
      for (const g of GAMES) for (const [k, box] of Object.entries(CARD_SCENES[c][g].layout)) expect(inside(box as FeltBox), `${c} ${g}.${k}`).toBe(true);
      const b = CARD_SCENES[c].baccarat.layout;
      expect([overlap(b.player, b.tie), overlap(b.tie, b.banker), overlap(b.player, b.banker)], c).toEqual([false, false, false]);
      const t = CARD_SCENES[c].three_card_poker.layout;
      expect([overlap(t.ante, t.play), overlap(t.play, t.pairplus), overlap(t.ante, t.pairplus)], c).toEqual([false, false, false]);
      // Cards never sit on the betting spots.
      for (const z of [t.ante, t.play, t.pairplus]) expect([overlap(z, t.player), overlap(z, t.dealer)], c).toEqual([false, false]);
      for (const z of [b.player, b.tie, b.banker]) expect([overlap(z, b.playerCards), overlap(z, b.bankerCards)], c).toEqual([false, false]);
    }
  });

  it('blackjack covers the printed "hits soft 17" line with the real rule; no other game has a cover', () => {
    for (const c of CASINOS) {
      expect(CARD_SCENES[c].blackjack.ruleCover?.felt, c).toMatch(/^#[0-9a-f]{6}$/);
      expect(CARD_SCENES[c].baccarat.ruleCover).toBeUndefined();
      expect(CARD_SCENES[c].three_card_poker.ruleCover).toBeUndefined();
    }
  });

  it('only the bets the games support have zones', () => {
    const keys = (g: CardGame) => Object.keys(CARD_SCENES.desert_palms[g].layout);
    expect(keys('baccarat').filter((k) => ['player', 'tie', 'banker'].includes(k))).toHaveLength(3);
    expect(keys('three_card_poker').filter((k) => ['ante', 'play', 'pairplus'].includes(k))).toHaveLength(3);
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

describe('casino roulette scenes and board', () => {
  it('each casino has a whole 1672x941 scene; the wheel and the board cover sit inside it', async () => {
    const { ROULETTE_SCENES } = await import('../src/expansion/tableThemes');
    for (const c of CASINOS) {
      const s = ROULETTE_SCENES[c];
      expect(s.url, c).toBeTruthy();
      const [x, y, w, h] = s.board;
      expect(x > s.wheel.x + s.wheel.rx - 20 && x + w <= 1672 && y + h <= 941, c).toBe(true);
      expect(s.wheel.ry).toBeLessThan(s.wheel.rx);
    }
  });

  it('the board has exactly the engine\'s 49 bets, each in its own cell, numbers in standard order', async () => {
    const { ALL_SPOTS } = await import('../src/ui/casino/rouletteLayout');
    const { boardCell } = await import('../src/ui/casino/RouletteBoard');
    const { colorOf, wins } = await import('../src/casino/roulette');
    expect(ALL_SPOTS).toHaveLength(49);
    const cells = new Set(ALL_SPOTS.map((s) => `${boardCell(s).style.gridColumn}|${boardCell(s).style.gridRow}`));
    expect(cells.size).toBe(49);
    // Rows: 3,6..36 on top; 1,4..34 at the bottom. Column bets sit at the end of their row.
    for (let n = 1; n <= 36; n++) {
      const c = boardCell(`n${n}`);
      expect(c.style.gridRow, `n${n}`).toBe(String(3 - ((n - 1) % 3)));
      expect(c.tone).toBe(colorOf(n));
      const colBet = (['col1', 'col2', 'col3'] as const).find((k) => wins(k, n))!;
      expect(boardCell(colBet).style.gridRow).toBe(c.style.gridRow);
    }
    expect(boardCell('n0').tone).toBe('green');
  });
});
