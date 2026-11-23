/**
 * The casino's dealers as NPCs. Their art, names and existing lines are unchanged: this only
 * says who deals which game where, and what a normal bet at that table is (for tipping).
 */
import { BACCARAT_LIMITS } from '../casino/baccarat';
import { BJ_LIMITS } from '../casino/blackjack';
import { CRAPS_LIMITS } from '../casino/craps';
import { ROULETTE_LIMITS } from '../casino/roulette';
import { THREE_CARD_LIMITS } from '../casino/threeCard';
import type { CasinoGameId } from '../expansion/locations';
import type { LocationId } from '../expansion/unlocks';
import type { DealerId } from './types';

export interface DealerDef {
  id: DealerId;
  name: string;
  /** Used on buttons ("Tip Monique"). */
  short: string;
  location: LocationId;
  game: CasinoGameId;
  /** A normal bet at the table: the table minimum. */
  tableMin: number;
}

export const DEALERS: readonly DealerDef[] = [
  { id: 'velvet_vega', name: 'Velvet Vega', short: 'Velvet', location: 'desert_palms', game: 'blackjack', tableMin: BJ_LIMITS.min },
  { id: 'stick_lady', name: 'Stick Lady', short: 'Stick Lady', location: 'desert_palms', game: 'craps', tableMin: CRAPS_LIMITS.min },
  { id: 'madame_monique', name: 'Madame Monique', short: 'Monique', location: 'desert_palms', game: 'roulette', tableMin: ROULETTE_LIMITS.min },
  { id: 'waifu', name: 'Waifu', short: 'Waifu', location: 'desert_palms', game: 'baccarat', tableMin: BACCARAT_LIMITS.min },
  { id: 'winston', name: 'Winston', short: 'Winston', location: 'desert_palms', game: 'threecard', tableMin: THREE_CARD_LIMITS.anteMin },
];

export const dealerById = (id: string) => DEALERS.find((d) => d.id === id);
export const isDealerId = (id: string): id is DealerId => DEALERS.some((d) => d.id === id);
