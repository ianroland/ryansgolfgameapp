# Sportsbook Phase 0: inspection report

- **Inspected:** 2026-11-23, against the repository at v0.17.0.
- **Scope:** findings, discrepancies with `SPORTSBOOK_DESIGN.md`, and the plan. No code changes are described here except the Phase 1 slice.

## What exists

| Area | Reality in the repo | Files |
|---|---|---|
| Navigation | No router. The hub shows tabbed panels. Casino: Head to the casino (one visit per career week, `casinoWeekKey`) → lobby → game subtabs from `LOCATIONS[desert_palms].games`. Table games stay mounted while hidden. | `src/ui/casino/CasinoPanel.tsx`, `CasinoLobby.tsx`, `src/expansion/locations.ts` |
| Game clock | Career calendar: **season + week, with `SEASON_WEEKS = 30`**. `gameDate(season, week)` maps to a date (season 1 = Feb 2027, 7 days per week). The casino is entered once per week. | `src/career/config.ts`, `src/career/engine.ts` |
| Ledger | `EconomyService.post({ ownerId, amount, type, sourceId, idempotencyKey })`. Atomic inside a Dexie transaction spreading `economy.tables`. Idempotency by key. `TransactionType` is a closed union validated by zod (`'tip'` and `'drink'` were added recently with no migration, because widening an enum is backwards-compatible). | `src/services/economyService.ts`, `src/core/types.ts`, `src/persistence/schemas.ts` |
| Save schema | Dexie/IndexedDB **v3** (`CURRENT_SCHEMA_VERSION`), every row zod-validated. `migrateSaveFile` steps v1 → v2 → v3. Boot and import run reconciles. Small feature state can live in `CareerState.flags` as JSON (Monique's memory, the drink state). | `src/persistence/db.ts`, `schemas.ts`, `src/services/saveService.ts` |
| Existing betting game | Greyhounds (`src/casino/greyhounds.ts`, `Greyhounds.tsx`): a race with betting and pending-race state saved in the career. The closest pattern for "bet now, settle later". | — |
| NPC packs | **Not implemented.** NPC Factory work is documentation only (`docs/npc-factory/`, the proposed `npc-pack` v1). NPCs at runtime: dealers and cocktail servers (`src/npc/*`, `src/casino/servers/*`), relationship tiers, `DealerDialoguePanel`. | — |
| UI scale | Casino scenes use the art's aspect ratio with container-query (`cqw`) sizing. Tables are 1672×941 (craps, roulette). Two-column layout at ≥1000 px; stacked on phones. | `src/ui/styles.css` |

## Discrepancies with SPORTSBOOK_DESIGN.md, and proposed fixes

1. **Calendar: a 30-week season, not 52.**
   - The design assumed a 52-week sports year with league windows from week 10 to week 3 the next year.
   - **Fix:** one sports year per golf season (30 weeks). Each league plays inside a staggered window and finishes within the season. Cross-season leagues (basketball, hockey) span two golf seasons, with the off-season handled at the year boundary.
2. **Season lengths with 8 teams.** A balanced schedule needs a multiple of 7 opponents, with home and away alternating.

| League | Games per team | Games per week | Weeks of play |
|---|---|---|---|
| Basketball | 28 (4 × 7) | 2 | 14 |
| Hockey | 28 | 2 | 14 |
| Baseball | 42 (6 × 7), in series of 3 | 3 | 14 |
| Football | 14 (2 × 7) | 1 | 14 |

   - **Playoffs:** 2–3 weeks.
   - **Feasibility:** each round is 4 games (the circle method), so every week is valid. The engine will verify this in Phase 2 with a schedule validator test.
   - These replace the 56/42/14/42 counts in the design. **Needs your approval.**
3. **Where time advances.** Career weeks advance through the existing career actions. The sports world advances to the current `gameDate` whenever it's read (lazy and idempotent), so no golf code needs a hook.
   - Nothing interrupts golf: the phone is view-only, and nothing pops up during a shot.
4. **Ledger types.** `sports_bet` and `sports_payout` are new `TransactionType`s (enum widening, the same as `drink`). Not added in Phase 1.
5. **Save migration.** v3 → v4, adding sports tables only. Planned for Phase 4. Phase 1 stores nothing.
6. **NPC clerk.** No importer exists yet. Phase 1 has an empty clerk portrait slot (clearly labelled), and the NPC Factory id is TBD. No invented id is made canonical.
7. **Casino entrance.** A "Sportsbook" subtab on the Desert Palms floor (the same pattern as the games). White Buffalo and Morongo Sky floors aren't open yet, so their lounges come with their floors (existing unlocks unchanged).

## Phase 1 implementation (this change)

- **Desert Palms sportsbook prototype:** a visual-first slice with **DEMO data** (clearly tagged), where nothing touches the ledger or the save.
- **File map:**
  - `src/sports/demo.ts`: demo leagues and teams (names from the design, pending clearance), demo matchups, demo lines from a simple rating model (not the real odds engine), and demo scores, standings, news and history.
  - `src/sports/themes.ts`: theme tokens per casino (colours and asset paths), with placeholders where art is missing.
  - `src/sports/slip.ts`: pure bet-slip maths (decimal odds, parlay legs, potential return). Reused by Phase 3.
  - `src/assets/sportsbook/manifest.json` + `docs/sportsbook/ASSET_MANIFEST.md`: every required asset, its exact size, transparency, status and where it's used.
  - `src/ui/sportsbook/Sportsbook.tsx`: lounge stage (1672:941 at native aspect, scaled with container units), placeholder background, CRT boards, clerk slot, menu, bankroll HUD, league tabs, games, matchup, market selectors, bet slip with stake and confirmation, sandboxed tickets, and Scores, Standings, News and History views.
- **Tests:** demo determinism, slip maths, theme completeness, the sandbox boundary (the sportsbook UI and demo modules never import the ledger or save code), and Playwright navigation and screenshots.

## Next smallest milestone after review

**Phase 2a:** basketball end to end in the pure engine, with no UI or save changes:
- 8 teams, the circle-method schedule plus the validator, game simulation, standings, a playoff bracket.
- A deterministic replay test with a fixed seed.

## Phase 1 result (implemented)

- **Built:** the Desert Palms "Sportsbook (demo)" tab with:
  - a lounge stage (native 1672:941 on wide screens, stacked on phones)
  - a labelled placeholder background
  - CRT boards: Lines, Scores, Standings, News, History, Tickets
  - league tabs, matchup details, moneyline/spread/total selectors
  - a bet slip with singles and parlays (2–6 legs, different games), stake control, a confirmation dialog (Esc closes it) and sandboxed demo tickets
  - a bankroll HUD and a clerk portrait slot (placeholder)
- **Sandbox:** verified in the browser (bankroll and ledger unchanged after demo bets) and by a boundary test.
- **Tests:** `tests/sportsbookSlice.test.ts` (11).
- **Theme tokens** for all three lounges in `src/sports/themes.ts`. Only Desert Palms is playable.

## Decisions still open

| # | Decision | Status |
|---|---|---|
| 1 | League and team names | **Approved 2026-11-23:** nationwide alignment, 32 teams (design §4). Trademark clearance still **open**. |
| 2 | Season lengths: baseball 42 (6 per opponent), basketball 28 (4), football 14 (2), hockey 28 (4); balanced home and away | **Approved 2026-11-23** (`SEASON_FORMAT` in `src/sports/demo.ts`). Playoff length still open. |
| 3 | Roster sizes (about 680 active players) | Open |
| 4 | House margin 4.5% overround (configurable; realised hold is reported separately) | Open |
| 5 | Stake limits $5 to $1,000 at Desert Palms; parlay cap 100× or $50,000 | Open |
| 6 | v1 markets: moneyline, spread, totals, pre-game; no live or same-game parlays; futures later | Open |
| 7 | Bets in lounges only (v1), or from the phone too | Open |
| 8 | Phone view access during golf (view only) | Open |
| 9 | New ledger types `sports_bet` / `sports_payout` | Open |
| 10 | Lounges follow existing casino unlocks | Open (assumed yes) |
| 11 | UI-only confirmation when Ryan is impaired | Open |
| 12 | Clerk: per-lounge NPC Factory clerks, or one placeholder | Open (placeholder slot in Phase 1) |
| 13 | Save schema v4 migration (sports tables only) | Open (Phase 4) |
| 14 | Art list and sizes (`ASSET_MANIFEST.md`) | Open |
| 15 | Keep the demo tab visible on the live site (labelled "demo") until Phase 3 | **New**; currently visible |

## Phase 2a result (implemented): basketball engine

- **Pure engine, nothing visible yet.** No UI, save or ledger changes.
- **Files** in `src/sports/`:
  - `rng.ts`: seeded streams per purpose.
  - `config.ts`: tunable numbers (PROPOSED).
  - `names.ts`: original name generator.
  - `players.ts`: rosters and attributes.
  - `schedule.ts`: circle-method balanced schedules plus a validator.
  - `basketball.ts`: possession simulation.
  - `season.ts`: world, season, standings and tiebreakers, playoffs, awards.
- **World:** 8 CCL franchises, each with 10 players (two per position), team quality hidden. Players have age, attributes, overall, hidden potential and peak age, and a personality tag.
- **Season:**
  - 28 games per team (4 per opponent, 2 home and 2 away). Weeks 2–15 of Ryan's season, two rounds a week. Playoffs in weeks 16–17.
  - Injuries sit players and weaken teams.
  - Standings use win %, then head-to-head within the tied group, then point difference, then a seeded draw.
  - Playoffs: 1 v 4 and 2 v 3, best-of-5, then a best-of-7 final. Higher seeds host games 1, 2, 5 and 7.
  - Awards: MVP and Finals MVP.
- **Measured** over 24 seeded seasons:

| Measure | Result |
|---|---|
| Points per game (both teams) | about 214 |
| Home win rate | about 57% |
| Overtime | 1–10% of games |
| Team quality vs record | correlation above 0.5 |
| Injuries per season | 2–25 |
| Time per season | about 50 ms |

- **Determinism:** the same seed reproduces the world and the whole season exactly.
- **Tests:** `tests/sportsEngine.test.ts` (18).
- **Not yet built:** other sports, the off-season (draft, development, aging, trades, retirements), odds, saving, the calendar hook, and UI wiring. The sportsbook screens still show demo data.

**Next (done below):** Phase 2b.

## Phase 2b result (implemented): baseball, football and hockey engines

- **Still pure engine, nothing visible yet.** No UI, save or ledger changes. Basketball results are unchanged from Phase 2a (same seeds give the same seasons).
- **New files** in `src/sports/`:
  - `sim.ts`: the shapes every sport shares (game result, box line, game context).
  - `baseball.ts`: plate-appearance simulation. Four-man rotation, bullpen, base running, sacrifice flies, double plays, extra innings with a runner on second from the 10th, walk-offs.
  - `football.ts`: drive simulation. Touchdowns, field goals, defensive scores, overtime (each team gets a drive, then sudden death). Regular-season games can end tied; playoff games always have a winner.
  - `hockey.ts`: shot simulation, shooter against goalie, with assists. The backup goalie starts every fourth game. Five-minute sudden-death overtime, then a shootout.
- **Changed:** `players.ts` (rosters by sport), `schedule.ts` (baseball's three-game series), `season.ts` (all four leagues), `config.ts` (all tunable numbers, still PROPOSED).
- **Rosters:**

| Sport | Players per team | Positions |
|---|---|---|
| Baseball | 16 | one at each fielding spot plus DH and utility; 4 starting and 2 relief pitchers |
| Basketball | 10 | two at each position |
| Football | 24 | QB, 2 RB, 3 WR, TE, 5 OL, 4 DL, 3 LB, 4 DB, K |
| Hockey | 18 | 3 C, 7 W, 6 D, 2 G |

- **Calendar** (Ryan's 30-week season; every league finishes its playoffs by week 30):

| Sport | Regular season | Games per team | Playoffs |
|---|---|---|---|
| Baseball | from week 1, 3 days a week, in 3-game series | 42 | best-of-5 semis, best-of-7 final (2-3-2) |
| Basketball | weeks 2–15 | 28 | best-of-5 semis, best-of-7 final |
| Football | from week 13, one game a week | 14 | single-game semis, neutral-site final |
| Hockey | from week 15, 2 days a week | 28 | best-of-5 semis, best-of-7 final |

- **Standings:** hockey uses points (2 for a win, 1 for an overtime or shootout loss). Football counts a tie as half a win.
- **Awards:** MVP and Finals MVP in every league, scored from each sport's own box score. Kickers are excluded.
- **Measured** over 30 seeded seasons:

| Measure | Baseball | Football | Hockey |
|---|---|---|---|
| Total score per game (both teams) | about 9.3 runs | about 46.5 points | about 6.2 goals |
| Home win rate | about 55% | about 53% | about 56% |
| Extra innings / overtime | about 9% | under 10% | about 15% (some shootouts) |
| Team quality vs record (correlation) | about 0.69 | about 0.53 | about 0.64 |
| Time per season | about 28 ms | about 6 ms | about 15 ms |

- **Tests:** `tests/sportsEngine.test.ts` now has 29 (11 new). They cover determinism, rosters, schedule length and calendar, baseball series, box scores that add up to the final score, hockey points, football ties and the neutral final, baseball's 2-3-2 final, realism ranges, better teams winning more, and awards.
- **Not yet built:** the off-season (draft, development, aging, trades, retirements), odds, saving, the calendar hook, and UI wiring. The sportsbook screens still show demo data.

**Next:** Phase 2c, the off-season.

## Desert Palms sportsbook clerk (installed)

- **Who:** Emmett Okafor (`emmett_okafor`), from the NPC Factory pack `tiny_mana.casino_servers` 0.2.0.
- **Portraits:** all six expressions (friendly, playful, impressed, concerned, annoyed, firm) at `src/assets/sportsbook/desert_palms/clerk_<expression>.png`. They are copied byte-for-byte from the pack's `sprites/emmett_okafor/` and match the 3×2 sheet the user supplied.
- **In the lounge:** shown in the clerk slot on wide screens and phones, with his name.
  - Friendly by default.
  - Concerned while the stake is more than the bankroll.
  - Playful for a few seconds after a ticket goes in.
  - These are presentation only and never touch the slip, odds or ledger.
- **Still placeholder:** his line ("Lines are posted. Take your time.") keeps the Placeholder tag.
- **Mismatch to fix in NPC Factory:** the pack lists Emmett as a **roulette dealer**, and all 21 of his dialogue lines are roulette puns. Those lines are not used here. Desert Palms roulette is already Monique's table. The pack should be re-exported with Emmett as the sportsbook clerk and sportsbook-appropriate lines. The pack itself was not edited.
- **Pack status:** a development build (`productionReady: false`). Only the portraits were taken from it; no pack data is imported at runtime.

## Sports history canon (draft, read-only)

The `sports-lore/1` historical layer is in `src/sports/lore/` (see `docs/sports-lore/SPORTS_LORE.md`). The sportsbook History board now shows draft canon instead of invented demo champions. It never touches the engine, odds, bankroll or saves.
