# NPC system audit: Ryan's Road to the LPGA

- **Audited:** 2026-11-23, against `main` at v0.16.2.
- **Scope:** documentation only. No code, saves or gameplay were changed.

**Legend**
- **EXISTING:** implemented and running in the game.
- **PARTIAL:** some code exists, but it isn't wired to content.
- **PLANNED:** in a design doc or an asset pack, with no runtime code.
- **MISSING:** neither designed nor built.

## Summary

| Area | Status | Where |
|---|---|---|
| Casino dealers (5) | EXISTING | `src/npc/*`, `src/services/npcService.ts`, `src/ui/casino/*` |
| Dealer relationships, tiers, tipping | EXISTING | `src/npc/config.ts`, `relationship.ts`, `npcService.ts`, `Tipping.tsx` |
| Relationship event hooks | PARTIAL (registry is empty) | `src/npc/hooks.ts` |
| Dealer dialogue | EXISTING, in **three** separate systems | see §2 |
| Shared dialogue panel (portrait, tier, collapse) | EXISTING | `src/ui/casino/DealerPanel.tsx` |
| Story cast (golf characters) | EXISTING (10 characters) | `src/story/cast.ts`, `src/assets/characters/*` |
| Story encounters (graph dialogue + choices) | EXISTING (2 encounters) | `src/story/encounters.ts` |
| Inbox stories (choice events) | EXISTING (22 stories) | `src/career/stories.ts` |
| Career "People" relationships | EXISTING | `CareerState.relationships` (`src/career/types.ts`) |
| Story bonds (cast outside People) | EXISTING | `StoryState.bonds` |
| Tournament competitors | EXISTING (generated pools) | `src/career/field.ts` |
| Rival (Kayla Brooks) | EXISTING | `field.ts` (golfer) + `cast.ts` (character) |
| Cocktail servers (3) | PLANNED (dialogue pack V1 received; sprites not yet supplied) | `RYANS_CASINO_SERVERS_DIALOGUE_V1` |
| Drinks, sponsor confidence | PLANNED | `docs/casino-expansion/*` |
| Bartenders, poker opponents, patrons, hotel staff, security | MISSING (poker rooms PLANNED as "secret poker") | — |
| Tournament officials, spectators | MISSING as NPCs (Commissioner Clipboard exists as cast; "fans" is a relationship number) | — |
| NPC schedules / shifts | MISSING | — |
| NPC-to-NPC relationships, rumours, secrets | MISSING | — |
| General game event bus | MISSING (see §8) | — |

## 1. Casino dealers: EXISTING

**Files**
- `src/npc/registry.ts`: `DEALERS`.
- `src/npc/types.ts`: `NpcId`, `NpcState`.
- `src/services/npcService.ts`.

**Function.** Five dealers, all at Desert Palms. Each `DealerDef` has id, name, short name, location, game and table minimum.

| NpcId | Name | Game |
|---|---|---|
| `velvet_vega` | Velvet Vega | Blackjack |
| `stick_lady` | Stick Lady | Craps |
| `madame_monique` | Madame Monique | Roulette |
| `waifu` | Waifu | Baccarat |
| `winston` | Winston | Three Card Poker |

**Data.** `NpcId` is a closed TypeScript union, and save validation checks it (`schemas.ts`).

**Dependencies.** Casino rule limits (`tableMin`), the economy ledger (tips), and the save DB.

**Reusability.** Good for "a named NPC with saved relationship state".

**Missing**
- Open-ended ids: new NPCs require a code change to the union and the schema.
- No category field.
- No schedule.
- Location is fixed.

**Risk.** Importing new NPCs means widening `NpcId` and the saved-row schema. That needs a save migration step (the migration pattern already exists).

## 2. Dialogue: EXISTING, three systems

**2a. Velvet Vega and Stick Lady**
- **Files:** `src/ui/casino/DealerDialogue.tsx`. Lines are inline strings in `CasinoPanel.tsx` (`velvetLine`, `stickCall`).
- **How it works:** one typed line at a time, from game results.
- **Data:** `DealerLine = string | { text; draft }`. There are **no line ids**.
- **Portraits:**
  - Velvet: `velvet_portrait.png`, a single image.
  - Stick Lady: `stick_portraits.png` + `stick_portraits.json`, chosen by dealer animation (neutral, smile, laugh, wink, facepalm).
- **Gaps:** no stable ids, no conditions, no variants, no repetition control.

