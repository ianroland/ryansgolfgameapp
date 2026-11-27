/**
 * Story phases and the words for Ryan in each (outline: "Ryan's Road: Acts II–IV", 2026-11-27).
 *
 *   Act I   → phase 1 · he/him · Baba says *habibi*
 *   Act II  → phase 2 · he/him · *habibi*
 *   Act III, IV → phase 3 · she/her · *habibti*
 *
 * Every line that refers to Ryan in the third person, or that Baba says to Ryan, goes through
 * `ryanSay` so no scene hard-codes a pronoun. Misgendering is never a joke (Baba bible §5).
 */
import type { CareerState } from '../career/types';
import { storyOf } from './appearance';
import type { Act, Hair } from './types';

export type Phase = 1 | 2 | 3;

export const phaseOfAct = (act: Act): Phase => (act === 1 ? 1 : act === 2 ? 2 : 3);
export const phaseOf = (c: Pick<CareerState, 'story'>): Phase => phaseOfAct(storyOf(c).act);

/** The approved look for each phase (the art already exists for all three). */
export const HAIR_OF_PHASE: Record<Phase, Hair> = { 1: 'curly', 2: 'bald', 3: 'wig' };

const WORDS: Record<Phase, Record<string, string>> = {
  1: { he: 'he', him: 'him', his: 'his', himself: 'himself', habibi: 'habibi' },
  2: { he: 'he', him: 'him', his: 'his', himself: 'himself', habibi: 'habibi' },
  3: { he: 'she', him: 'her', his: 'her', himself: 'herself', habibi: 'habibti' },
};

/**
 * Fills `{he} {him} {his} {himself} {habibi}` (and capitalised `{He}`, `{His}`, `{Habibi}`) for
 * Ryan's phase. `{his}` is the possessive before a noun ("his putter" / "her putter").
 */
export function ryanSay(phase: Phase, template: string): string {
  return template.replace(/\{(he|him|his|himself|habibi|He|Him|His|Himself|Habibi)\}/g, (_, k: string) => {
    const w = WORDS[phase][k.toLowerCase()];
    return k[0] === k[0].toUpperCase() ? w[0].toUpperCase() + w.slice(1) : w;
  });
}

/** Tokens a template may use (for the tests that keep raw pronouns out of Ryan's lines). */
export const RYAN_TOKENS = ['he', 'him', 'his', 'himself', 'habibi'] as const;
