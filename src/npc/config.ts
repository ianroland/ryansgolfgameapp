/**
 * Every tunable number for dealer tipping and relationships, in one place.
 * All values are PROPOSED (Casino Secrets & Rivalries, Slice 1) and can be changed here
 * without touching rules or components.
 */
import type { LocationId } from '../expansion/unlocks';

export type TierId = 'acquaintance' | 'regular' | 'friend' | 'confidant' | 'inner_circle';

export interface TierDef {
  id: TierId;
  label: string;
  /** Relationship needed (0–100; never shown to the player). */
  min: number;
}

export const RELATIONSHIP_CONFIG = {
  /** Tip sizes offered at each casino. */
  tipAmounts: { desert_palms: [5, 25, 100], white_buffalo: [5, 25, 100], morongo_sky: [5, 25, 100] } satisfies Record<LocationId, number[]>,
  /** Where every dealer starts: neutral. */
  neutralBase: 50,
  /** Most relationship tips alone can ever add (keeps the upper tiers for real interactions). */
  goodwillCap: 15,
  /** Most one tip can add. */
  tipGainCap: 3,
  /** Most all tips in one casino visit can add. */
  visitGainCap: 5,
  /** Gain per tip = gainScale × log2(1 + tip ÷ table minimum): diminishing returns. */
  gainScale: 1.2,
  /** Consistency bonus: +step for each recent visit with a tip, up to maxVisits. */
  consistencyStep: 0.1,
  consistencyMaxVisits: 5,
  /** Recent visits remembered for consistency. */
  visitsRemembered: 8,
  /** Tip size (× table minimum) that counts as generous, and as huge. */
  generousRatio: 2,
  hugeRatio: 8,
  /** Visits with a tip (other than this one) that make Ryan a "consistent" tipper. */
  consistentAfterVisits: 2,
  /** Tiers, lowest first. Tips alone reach at most neutralBase + goodwillCap (65): Regular. */
  tiers: [
    { id: 'acquaintance', label: 'Acquaintance', min: 0 },
    { id: 'regular', label: 'Regular', min: 58 },
    { id: 'friend', label: 'Friend', min: 70 },
    { id: 'confidant', label: 'Confidant', min: 82 },
    { id: 'inner_circle', label: 'Inner Circle', min: 92 },
  ] as const satisfies readonly TierDef[],
  /** Significant memories kept per dealer. */
  memoriesKept: 20,
} as const;