**2b. Waifu and Winston**
- **Files:** `src/casino/wwDialogue.ts` + `src/casino/dialogue/{waifu,winston}.json`.
- **How it works:**
  - Lines are grouped by event: `welcome`, `bet`, `deal`, `natural`, `player_win`, … (`WAIFU_EVENTS`, `WINSTON_EVENTS`).
  - Every line has a **stable id** (`waifu_welcome_01`) and a status (`draft`).
  - The last 8 lines are kept to avoid repeats.
  - A "Chat: quiet" level (stored in localStorage) keeps only result and notice lines.
  - Each event maps to a face and a pose (`WAIFU_FACE`, `WAIFU_POSE`).
- **Portraits:** horizontal face strips (`ww/<who>_faces.png`), with face names in `ww_meta.json`.
- **Reusability:** **the closest to an import format already in the game.**
- **Gaps:** no conditions beyond the event, no weights, no relationship gating.

**2c. Madame Monique**
- **Files:** `src/casino/monique.ts`, `src/ui/casino/Monique.tsx`, `docs/MONIQUE_DIALOGUE_INVENTORY.md`.
- **How it works:**
  - Events: `greet_first`, `greet_golf_win`, `win_streak`, `loss_streak`, `extraordinary`, `pink_jacket`, …
  - Line choice depends on memory (streaks, visits, golf facts already remarked on, banter cooldown).
  - Ryan can reply with comeback lines.
  - Lines have an `approved` flag.
- **Memory:** `MoniqueMemory` is saved as a JSON string in `CareerState.flags.moniqueMemory`.
- **Portraits:** an expression strip, `monique_portraits.png`.
- **Reusability:** shows the needed behaviours: memory, cooldowns, context greetings, two speakers.
- **Gap:** the memory format is specific to Monique.

**2d. Tip reactions**
- **File:** `src/npc/tipLines.ts` (draft lines for each dealer).
- **Events:** `TipEvent` = `tip_first | tip_small | tip_generous | tip_huge | tip_regular | tip_maxed | tier_up`.

**2e. Story encounters**
- **File:** `src/story/encounters.ts` (2 encounters).
- **How it works:** a node graph. Each node has lines, then a choice, a skill challenge, a next node, or an outcome.
  - Lines carry `who`, `expr` and `pose`.
  - Outcomes carry `effects` (money, stats, relationships) and `bonds`.
  - Eligibility is a code function, `when(c, story)`.
  - Completed encounters are recorded in `StoryState.encounters` and never repeat.
- **Reusability:** **the right model for branching conversations.**
- **Gap:** conditions are TypeScript functions, so they can't be imported as data.

**2f. Inbox stories**
- **File:** `src/career/stories.ts` (22 stories).
- **How it works:** a title, a body, and choices with effects. `when()` is a code function; `once` and `weight` control frequency.
- **Gap:** same as encounters, conditions are code.

**Shared UI**
- **Files:**
  - `DealerDialoguePanel` (`src/ui/casino/DealerPanel.tsx`): portrait slot, name, tier chip, draft tag, extra controls and actions, collapsible.
  - `TierChip` (`Tipping.tsx`).
- **Story scenes:** encounters use their own scene UI, with full-body poses.
- **Casino tables:** no full-body sprites (`SHOW_TABLE_DEALER_SPRITES = false`).

**Integration risks**
- **Three line formats with different id rules:** 2a has no ids at all; 2b and 2d have ids.
- **Draft status is spelled differently:** `status: 'draft'` in 2b, `approved: boolean` in 2c, `draft: boolean` in 2a.

## 3. Relationships

**Dealer relationships: EXISTING**
- **Files:** `src/npc/config.ts`, `relationship.ts`, `npcService.ts`; DB tables `npcState` and `relationshipLog`.
- **Score:** a hidden 0–100 score = `base` (50) + `goodwill` (tips; capped at 15).
- **Tiers** (`RELATIONSHIP_CONFIG.tiers`):

| Tier | Minimum score |
|---|---|
| Acquaintance | 0 |
| Regular | 58 |
| Friend | 70 |
| Confidant | 82 |
| Inner Circle | 92 |

- **Tip rules:** diminishing returns, plus per-tip and per-visit caps.
- **Saved state:** `flags` (a record) and `memories` (`{ key, at }`, capped at 20). The `relationshipLog` table keeps one entry per tip or visit.
- **Rules:**
  - All values are marked PROPOSED.
  - Relationships never change casino odds or payouts.
  - Tips alone can't go past Regular; higher tiers need real interactions (the `applyInteraction` path exists).

**Career People: EXISTING**
- **Data:** `CareerState.relationships: Record<PersonId, number>`, with PersonId = `coach | mom | friend | rival | agent | sponsor | caddie | fans`.
- **Changed by:** stories, encounters and results.
- **Naming inconsistency:**
  - In stories, `friend` is written as "Jess" and `mom` as "Baba".
  - In `CAST`, the friend character is "Avery" (`friend_avery`).
  - This needs a canonical decision before importing.

