# Phase E: the Sports History Board

Version 0.19.9. A read-only, in-game archive of the four leagues: shared history (1972–2026) and
this save's own seasons (2027 on), in a 90s arcade sports-almanac style. Nothing on the board
changes a save or the shared data.

## Navigation entry point

- **Moved in 0.19.12:** the board now lives in the sportsbook, not the main navigation. The sportsbook's **History** button (Casino → Sportsbook) opens it in place of the lounge, on the league that was on screen. **◀ Sportsbook** (or **Esc** with no drill-down open) returns to the lines. The old lore-only History screen it replaced is gone. *(0.19.9–0.19.11 had it as a main tab, Sports History, after Casino.)*
- It opens inside the game: no page reload, and the career and session are untouched.
- The board is lazy-loaded, so its code and archive download on first open only.
- It remembers where you were when you close it and come back (a drill-down left open is kept; otherwise it opens on the sportsbook's league).

**Inside the board:**
- nine section tabs;
- a league switch (GDL / CBL / ALF / FHL) on the league-based sections;
- drill-down links to players, teams and seasons from anywhere;
- **Back** (or **Esc**) through up to 20 steps, with a breadcrumb.

All controls are buttons, selects or links, so mouse and keyboard work throughout. The layout collapses to one column on phones.

## Screens

| Section | What it shows |
|---|---|
| League | Official name, nickname, founding year, trophy, the eight franchises (colour squares) with title counts, current champion, most titles, all-time title leaders, recent champions, current-season standings (live, games played so far), featured legends |
| Seasons | Every season from founding to the last completed one: final standings, the playoff bracket game by game, awards (or "No qualifying winner"), leaders, records, comebacks and bible events for that year, with a source tag |
| Champions | Every title, filterable by league, decade and franchise: result, runner-up, championship MVP, title number, titles in a row; plus historic championship comebacks (Phoenix's 1998 3–1 and the three legendary 0–3s) |
| Players | Search across about 4,700 shared players plus this save's draftees. Filters: league, team, era, position, status. Paginated. Profiles show career span, status, draft, teams by years, season-by-season stats with career and playoff totals, awards, championships, records held, Hall of Fame status, and data-coverage notes |
| Records | Per league: single season and career (top 5 or 10), single game, and team records (most wins, longest winning streak, most titles, titles in a row, longest drought, greatest comebacks). Every row is tagged with its source |
| Awards | MVP, championship MVP, Rookie of the Year and the sport award per season, by decade. "No qualifying winner" where none qualified. No Coach of the Year |
| Hall of Fame | Members by class with pathway (statistical, or Historical Legend for Voss), the rules, and "eligible soon" (retired, 8+ seasons, inside the five-year wait), shown without predicting an outcome |
| Moments | Timeline of the 16 bible events plus moments read from the records (legendary comebacks, legends' repeated leader titles) and this save's new records and comebacks. Filters: league, decade, team, type. Each moment is tagged: league bible; league bible, in the game records; game records; or this save |
| Year in Review | A newspaper page per completed year (2026 and every save year): champions, final results, award winners, leaders, records set or tied, comebacks, retirements, the next Hall of Fame class, and the first draft picks |

## Record categories

| Sport | Categories |
|---|---|
| Baseball | home runs, hits, RBI, runs, stolen bases, batting average, pitching wins, strikeouts, shutouts, saves, no-hitters, ERA |
| Basketball | points, rebounds, assists, steals, blocks, three-pointers, points per game, field-goal %, free-throw % |
| Football | passing yards and TDs, rushing yards and TDs, receiving yards, receptions and TDs, tackles, sacks, interceptions, forced fumbles |
| Hockey | goals, assists, points, saves, shutouts, goaltender wins, save %, goals-against average |

Rates need a qualifying amount of play, per season and per career. Shutouts in baseball are credited for complete-game wins with no runs allowed. The engine rarely produces them, so Elias Voss's three in 1983 are the only ones on file (accurate, not a gap).

## Data access and coverage

**Read-only layer:**
- `src/sports/archive/shared.ts`: loads the shared files on demand, as separate chunks.
- `save.ts`: this save's completed years.
- `board.ts`: one combined model with memoized selectors.
- `records.ts`: record-book rules.

Every screen reads the same season list, so a champion is the same in Seasons, Champions, League, Team pages and the Year in Review (tested).

| Years | Source | Tag |
|---|---|---|
| 1972–2025 | Ledger history (proposed canon) | Ledger |
| 2026 | Shared simulated season, the same in every save | 2026 sim |
| 2027 on | This save's stored years (`sportsYears`) | This save |
| Legacy gaps | Seasons a legacy save played on the fixed 2027 rosters before yearly off-seasons began, rebuilt from the same games (deterministic); no awards were held | Rebuilt |

- **Season lines and playoff series** for 1972–2026 come from a new derived file, `archive.json`, built by `scripts/history/build_archive.ts` from the same games and stats as Phases B–D, so the browser never replays seasons. It's checked against a fresh replay in the tests. Career totals from it equal `careers.json` (tested).
- **The save's data** isn't copied anywhere: the board reads the stored years and newest state through `SportsUniverseService.historyInput()`.
- **No spoilers:** only completed seasons appear. The season in progress shows only its standings to date. Hall of Fame classes appear only once inducted.
- **Legacy saves (known D3 limitation):**
  - Seasons played on the fixed rosters before the yearly off-seasons are now rebuilt read-only from their games. Their player lines count in career totals, and profiles say so.
  - Seasons played in the original generated leagues (before the history universe) aren't part of this history, and profiles say that too.
  - A completed season whose off-season hasn't been filed yet is flagged rather than shown.
  - Nothing is invented, and no betting result is touched.

**Phase D3 change (additive):** stored year summaries now include the full playoff series. Rows written by v0.19.8 show the final result and who advanced from each semifinal, with "series score not recorded".

**Correction to the Phase D1 report:** every ledger season has a sport-specific award winner (54 + 102 + 48 = all 204). The award that sometimes has no qualifying winner is Rookie of the Year: never in a founding season (by rule), and in a few other seasons. The board shows "No qualifying winner" there.

## Files

**Added:**
- `src/sports/archive/shared.ts`, `save.ts`, `board.ts`, `records.ts`
- `src/ui/history/HistoryBoard.tsx`, `nav.ts`, `common.tsx`, `Overview.tsx`, `Seasons.tsx`, `Champions.tsx`, `Players.tsx`, `Records.tsx`, `Awards.tsx`, `HallOfFame.tsx`, `Moments.tsx`, `Review.tsx`, `TeamPage.tsx`
- `scripts/history/build_archive.ts` and `src/sports/history/data/archive.json`
- `tests/historyBoard.test.ts` (22 tests)
- this report

**Modified:**
- `src/ui/App.tsx`: the Sports History tab, lazy-loaded (moved into `src/ui/sportsbook/Sportsbook.tsx` in 0.19.12).
- `src/ui/styles.css`: the `.hb-*` almanac styles.
- `src/ui/sportsbook/Sportsbook.tsx`: a pointer to the board.
- `src/services/sportsUniverseService.ts`: `historyInput()`, read-only.
- `src/sports/universe/offseason.ts`: playoff series in summaries, plus `seasonLinesOf` for rebuilding legacy seasons.

## Performance

- **Main bundle:** grew by under 1 KB.
- **On first open:** the board loads 20 KB of code and about 760 KB of data (gzipped), cached for the session.
- **Opening:** about 1.7 s on the dev server; each section then opens in under a second.
- **Large saves:** with 25 save seasons every view builds in well under a second (tested). The encyclopedia and long lists are paginated; record books and career totals are computed once and memoized.

## Tests and build

- `tests/historyBoard.test.ts` covers:
  - all four leagues, official names (and no retired names), founding years;
  - championship completeness and consistency across views;
  - player lookup and the career totals;
  - record-book calculations, with the bible feats in place;
  - awards and missing winners; Hall of Fame rules and candidates;
  - historic moments and their provenance; the 2026 shared history;
  - 2027+ save history; no future spoilers; two saves with different futures;
  - legacy coverage (rebuilt, generated, unfiled seasons);
  - read-only access, both shared files and save rows unchanged;
  - navigation; a 25-season performance check; archive staleness.
- Full suite: **698 passed, 7 skipped** (51 files). `npm run build` succeeds.

## Browser validation (Chrome, dev server)

- **Fresh career:** all nine sections open with no console errors; search → profile → Escape works.
- **Career jumped to season 4** (three off-seasons run on reload, about 4 s):
  - the archive defaults to 2029;
  - Year in Review offers 2026–2029;
  - a 2030 #1 pick's profile shows "drafted 2030, no seasons on file";
  - team drill-down and Escape back twice work;
  - leaving and returning keeps the section;
  - keyboard Enter opens sections.
- **Phone width (390 px):** single-column layout, newspaper readable.
- **Fixed during testing:**
  - a doubled article ("the The Crown");
  - unreadable source tags in panel headers;
  - zero rows for bench seasons, now "on the roster; did not appear";
  - a table-whitespace warning;
  - the phone masthead.

## Known limitations

1. Single-game records come from the record books (top 5 per stat for the ledger, 2026 and the save), not from every game, because single-game lines aren't stored per game.
2. Save years written by v0.19.8 have no semifinal scores (see above). Years from v0.19.9 on have every game.
3. Team colours are the existing franchise colour pairs. There are no logos, as asked.
4. The archive data adds about 760 KB (gzipped) to the first open of the board. It isn't part of the game's first load.
5. Moments read from the records are factual one-liners. There are no invented narratives or quotes; the bible's own event summaries are shown as written.
6. "Eligible soon" lists players by the eligibility rules only. Whether they'll be inducted isn't shown.
