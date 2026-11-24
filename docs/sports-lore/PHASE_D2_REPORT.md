# Phase D, part 2: 2026, the 2027 carry-over, and save migration

Version 0.19.7. Generated and proposed history, never verified records. The 1972–2025 files
(players.json, seasons.json, careers.json and the Part 1 entries in honors.json) are not rewritten.
The new years sit in a separate layer:

- `src/sports/history/forward.ts` holds the rules.
- `scripts/history/build_forward.ts` builds the files.
- `src/sports/history/data/forward.json` holds the 2026 off-season, season and honours, plus the 2027 off-season.
- `src/sports/data/live2027.json` holds the 2027 live rosters.

Everything is seeded from the history seed, so it is identical in every save and on every rebuild (tested).

## Approved decisions applied

- **Hall of Fame:** the statistical pathway is unchanged (the same 97). A new Historical Legends pathway is limited to an owner-approved list, which today is only Elias Voss (three no-hitters, 1983). He is eligible in 1997 after the same five-year wait. Calvin Redd and the other bible names are not added.
- **0–3 comebacks:** basketball 1997, hockey 2023 and baseball 2025 are tagged `legendary_comeback`. Their results are unchanged.
- **Gaps kept:**
  - no Coach of the Year;
  - Bellamy's 2008 deal is still the only trade, with its three players and two picks unresolved;
  - the 90 founding veterans stay founding signings;
  - no transactions were invented. Players stay with their teams.

## The active-player count, verified

The 715 holds, but it is three groups:

| Group | Players |
|---|---|
| On a 2025 roster | 656 |
| Contract runs through 2025 but not on v0.4's 2025 roster (a v0.4 mismatch; treated as reserves) | 38 |
| v0.4's own listed 2026 debuts | 21 |
| **Total (final year 2025 or later)** | **715** |

## 2026 off-season

| League | Retired | Listed debuts signed | Reserves back | Drafted | Reserves after |
|---|---|---|---|---|---|
| Baseball (GDL) | 26 | 3 | 0 | 22 | 12 |
| Basketball (CBL) | 13 | 2 | 2 | 7 | 10 |
| Football (ALF) | 22 | 0 | 3 | 18 | 10 |
| Hockey (FHL) | 25 | 3 | 1 | 20 | 8 |
| **Total** | **86** | **8** | **6** | **67** | **40** |

Retirement chance by age comes from each league's 1990–2024 history. Retiree ages ran from 22 to 35, and the total (86) matches the historical average of about 82 a year. Named legends are exempt; Mason Vale (football, age 32 in 2026) is the only one still active.

13 of v0.4's 21 listed 2026 debuts had no open place at their position, so they are reserves rather than invented roster moves.

**First overall picks:**
- Drew Monroe (OF), Phoenix Firebirds
- Noah Kerr (F), Detroit Forge
- Noah Molina (OL), Omaha Harvesters
- Isaac Vale (LW), Duluth Borealis

## 2026 season

The season was played on the engine with no target records, using today's schedules and the top-4 playoff.

| League | Champion | Record (seed) | Beat | Note |
|---|---|---|---|---|
| GDL | Charleston Kingfishers | 22–20 (4) | Boston Lamplighters | 11th title, first since 2022 |
| CBL | Seattle Satellites | 23–5 (1) | Denver Jackrabbits | 9th title; 23 wins ties the league record |
| ALF | Salt Lake City Rockslides | 10–4 (1) | Omaha Harvesters | Back-to-back (2025, 2026) |
| FHL | Duluth Borealis | 16–12 (4) | Toledo Rivets | First title since 2005 |

**Awards:**

| League | MVP | Second award | Rookie of the Year | Championship MVP |
|---|---|---|---|---|
| GDL | Carlos Carver (PIT) | Pitcher: Shawn Holland (PIT) | Theo Archer (TUC) | Caleb Archer (CHS) |
| CBL | Marcus Valdez (SEA) | Defense: Miles Olsen (DEN) | Xavier Hawkins (LV) | Marcus Valdez (SEA) |
| ALF | Gavin Vale (SLC) | Defense: Anton Novak (CLE) | Dante Porter (JAX) | Gavin Vale (SLC) |
| FHL | Damon Graves (POR) | Goalie: Parker Sawyer (BUR) | Jamal Berg (POR) | Micah Ellis (DUL) |

**Records:** none broken. Ties:
- three home runs in a game (twice);
- four goals in a game;
- Seattle's 23 wins.

