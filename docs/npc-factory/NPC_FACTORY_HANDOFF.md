# NPC Factory handoff: Ryan's Road to the LPGA

- **From:** Ryan's Road to the LPGA (Tiny Mana Studios), game repository `ianroland/ryansgolfgameapp`, v0.16.2.
- **To:** the NPC Factory project.
- **Status:** a proposal for agreeing a shared content contract. Nothing described as "proposed" exists yet in either project.

This document is self-contained. Copy it into the NPC Factory project as-is.

---

## 1. The game in one paragraph

- **What it is:** a browser game (React 19 + TypeScript, Vite, Phaser 4 for golf). It's a static site with no server.
- **The career:** Ryan works up from amateur golf to the LPGA Tour, over seasons and weeks of game time.
- **The casinos:** three, with a shared bankroll:
  - **Desert Palms:** the start.
  - **The White Buffalo:** unlocks permanently at a $100,000 bankroll peak.
  - **Morongo Sky:** unlocks permanently at $1,000,000.
- **Casino games:** blackjack, craps, roulette (single zero), baccarat, Three Card Poker, slots, greyhounds.
- **Saves:** stored locally in IndexedDB, with JSON export and import.
- **Offline:** the game runs fully offline and never calls an AI or network API at runtime.

## 2. Responsibilities

| NPC Factory produces (content) | The game owns (runtime and authority) |
|---|---|
| Character definitions, bibles, personality, humour, speech patterns | Player state, bankroll and ledger, golf and casino progression |
| Dialogue: lines grouped by event, branching conversations, choices | Current relationship values, NPC memories, availability, game time |
| Expression metadata + portrait packages | Choosing which line to show, and when |
| Encounter definitions with **data** conditions | Processing game events; random encounter selection |
| Initial NPC↔NPC / NPC↔Ryan relationships, rumours, secrets, rivalries | Betting outcomes, sponsor consequences, save/load and migrations |
| Pack versioning and approval status | Validating packs at build time; refusing anything unsafe |

**NPC Factory is never a runtime dependency.** Packs are imported at build time into static files.

## 3. Hard constraints (non-negotiable)

1. **No effect on gambling or golf maths.** Content must never change odds, RNG, payouts, card shuffles, dice, roulette results or golf scoring, and must never move money except through game-approved encounter outcomes.
2. **No real people.** No real golfer likenesses; original characters only.
3. **Alcohol.** The only alcoholic drink Ryan can order is **Tito's Double**; water is the non-alcoholic option. Servers can refuse further alcohol when Ryan is impaired; the game enforces the refusal and no dialogue or tip can bypass it. Drinking is never required for progression.
4. **No full-body NPCs at casino tables.** NPCs appear as a portrait in an RPG dialogue panel. Full-body poses are optional and only for story scenes.
5. **New dialogue is draft until approved.** Packs mark lines `draft`; the game shows a "Draft line" tag.
6. **Don't redefine existing characters.** Reuse their ids (§6) or create new ones.
7. **No real-money mechanics.**

## 4. Content package: `npc-pack` v1 (proposed)

```
npc-pack/
  manifest.json            { contract: "npc-pack/1", packId, version (semver), approval, characters[], encounters[], requiresGame, files{path: sha256} }
  characters/<npc_id>.json
  dialogue/<npc_id>.json
  encounters/<encounter_id>.json
  relationships/graph.json
  sprites/<npc_id>/<expression>.png
  schemas/  integration/  README.md
```

### Ids

| Id | Format |
|---|---|
| NPC | snake_case `^[a-z][a-z0-9_]{2,47}$`, stable forever |
| Line | `<npc_id>.<event>.<n>` |
| Locations | `desert_palms`, `white_buffalo`, `morongo_sky`, `driving_range`, `clubhouse_lounge`, `tour:<amateur\|mini\|qschool\|epson\|lpga>` |

### Character

