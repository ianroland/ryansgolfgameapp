# Phase F: final validation and implementation report

Version 0.19.10. This closes the Sports Universe work (master brief "Phase 5", phases A to F).
The machine-generated numbers are in `VALIDATION_REPORT.md` and `validation.json`
(`npx vite-node scripts/validate/phase_f.ts`; exits non-zero if any gate fails). This report adds the
context and lists, honestly, what is still missing.

## Result

| Check | Result |
|---|---|
| Seasons replayed and audited | 208 (every league season from founding to 2026) |
| Games audited one by one | 23,520 regular season and 2,294 playoff (2,220 overtime or extra innings) |
| Player game lines checked | 659,924 |
| Quality gates (seven) | All pass, 0 failures |
| Reproducibility | Rebuilding all six generated data files gives byte-identical output (SHA-256 checked) |
| Full test suite | 700 passed, 7 skipped (52 files) |
| Production build | Passes. Main bundle 890 KB gzipped; history data and the board load on demand |

The gates audit **every** season and game, not a sample:
- schedules: two different league teams per game, full length, balanced home and away, every opponent met equally;
- team records rebuilt from the games match the ledger;
- playoffs follow the seeds, series lengths and deciders are correct, the champion and runner-up come from the final, and there are no tied or shootout playoff games;
- every rostered player is in his career window, on that team, at a plausible age;
- per-game arithmetic: points, runs, goals, touchdowns, pitching decisions and goaltending all add up to the score;
- every event a game cites exists in the bible;
- career totals equal the sum of season lines for all 4,534 players;
- awards: an MVP every season, the championship MVP on the champion, rookies in their debut year, no coach award;
- Hall of Fame rules, including once per player and Legends only with approval;
- every record entry traces to a real game or season line, or a career total;
- drafts and the one trade agree with career segments.

The audit is now also a permanent test (`tests/universeAudit.test.ts`, about 7 s), including a check that it catches a deliberately broken season.

**One fix made during validation:** my Hall of Fame check flagged the two players who set the league bars, because stored scores are whole numbers (1614 v 1614.02). The check now compares at stored precision; the inductions were right.

## What was built, by phase

| Phase | Version | What it delivered |
|---|---|---|
| A. Audit | — | v0.4 audit; owner decisions D1–D10 |
| B. Games and playoffs | 0.19.x | Deterministic game-by-game history for every season on today's formats, matching every approved record and champion. Anchor events are hard constraints: Voss's 1983, Soren's 71 saves, the 1994 24–20 Iron Bowl, Phoenix 1998 from 3–1 down, the 2002 seven-game final, Burlington 2019 in six, the Comets–Voltage finals, Cleveland's unbeaten 1985 |
| C. Statistics | 0.19.x | Exact and allocated player stats from the games; season and career totals |
| D1. Careers and honours | 0.19.6 | Awards, leaders, record books, drafts, transactions, Hall of Fame |
| D2. 2026 and the carry-over | 0.19.7 | 2026 off-season and season, 2027 rosters, save migration |
| D3. Living universe | 0.19.8 | Yearly off-seasons per save (aging, development, retirements, drafts, awards, records, Hall of Fame), stored per save, with betting integrity |
| E. History Board | 0.19.9 | The in-game Sports History tab (your Phase E brief) |
| F. Validation | 0.19.10 | Full audit, reproducibility check, this report. Also Emmett's dialogue is a size larger |

## Game functionality preserved

The full suite covers golf, tournaments, the casino games, the sportsbook (slips, odds, settlement, the shared bankroll), save/load and import, casino unlocks, NPC dialogue and drinks. All pass. The sportsbook's original generated world for legacy seasons replays exactly (fingerprint test).

## Not done, or only partly done (master brief)

