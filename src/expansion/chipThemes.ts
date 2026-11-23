/**
 * Casino chip themes (Chip Asset Pack V3, prototype art, cleaned by tools/clean_chip_faces.py).
 * Purely visual: denominations here only pick which picture to draw. Bets, bankroll and the
 * ledger never read this file.
 *
 * Every casino has $1, $5, $25, $100, $500 and $1,000 faces. Amounts without their own face
 * (the $10 selector chip) fall back to the original chip art and CSS chips.
 */
import type { LocationId } from './unlocks';

export const CHIP_DENOMINATIONS = [1, 5, 25, 100, 500, 1000] as const;
export type ChipDenomination = (typeof CHIP_DENOMINATIONS)[number];

const files = import.meta.glob<string>('../assets/casino/chips/*/chip_*.png', { eager: true, query: '?url', import: 'default' });

export interface ChipTheme {
  location: LocationId;
  denominations: readonly ChipDenomination[];
  /** Face image for a denomination (null if this theme has none). */
  face: (d: number) => string | null;
}

function theme(location: LocationId): ChipTheme {
  return {
    location,
    denominations: CHIP_DENOMINATIONS,
    face: (d) => files[`../assets/casino/chips/${location}/chip_${d}.png`] ?? null,
  };
}

export const CHIP_THEMES: Record<LocationId, ChipTheme> = {
  desert_palms: theme('desert_palms'),
  white_buffalo: theme('white_buffalo'),
  morongo_sky: theme('morongo_sky'),
};

/** The chip drawn for an amount on the felt: the biggest face that fits (as before). */
export function chipFaceForAmount(location: LocationId, amount: number): { denomination: number; url: string } | null {
  const t = CHIP_THEMES[location];
  const d = [...t.denominations].reverse().find((v) => amount >= v) ?? t.denominations[0];
  const url = t.face(d);
  return url ? { denomination: d, url } : null;
}