- **Required:** `id`, `name`, `short`, `category`, `role`, `locations[]`, `expressions[]`, `defaultExpression`, `portrait`.
- **Optional:** `bible{summary, backstory, personality[], humor, speech}`, `schedule`, `relationship{start}`, `memoryKeys[]`, `tags[]`, `aliases[]`.
- **Category** is one of: `dealer`, `cocktail_server`, `bartender`, `poker_opponent`, `patron`, `hotel_staff`, `security`, `rival_golfer`, `competitor`, `coach`, `caddie`, `sponsor`, `official`, `media`, `family`, `friend`, `spectator`, `other`.
- **Schedules use game time only:**
  - `always`
  - `visits` (chance per casino visit)
  - `weeks` (career weeks or seasons)
  - There's no real-world clock.

### Dialogue line

```json
{ "id": "maya_solis.order.1", "text": "One Tito's Double. Coming right up.", "expression": "friendly",
  "weight": 1, "when": { "all": [ { "tierAtLeast": "regular" } ] }, "cooldownVisits": 0, "status": "draft" }
```

- **Grouping:** lines are grouped under **event ids** (§7).
- **Branching conversations:** nodes → `lines` → `choices{ id, label, next, effects[] }`.

### Conditions (`when`)

- **Data only, never code:**
  - Combinators: `all`, `any`, `not`.
  - Relationship: `tierAtLeast`, `tierBelow`.
  - Memory and flags: `memory`, `noMemory`, `flag`.
  - Place and progress: `location`, `act`, `tour`, `phase`.
  - Casino state: `casinoVisitsAtLeast`, `sessionNetAbove`, `sessionNetBelow`, `drinkState`.
  - History: `eventHappened{withinVisits | withinWeeks}`, `rumorKnown`.
- **The game publishes the final list.** Unknown predicates are rejected.

### Effects

- **They're requests, not commands.** The game clamps them or refuses them:
  - `relationship` (± small, clamped)
  - `memory.add`
  - `flag.set`
  - `rumor.learn`
  - `encounter.queue`
- **Money or stat effects:** only in encounter outcomes, and only with game approval. Any key touching odds, RNG or payouts makes the pack invalid.

### Encounters

- **Shape:** mirrors the game's existing encounter engine:
  - Nodes with `lines` (speaker, expression, optional pose).
  - Then one of: `choice`, `challenge` (`drive | putt` only), `next` or `outcome`.
- **Triggers and uniqueness:** a `trigger` (event id) plus `when` decide eligibility. `once: true` encounters never repeat.

### Relationship graph

- **Edges:** `{ a, b, type: friend|rival|coworker|enemy|family|secret_ally|romantic|rumor_link, affinity: -100..100, public }`.
- **To Ryan:** `toRyan: { npcId: start }` (0–100; 50 is neutral).
- **Tiers stay game-defined:**

| Tier | Starts at |
|---|---|
| Acquaintance | 0 |
| Regular | 58 |
| Friend | 70 |
| Confidant | 82 |
| Inner Circle | 92 |

## 5. Portraits

- **Format:** PNG RGBA, **256×256** per expression, head and shoulders, the same framing for every expression of an NPC, 8–16 px of transparent padding, no baked text, 60 KB or less each.
- **Expressions:** `neutral` (or the declared default) is required. Recurring NPCs should have 6+, for example `friendly, playful, impressed, concerned, annoyed, firm, scheming` or the cast set `happy, angry, surprised, worried, laughing, confident, disappointed`. Background NPCs may have 1–3.
- **Fallback:** the game falls back to the default or a placeholder when an expression is missing. It never stretches.
- **Style:** 1990s Neo Geo-inspired pixel art, readable on dark purple, teal and green panels.

## 6. Existing characters (reuse these ids; don't redefine them)

**Casino dealers** (all at Desert Palms today)

