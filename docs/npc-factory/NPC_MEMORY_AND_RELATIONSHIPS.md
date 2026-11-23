# NPC memory and relationships: persistence proposal (PROPOSED)

## What exists today

- **Dealers:** `npcState` rows hold:
  - the score: `base` + `goodwill`
  - `visits` and `tips`
  - `flags`: a record of string, number or boolean
  - `memories`: `{ key, at }`, newest last, capped at 20 (`RELATIONSHIP_CONFIG.memoriesKept`)
  - `relationshipLog`: one row per tip or visit
- **Monique:** her own memory, saved as a JSON string in `CareerState.flags.moniqueMemory`.
- **Career People** (`relationships`), story bonds (`StoryState.bonds`) and completed encounters (`StoryState.encounters`).
- **Missing:** a witness model, NPC↔NPC relationships, rumours and secrets, and one relationship model shared by everyone.

## Proposed model (save schema v4, added by migration; nothing removed)

### `npcRuntime` table: one row per NPC Ryan has met

```ts
{
  npcId: string;               // open id (pack or existing)
  packVersion: string;         // pack that introduced the NPC
  relationship: { base: number; goodwill: number; interaction: number }; // existing split kept; tier derived by the game
  flags: Record<string, string | number | boolean>;
  memories: { key: string; eventId?: string; at: GameTime; weight: 1 | 2 | 3; source: 'witnessed' | 'told' | 'rumor' }[];
  recentLines: string[];       // repetition prevention (last N line ids)
  cooldowns: Record<string, number>; // key → visit or week index when available again
  lastSeen?: GameTime;
  mood?: 'warm' | 'neutral' | 'cool'; // optional, derived from recent events, decays to neutral
}
```

**Migration v3 → v4**
- Each existing `npcState` row becomes an `npcRuntime` row with the same id, and values are copied exactly. `goodwill` keeps its cap.
- `moniqueMemory` stays where it is until Monique's adapter moves it (a later phase). It isn't duplicated.
- `relationshipLog` is kept as the audit trail and extended to all NPCs.
- The migration is step-by-step, like `migrateSaveFile` v2 → v3. Old saves import cleanly; new optional fields are simply missing on old rows.

### `npcEdges` table: NPC↔NPC (only edges that changed from the pack's starting graph)

```ts
{ key: `${a}|${b}`; type: EdgeType; affinity: number; revealed: boolean; updatedAt: GameTime }
```

- Starting edges come from the pack and aren't saved until they change, which keeps saves small.

### `rumors` table: what Ryan knows

```ts
{ rumorId: string; learnedFrom?: string; at: GameTime }
```

## Witness rule: NPCs only know what they saw or were told

- **Witnesses:** each event names `witnesses`, which the game computes: NPCs at that location this visit, plus the NPCs involved.
- **Memory:** a listener adds memories only for witnesses (`source: 'witnessed'`).
- **Spreading:**
  - "Told" and "rumor" memories spread only through authored edges (for example coworkers at the same casino).
  - Spreading happens at the next visit, so there's no constant simulation.
- **Golf news:** golf results are public facts. NPCs who "follow golf" (a character tag) may get `told` memories of wins and majors. Others don't know.

## Pruning and size

- **Per-NPC cap:** 20 memories, the existing value, now configurable per category.
- **What goes first:** low-weight, old memories are dropped first. Weight 3 ("defining") memories are never pruned automatically.
- **NPCs Ryan hasn't met:** no rows at all.
- **Expected size:** about 300 bytes per met NPC. 500 met NPCs is about 150 KB, well within IndexedDB comfort.

## Relationship rules (the game keeps authority)

- **Tiers:** stay game-defined (Acquaintance 0, Regular 58, Friend 70, Confidant 82, Inner Circle 92, all PROPOSED values).
- **Tips:** feed `goodwill` only and stay capped. Tips alone can't go past Regular, the existing rule.
- **Pack effects:** request `interaction` changes. The game clamps each change, ±5 per event (PROPOSED).
- **No hidden penalties:** there's no penalty for never tipping and no decay by default (an existing Slice 1 rule). A pack can't turn decay on; that's a game setting.
- **Never touches gambling:** relationship values never feed casino odds, payouts or golf scoring.

## Examples

| Event | Who remembers | Memory key |
|---|---|---|
| Ryan beats a poker opponent | the opponent + witnesses at the table | `beat_me_poker` |
| Ryan tips a cocktail server | that server | `tipped` (existing pattern) |
| Ryan wins a tournament | NPCs tagged `follows_golf`, as `told` | `ryan_won_<tournament>` |
| A server refuses Ryan service | that server; the bartender as `told` | `refused_service` |
| Sponsor warning | sponsor contact (Mr. Dawson) | `sponsor_warning` |
