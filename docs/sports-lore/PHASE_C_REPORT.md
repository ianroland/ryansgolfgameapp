# Sports history: Phase C report (player and team statistics)

**Status:** built and tested. It is **not yet visible in the game**. All numbers are **generated / proposed history**, derived from simulated games, not verified records. Date: 2026-11-23.

## How stats are made

Every stat comes from the Phase B games. There are two kinds:

- **Exact.** What the simulation recorded as it played.
  - **The live engine is unchanged:** recording these stats uses no extra randomness. A fingerprint of every live and historical result, taken before and after, is identical.
  - **Basketball:** points and made 2s, 3s and free throws by player; attempts, offensive rebounds and turnovers by team.
  - **Baseball:** at-bats, hits, doubles, triples, home runs, runs, RBI, walks and strikeouts by batter; each starter's line while on the mound (outs, hits, runs, walks, strikeouts, home runs); the bullpen's line.
  - **Football:** touchdowns by scorer, passing TDs, and drives, field goals and extra points by team.
  - **Hockey:** goals, assists and shots by player; each goalie's shots against and goals against.
- **Allocated.** Stats the simulation doesn't play out shot by shot. They come from a separate seeded stream, and always add up to the game's real totals:
  - **Basketball:** missed shots by player, rebounds (= the misses), assists (a share of made baskets), steals and blocks (from the opponent's turnovers and misses), turnovers (team total), minutes (240 + overtime).
  - **Baseball:** relievers' split of the bullpen line (it always sums to the bullpen line), stolen bases, decisions (W/L to a starter who goes 5+ innings, otherwise the first reliever; saves to the closer in games of 3 runs or fewer), complete games, shutouts and no-hitters.
  - **Football:** yards from each drive's outcome; passing attempts and completions; carries; receptions and receiving yards (= the passing line, and every receiving TD keeps its catch); tackles (= the opponent's plays), sacks, interceptions and forced fumbles.
  - **Hockey:** penalty minutes.
- **Season totals** are the sum of the games, with regular season and playoffs kept apart. **Career totals** are the sum of the seasons. Averages and percentages are always **recomputed from totals**, never summed; this fixes v0.4's 187% field-goal careers.

## Anchor stats (owner-approved)

| Anchor | Result | How |
|---|---|---|
| Elias Voss, 1983 | **13–1, three no-hitters** (14 starts, 1.83 ERA) | Voss's 14 starts are fixed (every third Millers game: 13 wins, 1 loss) before the season's winners are assigned. The three no-hitters are complete games, resampled until the opponent has no hits. |
| Viktor Soren, 1989 | **71 saves** in the triple-overtime semifinal win over Buffalo | The game is a real triple-overtime win with Soren in net. 21 extra *saved* shots were added to reach 71; the score is unchanged. This is a documented adjustment. |
| Calvin Redd, 1996 | **31 points off the bench** in Game 5, the clincher of the final | Redd is first off the bench. Made baskets were moved from teammates to Redd; the team score is unchanged. This is a documented adjustment. |
| Andre Bellamy | **Exactly four scoring titles: 2002, 2003, 2005, 2007** (all at Detroit, before the 2008 trade) | Bellamy gets a larger shot share in those four seasons (a history-only setting). A test checks he leads the league in exactly those years from 1999 to 2014. |
| Marco Salazar, 1998 | Doubles in Game 7 | Game 7 is resampled until Salazar has a double. |
| Legends | Voss, Soren, Bellamy, King, Mercer, Salazar, Vale and Kessler get extra talent | e.g. Leon Mercer led 1987 at 20.2 ppg; Mason Vale's 2016 rookie year was 3,265 yards and 27 TDs |

## Data

- `src/sports/history/data/careers.json`: career totals for all **4,534** players who played a historical season (981 KB, 174 KB gzipped, loaded on demand).
  - The remaining 27 profiles never played one; 21 of them are 2026 rookies.
  - Rebuild with `npx vite-node scripts/history/build_careers.ts`. A test checks the file is current.
- Season stats are generated on demand per league season (well under a second).

## Tests

`tests/sportsHistoryStats.test.ts`: 10 tests (21 with Phase B), all passing. Across 16 seasons covering every league and era, plus every anchor season, every game's lines must reproduce its real totals:

| Sport | Checks |
|---|---|
| Basketball | points = score; minutes = 240 + OT; attempts ≥ makes; rebounds = offensive + defensive |
| Baseball | runs = score = runs allowed; hits = hits allowed; strikeouts match; one win and one loss per game |
| Football | receiving = passing (yards, catches, TDs); TDs = the game's TDs |
| Hockey | goals = score; goals against = opponent goals; saves = shots − goals; one goalie win |

- **Pitching records:** pitchers' wins and losses add up to the team record.
- **Anchors:** all five above.
- **Careers:** totals equal the sum of seasons; rates are recomputed.
- **Coverage and determinism:** the file covers every rostered player, and the same inputs give the same stats.

## Against the brief (§6): what is and isn't modelled

| Sport | Have | Not modelled (yet) |
|---|---|---|
| Baseball | G, AB, R, H, 2B, 3B, HR, RBI, BB, SO, SB, AVG, OBP, SLG; pitching G, GS, IP, H, R, ER, BB, SO, HR, W, L, SV, CG, SHO, no-hitters, ERA | Errors (so ER = R); pitching appearances are starter or reliever only |
| Basketball | GP, GS, MIN, PTS, FGM/A, 3PM/A, FTM/A, OREB/DREB/REB, AST, STL, BLK, TOV, percentages | n/a |
| Football | Passing ATT/CMP/YDS/TD/INT; rushing ATT/YDS/TD; receiving REC/YDS/TD; tackles, sacks, INT, forced fumbles | Kicking and punting by player (v0.4 has no kickers; kicks count for the team) |
| Hockey | GP, G, A, PTS, SOG, PIM; goalie GP, W, L, OTL, SA, SV, GA, SV%, GAA, SO, minutes | Plus/minus |

## Not in this phase

| Item | Phase |
|---|---|
| Awards (league MVP, championship MVP from the finals, rookie, pitching and defensive awards, statistical leaders), record books, Hall of Fame | D |
| Drafts, transactions, retirements | D |
| 2026 and the 2027 carry-over | D |
| Knowledge pack and History board UI | E |

**Not used:** v0.4's 33,376 stat lines and career totals (owner decision D1).
