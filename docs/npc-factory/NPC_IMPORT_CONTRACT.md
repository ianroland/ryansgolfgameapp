# NPC import contract: `npc-pack` v1 (PROPOSED, for review)

This is a proposal written against the game's real conventions. It isn't implemented, and nothing about NPC Factory's internals is assumed. Field names follow the game's style: snake_case ids, camelCase JSON keys.

## Package layout

```
npc-pack/
  manifest.json           pack id, version, contract version, contents index, checksums
  characters/<npc_id>.json
  dialogue/<npc_id>.json  lines grouped by event; branching conversations
  encounters/<encounter_id>.json
  relationships/graph.json  NPC↔NPC edges and NPC↔Ryan starting values
  sprites/<npc_id>/<expression>.png   (or one sheet + frames, see NPC_SPRITE_REQUIREMENTS.md)
  schemas/                JSON Schema copies the pack was validated against
  integration/            optional notes: event ids used, unresolved references
  README.md
```

## ID rules

| Id | Format | Example |
|---|---|---|
| NPC | `^[a-z][a-z0-9_]{2,47}$`, globally unique, never reused | `maya_solis` |
| Dialogue line | `<npc_id>.<event>.<n>`, unique within the pack | `maya_solis.order.2` |
| Expression | `^[a-z_]{2,24}$` | `concerned` |
| Encounter / outcome / node | `^[a-z][a-z0-9_]{2,63}$` | — |
| Location | Game ids only: `desert_palms`, `white_buffalo`, `morongo_sky`, `driving_range`, `clubhouse_lounge`, `tour:<tour_id>` | — |
| Aliases | Optional `aliases: []` on a character, mapping legacy game ids | `["golfer_kayla_brooks"]` |

Further rules:
- **Ids are stable across pack versions.** Renaming means deprecating the old id and adding a new one.
- **Existing game ids are reserved** (the importer refuses a pack that reuses them unless the character is the matching existing NPC):
  - Dealers: `velvet_vega`, `stick_lady`, `madame_monique`, `waifu`, `winston`
  - Cast: `kayla_brooks`, `coach_martinez`, `biff_fairway`, `marty_mulligan`, `commissioner_clipboard`, `agent_reese`, `sponsor_dawson`, `caddie_jordan`, `friend_avery`, `reporter_kim`, and `ryan`

## `manifest.json`

```json
{
  "contract": "npc-pack/1",
  "packId": "tiny_mana.casino_staff",
  "version": "1.2.0",
  "createdBy": "NPC Factory",
  "createdAt": "2026-11-23T00:00:00Z",
  "approval": "draft",
  "characters": ["maya_solis"],
  "encounters": [],
  "requiresGame": ">=0.17.0",
  "files": { "characters/maya_solis.json": "sha256-…" }
}
```

- **`approval`:** one of `draft`, `approved` or `retired`. Draft lines show the existing "Draft line" tag in the game, as they do today.

## `characters/<id>.json`

```json
{
  "id": "maya_solis",
  "name": "Maya Solis",
  "short": "Maya",
  "category": "cocktail_server",
  "role": "Cocktail server",
  "locations": ["desert_palms"],
  "bible": { "summary": "…", "backstory": "…", "personality": ["playful", "warm", "direct"], "humor": "quick wit", "speech": "short sentences, teasing" },
  "expressions": ["friendly", "playful", "impressed", "concerned", "annoyed", "firm"],
  "defaultExpression": "friendly",
  "portrait": { "kind": "files", "dir": "sprites/maya_solis" },
  "schedule": { "kind": "visits", "rules": [{ "location": "desert_palms", "chance": 1.0 }] },
  "relationship": { "start": 50, "tiers": "default" },
  "memoryKeys": ["tipped", "refused_service", "big_win_seen"],
  "tags": ["casino", "server"],
  "aliases": []
}
```

- **`category`:** one of `dealer`, `cocktail_server`, `bartender`, `poker_opponent`, `patron`, `hotel_staff`, `security`, `rival_golfer`, `competitor`, `coach`, `caddie`, `sponsor`, `official`, `media`, `family`, `friend`, `spectator`, `other`.
- **`schedule.kind`:** `always`, `visits` (chance per casino visit) or `weeks` (career weeks or seasons). There's no real-world clock, because the game time is the career calendar.
- **`relationship.tiers`:** `"default"` uses the game's five tiers (Acquaintance → Inner Circle). Packs can't redefine thresholds; the game owns them.

