# Phase D, part 3: the living sports universe

Version 0.19.8. Generated and proposed history; nothing here is verified record. Technical
reference: `docs/sports-lore/LIVING_UNIVERSE.md`.

## Implementation summary

- **Off-seasons from 2027 on.** After every completed season, each save's four leagues run an off-season with the 13 steps from the brief:
  - ages from the season year;
  - retirements;
  - Hall of Fame;
  - reserves back on their team;
  - a rookie class and draft;
  - full rosters;
  - development and decline;
  - validation.

  The 2027 rosters are used for 2027 only. Every later season's rosters come from the season before.
- **Per-save history.** Each completed year is stored in the save (new `sportsYears` table, database v4): champions, standings, awards, leaders, records, milestones, comebacks, retirements, inductees, the draft, and every player's season line. The latest years also keep the next season's full state. Two saves share everything up to the 2027 rosters, then grow different futures.
- **Shared history is untouched.** The 1972–2026 data, forward.json and live2027.json are unchanged. honors.json only gained fields; its Part 1 and 2 content is identical (tested).
- **Deterministic.** Every year follows from the previous state, the season's results and the save's sports seed. Reloads, exports and imports give the same players and awards (tested, including resuming a 10-year chain from a stored state).
- **Run exactly once.** An off-season runs only after the season is complete (the career rollover after week 30) and after due tickets have settled. Its row and the career's `sportsYearDone` marker are written in one transaction, so repeats, reloads and second tabs do nothing.
- **Hall of Fame:**
  - Statistical pathway unchanged: five years, eight seasons, and the existing score. The bar is the league's canon top-2.5% cut.
  - Legends pathway: still Voss only.
  - Inductions happen once.
  - The canon-decided classes of 2030 and 2031 (2026–27 retirements) are scheduled in the shared start.
- **Mason Vale** is the only protected player.

## Files changed

**New:**
- `src/sports/universe/model.ts`: player model, development curves, retirement chance, world builder.
- `src/sports/universe/offseason.ts`: the off-season and its validation.
- `src/sports/universe/chain.ts`: the per-save chain.
- `src/services/sportsUniverseService.ts`: runs and stores off-seasons.
- `scripts/history/build_universe.ts` → `src/sports/data/universe2027.json`: the shared 2027 start (682 players, careers, Hall of Fame queue, record books, name pool).
- `tests/sportsUniverse.test.ts` (19 tests).
- `docs/sports-lore/LIVING_UNIVERSE.md` and this report.

**Changed:**
- `src/sports/book.ts`: third world mode `evolved`, plus a roster version per season.
- `src/sports/bets.ts`: legs record the roster version; settlement refuses a mismatch.
- `src/career/sportsbook.ts`: world v3 (`sportsEvolveFrom`, `sportsYearDone`) and its migration.
- `src/career/engine.ts`: new careers are v3.
- `src/persistence/db.ts`, `schemas.ts`, `src/services/saveService.ts`: DB/save schema v4, with the v3 → v4 save-file step.
- `src/services/index.ts`, `sportsbookService.ts`, `src/main.tsx`, `src/ui/saveActions.ts`, `src/ui/career/CareerHub.tsx`: wiring. Off-seasons run on launch, after import, and on the first week of a new season.
- `src/sports/history/honors.ts`, `rosters.ts`: helpers exported, award bonus shared, Hall of Fame bar.
- `scripts/history/build_careers.ts` → `honors.json`: new fields `hallOfFameThreshold`, `hallOfFameFuture` (class of 2027) and `activeCareerValues`.

**Tests updated:**
- `sportsForward.test.ts`: world v3.
- `casinoExpansion.test.ts`: schema v4.
- `cutins.safety.test.ts`: a 30 s limit on a whole-graph walk that timed out under full-suite load. It passes alone in 0.6 s; the assertions are unchanged.

## 2028 example results (save seed 4242)

| League | Champion | Record (seed) | Final | MVP | Rookie | Championship MVP | Sport award |
|---|---|---|---|---|---|---|---|
| GDL | Charleston Kingfishers | 21–21 (4) | 4–3 over Boston | Darius Sterling (TUC) | Ivan Porter (MIL) | Tariq King (CHS) | Pitcher: Evan Hale |
| CBL | Miami Monsoon | 19–9 (2) | 4–3 over Los Angeles | Owen Sloan (LA) | Brett Walker (BAL) | Gabriel Rivers (MIA) | Defense: Gabriel Rivers |
| ALF | Portland Smokejumpers | 8–6 (4) | won the Iron Bowl over Salt Lake City | Gavin Vale (SLC) | Micah Voss (OMA) | Mika Salazar (POR) | Defense: Anton Novak |
| FHL | Duluth Borealis | 17–10 (2) | 4–1 over Toledo | Malik Ortiz (PRO) | Tobias Kessler (PWM) | Blake Delgado (DUL) | Goalie: Malik Ortiz |

**Records:** Cedric Rasmussen broke the 1985 career passing-touchdown record (258, previously 255). Ties: three home runs in a game, and Los Angeles' 23 wins.

