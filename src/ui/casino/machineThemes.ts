/**
 * Video poker and keno art, per casino (data-driven, like the card table themes). Purely visual:
 * every rule, bet and payout stays in src/casino/videoPoker.ts and src/casino/keno.ts.
 *
 * Pieces are cut from the supplied sheets by tools/cut_machines.py. Where a casino's sheet lacks a
 * piece the "base" set fills in (see docs/casino/MACHINE_ART.md): Desert Palms has no video poker
 * sheet, White Buffalo has no keno sheet, and only the base sheets have a complete card deck
 * (Morongo Sky's deck has unreadable corner suits) and a complete 1–80 ball set.
 */
import type { LocationId } from '../../expansion/unlocks';
import META from '../../assets/casino/machines/machines.json';

const files = import.meta.glob<string>('../../assets/casino/machines/*.webp', { eager: true, query: '?url', import: 'default' });
export type Piece = keyof typeof META;
export const pieceUrl = (p: Piece) => files[`../../assets/casino/machines/${p}.webp`];
export const pieceMeta = (p: Piece) => META[p] as { w: number; h: number; slice?: number[]; fill?: boolean; box?: number[]; frames?: number; frame_w?: number; cols?: number; rows?: number; values_x?: number[]; rows_y?: number[] };

export interface VPTheme {
  marquee: Piece;
  /** A small game sign under a casino-wide marquee. */
  sign?: Piece;
  screen: Piece;
  /** `art`: the sheet's printed paytable (hand names; coin columns drawn over it). `frame`: a frame the table is drawn inside. */
  paytable: { art: Piece } | { frame: Piece };
  cards: Piece;
  back: Piece;
  holdOff: Piece;
  holdOn: Piece;
  deal: [Piece, Piece];
  draw: [Piece, Piece];
  bet: [Piece, Piece];
  sparkles: Piece;
}

export interface KenoTheme {
  marquee: Piece;
  sign?: Piece;
  /** Frame around the number board; none draws the board on a plain cabinet. */
  board?: Piece;
  paycard: Piece;
  draw: [Piece, Piece];
  clear: [Piece, Piece];
  sparkles: Piece;
  /** Decorative band behind the status line. */
  band?: Piece;
}

const BASE_VP: VPTheme = {
  marquee: 'base_vp_marquee',
  screen: 'base_vp_screen',
  paytable: { art: 'base_vp_paytable' },
  cards: 'base_vp_cards',
  back: 'base_vp_back',
  holdOff: 'base_vp_hold_off',
  holdOn: 'base_vp_hold_on',
  deal: ['base_vp_deal', 'base_vp_deal_lit'],
  draw: ['base_vp_draw', 'base_vp_draw_lit'],
  bet: ['base_vp_bet', 'base_vp_bet_lit'],
  sparkles: 'base_vp_sparkles',
};
const BASE_KENO: KenoTheme = {
  marquee: 'base_keno_marquee',
  paycard: 'base_keno_paycard',
  draw: ['base_keno_draw', 'base_keno_draw'],
  clear: ['base_keno_clear', 'base_keno_clear'],
  sparkles: 'base_keno_sparkles',
};

export const MACHINE_THEMES: Record<LocationId, { vp: VPTheme; keno: KenoTheme }> = {
  desert_palms: {
    vp: BASE_VP,
    keno: {
      marquee: 'dp_keno_marquee',
      board: 'dp_keno_frame',
      paycard: 'dp_keno_paycard',
      draw: ['dp_keno_draw', 'dp_keno_draw'],
      clear: ['dp_keno_clear', 'dp_keno_clear'],
      sparkles: 'dp_keno_sparkles',
      band: 'dp_keno_band',
    },
  },
  white_buffalo: {
    vp: {
      marquee: 'wb_vp_marquee',
      screen: 'wb_vp_screen',
      paytable: { frame: 'wb_vp_payframe' },
      cards: 'wb_vp_cards',
      back: 'wb_vp_back',
      holdOff: 'wb_vp_hold_off',
      holdOn: 'wb_vp_hold_on',
      deal: ['wb_vp_deal', 'wb_vp_deal'],
      draw: ['wb_vp_draw', 'wb_vp_draw'],
      bet: ['wb_vp_bet', 'wb_vp_bet'],
      sparkles: 'wb_vp_sparkles',
    },
    keno: BASE_KENO,
  },
  morongo_sky: {
    vp: {
      marquee: 'ms_sign',
      sign: 'ms_vp_sign',
      screen: 'ms_vp_screen',
      paytable: { frame: 'ms_vp_payframe' },
      cards: 'base_vp_cards',
      back: 'ms_vp_back',
      holdOff: 'ms_vp_hold_off',
      holdOn: 'ms_vp_hold_on',
      deal: ['ms_vp_deal', 'ms_vp_deal_lit'],
      draw: ['ms_vp_draw', 'ms_vp_draw_lit'],
      bet: ['ms_vp_bet', 'ms_vp_bet_lit'],
      sparkles: 'ms_vp_sparkles',
    },
    keno: {
      marquee: 'ms_sign',
      sign: 'ms_keno_sign',
      board: 'ms_keno_frame',
      paycard: 'ms_keno_paycard',
      draw: ['ms_keno_draw', 'ms_keno_draw_lit'],
      clear: ['ms_keno_clear', 'ms_keno_clear_lit'],
      sparkles: 'ms_keno_sparkles',
    },
  },
};

export const BALLS: Piece = 'base_keno_balls';
export const METER_BET: Piece = 'base_meter_bet';
export const METER_WIN: Piece = 'base_meter_win';

/** Panel colour inside frames drawn without their centre (their printed lines would not match the table). */
export const PANEL_BG: Partial<Record<Piece, string>> = {
  base_keno_paycard: '#0b1450',
  dp_keno_paycard: '#2b0615',
  wb_vp_payframe: '#03241a',
  ms_vp_payframe: '#06125a',
  ms_keno_paycard: '#06125a',
};
