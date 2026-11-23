/**
 * Extension point for future relationship-driven events (poker invitations, favours, quests).
 * NOT USED BY ANY CONTENT YET: no invitations are implemented in Slice 1.
 *
 * A hook names a dealer (or '*'), a condition on the saved relationship, and an id. After every
 * tip or visit, NpcService reports which hooks became eligible, so a later slice can offer the
 * event between hands. Hooks never change money or game outcomes themselves.
 */
import { tierRank, tierIdOf } from './relationship';
import type { TierId } from './config';
import type { NpcId, NpcState } from './types';

export interface RelationshipHook {
  id: string;
  npc: NpcId | '*';
  /** Minimum tier, plus any extra condition on the dealer's saved state. */
  minTier: TierId;
  when?: (s: NpcState) => boolean;
  /** Flag set on the dealer once the hook has fired, so it fires once. */
  onceFlag: string;
}

/** Registered hooks. Empty until a relationship event is approved. */
export const RELATIONSHIP_HOOKS: RelationshipHook[] = [];

export function eligibleHooks(s: NpcState, hooks: readonly RelationshipHook[] = RELATIONSHIP_HOOKS): RelationshipHook[] {
  return hooks.filter(
    (h) => (h.npc === '*' || h.npc === s.npcId) && tierRank(tierIdOf(s)) >= tierRank(h.minTier) && !(s.flags ?? {})[h.onceFlag] && (h.when?.(s) ?? true),
  );
}
