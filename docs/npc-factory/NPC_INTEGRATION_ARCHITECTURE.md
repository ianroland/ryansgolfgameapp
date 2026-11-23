# NPC Factory integration architecture (PROPOSED)

Everything here is a proposal for review. Nothing is implemented.

## Principles

1. **The game runs offline.** NPC Factory is used to author content. Its exports are bundled into the game build as static data and assets, with no runtime dependency, network call or AI call.
2. **Content and state stay separate.**
   - NPC Factory owns *definitions*.
   - The game owns *live state* (relationship values, memories, availability, money, outcomes) and has final authority over gameplay.
3. **The importer is a build step.**
   - A validator and compiler turns an `npc-pack/` into typed game data, run at development time (`npm run npc:import`).
   - Bad packs fail the build, never the player's game.
4. **Gambling maths is out of reach.** NPC content can change dialogue, relationships, social access and RPG effects. It can never touch RNG, odds, payouts, card or dice outcomes, golf scoring or the ledger rules.
5. **Existing NPCs keep working.** The five dealers, the cast, Monique's memory and the inbox stories are moved behind adapters step by step. Nothing is deleted.

## Who owns what

| NPC Factory owns (content) | The game owns (runtime) |
|---|---|
| Character definitions and bibles | Player state, bankroll, ledger |
| Personality traits, speaking style | Golf career and casino progression |
| Dialogue content (lines, branches, choices) | Current relationship values |
| Expression metadata and portrait packages | NPC memory state (what happened) |
| Encounter definitions and their conditions (as data) | NPC availability (who is where now) |
| Initial relationships (NPC↔NPC, NPC↔Ryan) and progression rules | Game time |
| Rumours, secrets, rivalries (definitions) | Dialogue execution and line selection |
| Pack versioning | Event processing, random encounter selection |
| | Betting outcomes, sponsor consequences |
| | Save/load and migrations |

## Proposed runtime layers in the game

```
npc-pack (authored in NPC Factory)
   │  build-time importer: validate → compile → src/npc-content/<pack>/ (JSON + assets)
   ▼
NpcCatalog        read-only definitions, lazily loaded by location
   ▼
NpcRuntime        live state per NPC (relationship, memories, flags, cooldowns), stored in the save DB
   ▼
DialogueSelector  picks an authored line or encounter for (npc, event, context)
   ▼
DealerDialoguePanel / encounter scene    existing UI; portrait chosen by ExpressionResolver
   ▲
GameEvents        normalised events emitted by existing systems (see NPC_EVENT_MAPPING.md)
```

- **`NpcCatalog`**
  - Indexes characters by id, location and category.
  - Loads a location's content when Ryan enters it, so a casino floor's NPCs load on entry.
- **`NpcRuntime`**
  - Generalises today's `NpcState` and `NpcService`: an open id space, categories, and memories with witnesses.
  - Owns relationship writes. Every change goes through one service, logged like `relationshipLog`.
- **`DialogueSelector`**
  - Evaluates *data* conditions (no code from packs).
  - Adds weights, repetition prevention (as `wwDialogue` does today) and cooldowns.
  - Falls back to a generic line when nothing matches.
- **`ExpressionResolver`**
  - Maps an expression id to a portrait frame.
  - Falls back to the NPC's `neutral`, then a category placeholder. Never empty.
- **`GameEvents`**
  - A small synchronous emitter that existing services call after they commit: tournament pipeline, casino settle, tip, drink, encounter outcome.
  - Listeners update memories and relationships, and queue encounters.
  - Events are facts *after* a ledger or save commit. They can't change the commit.

## Adapters for existing NPCs (no rewrite)

| Existing | Adapter |
|---|---|
| `DEALERS` + `NpcState` | Becomes catalog entries with `category: dealer` and existing ids; saved rows are kept as they are. |
| `wwDialogue` JSON | Already event → line id; maps 1:1 to pack dialogue entries. |
| Monique (`monique.ts`) | Stays as is at first. Later her events map to the event vocabulary and her memory moves to `NpcRuntime` through a migration. |
| Velvet / Stick inline lines | Given stable ids in a later pass (`velvet.result.blackjack.1`), with no change in what players see. |
| `CAST` + atlases | Catalog entries with `category: career`; atlas frame keys become expression ids. |
| Encounters / stories | Their `when()` code stays. Imported encounters use data conditions, run by the same encounter engine. |
| Kayla Brooks | One NPC id with an alias: `aliases: ["golfer_kayla_brooks"]`. |

## Performance and scale (hundreds to thousands of NPCs)

- **Lazy loading:**
  - Per-location content chunks (Vite dynamic import).
  - Portraits load only when a panel shows them.
- **No background simulation:**
  - NPCs are evaluated only when an event involves them, or when Ryan is at their location.
  - Golf competitors stay as pool entries, not full NPCs, unless the pack promotes them ("notable competitor").
- **Indexes:** built at import time (location → ids, event → line ids, relationship adjacency lists), so runtime lookups are O(1).
- **Save size:** only NPCs Ryan has met get runtime rows. Memories are capped per NPC and pruned by importance and age. Untouched NPCs cost nothing.
- **Validation cost:** paid at build time, not on device.

## Phased roadmap

| Phase | Work | Changes gameplay? |
|---|---|---|
| 0 | These docs + handoff (this task) | No |
| 1 | Contract review with NPC Factory; freeze `npc-pack` v1 schema; write the JSON Schemas | No |
| 2 | Build-time validator only (reports on a sample pack); no runtime use | No |
| 3 | `NpcCatalog` + `ExpressionResolver`, used for the **cocktail servers** first (new NPCs, so no migration risk) | Adds servers |
| 4 | `GameEvents` emitter wired into existing services (read-only listeners) | No |
| 5 | `NpcRuntime` generalisation + save migration (v4): open ids, categories, witnessed memories | Save migration |
| 6 | `DialogueSelector` with data conditions; move Waifu/Winston to pack format with identical lines | No visible change |
| 7 | NPC↔NPC relationships, rumours, encounter triggers from packs | New content |
| 8 | Bulk background NPCs (patrons, staff) with location availability | New content |

Each phase needs approval before it starts.
