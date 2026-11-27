/** Shared types for Ryan's appearance, the cast and story encounters. */
import type { GameTime } from '../core/types';

export const EXPRESSIONS = ['neutral', 'happy', 'angry', 'surprised', 'worried', 'laughing', 'confident', 'disappointed'] as const;
export type Expression = (typeof EXPRESSIONS)[number];

/** Full-body poses. Not every character has every pose: see `poseFrames`. */
export type Pose = 'idle' | 'talk' | 'celebrate' | 'disappointed' | 'confident' | 'walk' | 'laugh' | 'angry' | 'surprised' | 'sad' | 'point' | 'handshake' | 'sit' | 'stand'
  /** Baba's sheet: emphatic talk, handing over a BOBO MILKY, drinking one, thinking. */
  | 'emphatic' | 'give' | 'drink' | 'think';

/**
 * Ryan's phase look (stable save ids): `curly` = phase 1, natural black side-parted hair (Act I);
 * `bald` = phase 2, with wraparound sunglasses (from Act II); `wig` = phase 3, the auburn ponytail wig
 * and visor (from Act III). The id `curly` is kept for save compatibility; no curly-haired Ryan exists.
 */
export type Hair = 'curly' | 'bald' | 'wig';
export const HAIRS: Hair[] = ['curly', 'bald', 'wig'];

/** Hair and hat are chosen independently. */
export interface Appearance {
  hair: Hair;
  hat: boolean;
}

export type Act = 1 | 2 | 3 | 4;

export interface EncounterRecord {
  outcome: string;
  /** The choices made, in order (and the challenge result, if any). */
  path: string[];
  season: number;
  week: number;
  at: GameTime;
}

export interface StoryState {
  act: Act;
  /** Hair styles Ryan can pick (story unlocks; never removed). */
  hairUnlocked: Hair[];
  /** Completed encounters. A completed unique encounter never runs again. */
  encounters: Record<string, EncounterRecord>;
  /** Encounter waiting to be played, if any. */
  available: string | null;
  /** Relationship with cast members who aren't in the classic People list (0-100). */
  bonds: Record<string, number>;
}
