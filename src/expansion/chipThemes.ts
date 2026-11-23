/**
 * Casino chip themes: data-driven, one entry per casino.
 *
 * Art: Chip Pack V7 (src/assets/casino/chips/v7/), mapped through its own manifest.json, so the
 * file names and paths here are the pack's. 21 chips: 3 casinos x $1, $5, $10, $25, $100, $500,
 * $1,000; 256x256 RGBA, one round chip per file with transparent padding (tools/validate_chip_pack.py).
 *
 * Fallbacks, kept until V7 has passed in-game QA: the V3 faces (chips/<casino>/chip_<d>.png),
 * then the original chip art / CSS chips.
 *
 * Purely visual: a denomination here only picks which picture to draw. Bets, limits, payouts,
 * the bankroll and the ledger never read this file. Which chips a game offers is up to the game.
 */
import type { LocationId } from './unlocks';
import manifest from '../assets/casino/chips/v7/manifest.json';

export const CHIP_DENOMINATIONS = [1, 5, 10, 25, 100, 500, 1000] as const;
export type ChipDenomination = (typeof CHIP_DENOMINATIONS)[number];

/** Where the picture came from: the V7 pack, or a temporary V3 fallback. */
export type ChipSource = 'v7' | 'v3';

export interface ChipManifest {
  version: string;
  canvas: number[];
  diameter_px: number;
  padding_px: number;
  denominations: number[];
  files: { casino: string; denomination: number; path: string }[];
}
export const CHIP_MANIFEST: ChipManifest = manifest;

const V7_ROOT = '../assets/casino/chips/v7/';
const v7Files = import.meta.glob<string>('../assets/casino/chips/v7/chips/*/*.png', { eager: true, query: '?url', import: 'default' });
const v3Files = import.meta.glob<string>('../assets/casino/chips/*/chip_*.png', { eager: true, query: '?url', import: 'default' });

/** casino -> denomination -> url, built from the manifest's own paths. */
const v7Index = new Map<string, string>();
for (const f of CHIP_MANIFEST.files) {
  const url = v7Files[V7_ROOT + f.path];
  if (url) v7Index.set(`${f.casino}:${f.denomination}`, url);
}

export interface ChipAsset {
  denomination: number;
  url: string;
  source: ChipSource;
}

/** The one lookup every chip picture goes through. Null when no themed face exists. */
export function chipAsset(location: LocationId, denomination: number): ChipAsset | null {
  const v7 = v7Index.get(`${location}:${denomination}`);
  if (v7) return { denomination, url: v7, source: 'v7' };
  const v3 = v3Files[`../assets/casino/chips/${location}/chip_${denomination}.png`];
  return v3 ? { denomination, url: v3, source: 'v3' } : null;
}

export interface ChipTheme {
  location: LocationId;
  name: string;
  emblem: string;
  /** Brand colours, for docs and future UI (chips themselves are pictures). */
  palette: readonly string[];
  denominations: readonly ChipDenomination[];
  /** Face image for a denomination (null if this theme has none). */
  face: (d: number) => string | null;
}

function theme(location: LocationId, name: string, emblem: string, palette: string[]): ChipTheme {
  return { location, name, emblem, palette, denominations: CHIP_DENOMINATIONS, face: (d) => chipAsset(location, d)?.url ?? null };
}

export const CHIP_THEMES: Record<LocationId, ChipTheme> = {
  desert_palms: theme('desert_palms', 'Desert Palms', 'Palm tree', ['classic Vegas red', 'green', 'blue', 'black', 'gold']),
  white_buffalo: theme('white_buffalo', 'The White Buffalo', 'Buffalo', ['turquoise', 'copper', 'ivory', 'gold']),
  morongo_sky: theme('morongo_sky', 'Morongo Sky', 'Mountain and sky', ['purple', 'platinum', 'black', 'gold']),
};

/** The chip drawn for an amount on the felt: the biggest face that fits (as before). */
export function chipFaceForAmount(location: LocationId, amount: number): ChipAsset | null {
  const t = CHIP_THEMES[location];
  const d = [...t.denominations].reverse().find((v) => amount >= v) ?? t.denominations[0];
  return chipAsset(location, d);
}

/** Rendered size of the chip artwork (the pack's canvas), for width/height attributes. */
export const CHIP_CANVAS = CHIP_MANIFEST.canvas[0] ?? 256;
