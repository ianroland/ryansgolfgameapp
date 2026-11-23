/** Which casino the player is in, for presentation (chip art). Desert Palms is the only open floor. */
import { createContext, useContext } from 'react';
import type { LocationId } from '../../expansion/unlocks';

export const CasinoLocationContext = createContext<LocationId>('desert_palms');
export const useCasinoLocation = () => useContext(CasinoLocationContext);

const PREVIEWABLE: LocationId[] = ['desert_palms', 'white_buffalo', 'morongo_sky'];

/**
 * Development builds only: `?chipTheme=white_buffalo` (or morongo_sky) draws the Desert Palms
 * tables with another casino's chips, to check chip art before those floors open. Ignored in
 * production builds; changes nothing but the pictures.
 */
export function devChipPreview(): LocationId | null {
  if (!import.meta.env.DEV || typeof location === 'undefined') return null;
  const v = new URLSearchParams(location.search).get('chipTheme') as LocationId | null;
  return v && PREVIEWABLE.includes(v) ? v : null;
}
