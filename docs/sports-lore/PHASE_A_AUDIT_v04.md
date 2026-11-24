# Sports history v0.4: Phase A audit and reconciliation plan

**Status:** audit only. Nothing from v0.4 has been imported. The game still runs canon `0.1.1-draft` (the 16 anchor events and 11 anchor results). Date: 2026-11-23.

## 1. What the game has today

| Area | State | Where |
|---|---|---|
| 4 leagues, 32 teams, colour squares | Live; ids, cities and colours match v0.4 exactly | `src/sports/demo.ts` |
| Live sports engine (2027 on) | Deterministic seasons, playoffs and awards. Rosters are **generated per world seed, not taken from history** | `src/sports/season.ts`, sims per sport |
| Real sportsbook | Bets through the ledger, settled on week advance, Inbox notices, ticket history | `src/sports/book.ts`, `bets.ts`, `services/sportsbookService.ts` |
| Historical canon | `sports-lore/1` 0.1.1-draft: 16 anchor events, 11 results, 9 named people, 4 rivalries, NPC rules, year and tier gating | `src/sports/lore/` |
| NPC Factory export | Versioned and sanitised, with JSON Schemas and hashes | `exports/sports-lore-0.1.1-draft/` |
| Saves | Dexie v3. Sportsbook tickets live in career flags; no history tables | `src/persistence/db.ts` |

**Owner decisions already applied:** CCL founded by 8 clubs; Las Vegas beat **two** higher seeds in 1996; Salazar played for Phoenix and Redd for Las Vegas; event cities mean today's franchises; Mason Vale and Celeste Vale are unrelated.

## 2. What v0.4 contains

| File | Records | Same as v0.3? |
|---|---:|---|
| championships | 204 (1972–2025) | Identical |
| seasons | 204 | Identical |
| team_season_records | 1,632 | Identical |
| awards (championship MVP only) | 204 | Identical |
| players | 4,561 (681 from v0.3 + 3,880 generated) | 680 of 681 unchanged; **Bellamy changed** |
| rosters | 1,632 | New |
| player_season_stats | 33,376 (1,020 v0.3 lines + 32,356 modelled) | New |
| career_totals | 4,534 | New |

**Size:** 23 MB raw. `player_season_stats.json` alone is 14 MB (0.8 MB gzipped).

## 3. What checks out

- **Anchors:** all 11 anchor results are preserved, plus Cleveland 1983/1985/1986. Cleveland went 14–0 in 1985 and Asheville 2–12 in 2015.
- **Burlington:** has no title from 1996 to 2018.
- **Team records:**
  - 8 per league season, and league wins equal losses.
  - W + L equals games played.
  - The champion of every season has a record.
- **Rosters:**
  - Every roster id exists.
  - Nobody is on two rosters in one season.
  - Every roster entry is inside the player's career segments.
- **Stat lines:** every line belongs to a rostered player. Within each line the arithmetic holds: batting average = H/AB, ERA = 9·ER/IP, save % = saves/shots, points = goals + assists. No percentage is outside 0–1, and no count stat is negative (plus/minus excepted).
- **Championship MVPs:** all 204 are on the champion's roster that season.
- **Compatibility:** team ids, cities and colours match the game's registry.

## 4. Findings

### Blocking (must be resolved before any import)

| # | Finding | Evidence |
|---|---|---|
| B1 | **Anchor contradiction:** the ledger gives Las Vegas the **1978** Crown, but the 1996 anchor calls 1996 the franchise's *first* title. | `ccl-champ-1978` |
| B2 | **v0.4 broke an anchor:** Andre Bellamy's `final_year` moved from 2014 to **2010**, but his Miami segment still runs to 2014. 21 other profiles also have segments outside their careers. | 22 profiles |
| B3 | **Player stats don't reconcile with team results.** Lines were generated independently per player: | |
| | Baseball pitchers' wins add up to **2.1×** their team's wins (range 0.7–4.7×; all 432 team-seasons wrong) | |
| | Hockey goalies' wins add up to **1.55×** team wins (376 of 384 team-seasons wrong) | |
| | Basketball teams score about **138** points a game in player lines; the game's engine plays about 107 | |
| | Hockey skaters score about **4.8** goals per team game; the engine plays about 3.1 | |
| B4 | **Career totals sum rates.** 56 players show impossible values, e.g. Bellamy at 25.6 rebounds/game and 187% FG. Counting totals do equal the season sums. 27 players have no totals at all. | `career_totals.json` |
| B5 | **Package size:** 23 MB can't ship in a web game as-is (the whole game today is about 60 MB, mostly art). | |

### Significant

| # | Finding |
|---|---|
| S1 | **Duplicate names:** 1,218 names are shared by 3,061 players. That includes anchors **Darius King** and **Leon Mercer**, each with an unrelated namesake. |
| S2 | **Schedule lengths:** every historic season uses today's length. The Phase 5 brief says not to assume that. |
| S3 | **No ages or birth years** for anyone, so ages, rookie seasons and Hall of Fame eligibility can't be validated. |
| S4 | **1,252 player-seasons** fall inside a career segment but on no roster (gaps in careers). |
| S5 | **Roster sizes differ from the live engine:** history uses 22 / 12 / 28 / 20 players; the engine uses 16 / 10 / 24 / 18. |
| S6 | **715 players are active in 2025**, but the live 2027 world generates new rosters, so nobody from history plays on. |
| S7 | **Seven champions had losing records:** GDC 1978 (20–22) and 1985 (19–23), CCL 2000 (13–15), IGL 2004 (6–8), 2014 (5–9) and 2020 (6–8), FHL 2006 (13–15). This is possible with top-4 playoffs, but it's odd. |
| S8 | **2009 CCL:** v0.3/v0.4 names Miami champion over Denver. Our 0.1.1 canon still says the 2009 winner is unwritten. |
| S9 | **2026 is missing:** the ledger ends at 2025, but careers start in 2027. |
| S10 | **The v0.4 bible still says Las Vegas beat "three higher seeds"**; the owner's answer was two. |