**Story bonds: EXISTING**
- **Data:** `StoryState.bonds: Record<castId, number>`, for cast members who aren't People.

**Missing**
- One relationship model shared by dealers, cast and People.
- NPC-to-NPC edges.
- Relationship decay or mood.

## 4. Tipping: EXISTING

- **Files:** `src/ui/casino/Tipping.tsx` (`TipTray`), `npcService.tip`.
- **Ledger:** each tip goes through `EconomyService.post` as type `'tip'`, with idempotency key `tip:<npc>:<tipId>`. A press lock prevents double charges.
- **Amounts:** per casino (`RELATIONSHIP_CONFIG.tipAmounts`).
- **Reusability:** directly reusable for cocktail servers once `NpcId` is widened.

## 5. Schedules and availability: MISSING

- Dealers are always at their tables; there's no time of day.
- Game time is a career calendar (season and week), with one casino visit per week (`casinoWeekKey`).
- Cocktail server, bartender and poker-room availability will need a schedule model. It should work in visits and weeks, not real time.

## 6. Memory and event flags

| What | Status | Where it's saved |
|---|---|---|
| Dealer memories and flags | EXISTING | `NpcState.memories` / `flags` |
| Monique's memory | EXISTING | JSON string in `CareerState.flags.moniqueMemory` |
| Career flags | EXISTING | `CareerState.flags` (a record of string/number/boolean), used for one-off facts such as `casinoVisit` and `seed` |
| Completed encounters | EXISTING | `StoryState.encounters` |
| Witness model (who knows what) | MISSING | — |

## 7. Save and load: EXISTING

- **Storage:** Dexie/IndexedDB, schema **v3** (`src/persistence/db.ts`). Every row is checked by zod in `src/persistence/schemas.ts`.
- **Export/import:** `saveService`, with step-by-step `migrateSaveFile` (v2 → v3 added `unlocks`, `milestones`, `npcState`, `relationshipLog`, `locationState`).
- **Repairs:** a reconcile pattern runs at boot and after import for derived data (records, legacy, casino unlocks, tour fields).
- **Risk:** any new saved NPC data must add a schema version and a migration. It must never break existing rows.

## 8. Events: PARTIAL

- **Career events:** `CareerEvent` with `eventType: 'tournament_completed'` only, through `tournamentPipeline.ts`, which is idempotent with a processed-events table.
- **Ledger types:** `TransactionType`, including `casino`, `tip`, `prize_money`, `story` and `sponsor_income`.
- **Event-like enums:** `TipEvent`, `MoniqueEvent`, `WaifuEvent`, `WinstonEvent`, and the broadcast `MomentType` (ACE, EAGLE, LEAD_CHANGE, RIVAL_SWING, …).
- **Hooks:** `RELATIONSHIP_HOOKS` is checked after tips and visits (the registry is empty).
- **Missing:** a single event vocabulary and dispatcher. Today each system decides inline. See `NPC_EVENT_MAPPING.md`.

## 9. Competitors and rival

- **Pools:** `src/career/field.ts` keeps generated pools per tour (ids `golfer_<tour>_<n>`, plus a rating).
  - Since v0.16.1, the Amateur Circuit and SoCal Pro Series are men's fields; Q-School, Epson and LPGA are women's.
  - Pools evolve each season.
- **Rival:** Kayla Brooks has **two ids**: `golfer_kayla_brooks` (competitor) and `kayla_brooks` (cast character). Integration risk: the import contract needs alias support.
- **Gap:** competitors have no personality or dialogue; they're names and ratings.

## 10. Portraits and sprites

| Character group | Art | Notes |
|---|---|---|
| Cast (10) and Ryan | One atlas each: `src/assets/characters/<id>.png` + `.json`, packed by `tools/pack_characters.py` | Frame keys `portrait.<expression>`, `portrait.big`, `<pose>.<n>`. 8 expression names (`neutral, happy, angry, surprised, worried, laughing, confident, disappointed`); cast sheets draw 7 heads, so "worried" reuses "disappointed". Ryan's frames are per phase look. |
| Dealers | One-off formats: a single PNG (Velvet), strips with JSON (Stick Lady, Waifu, Winston), a strip (Monique) | — |
| Cocktail servers | Planned: 3 × 6 expressions (`friendly, playful, impressed, concerned, annoyed, firm`) | Sheets not yet supplied |
| All portraits | — | No shared lookup or fallback rule across these formats. |

## 11. Casino assignments

- **Locations:** `desert_palms`, `white_buffalo`, `morongo_sky` (`src/expansion/locations.ts`).
- **Unlocks:** permanent, at a bankroll peak of $100K and $1M.
- **Dealers:** all five are Desert Palms only today.
- **Floors:** only the Desert Palms floor is playable. The other two exist as lobby cards and art themes.
