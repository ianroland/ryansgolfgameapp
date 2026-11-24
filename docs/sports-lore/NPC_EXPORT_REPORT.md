# NPC Factory export (master brief Phase E): the sports-lore/2 knowledge pack

Version 0.19.11. This completes the brief's last outstanding phase: the generated history and a
knowledge layer exported in a documented, versioned format for Tiny Mana Studios' NPC Factory.

## The pack

**Location:** `exports/sports-lore-0.2.0-draft/`, 54 files, 14.4 MB. Rebuild it with `npx vite-node scripts/export-sports-lore.ts`; the export refuses to write if any file fails its schema, carries a forbidden key, or a fact cites a record that doesn't exist.

| Part | Contract | Notes |
|---|---|---|
| Bible files, `manifest.json`, `README.md` | `sports-lore/1`, canon `0.1.3-draft` | Byte-identical to the previous export, so an existing sports-lore/1 importer still loads the pack (tested). The old `exports/sports-lore-0.1.3-draft/` folder is replaced by this one |
| `history/` | `sports-lore/2`, history `0.2.0-draft` | Below |
| `knowledge/` | `sports-lore/2` | Facts, retrieval index, reference retrieval code |
| `knowledge.manifest.json` | `sports-lore/2` | SHA-256 of every new file and of the bible manifest it extends, record counts, provenance definitions, scope (1972–2026) |
| `schemas/` | Both | JSON Schema (draft 2020-12) for every file, plus the run-time live-context schema |
| `HISTORY_AND_KNOWLEDGE.md`, `NPC_FACTORY_PROMPT.md` | — | Documentation, and the prompt to give NPC Factory |

**history/ files:**

| File | Records |
|---|---:|
| seasons.json | 208 |
| games.json (columnar) | 25,814 |
| playoff_series.json | 624 |
| championships.json | 208 |
| players.json (athletes) | 4,694 |
| player_seasons.json (columnar, regular and playoffs) | about 37,000 |
| player_careers.json | 4,609 |
| awards.json | 819 |
| leaders.json | 840 |
| records.json (top 5 per category) | 489 |
| hall_of_fame.json | 108 |
| drafts.json | 4,017 |
| transactions.json | 1 |

**knowledge/facts.json: 3,593 facts.** Each fact has:
- the year it's about, and `known_from` (the first sports year an NPC can know it);
- league, teams, athletes, bible events and rivalry;
- a knowledge tier, a plain factual sentence and structured data;
- `refs` (the history records it restates; every one resolves, tested), provenance and dialogue uses.

| By kind | Count |
|---|---:|
| Award | 819 |
| Leader | 840 |
| Semifinal | 416 |
| Record | 405 |
| Championship | 208 |
| Final | 208 |
| Standings | 208 |
| Draft | 200 |
| Hall of Fame | 108 |
| Grudge | 82 |
| Franchise | 50 |
| Comeback | 23 |
| Drought | 12 |
| Legend | 9 |
| Rivalry | 4 |
| Trade | 1 |

| By tier | Count |
|---|---:|
| Casual | 225 |
| Fan | 841 |
| Specialist | 1,183 |
| Historian | 1,344 |

| By provenance | Count | Meaning |
|---|---:|---|
| Derived statistic | 2,305 | Computed by a published rule from the generated games |
| Generated history | 854 | Generated details: game scores, series lengths, drafts, the 2026 season |
| Proposed canon | 431 | The history ledger and the league bible: draft until approved |
| Approved canon | 3 | Fixed by your decisions |

Save-specific seasons (2027 on) are never in the pack.

**Retrieval** (`knowledge/retrieve.mjs`, the game's `src/sports/knowledge/retrieve.ts` with types stripped; tested to behave identically) answers by league, team, athlete, season, bible event, rivalry, hometown, favourite teams, age and knowledge tier. Its rules:
- **No future knowledge:** a fact is available only from its `known_from` year.
- **Tiers:** casual facts for everyone; fan facts for followers of the league or of a favourite or hometown team involved; specialist facts for followers of the league; historian facts for historians.
- **Firsthand memories** only from age 8.
- **Ranking:** favourite teams, then hometown teams, then importance and recency.

**Dialogue uses supported:** sportsbook, favourite team, rivalry, championship memory, legend, grudge and trivia. For reactions to current results the game builds a **live context** at run time (`src/sports/knowledge/live.ts`: standings and finals already played, labelled as this save). It is never stored in the pack.

**Consistency:** facts are built from the same model as the History Board, so champions, Hall of Fame entries and top records agree with the board (tested). The 1998 comeback, the 1994 24–20 Iron Bowl, the 2002 seven-game final, Voss's records and Soren's 71 saves come through as facts, tied to their bible events.

## The NPC Factory prompt

`docs/sports-lore/NPC_FACTORY_PROMPT.md` (also inside the pack) is a ready-to-paste brief for a Claude session in the NPC Factory repository. It covers:
- importing and verifying the pack;
- the NPC sports-profile fields;
- the retrieval and dialogue rules (lines must cite fact ids; no invention; no future knowledge; live context never stored);
- a JSON contract for dialogue lines sent back to the game (fact ids, bible events, `min_year`, tier, draft status);
- the tests and report to deliver.

The example ids in it exist in the pack (tested).

## Tests

- `tests/sportsKnowledge.test.ts` (12) covers:
  - the pack on disk is current;
  - backwards compatibility with sports-lore/1, and manifest hashes;
  - no private keys, no save data, no future facts;
  - agreement with the history and the board;
  - the prompt's examples resolve;
  - the gating rules for year, tiers, hometown, favourites and firsthand age;
  - query filters;
  - `retrieve.mjs` parity with the game's module;
  - the live-context shape.
- `tests/sportsLore.test.ts` now checks the bible files inside the new pack.
- Full suite: **712 passed, 7 skipped** (53 files). `npm run build` succeeds; the game bundle is essentially unchanged (+0.2 KB, the release note); the pack is build-time only.

## Not done here / next steps

1. **The game can't yet read lines back from NPC Factory.** Importing dialogue in the contract above (for example new Emmett lines that cite facts, gated by `min_year`) needs a small importer in the game. It's best built once NPC Factory produces its first file.
2. **Per-game athlete box scores aren't exported** (about 660,000 lines). They're reproducible in the game; the pack has season and career lines.
3. **Rivalry facts** cover playoff meetings between the four bible rivalries and other frequent playoff opponents. Regular-season head-to-head records aren't computed.
4. **Canon status:** everything is proposed until you approve it. The eight open bible questions are unchanged.
5. **Size:** the pack adds 14 MB to the repository (it isn't part of the game download).
