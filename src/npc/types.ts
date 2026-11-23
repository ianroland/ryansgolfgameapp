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
    firstAt?: GameTime;
    lastAt?: GameTime;
  };
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