| Id | Name | Game | Current art |
|---|---|---|---|
| `velvet_vega` | Velvet Vega | Blackjack | single portrait |
| `stick_lady` | Stick Lady | Craps | 5 faces |
| `madame_monique` | Madame Monique | Roulette | expression strip; has her own memory system |
| `waifu` | Waifu | Baccarat | face strip |
| `winston` | Winston | Three Card Poker | face strip |

**Golf cast**
- **Characters:** `kayla_brooks` (rival; competitor alias `golfer_kayla_brooks`), `coach_martinez` (Dana Martinez), `biff_fairway`, `marty_mulligan`, `commissioner_clipboard`, `agent_reese`, `sponsor_dawson`, `caddie_jordan`, `friend_avery`, `reporter_kim`.
- **Ryan** is the id `ryan`, the player character.
- **Art:** each has an 8-expression portrait atlas and full-body poses.
- **Planned (draft pack received):** cocktail servers Maya Solis (Desert Palms), Nina Calder (White Buffalo) and Celeste Vale (Morongo Sky), each with 6 expressions: friendly, playful, impressed, concerned, annoyed, firm. Names are provisional.
- **Competitors:**
  - They're generated, with names and ratings only.
  - The Amateur Circuit and SoCal Pro Series fields are men's.
  - The Q-School, Epson Tour and LPGA Tour fields are women's.
  - Promoting a competitor to a full NPC is a future option.

## 7. Events the game can provide

These are proposed names. They're grouped by what the game already knows.

**Available now:** these facts exist in the game today and only need an emitter.
- `golf.tournament_completed`, `golf.tournament_won`, `golf.tournament_lost`, `golf.cut_missed`
- `golf.rival_defeated`, `golf.rival_won`, `golf.major_won`
- `golf.ace`, `golf.albatross`, `golf.eagle`
- `golf.tour_card_earned`, `golf.tour_card_lost`, `golf.season_ended`, `golf.phase_changed`
- `golf.sponsor_signed`, `golf.sponsor_ended`
- `casino.visit_started`, `casino.location_unlocked`
- `casino.game_won`, `casino.game_lost`, `casino.push`, `casino.big_win`
- `casino.dealer_tipped`, `npc.relationship_changed`, `npc.tier_reached`
- `casino.insufficient_funds`
- `story.encounter_completed`, `story.inbox_choice_made`, `npc.memory_added`

**Coming with planned features:**
- `casino.server_approach`, `casino.server_tipped`
- `casino.drink_ordered`, `casino.water_ordered`, `casino.drink_refused`, `casino.intoxication_changed`
- `sponsor.warning_issued`
- `poker.invited`, `poker.opponent_defeated`, `poker.busted`

**Missing, needing design:** `npc.rumor_learned`, `npc.secret_revealed`, `npc.insulted`, `npc.helped`.

**Event shape:** `{ id, type, at: { season, week, day? }, location?, npcIds?, witnesses?, payload }`. Ids are stable, and events are facts only.

## 8. How the game runs content (proposed)

- **Selection:** a line comes from (NPC, event, context), filtered by `when`, weighted, with repeats avoided (each NPC's recent lines are remembered) and cooldowns applied.
- **Memory:** NPCs only remember what they **witnessed** (present at the location or involved), were **told** through a relationship edge, or heard as a **rumor**.
- **Save storage:** memories live in the save, capped per NPC (20 by default) and pruned by weight and age. NPCs Ryan hasn't met cost no save space.
- **Loading and simulation:** content loads per location. NPCs aren't simulated in the background.

## 9. What we need from NPC Factory first

1. Agreement on, or changes to, the `npc-pack` v1 shape above.
2. A JSON Schema for each file type.
3. **A small sample pack.** Ideally the three cocktail servers, using the draft lines in `RYANS_CASINO_SERVERS_DIALOGUE_V1`, so the game's importer can be built and tested on real data.
4. A note of any field NPC Factory needs that isn't listed here.

**Questions for NPC Factory**
- Does it want ids it generates itself, or ids chosen by an author?
- How will it express approval status?
- Will it export one sheet per NPC or one file per expression?
