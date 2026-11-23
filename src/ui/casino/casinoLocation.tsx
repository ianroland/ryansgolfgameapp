/** Which casino the player is in, for presentation (chip art). Desert Palms is the only open one. */
import { createContext, useContext } from 'react';
import type { LocationId } from '../../expansion/unlocks';

export const CasinoLocationContext = createContext<LocationId>('desert_palms');
export const useCasinoLocation = () => useContext(CasinoLocationContext);
