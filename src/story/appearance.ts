/**
 * Ryan's appearance across the adventure.
 *
 *   Act I      phase 1: natural black side-parted hair, no visor
 *   Act II     phase 2: bald, wraparound sports sunglasses
 *   Act III+   phase 3: the auburn ponytail wig, white-and-navy visor, hoop earrings
 *
 * Only the author-approved phase art is drawn (portraits: the Ryan expression
 * sheet, phases 1-3; on course: the phase swing sequences). The stored hair id
 * for phase 1 stays `curly` so existing saves load unchanged.
 *
 * Hair and hat are independent choices. Not every combination has been drawn
 * yet, so `resolveLook` picks the closest drawn art and says what's missing.
 * Saves from before this system have no `appearance`/`story`: they start in
 * Act I with only the natural look unlocked (nothing is assumed to have
 * happened in the story).
 */
import type { CareerState } from '../career/types';
import type { Appearance, Hair, StoryState } from './types';

export const DEFAULT_APPEARANCE: Appearance = { hair: 'curly', hat: false };

export function storyOf(c: Pick<CareerState, 'story'>): StoryState {
  const s = c.story;
  return {
    act: s?.act ?? 1,
    hairUnlocked: s?.hairUnlocked?.length ? s.hairUnlocked : ['curly'],
    encounters: s?.encounters ?? {},
    available: s?.available ?? null,
    bonds: s?.bonds ?? {},
  };
}

export function appearanceOf(c: Pick<CareerState, 'appearance'>): Appearance {
  return c.appearance ?? DEFAULT_APPEARANCE;
}

export const HAIR_INFO: Record<Hair, { label: string; unlock: string }> = {
  curly: { label: 'Natural hair', unlock: 'From the start' },
  bald: { label: 'Bald', unlock: 'Unlocks in Act II' },
  wig: { label: 'Auburn ponytail wig', unlock: 'Unlocks in Act III' },
};

/**
 * Which approved art exists: one look per phase (phase 1 without a visor,
 * phase 2 bald with sunglasses, phase 3 with the visor), each with portraits
 * and an on-course swing.
 */
const DRAWN: Record<Hair, { hat: boolean[]; gameplay: boolean }> = {
  curly: { hat: [false], gameplay: true },
  bald: { hat: [false], gameplay: true },
  wig: { hat: [true], gameplay: true },
};

export interface ResolvedLook {
  /** Which art set to draw (atlas key prefix). */
  sheet: Hair;
  hat: boolean;
  /** True when the exact hair + hat combination is drawn. */
  exact: boolean;
  /** True when on-course swing frames exist for this look. */
  gameplay: boolean;
  /** What isn't drawn yet, for the appearance screen. */
  missing: string[];
}

/** The visor goes with the phase (phase 3 wears it; phases 1 and 2 don't). */
export const phaseHat = (hair: Hair): boolean => DRAWN[hair].hat[0];

export function resolveLook(a: Appearance): ResolvedLook {
  const d = DRAWN[a.hair];
  const exact = d.hat.includes(a.hat);
  const missing: string[] = [];
  if (!exact) missing.push(`${HAIR_INFO[a.hair].label} ${a.hat ? 'with' : 'without'} a visor`);
  if (!d.gameplay) missing.push(`on-course swing frames for ${HAIR_INFO[a.hair].label.toLowerCase()}`);
  return { sheet: a.hair, hat: exact ? a.hat : d.hat[0], exact, gameplay: d.gameplay, missing };
}

/** Can Ryan wear this? Hair must be unlocked by the story. */
export function appearanceBlocker(c: Pick<CareerState, 'story'>, a: Appearance): string | null {
  if (!['curly', 'bald', 'wig'].includes(a.hair) || typeof a.hat !== 'boolean') return 'Unknown look';
  if (!storyOf(c).hairUnlocked.includes(a.hair)) return `${HAIR_INFO[a.hair].label}: ${HAIR_INFO[a.hair].unlock}`;
  return null;
}