**2029 first picks:**
- Mika Molina (SS), Minneapolis
- Amir Kendrick (G), Detroit
- Brett Garcia (TE), New Orleans
- Anton Graves (RW), Bozeman

Results differ in every save. These are one example.

## 10-year and 25-year validation

Tests run 10 seasons (seed 777) and 25 seasons (seed 2026). Every season checks:
- 32 teams with full 2025-composition rosters (656 players);
- no retired, duplicated or over-age player;
- unique draft ids and names, the draft order, and that every rostered retirement is filled;
- ages from the season year and smooth development: 75%+ of young players improve, 75%+ of players 34 and over decline;
- career totals = previous + the season, and canon totals never rewritten;
- awards every year, records that only move up, and titles tracked;
- Hall of Fame once, at the bar, five years on;
- determinism, and resuming from a stored state.

**Player-count trend over 25 years (seed 4242):**

| | 2027 | 2028 | 2029 | 2030 | 2031–2052 |
|---|---|---|---|---|---|
| Active | 682 | 668 | 661 | 658 | 656 |
| Reserves | 26 | 12 | 5 | 2 | 0 |

- **Ages and ability stay level:** average age 25.8–26.4, average ability 57.5–58.5, with no talent inflation (the test allows less than 3 points of drift). Scoring levels per game stay flat.
- **Retirements and rookies:**
  - Seed 4242: 2,131 retirements, 2,105 draftees and 18 reserves back over 25 off-seasons (66–106 a year), 91 Hall of Famers, 29 new records.
  - Seed 2026: 2,077 retirements, 2,051 draftees, 87 Hall of Famers, 42 new records.
  - Historical average: about 82 retirements a year.
- **Speed:** each off-season takes about 0.2–0.3 s on top of the season simulation the sportsbook already runs. 25 seasons from scratch take about 6 s; in play it's one season at a time.
- **Storage per save:** about 120 KB a year, plus about 220 KB of full state on the newest three rows. That's about 3.5 MB after 25 years.

## Save compatibility

| Save | Result |
|---|---|
| Fresh career | v3: fixed 2027 rosters, evolving from 2028 |
| v0.19.7 (v2) in 2027 | Evolves from 2028; 2027 unchanged |
| v0.19.7 save already in a 2028+ season with tickets or games played | That season stays on its fixed rosters; evolves from the next |
| Older unmarked save | History rosters and off-seasons follow on safely (tested) |
| Export / import | Rows and flags round-trip; the imported universe is identical; nothing re-runs |
| Older save files (schema 1–3) | Migrate to v4 with an empty `sportsYears` |
| Reload mid-season or between seasons | Stored states load; results identical (tested) |
| Repeated migration or off-season calls | No change (tested) |

**Rollback:** a v4 save file can't be imported by v0.19.7. Running v0.19.7 on a v4 database ignores the new table and flags, so 2028+ would show the fixed rosters. Settle open tickets or restore an older export before downgrading.

## Sportsbook settlement

- Each season keeps its own rosters forever, so a transition never changes a game a ticket depends on.
- Ticket legs carry the roster version they were priced on. A mismatched version is never graded or voided; the ticket stays open and the next off-season waits for it, with a reason (tested).
- **Rollover test:** a bet on a week-29 playoff game is settled at the rollover against the exact game. The sportsbook ledger nets −stake + payout, paid once. The off-season stores 2027 once, and a rerun or reload does nothing. Ledger integrity holds.
- **Browser check (fresh career):** advancing from week 30 ran the 2027 off-season, posted "Sports 2027: the year in review" to the Inbox, and the season 2 board priced normally. No page errors.

## Tests and build

- Phase D3 tests: 19 passed. Sports, betting, persistence and clerk tests pass.
- Full suite: **676 passed, 7 skipped** (50 files). The first full run had one load-related timeout in the cut-ins graph test, fixed as described above; the rerun is clean.
- `npm run build` succeeds. The app grew by about 72 KB gzipped, mostly the shared 2027 start.

## Remaining limitations

1. **Mason Vale never retires** until you decide. In a long career he plays into his 50s (age 58 in 2052), declining to a backup. A decision would let the normal rules apply.
2. **No trades, free agency or coaches**, as required. Players stay with one franchise for life.
3. **Draftee names reuse the source data's first and last names,** so legend surnames recur (for example Micah Voss, Mika Salazar, Tobias Kessler in 2028). These are not relatives. Legend surnames could be removed from the pool if you prefer.
4. **Football still has no kickers.** Team-level kicking is unchanged.
5. **The universe's history is stored but not yet shown** beyond the Inbox review. The History Board is Phase E.
6. **The shared start is bundled with the app** (+72 KB gzipped) so the sportsbook never has to wait for it. It could be lazy-loaded later.
7. **A legacy save that sat on the fixed rosters for extra seasons** (only possible for odd v0.19.7 cases) counts those seasons' games but not their stats in careers. The off-season after them applies the development for the whole gap.
