# The living sports universe (technical reference)

Phase D part 3, v0.19.8. How the four leagues keep going after the shared history, season after
season, inside one save.

## Layers

| Layer | Years | Where | Shared or per save |
|---|---|---|---|
| Ledger history | 1972–2025 | `src/sports/history/data/*.json` (players, seasons, careers, honors) | Shared, immutable |
| Simulated 2026 and the 2027 off-season | 2026–2027 | `forward.json`, `src/sports/data/live2027.json` | Shared, immutable |
| Universe start | 2027 | `src/sports/data/universe2027.json` (from `scripts/history/build_universe.ts`) | Shared, immutable |
| Living universe | 2027 season on | IndexedDB table `sportsYears` (one row per completed year) | **Per save** |

Two saves share everything through the 2027 rosters. After that, each save's seed decides its own
games, awards, retirements and drafts. Nothing a save generates is ever written to the shared data.

Rebuild order for the shared files:
1. `build_careers.ts`
2. `build_forward.ts`
3. `build_universe.ts`

Tests check that the files are current.

## World versions (career flags)

| Flag | Meaning |
|---|---|
| `sportsWorldV: 3` | The current version. |
| `sportsHistoryFrom` | The first career season on the history rosters. |
| `sportsEvolveFrom` | The first season whose rosters come from an off-season. Seasons from `sportsHistoryFrom` up to it use the fixed 2027 rosters. |
| `sportsYearDone` | The last sports year whose off-season is stored. |
| `sportsWorldMigrated`, `sportsEvolveMigrated` | When the save was moved to v2 and v3. |

New careers start with `historyFrom 1, evolveFrom 2`: 2027 on the fixed rosters, then 2028 onward evolving.

Older saves are moved up by `migrateSportsWorld` on launch and after an import. Any season that already has a ticket or a final game keeps the rosters it had.

`book.ts` `rostersFor(ref, season)` returns one of three modes:
- `generated`: the pre-history world;
- `history`: the fixed 2027 rosters;
- `evolved`: the per-save chain.

## The chain (`src/sports/universe/`)

- `model.ts`: the player model (`UPlayer`), career records (`UCareer`), development curves, the retirement chance, and `worldFromState` (state → engine players).
- `offseason.ts`: `runOffseason(prev, season results, seed, shared seed)`, with its 13 steps:
  1. games final;
  2. tickets settled (by the service);
  3. standings and champions;
  4. player stats;
  5. awards and records;
  6. retirements;
  7. Hall of Fame;
  8. rookie class;
  9. draft;
  10. replenishment;
  11. development;
  12. schedule (made by the engine);
  13. validation.

  Pure and deterministic.
- `chain.ts`: `state(S) = runOffseason(state(S-1), results(S-1))` for S ≥ `evolveFrom`, memoized (last four seasons). `registerState` loads stored states.

**Player state.** Each player stores a birth year (age is always the season year minus it), team, position group, peak age, development kind, current ability `L`, and attributes set once (`a0` at `L0`, shifted by `L − L0`). Engine positions such as SP/RP and DH/UT are re-assigned by ability every season, exactly as the history rosters were.

**Development.** Each off-season: expected change = curve(age now) − curve(age before), plus a small seeded noise (±1.5), capped at −6 / +5.

| Sport | Growth per year below peak | Years at peak | Decline per year after |
|---|---|---|---|
| Basketball | 1.2 | 2 | 1.1 |
| Baseball | 1.0 | 3 | 0.9 |
| Football | 1.2 | 1 | 1.3 |
| Hockey | 1.2 | 2 | 1.1 |

Decline speeds up 20% per year past 33.

| Kind | Share | Difference |
|---|---|---|
| Standard | 80% | — |
| Late bloomer | 8% | Peaks two years later |
| Durable | 7% | Two more peak years, decline × 0.6 |
| Early fade | 5% | Decline × 1.5 |

**Retirement.** The league's historical chance for the age (Phase D part 2 table), multiplied by:

| Factor | Multiplier |
|---|---|
| Playing time under 30% of games | × 1.5 |
| Playing time over 80% of games | × 0.85 |
| Bottom third of the team by ability | × 1.25 |
| Top fifth of the team by ability | × 0.75 |
| 14 or more seasons | × 1.25 |
| Ability fell 1.5 or more last year | × 1.3 |
| Running back | × 1.25 |
| Quarterback | × 0.85 |
| Offensive line | × 0.95 |
| Goalie | × 0.85 |
| Pitcher | × 1.05 |

The chance is capped at 95%, at least 60% from age 41, and 100% at 44. `PROTECTED` lists only Mason Vale.

**Draft.**
- Reserves rejoin their own team first.
- Each league's rookie class is sized to the open places: two per place plus three, per position.
- Names come from the source data's first and last names, never one already used (shared names plus this save's).
- Debut ages come from the league's history.
- The prospect pool is centred 0.7 player-spreads below the historical level, because teams take the best of it. A typical draft class then averages the league level, with no talent inflation over decades (tested).
- Order: non-playoff teams worst first, then semifinal losers (worse record first), the runner-up, and the champion last.
- Each team takes the best prospect left at a position it needs.
- If a roster can't be completed, `RosterError` is thrown; positions are never assigned that can't be filled.

**Awards and records.**
- Awards use the Phase D part 1 `seasonHonors`: MVP, championship MVP, rookie, the sport's own award, and leaders.
- The record book starts from the canon top 5 plus 2026 and keeps the top 5 per stat.
- Each year's summary lists new and tied records, career milestones, comebacks (0–3 tagged legendary), the title drought ended, and titles in a row.

**Hall of Fame.**
- Statistical pathway: score = season value + award bonuses + 5 × titles (the part 1 model), at least eight seasons, and a score at or above the league's bar (the last career inside the canon top 2.5%; `honors.hallOfFameThreshold`).
- Decided at retirement and inducted five years later, once.
- Pending canon classes (2030 and 2031) ship in the shared seed.
- Legends pathway: Voss only (already inducted).

## Persistence (`SportsUniverseService`, DB v4)

**`sportsYears` rows.** Each row has:
- id `sy:<year>`, year, season, chain key, `phase: 'complete'`, the steps run, and when it was written;
- `summary` (JSON);
- `lines` (each player's regular-season and playoff line);
- `state`: the next season's full state, kept on the newest three rows only.

**Size per year.** About 30 KB summary, 90 KB lines, and 220 KB state on three rows. That's about 3.5 MB after 25 years.

**`processDue()` steps:**
1. Settle what's final.
2. For each completed season not yet stored: refuse if a ticket on it is still open, otherwise run the off-season and write the row plus `sportsYearDone` in one transaction.

It's idempotent across repeats, reloads and tabs.

**Calls:**
- `prime()`: on launch and after import, gives the chain the stored states.
- `processDue()`: on launch, after import, and on the first week of a new season.

## Betting integrity

- Each season's rosters are fixed once made, so a game's result never changes.
- Each ticket leg records `rv`, the roster version of its season, when priced.
- `settleTicket` refuses to grade a leg whose season's roster version differs. Such a ticket stays open, and the next off-season waits for it.
- Payout keys stay unique per ticket; nothing is voided or deleted.

## Rollback

- A v4 save file can't be imported by v0.19.7 (it refuses newer schema versions).
- Running v0.19.7 on a v4 database ignores the `sportsYears` table and the v3 flags. Seasons from 2028 would show the fixed rosters again, and a ticket placed on an evolved season would be graded against different games.
- Before downgrading, settle open tickets or restore an export made with the older version.

## The History Board (Phase E)

The board (`src/ui/history/`, opened from the sportsbook's History button) reads this universe through a read-only layer:
- `src/sports/archive/shared.ts` loads the shared files plus `archive.json` (season lines and playoff series, 1972–2026, derived by `scripts/history/build_archive.ts`).
- `save.ts` adds the save's stored years and rebuilds any fixed-roster seasons a legacy save played.
- `board.ts` combines them; every view reads the same season list.

From v0.19.9, stored year summaries include each playoff series (`LeagueYear.series`). See `PHASE_E_REPORT.md`.