## `dialogue/<id>.json`

```json
{
  "npc": "maya_solis",
  "events": {
    "casino.server_approach": [
      { "id": "maya_solis.approach.1", "text": "You found my section again. Lucky me.", "expression": "friendly", "weight": 2,
        "when": { "all": [{ "tierAtLeast": "regular" }, { "memory": "tipped" }] }, "cooldownVisits": 3, "status": "draft" }
    ]
  },
  "conversations": { "small_talk_1": { "start": "a", "nodes": { "a": { "lines": [], "choices": [{ "id": "ask", "label": "Ask about the high-limit room", "next": "b", "effects": [] }] } } } }
}
```

- **`when`:** a small, data-only condition language. There's no code in packs. The game evaluates it:
  - Combinators: `all`, `any`, `not`.
  - Relationship: `tierAtLeast` / `tierBelow`.
  - Memory and flags: `memory` / `noMemory` (this NPC's memory key), `flag` (game flag set by the game).
  - Place and progress: `location`, `act`, `tour`, `phase`.
  - Casino state: `casinoVisitsAtLeast`, `sessionNetAbove` / `sessionNetBelow`, `drinkState` (`sober | buzzed | impaired | refused`).
  - History: `eventHappened` (with `withinVisits` / `withinWeeks`), `rumorKnown`.
  - The game publishes the supported predicate list. Unknown predicates fail validation.
- **`effects`** (on choices and outcomes): **requests** the game may apply, clamp or refuse:
  - `relationship` (± within caps), `memory.add`, `flag.set`, `rumor.learn`, `encounter.queue`.
  - Money and stat effects are allowed **only** for encounter outcomes, using the existing `Effects` shape, and need game-side approval per encounter.
  - Effects can never target odds, RNG, payouts, card, dice or golf outcomes. The validator rejects such keys.
- **Repetition:** the game remembers each NPC's recent line ids; `cooldownVisits` and `weight` are hints.

## `encounters/<id>.json`

- **Shape:** mirrors the game's existing `EncounterDef`:
  - Nodes with `lines` (speaker id, expression, optional pose).
  - `choice`, `challenge` (`drive | putt`, existing kinds only), `next` or `outcome`.
- **Differences:**
  - Eligibility is a data `when` (as above) plus a `trigger` (an event id from `NPC_EVENT_MAPPING.md`).
  - Outcomes use `effects` as above.
- **Uniqueness:** `once: true` encounters never repeat. The game records completion.

## `relationships/graph.json`

```json
{ "edges": [ { "a": "maya_solis", "b": "velvet_vega", "type": "coworker", "affinity": 20, "public": true, "since": "pre_game" } ],
  "toRyan": { "maya_solis": 50 } }
```

- **Edge `type`:** `friend`, `rival`, `coworker`, `enemy`, `family`, `secret_ally`, `romantic` or `rumor_link`.
- **`public: false`:** secret until revealed by a `rumor.learn` effect.

## Validation (in the game's importer, at build time)

| Check | Result |
|---|---|
| Schema valid (JSON Schema per file) and `contract` version supported | error |
| Duplicate NPC, line, encounter or node ids, or ids clashing with reserved game ids | error |
| Missing references: speaker, `next`, outcome, edge endpoint, alias target, location | error |
| Expression used in a line but not listed in `expressions` | error |
| Listed expression with no image (or a frame outside its sheet), wrong image size, or no alpha channel | error; `neutral`/default missing is an error, others are warnings with fallback |
| Unsupported event id or `when` predicate | error |
| Effects targeting money/stats outside encounter outcomes, or any odds/RNG/payout key | error |
| Line text empty or over 280 characters; non-UTF-8 | error / warning |
| `approval: draft` | warning (the game shows its Draft tag) |
| Pack requires a newer game (`requiresGame`) | error |

The importer writes a report (`npc-import-report.json`) and only emits compiled content when there are zero errors.

## Versioning

- **`contract`** (for example `npc-pack/1`) changes only when the format changes. The game supports a declared range.
- **Pack `version`** follows semver:
  - **Patch:** text fixes.
  - **Minor:** new lines, NPCs or encounters.
  - **Major:** removals or id changes. These need a game-side migration note for saved memories and ids.
- **Saves** record which pack version introduced each NPC. A retired NPC's saved state is kept but no longer shown.
