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