Cedric Rasmussen reached the football career passing-touchdown top 5 (206). The 1972–2025 record books are compared against, never rewritten.

**Hall of Fame class of 2026:** same rule and same ranking as the 97, players whose final season was 2021:
- Tariq Nyberg (4× MVP), Luca Quinn and Brett Novak (basketball);
- Theo Nyberg and Gavin Rowe (baseball).

## 2027 off-season and live rosters

| League | Retired | Reserves back | Drafted | Reserves after |
|---|---|---|---|---|
| GDL | 18 | 3 | 14 | 8 |
| CBL | 14 | 3 | 10 | 6 |
| ALF | 23 | 2 | 20 | 7 |
| FHL | 25 | 2 | 22 | 5 |
| **Total** | **80** | **10** | **66** | **26** |

**2027 live rosters: 656 players on 32 teams, every team at full 2025 composition** (12 basketball, 22 baseball, 28 football, 20 hockey), plus 26 reserves who are not on a game roster.
- No player is duplicated, and none is retired.
- Ages are 2027 minus birth year.
- Talent comes from the same model as the history, with half of last season's team strength carried over.
- Live rosters are larger than the old generated ones (10/16/24/18). Football has no kickers, so kicks count for the team, the same as all 50 years of history.

## Live engine and saves

- **World marker on the career** (career flags, no database change):
  - `sportsWorldV: 2`;
  - `sportsHistoryFrom: N`, the first career season on the history rosters;
  - `sportsWorldMigrated: "season.week"`.
- **New careers** are marked from season 1 (2027).
- **Older saves** are migrated on launch and after a save import:
  1. Every ticket already final is settled under the existing rules (same keys, idempotent).
  2. The marker is written.
     - If any ticket is on the current season, or any of its games is final, the history rosters start **next** season. The season in progress replays exactly as before (fingerprint `36d0b61ebf72f0ec`, unchanged).
     - Otherwise they start now.
- **Open tickets are never settled early, voided or deleted.** They settle later against the same games they were priced on. Bankroll and transaction history are untouched, apart from normal payouts for tickets that were already final.
- **Repeat safety:** running the migration again does nothing, because a marked save is returned unchanged. Payout keys stay unique per ticket.
- **Your own save:** I can't see it from here. On first launch of 0.19.7 it will be migrated as above. Tickets that are open stay open and settle as normal.

### Rollback and recovery

- **Before updating:** an export from Settings is a full backup. Re-importing it is safe, and the migration runs once.
- **Rolling back to 0.19.6:** this is safe only when no ticket is open on a season at or after `sportsHistoryFrom`. The old build doesn't know the marker and would grade those tickets against the old rosters' games. To be safe, advance a week so open tickets settle, or restore the pre-update export.
- **Marker lost** (for example, an old export imported): the migration re-applies the same rule. A season with tickets keeps its original rosters.

## Validation

`tests/sportsForward.test.ts` (20 tests) covers:
- retirement and rookie eligibility;
- age progression;
- roster limits and composition;
- schedule completeness and playoff structure;
- preservation of the 1972–2025 data;
- awards and Hall of Fame eligibility;
- deterministic rebuilds;
- live world switching;
- ticket settlement across the migration, bankroll reconciliation, and ledger idempotency;
- save export/import before and after migration;
- repeat-migration safety.

Existing service tests now use the save's world reference.

- Full suite: **657 passed, 7 skipped** (49 files).
- `npm run build` succeeds. The live rosters add about 12 KB gzipped to the app.
- Browser check on a fresh career: bet, advance a week, settle, inbox and tickets all work, with no page errors.

## Remaining issues before Phase E

1. **Live seasons after 2027 reuse the 2027 rosters.** There is no yearly live off-season yet (aging, retirements, drafts per save). Next piece of work.
2. **Mason Vale** is exempt from generated retirement. His career end needs an owner decision at some point.
3. **v0.4 data mismatches carried as reserves:**
   - 38 players whose contracts run through 2025 but who are missing from the 2025 rosters;
   - 13 listed 2026 debuts with no open place (7 still reserves in 2027).
4. **Football has no kickers** (v0.4 never had them). Adding eight would be invented players, so it's left for the owner.
5. **Rookie names reuse v0.4's own first and last names.** Some share surnames with bible figures (e.g. Isaac Vale, Gavin Vale), as v0.4's generated players already did. No relation is implied.
6. **Nothing new is shown in the game yet.** The History Board (Phase E) will read honors.json and forward.json. Emmett's lines and other clerks are still drafts.
