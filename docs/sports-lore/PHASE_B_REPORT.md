# Sports history: Phase B report (historical games and playoffs)

**Status:** built and tested. It is **not yet visible in the game**: the History board still shows canon 0.1.2. Everything here is **proposed / generated**, not approved canon. Date: 2026-11-23.

## What was built

- **Reconciled dataset** in `src/sports/history/data/` (0.84 MB, loaded on demand, not in the game's first load). It comes from v0.4 via `scripts/history/reconcile_v04.py`, which applies the owner's decisions:
  - **1978 CCL (D3):** Los Angeles is champion and Las Vegas runner-up, so 1996 stays Las Vegas's first title.
  - **Bellamy (D4):** Andre Bellamy's career runs to 2014.
  - **Other career fixes:** 21 profiles had empty 2026 careers (2026 → 2025); they become 2026 rookies.
  - **Names (D5):** 1843 duplicate names were renamed deterministically. Anchors and the earliest holder of each name keep theirs, so every name is now unique.
  - **Birth years (D8):** generated from each sport's debut-age range.
  - **Records (Phase B decision):** today's top-4 format is kept. **76 seasons** had team records adjusted (**157 wins moved**, median 2, max 10) so each ledger champion and runner-up qualify on opposite sides of the bracket. Cleveland 1985 (14–0) and Asheville 2015 (2–12) were never touched. Every change is in `changes.json`.
- **Historical rosters → engine players** (`rosters.ts`):
  - Talent is seeded per player and shaped by age and by the team's record, so strong teams have strong players.
  - Positions are mapped to the engine's: baseball OF → LF/CF/RF, the four best pitchers start, the best spare bat is the DH; basketball G/F → PG/SG/SF/PF; hockey LW/RW → W.
- **Games** (`games.ts`):
  - Each season uses today's schedule.
  - A b-matching (augmenting paths) picks every game's winner so each team finishes with **exactly** its approved record.
  - Each game is then simulated by the live engine on those rosters until it produces that winner, so scores and box scores are real engine games.
  - Generation is deterministic, and nothing is stored: about 26,000 games for all 204 seasons generate in a few seconds.
- **Playoffs:** seeds 1 v 4 and 2 v 3, then the final. The ledger decides who advances, series lengths are seeded, and home games follow the live pattern. The football final is at a neutral site.
- **Anchors enforced exactly:**

| Anchor | In the generated history |
|---|---|
| 1998 GDC | Boston led Phoenix 3–1, then Phoenix won three straight |
| 2002 FHL | Bozeman beat Duluth in seven, with four overtime games |
| 2019 FHL | Burlington beat Toledo in six |
| 1994 IGL | Oklahoma City 24, New Orleans 20 (neutral site) |
| 1989 FHL | Anchorage beat Buffalo in a **triple-overtime** semifinal game |
| 1996 CCL | Las Vegas, the 4th (lowest) seed, beat the 1st seed and then Denver |
| 1987–89 CCL | Chicago v Los Angeles finals |
| 1985 IGL | Cleveland 14–0, champions |

- **Engine change:** hockey playoff overtime is now full 20-minute sudden-death periods with no shootout, as in real playoff hockey. Live playoffs use it too; the regular season is unchanged.

## Record adjustments for anchor seasons

| Season | Wins moved | Changes |
|---|---:|---|
| igl-1983 | 4 | thunderherd 6→5, undertow 8→7, rockslides 7→6, harvesters 9→8, squall 4→8 |
| igl-1985 | 5 | thunderherd 6→5, undertow 6→5, rockslides 8→7, harvesters 3→8, highlanders 7→6, smokejumpers 4→3 |
| ccl-1989 | 5 | voltage 10→15, monsoon 17→15, anchors 12→11, forge 11→10, satellites 14→13 |
| fhl-1989 | 1 | sawblades 15→16, snowowls 17→16 |
| fhl-1995 | 1 | polars 13→12, floes 13→14 |
| ccl-1996 | 1 | dustdevils 14→15, satellites 16→15 |
| gdc-1998 | 2 | lamplighters 18→20, ore_haulers 21→20, gilas 19→18 |
| fhl-2002 | 1 | yetis 15→16, rivets 16→15 |
| ccl-2012 | 1 | comets 13→12, satellites 13→14 |
| igl-2016 | 1 | harvesters 7→8, ironclads 8→7 |
| fhl-2019 | 1 | polars 14→13, rivets 13→14 |

## Largest adjustments

| Season | Wins moved | Changes |
|---|---:|---|
| fhl-2015 | 10 | narwhals 6→16, sawblades 11→9, floes 17→13, yetis 9→7, snowowls 17→15 |
| igl-1985 | 5 | thunderherd 6→5, undertow 6→5, rockslides 8→7, harvesters 3→8, highlanders 7→6, smokejumpers 4→3 |
| ccl-1989 | 5 | voltage 10→15, monsoon 17→15, anchors 12→11, forge 11→10, satellites 14→13 |
| fhl-1999 | 5 | polars 14→15, narwhals 11→15, sawblades 15→13, rivets 14→12, snowowls 16→15 |
| igl-1983 | 4 | thunderherd 6→5, undertow 8→7, rockslides 7→6, harvesters 9→8, squall 4→8 |
| ccl-1986 | 4 | monsoon 15→14, comets 11→10, dustdevils 14→13, forge 12→11, satellites 11→15 |

## Tests

`tests/sportsHistory.test.ts`: 11 tests, all passing. They cover:
- coverage from 1972 to 2025;
- records adding up;
- the anchors;
- the owner's decisions;
- bracket feasibility;
- roster tenure;
- the winner assignment;
- full schedules whose standings reproduce the records;
- home and away balance;
- brackets matching the ledger;
- the anchor moments;
- determinism;
- score ranges per sport.

## Not done yet (later phases)

| Item | Phase |
|---|---|
| Player stats and career totals derived from these games, with anchor stat constraints: Voss 13–1 and three no-hitters (1983), Soren 71 saves, Redd 31 points | C |
| Championship MVP and awards from the generated stats (v0.4's MVP picks are not used) | C / D |
| The 2026 season (D7) and carrying 2025 rosters into 2027 (D9). These need aging, rookies and retirements, so they come with careers | D |
| Drafts, transactions, Hall of Fame, record books | D |
| Knowledge pack, NPC Factory export, History board UI | E |

**Notes:**
- v0.4 football rosters have no kickers. Kicks count for the team, credited to no player.
- Historic injuries aren't modelled: every rostered player is available.
