# NPC FACTORY — Sports History Knowledge Integration

### Paste this into a Claude session working in the NPC Factory project (Tiny Mana Studios)

You are working inside the existing **NPC Factory** project. Ryan's Road to the LPGA (a separate game, repository `tinymana/ryansgolfgameapp`) has a fictional nationwide sports universe: four leagues, 32 teams and 55 years of history. It exports that history as a versioned knowledge pack. Your job is to make NPC Factory consume that pack, so the NPCs it creates can talk about sports history accurately, at the right knowledge level, and never invent or foresee anything.

**Inspect the NPC Factory codebase first.** Find how NPCs, their profiles and their dialogue are modelled, stored, generated and exported. Extend that architecture; don't replace it. Report what you found before building.

## 1. The pack

**Location:** `exports/sports-lore-0.2.0-draft/` in the game repository. Copy the whole folder into NPC Factory as read-only reference data; never edit it by hand.

**Two contracts in one folder:**

| Part | Contract | Manifest | Contents |
|---|---|---|---|
| League bible | `sports-lore/1` (canon revision `0.1.3-draft`) | `manifest.json` | Leagues, teams, nine named legends, 16 anchor events with tiered facts, rivalries, bible championships, franchise history, dialogue rules |
| History and knowledge | `sports-lore/2` (history revision `0.2.0-draft`) | `knowledge.manifest.json` | `history/` (every season, game, playoff series, championship, athlete, athlete season and career, award, leader, record, Hall of Fame entry, draft, trade, 1972–2026) and `knowledge/` (facts, index, reference retrieval) |

Each manifest lists SHA-256 hashes of its files: verify them on import and refuse a pack that doesn't match. Read `HISTORY_AND_KNOWLEDGE.md` and `README.md` in the pack. JSON Schemas (draft 2020-12) for every file are in `schemas/`.

**Status:** everything is **proposed canon** (draft until the owner approves). Show that status wherever NPC Factory shows lore to its users. Eight bible questions are still open (listed in `manifest.json`); don't settle them yourself.

**Vocabulary:** "athlete" means a sports player (`athlete_id`). The word "player" is reserved for the game's human player and must not be used as a data key.

## 2. Facts and retrieval

`knowledge/facts.json` is the source for NPC dialogue: about 3,600 structured facts. Each fact has:
- `id`, `kind`, `year`, and `known_from` (the first sports year an NPC can know it);
- `league`, `teams`, `athletes`, `events` (bible event ids), `rivalry`;
- `tier`: casual, fan, specialist or historian;
- `text` (a plain factual sentence), `data` (structured values);
- `refs` (the history records it restates), `provenance` and `uses`.

Fact kinds: championship, final, semifinal, comeback, award, leader, standings, franchise, drought, grudge, rivalry, record, hall_of_fame, legend, draft, trade. Uses: sportsbook, favorite_team, rivalry, championship_memory, legend, grudge, trivia.

`knowledge/retrieve.mjs` is the **reference retrieval**: the exact code the game runs (`retrieve(facts, index, npc, query)`). Use it as is, or port it faithfully and test against it. Its rules:

1. **No future knowledge.** An NPC in sports year Y knows a fact only if `known_from <= Y`. The game supplies Y (2026 + the career season; careers start in 2027).
2. **Tiers.**
   - casual: everyone;
   - fan: NPCs who follow that league, or whose favourite or hometown team is involved;
   - specialist: NPCs who follow that league;
   - historian: historians only.
3. **Hometown:** `index.json` maps "City, ST" and "ST" to franchises. A hometown team counts like a favourite for fan-tier facts.
4. **Firsthand:** an NPC may say "I was there" or "I remember" only if they were at least 8 that year (`firsthand: true`). Otherwise they speak of it as history.
5. **Ranking:** favourite teams first, then hometown teams, then the query's focus; more important and more recent facts first.

## 3. NPC sports profile

Add to NPC Factory's NPC model, optional and with no default favourite teams:
- `sports_knowledge_tier`: casual, fan, specialist or historian;
- `leagues_followed`: ids `gdc` (Grand Diamond League, baseball), `ccl` (Crown Ball League, basketball), `igl` (Amigo League Football), `fhl` (Federal Hockey League);
- `favorite_teams`: team ids;
- `hometown`: city and two-letter state;
- `birth_year`.

