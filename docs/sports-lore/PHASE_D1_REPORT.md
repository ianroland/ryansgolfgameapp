# Phase D, part 1: awards, records, drafts, transactions, Hall of Fame

Version 0.19.6. Proposed / generated history. Every honour is computed from the generated games
and stats (Phases B and C) by `src/sports/history/honors.ts`, run by
`npx vite-node scripts/history/build_careers.ts`. The output is `src/sports/history/data/honors.json`
(about 750 KB, loaded on demand by `loadHistoryHonors()`; not in the first load). Nothing is shown
in the game yet: the History board UI is Phase E.

## What was produced

| Item | Count | Rule |
|---|---|---|
| Most Valuable Player | 204 (one per league season) | Regular-season value × (1 + 0.6 × (team win % − 0.5)); 60% of games to qualify |
| Championship MVP | 204 | The champion's best player by value in the final series |
| Rookie of the Year | 191 | Best value in a player's debut season; none in a league's founding season |
| Pitcher of the Year (GDL) | 54 | Pitching value (innings, earned runs, strikeouts, wins); 20 innings minimum |
| Defensive Player of the Year (CBL, ALF) | 102 | Steals, blocks, defensive rebounds / tackles, sacks, interceptions, forced fumbles |
| Goaltender of the Year (FHL) | 48 | Saves, goals against, shutouts; 40% of games in goal |
| Statistical leaders | 824 | Per season: CBL ppg/rpg/apg; GDL avg/HR/RBI/ERA/W/SO; ALF pass/rush/rec yards and sacks; FHL goals/points/save % |
| Record books | top 5 of each | Single-game, single-season, career, team (streaks, wins, titles, repeat titles, droughts), series comebacks |
| Draft picks | 3,884 | See below |
| Transactions | 1 | See gaps |
| Hall of Fame (proposed) | 97 | See below |

Pitcher, defensive and goalie awards are fewer than one per season because a few early seasons had
no player meeting the minimum. MVP, championship MVP and leaders are complete.

## Checks against the bible (tests: `tests/sportsHistoryHonors.test.ts`, 11)

- Andre Bellamy's scoring titles are exactly 2002, 2003, 2005 and 2007 ("four-time scoring champion" before the 2008 trade). He also holds the CBL single-season points record (782, 2002) and the career points record (8,570).
- Elias Voss, 1983: 13 wins and 3 no-hitters, both GDL single-season records.
- Viktor Soren: 71 saves in the 1989 marathon, the FHL single-game record; also the FHL career saves leader.
- The 1998 Founders Cup comeback from 3–1 down is in the comebacks list.
- Every record traces to a real game or season line (tests rebuild sample seasons and compare with the file), and the stored file is checked for staleness.

## Proposed rules for the owner to approve

**Hall of Fame.** Eligible five seasons after the final season. Inducted in the first eligible year if the career score is in the top 2.5% of the league's players, with at least eight seasons. Career score: total season value, plus MVP 40, championship MVP 25, pitching/defensive/goalie award 25, rookie 5, and 5 per title. Result: GDL 30, CBL 12, ALF 34, FHL 21. The first class is 1985. The counts differ because the leagues have different numbers of players.
- In: Leon Mercer, Darius King, Viktor Soren, Marco Salazar, Andre Bellamy (2019), Owen Kessler.
- **Not in under this rule: Elias Voss** (strong peak, only one Pitcher of the Year award) and Calvin Redd (bench player). If Voss should be a Hall of Famer, I'd add a small "named in the bible" exception rather than bend the formula. Owner's call.

**Drafts.** A player's draft class is his debut year. The drafting team is his debut team. Order within a class: debut-season value plus a seeded scouting error (so busts and steals exist), eight picks per round. Founding-season players are founding signings, not draftees. No draft order by record is implied.

## Gaps (flagged, not invented)

1. **No coaches** in the source data, so there is no Coach of the Year.
2. **Only one player in the whole dataset changes teams**: Bellamy, Detroit Forge → Miami Monsoon, 2008. The other 4,560 careers are spent with one club, so there are no other trades or free-agent moves to list. Bellamy's deal is recorded as a trade; the "three players and two draft picks" Detroit received are not identified in the data, so the record says so.
3. **90 founding veterans** have debut years before their league existed (1970–1972 in v0.4). They are treated as founding signings with pre-league careers, not draftees or rookies.
4. **Generated comebacks worth a look:** besides 1998, the generator produced 21 series won from two games down, including three from 0–3 (CBL 1997, FHL 2023, GDL 2025). They follow from the series lengths in the ledger. They can stay as generated history or be smoothed in part 2.
5. **Long title runs come straight from the champions list:** FHL Rivets nine in a row (2010–2018), and the CBL Comets and Monsoon six each. These are ledger facts, not new.

## Next (part 2)

2026 retirements and rookies, the simulated 2026 season and champion, then the 2027 carry-over of
the 715 active players into the live leagues. That changes the live engine; open bets will be
settled before the switch.