1. **NPC Factory export of the generated history (master Phase E).**
   - Your Phase E brief replaced this with the History Board and said not to start NPC Factory work, so it is still to do.
   - The exported pack (`exports/sports-lore-0.1.3-draft`) holds the league bible only: leagues, teams, legends, the 16 events, rivalries, championships as written in the bible, franchise history and dialogue rules, with tiered, year-gated facts.
   - Still missing from the export, although all of it exists in the game:
     - seasons, games, playoff series and championships from the ledger;
     - player seasons and careers;
     - awards, records, drafts and transactions;
     - retrieval metadata by team, player, season, hometown, favourite team, age and tier for that data;
     - dialogue lines that cite generated facts.
   - This is the natural next phase.
2. **No calendar dates on games.** Historical games have a week and day of the league calendar, not a calendar date.
3. **No coaches.** The data has none, so there's no Coach of the Year and no coaches on championships.
4. **Transactions.**
   - One trade in 50 years (Bellamy, 2008); its three players and two picks are unidentified.
   - No historical free agency.
   - No historical injuries: history replays don't model them, though live seasons do.
5. **Rivalries are not a computed record book.** They're bible entries (`rivalries.json`), with no head-to-head records computed from the games yet.
6. **Hockey standings in the ledger** fold overtime losses into losses, so pre-2026 hockey points can't be shown. From 2026, and in every save season, overtime losses are kept separately.
7. **Schedule lengths:** every season uses today's format (your decision D2), not historical lengths.

## Unresolved canon questions (lore manifest)

Eight bible questions are still marked open. The v0.4 data already proposes answers to several; these need your sign-off.

| # | Question | What the data says now |
|---|---|---|
| q1 | Founding years and trophy names | 1972 / 1974 / 1976 / 1978; Founders Cup, The Crown, Iron Bowl, Frost Cup (used everywhere) |
| q2 | Approve the 16 anchor events and nine legends | All 16 are in the game; 10 are played out in the games, 6 are bible-only (four foundings, the 2008 trade, the 2011 scandal) |
| q3 | Original 1970s franchises, relocations, expansions | The ledger uses today's 32 franchises from each founding year |
| q4 | Missing championship years and opponents | The ledger has a champion and runner-up for every season |
| q5 | Burlington's earlier Frost Cup in 1995? | The ledger has Burlington winning in 1983, 1995 and 2019 |
| q6 | Darius King's and Leon Mercer's teams | King: Los Angeles Voltage 1982–1995; Mercer: Chicago Comets 1981–1994 |
| q7 | Historic formats and playoffs | Today's formats throughout (D2) |
| q8 | Lore reveal before 2027 | Not needed: every career starts in 2027 |

**Season provenance in the ledger:**

| Origin | Seasons |
|---|---|
| New v0.4 proposals | 189 |
| Earlier anchors | 11 |
| Proposed inferences | 3 |
| Owner decision (the changed 1978 champion) | 1 |

All of it is proposed canon until approved.

## Known data limitations carried forward

- **v0.4 mismatches kept as reserves:**
  - 38 players whose contracts ran through 2025 but who are missing from v0.4's 2025 rosters;
  - 13 of v0.4's listed 2026 debuts with no open place.
- **90 founding veterans** debut before their league existed; they're founding signings, not draftees.
- **Football has no kickers;** kicks count for the team.
- **Mason Vale is protected from retirement** until you decide (in a long career he plays into his 50s).
- **Rookie names reuse the source data's names,** so legend surnames recur. No relation is implied.
- **Correction to the Phase D1 report:** every season has its sport-specific award; only Rookie of the Year sometimes has no winner (13 seasons: the four founding seasons and nine early ones, all before 1981).

## Files added in Phase F

- `src/sports/history/audit.ts`: per-season audit.
- `scripts/validate/phase_f.ts`: full validation; writes `docs/sports-lore/VALIDATION_REPORT.md` and `validation.json`.
- `tests/universeAudit.test.ts`.
- This report.
- `src/ui/styles.css`: Emmett's line 0.72 → 0.9 of the stage width (about 25% larger); his name slightly larger. Checked at 1024, 1440, 1920 and 2560 px: all 29 lines fit.