Retrieval must work from any combination of league, team, athlete, season (year), bible event, rivalry, hometown, favourite teams, age and tier.

## 4. Dialogue rules (non-negotiable)

- **Built from facts only:** every line about sports history comes from retrieved facts and **carries their ids** (and bible event ids where present), plus the pack revisions. A line with no fact ids may not state a historical fact.
- **Opinion and tone may vary** (a Boston fan can hate the 1998 Founders Cup); the facts may not. Never change a score, a winner, a year, a name or a record.
- **No invention:** no new scores, games, athletes, coaches (the data has none: there is no Coach of the Year), quotes, injuries, trades or outcomes. Unwritten bible history stays unwritten.
- **Future seasons:** seasons from 2027 belong to one save and are never canon. For "reactions to current results" the game passes a **live context** at run time (`schemas/knowledge/live_context.schema.json`: standings and recent finals). Use it only for that conversation; never store it, export it or treat it as history.
- **Format:** lines are short and in character. Keep the league names exactly: Grand Diamond League (GDL), Crown Ball League (CBL), Amigo League Football (ALF), Federal Hockey League (FHL). The trophies are the Founders Cup, The Crown, the Iron Bowl and the Frost Cup. No real-world leagues, teams or athletes.

**Dialogue categories to support:**
- contextual sportsbook dialogue;
- favourite-team commentary;
- historic rivalries;
- championship memories;
- legendary athletes;
- franchise grudges;
- trivia;
- reactions to current simulated results (live context).

## 5. Output back to the game: dialogue line contract

When NPC Factory produces sports dialogue for the game (for example the sportsbook clerks: Emmett Okafor at Desert Palms, and future clerks at White Buffalo and Morongo Sky), export it as JSON lines in this shape:

```json
{
  "id": "em.hist.gdc-1998.boston",
  "npc": "emmett_okafor",
  "league": "gdc",
  "kind": "championship_memory",
  "text": "Phoenix down 3–1 to Boston in '98 and they won the Cup. Boston fans still don't talk about it.",
  "facts": ["f.comeback.gdc:h1998:po:final:gdc_firebirds-gdc_lamplighters", "f.championship.gdc-1998"],
  "events": ["gdc-1998-001"],
  "min_year": 1999,
  "tier": "casual",
  "firsthand": false,
  "pack": { "lore": "sports-lore/1@0.1.3-draft", "history": "sports-lore/2@0.2.0-draft" },
  "status": "draft"
}
```

- `min_year` is the largest `known_from` among the line's facts; the game will only show the line from that sports year.
- `tier` is the highest tier among the line's facts.
- Every line is `"status": "draft"` until the owner approves it in the game.
- Look up the real fact ids in `knowledge/facts.json`; the ids above are only illustrations of the format.

## 6. Tests to add in NPC Factory

- Import: hashes verified, schemas validated, both contracts recognised, a tampered file rejected.
- No future knowledge: an NPC in 1999 never gets a 2002 fact. Tiers: a casual NPC never gets a specialist fact. Hometown and favourite-team gating, and the firsthand age rule.
- Retrieval matches `retrieve.mjs` on a set of profiles and queries.
- Every generated line cites existing fact ids, its `min_year` is correct, and its text contradicts none of its facts (team names, years, scores, winners).
- Live context is never persisted or exported as canon.
- No forbidden keys (`player`, `save`, `bankroll`, `balance` and similar) in anything exported back to the game.

## 7. Deliverables

1. Pack import with verification, stored read-only.
2. NPC sports profile fields.
3. Retrieval (reference-compatible).
4. Fact-cited dialogue generation for the categories above.
5. Dialogue export in the contract above.
6. Tests.
7. A short report: what you found, what you changed, test results, and anything in the pack you couldn't use or that looks inconsistent. Report problems; don't patch the pack.

Do not modify the game repository from NPC Factory. Do not approve canon on the owner's behalf.
