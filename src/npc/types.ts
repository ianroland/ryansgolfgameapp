/** Saved dealer-relationship shapes (validated by schemas.ts; see src/npc/relationship.ts). */
import type { GameTime } from '../core/types';
import type { LocationId } from '../expansion/unlocks';

export type NpcId = 'velvet_vega' | 'stick_lady' | 'madame_monique' | 'waifu' | 'winston';

export interface NpcState {
  npcId: NpcId;
  base: number;
  goodwill: number;
  visits: number;
  lastVisitKey: string;
  tips: {
    lifetime: number;
    count: number;
    largest: number;
    visitKeys: string[];
    visitKey: string;
    visitGain: number;
    /** Casino visits on which Ryan tipped this dealer (lifetime). Missing on v0.15.0 rows. */
    visitsTipped?: number;
    firstAt?: GameTime;
    /** Game time of the last tip. */
    lastAt?: GameTime;
  };
  /** Significant moments and dialogue flags (first tip, tiers reached, future event flags). */
  flags?: Record<string, string | number | boolean>;
  /** Significant memories, newest last (capped). */
  memories?: { key: string; at: GameTime }[];
}

export interface RelationshipLogEntry {
  id: string;
  npcId: NpcId;
  seq: number;
  at: GameTime;
  kind: 'tip' | 'visit';
  amount?: number;
  delta: number;
  txnId?: string;
  visitKey: string;
}

export interface LocationState {
  locationId: LocationId;
  seenUnlock: boolean;
  visits: number;
}
