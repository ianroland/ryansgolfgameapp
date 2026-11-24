/** Which casino the player is in, for presentation (tables, chips, machines). Set by the lobby (career flag `casinoAt`). */
import { createContext, useContext } from 'react';
import type { LocationId } from '../../expansion/unlocks';

export const CasinoLocationContext = createContext<LocationId>('desert_palms');
export const useCasinoLocation = () => useContext(CasinoLocationContext);

const PREVIEWABLE: LocationId[] = ['desert_palms', 'white_buffalo', 'morongo_sky'];

/**
 * Development builds only: `?casinoTheme=white_buffalo` (or morongo_sky; `?chipTheme=` also works)
 * draws the open floor with another casino's tables and chips, to check art before those floors
 * open. Ignored in production builds; changes nothing but the pictures.
 */
export function devChipPreview(): LocationId | null {
  if (!import.meta.env.DEV || typeof location === 'undefined') return null;
  const q = new URLSearchParams(location.search);
  const v = (q.get('casinoTheme') ?? q.get('chipTheme')) as LocationId | null;
  return v && PREVIEWABLE.includes(v) ? v : null;
}

/** Development builds only: `?tables=legacy` shows the previous table art (before/after checks). */
export function devLegacyTables(): boolean {
  if (!import.meta.env.DEV || typeof location === 'undefined') return false;
  return new URLSearchParams(location.search).get('tables') === 'legacy';
}
