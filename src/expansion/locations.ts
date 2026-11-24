/**
 * Casino location registry: Desert Palms, The White Buffalo, Morongo Sky.
 * Every location reuses the same table components and rules modules; a location
 * only decides which games, dealers and unlock rule apply. Presentation names for the
 * two new casinos are as given in the bible; their looks are PROPOSED (no art yet).
 */
import type { LocationId, UnlockId } from './unlocks';
import { UNLOCK_RULES } from './unlocks';

export type CasinoGameId = 'blackjack' | 'slots' | 'craps' | 'roulette' | 'baccarat' | 'threecard' | 'machines' | 'greyhounds' | 'sportsbook';

export interface LocationDef {
  id: LocationId;
  name: string;
  /** One line for the lobby card. */
  tagline: string;
  /** Null: open from the start. */
  unlock: UnlockId | null;
  /** 'open': playable. 'coming_soon': can be unlocked, but its floor isn't built yet. */
  status: 'open' | 'coming_soon';
  games: { id: CasinoGameId; label: string }[];
  /**
   * Music cue ids for the future casino soundtrack system (CONFIRMED feature, not built yet).
   * They name entries in the planned data-driven music registry; no audio exists for them.
   */
  music: Record<MusicRoom, string>;
}

export type MusicRoom = 'lobby' | 'floor' | 'bar' | 'vip';
const cues = (id: LocationId): Record<MusicRoom, string> => ({ lobby: `${id}_lobby`, floor: `${id}_floor`, bar: `${id}_bar`, vip: `${id}_vip` });

export const LOCATIONS: readonly LocationDef[] = [
  {
    id: 'desert_palms',
    music: cues('desert_palms'),
    name: 'Desert Palms',
    tagline: 'The neon on the edge of town. Your home casino.',
    unlock: null,
    status: 'open',
    games: [
      { id: 'blackjack', label: 'Blackjack' },
      { id: 'slots', label: 'Slots' },
      { id: 'machines', label: 'Video Poker & Keno' },
      { id: 'craps', label: 'Craps' },
      { id: 'roulette', label: 'Roulette' },
      { id: 'baccarat', label: 'Baccarat' },
      { id: 'threecard', label: 'Three Card' },
      { id: 'greyhounds', label: 'Greyhounds' },
      { id: 'sportsbook', label: 'Sportsbook (demo)' },
    ],
  },
  {
    id: 'white_buffalo',
    music: cues('white_buffalo'),
    name: 'The White Buffalo',
    tagline: 'A desert resort with higher limits and long memories.',
    unlock: 'unlock:white_buffalo',
    status: 'coming_soon',
    games: [],
  },
  {
    id: 'morongo_sky',
    music: cues('morongo_sky'),
    name: 'Morongo Sky',
    tagline: 'The high-roller destination. Invitation-only rooms.',
    unlock: 'unlock:morongo_sky',
    status: 'coming_soon',
    games: [],
  },
];

export const locationById = (id: LocationId) => LOCATIONS.find((l) => l.id === id)!;

/** Bankroll needed to unlock a location (null if it's open from the start). */
export const unlockThreshold = (l: LocationDef) => (l.unlock ? UNLOCK_RULES.find((r) => r.id === l.unlock)!.threshold : null);

/** Is a location unlocked, given the unlock records on file? Desert Palms always is. */
export const isUnlocked = (l: LocationDef, unlocked: ReadonlySet<string>) => l.unlock === null || unlocked.has(l.unlock);