### Not in the package (the Phase 5 brief asks for them)

None of these exist in v0.4:
- game-by-game fixtures;
- playoff brackets and series;
- drafts, trades and free agency;
- injuries;
- coaches;
- awards beyond championship MVP (league MVP, rookie, defensive/pitching, leaders, Coach of the Year);
- Hall of Fame;
- record books;
- per-game box scores;
- birth years.

**Format check:** every anchor fits today's formats.
- **Baseball and hockey:** best-of-7 finals. Covers 1998 3–1 → 4–3, 2002 seven games and 2019 six games.
- **Football:** single-game final; 1994 24–20.
- **Basketball:** top-4 playoffs; 1996 two upsets.

## 5. Proposed reconciliation plan

**Core proposal:** one engine for all history. Instead of storing 23 MB of independent numbers, we generate the past with the same deterministic engine that plays 2027 onward, constrained to the approved facts. Everything else (standings, player stats, career totals, records) is then *derived* from those games, so it all adds up by construction.

| Phase | Work | Uses from v0.4 | Output |
|---|---|---|---|
| **B** Games and playoffs | For each league season: a seeded schedule (with that era's format, per decision D2), then simulated games constrained so each team hits its approved W–L. Playoffs constrained to the approved champion, runner-up and anchor details (1998 comeback, 1994 24–20, 2002 seven games with four OT, 2019 in six). | championships, team records, rosters | Fixture ledger, brackets |
| **C** Stats | Player stats derived from the simulated box scores. Career totals computed from seasons, with rates recomputed, never summed. The 1,020 v0.3 "featured" lines and anchor stats (Voss: 24 wins, 3 no-hitters in 1983; Soren: 71 saves; Redd: 31 points) become constraints. | rosters, players, featured lines | Season and career stats that reconcile with games |
| **D** Careers | Birth years and ages, draft classes, rookie seasons, transactions (inferred from segment changes), retirements, and awards from the stats (MVP, rookie, leaders). The Hall of Fame follows once you approve a rule. | players, segments | Timelines, awards, record books |
| **E** Export | `sports-lore/1` gains `games`, `playoff_series`, `player_seasons`, `player_careers`, `transactions`, `awards` and `records`. Every fact is tagged *approved / proposed / derived / generated*. | | NPC Factory pack, retrieval by league, team, player, season, hometown and tier |
| **F** Validation | Tests for completeness, schedule consistency, W–L reconciliation, brackets, tenure, stat arithmetic, career totals, awards, determinism and no future knowledge; plus a report. | | Report |

**Storage:** games and box scores are regenerated from seeds on demand, as the live sportsbook already does. Only compact facts are stored: the ledger, standings, player profiles and season and career summaries. That lands at an estimated 2–3 MB, loaded per league only when the History screen opens. Saves are unaffected: history is global and read-only.

**Live continuity (optional):** 2027 rosters could be seeded from the 2025 rosters, so active historical players continue, age and retire in the live world. This would replace today's freshly generated rosters. It is a one-time change to the live world and would void open bets (there are none in shipped saves yet).

## 6. Decisions needed before Phase B

| # | Decision | Recommendation |
|---|---|---|
| D1 | Player stats: **derive from simulated games** (they will differ from v0.4's numbers), or keep v0.4's numbers as labelled "modelled aggregates" that don't reconcile? | Derive; keep only the 1,020 featured lines and anchor stats as constraints |
| D2 | Historic schedule lengths and playoff sizes by era, or today's formats throughout? | Today's formats unless you want eras |
| D3 | Las Vegas 1978 vs "first title in 1996" (B1). | Change 1978's champion, keeping the 1996 anchor |
| D4 | Bellamy's career end: 2010 or 2014 (B2), plus the 21 other bad segments. | 2014 (keeps his Miami years) |
| D5 | Rename duplicate names, at least anyone sharing a name with an anchor? | Rename all 3,061 duplicates deterministically, anchors untouched |
| D6 | The seven losing-record champions: keep or adjust? | Keep (top-4 playoffs allow it), flagged |
| D7 | 2026: simulate it as the season just before Ryan's career, or leave it unwritten? | Simulate it (proposed), so 2027 has a defending champion |
| D8 | Generate birth years (needed for ages, drafts and the Hall of Fame)? | Yes, deterministic, from debut age ranges per sport |
| D9 | Seed the live 2027 world from the 2025 rosters (S6)? | Yes, so history and the live world connect |
| D10 | Confirm the owner decisions above still hold over the v0.4 bible text (S10, S8). | 2009 Miami champion accepted from the ledger; "two higher seeds" kept |

## 7. Not done (by design, until approval)

- No v0.4 record was imported, converted or promoted.
- The v0.3 conversion I had started was set aside before v0.4 arrived; it was never shipped.
- The live engine, sportsbook, bankroll, saves and casino are untouched by this audit.
