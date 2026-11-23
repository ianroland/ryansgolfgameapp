# Casino Secrets & Rivalries: Gate 0 audit

Audited 2026-11-23 against `main` at `98476ee` (v0.14.0). This is a read-only audit: no code, saves or assets were changed. Every path below was opened and checked.

## 1. Project shape

| Area | What exists | Where |
|---|---|---|
| Stack | React 19 UI, Phaser 4 for the golf round and the clubhouse room, Dexie (IndexedDB) for saves, zod schemas, Vite, vitest + fake-indexeddb | `package.json` |
| Hosting | **Static site only.** Netlify runs `npm run build:site` into `dist-site/`. There are **no** functions, server, database, accounts, secrets or env vars. The game's only `fetch` loads local audio files. | `netlify.toml`, `scripts/build-site.mjs`, `src/audio/sound.ts:134` |
| Saves | One browser-local IndexedDB database per player (`ryans-road-to-the-lpga`), with JSON export/import | `src/persistence/db.ts`, `src/services/saveService.ts` |
| Tests | 35 vitest files: 448 passing, 7 skipped (full run on 0.14.0). Screenshot QA is done with an ad-hoc Python Playwright script outside the repo. | `tests/` |
| Docs convention | `docs/` holds topic folders (`docs/story/baba/`, `docs/casino/`). This plan lives in `docs/casino-expansion/`. | `docs/` |

## 2. Save and load schema

- **Dexie schema v2:** `CURRENT_SCHEMA_VERSION = 2` (`src/persistence/db.ts`).
  - Tables: `profiles, ledger, balances, properties, furniture, trophies, trophyPlacements, careers, tournaments, careerEvents, processedEvents, albatrosses`.
  - Every write passes a zod schema through Dexie hooks (`installValidationHooks`).
- **Import path:** `migrateSaveFile` (`src/services/saveService.ts`) steps old files forward (v1 to v2 adds `albatrosses: []`) and always rebuilds `balances` from the ledger.
  - The header comment in `db.ts` is the documented way to add a version: a new `this.version(n)` plus a matching migrate step.
- **Career row (`careers`, id `'career'`):** `CareerStateSchema` is a `z.looseObject` (`src/persistence/schemas.ts:167`), so extra fields pass through.
- **`career.flags: Record<string, number|boolean|string>`** is where most additive features have gone so far, with complex values stored as JSON strings. Examples:
  - `moniqueMemory` (`src/casino/monique.ts`)
  - `greyhoundCard`, `greyhoundPending`, `greyhoundHistory`
  - `baccaratShoe`, `baccaratHistory`, `threeCardPending` (`src/services/casinoService.ts`)
  - `casinoVisit`, `casinoWagered`, `casinoReturned`, `casinoBiggestWin` (`src/career/engine.ts:229-265`)
- **Finding:** the flags pattern is fine for small pieces of state. It does not suit the expansion's volume: NPC profiles, poker sessions, skins matches and sportsbook tickets. Each flag is re-serialised on every career write, and flags have no per-record validation. See `SAVE_MIGRATION_PLAN.md`.

## 3. Bankroll: one central path (confirmed)

**`EconomyService.post()` (`src/services/economyService.ts:42`) is the only code that changes the bankroll.**

- **The ledger is authoritative:** append-only, with a per-owner `seq` and a unique `idempotencyKey` index.
- `balances` is a snapshot written in the same transaction.
- `post()` refuses any entry that would take the balance below zero (`INSUFFICIENT_FUNDS`).
- `verifyIntegrity()` re-chains the whole ledger.
- **Amounts are whole dollars.**

Every caller of `post()`:

| Caller | Types posted |
|---|---|
| `careerService.ensureCareer` (`careerService.ts:73`) | `career_start_grant` |
| `careerService.mutate` (`careerService.ts:156`). Runs every `engine.*` outcome's `money[]`: actions and jobs (`engine.ts:213, 217`), entry and travel (`:356-357`), weekly sponsor and rent (`:528, 532`), stories and encounters (`applyEffects`, `:610`), gear and lifestyle (`:310, 327`), homes (`careerService.ts:238`), casino visit (`visitCasino`) | `job_wage, sponsor_income, entry_fee, travel, living_costs, story, gear_purchase, lifestyle_purchase, home_purchase` |
| `tournamentPipeline.process` (`tournamentPipeline.ts:127, 145`) | `prize_money`, plus a sponsor win bonus (`sponsor_income`) |
| `storeService.purchase` (`storeService.ts:58`) | `furniture_purchase` |
| `casinoService.*` (`wager`, `settle`, greyhounds, `playBaccarat`, `startThreeCard`, `finishThreeCard`) | `casino` |
| Save import (`saveService.importSave`) | Doesn't post. It **replaces** the ledger wholesale and rebuilds the snapshots. |

**Every transaction that posts also includes `economy.tables` in its Dexie scope.** I checked all of them: casino, career, store and the tournament pipeline (`allTables`). So a new table added to `EconomyService.tables` joins every money transaction automatically. That is the hook for the Morongo Sky peak-bankroll check (see the architecture proposal).

`TransactionType` is a closed enum (`src/core/types.ts:38`), and the ledger schema validates it (`schemas.ts:26`). New income kinds (skins, keno, sportsbook) need new enum values. Adding values is additive: old rows stay valid.

## 4. Career earnings: what already exists

| Measure | Source | Notes |
|---|---|---|
| `career.totals.earnings` | `engine.applyTournamentResult`: `t.earnings += me.prize` (`engine.ts:427`) | **Tournament prize money only.** It only ever goes up. Present on every save (schema requires it). |
| `career.careerMoney[playerId]` | `engine.ts:390-396` | All-time money list. Also prize money only. Seeded for older saves (`moneyList.ts`). |
| Ledger sums by type | `ledger` rows: `prize_money`, `sponsor_income`, `job_wage`, `story`, `casino` | Lets any income definition be **recomputed exactly for historical saves**. |
| Peak bankroll | **Not tracked anywhere.** Each ledger row does hold `balanceAfter`, so the historical peak is `max(balanceAfter)` over the ledger, which is exact. | This is how existing saves can be recognised for the $1M unlock. |

**Superseded by bible v0.2:** White Buffalo now unlocks on a $100K **bankroll peak** (all income counts), so earnings definitions no longer gate anything. Both unlocks use the ledger's `max(balanceAfter)`.

## 5. Casino today (Desert Palms)

- **One casino, gated per week.**
  - `engine.visitCasino` uses one weekly activity plus `CASINO_ENERGY` (10), and sets `flags.casinoVisit = casinoWeekKey`.
  - `CasinoService.open()` refuses play unless that week's visit is recorded and no tournament is active (`casinoService.ts:102`).
- **Games and their money paths:**

| Game | Money path |
|---|---|
| Blackjack, slots, craps, roulette | Client-side state machine; `wager()` debits, `settle()` credits with a `MAX_RETURN` cap. |
| Greyhounds | Atomic service methods; the pending race is saved in flags. |
| Baccarat | Atomic `playBaccarat`. |
| Three Card Poker | Saved `threeCardPending`; Play is debited once. |

- **Known gap:** blackjack's in-progress hand lives in React state. A reload mid-hand loses the hand after the stake is debited. This predates the expansion; the same pattern must not be copied.
- **Dealers.** Each uses a different dialogue implementation:

| Dealer | Game | How it's built |
|---|---|---|
| Velvet Vega | Blackjack | Inline lines (`CasinoPanel.tsx`); `DealerSprite` atlas `dealer_velvet_anim` |
| Stick Lady | Craps | Inline lines; `dealer_craps_anim` + `stick_portraits` |
| Madame Monique | Roulette | Rule-driven dialogue with persistent memory (`src/casino/monique.ts`: streaks, visits, golf facts); `monique.json` atlas; all lines approved |
| Waifu | Baccarat | Draft JSON dialogue, event-driven (`src/casino/wwDialogue.ts`) |
| Winston | Three Card Poker | Draft JSON dialogue, event-driven (`src/casino/wwDialogue.ts`) |

- **Unifying dialogue:** four styles exist, and the expansion needs one event-driven engine. Monique's memory model and the Waifu/Winston JSON format are the best starting points.
- **Not present:** casino locations, reputation, per-dealer relationship scores, invitations, private rooms, multi-seat card games, Keno, sportsbook.

## 6. NPCs, relationships and encounters (reusable)

- **Encounter engine:** `src/story/encounters.ts` describes encounters as a graph of `lines`, `choice`, `challenge` and `outcome` nodes.
  - `when()` gates eligibility.
  - Outcomes carry `effects` (money, stats, items) and `bonds`.
  - `engine.resolveEncounter` (`engine.ts:657`) re-walks the path before applying anything.
  - `story.encounters` records completion, so a unique encounter never runs twice.
  - `offerEncounter` offers one encounter per week (`engine.ts:633`).
- **Already "Vegas Stakes-style":**
  - `EncounterDef.location` is a closed union: `'driving_range' | 'clubhouse_lounge'`.
  - `act` gates encounters, and **the story never advances past Act I** today (previous session note; `story.act` is only ever 1).
- **Relationships, three parallel stores:**
  - `career.relationships: Record<PersonId, number>` (classic People list, 0–100)
  - `story.bonds: Record<castId, number>` (0–100, default 50)
  - Monique's `moniqueMemory`
- **Cast:** `src/story/cast.ts` has 10 golf-world characters with atlases in `src/assets/characters/*.png|json`.
  - 8 portraits each, about 72×82 px.
  - Full-body poses about 86 px tall.
  - Drawn crisp with `SpriteFrame` (`src/ui/story/Sprite.tsx`).
  - **No casino staff are in the cast.**
- **Encounter backdrops:** `src/assets/scenes/driving_range.webp` and `clubhouse_lounge.webp`, both 737×232.

## 7. Golf engine (reusable for skins)

- **Round renderer:** `RoundScene` (`src/game/RoundScene.ts`), Phaser at a **960×540 logical** resolution with `Scale.FIT`.
  - It plays one hole at a time from a `HoleSetup` (`:106`).
  - It reports through `RoundSceneHandlers.onHoleComplete(strokes, holed, shot)` (`:132`).
  - `TournamentView.tsx` drives it hole by hole. A skins view can drive it the same way.
- **Courses:**
  - `CourseDef` / `HoleDef` / `CourseTheme` live in `src/golf/course.ts`. Holes are built from compact specs (`src/golf/courses/build.ts`).
  - Registry: `src/golf/courses/index.ts` (`COURSES`, `getCourse`).
  - The tour schedule picks courses through `src/career/venues.ts`, so a course that isn't in venues never appears on the schedule. That is good for hidden courses.
- **Simulated opponents:**
  - `simHole(par, rating, rng, wind, extra, model)` and `simRound` (`src/career/field.ts:100, 111`) score holes for AI golfers.
  - `aiPlayHole` (`src/golf/ai.ts:155`) actually plays a hole through the physics.
- **Skill challenges:** drive and putt challenges for encounters (`src/story/challenge.ts`).
- **Course visual layers:**
  - Backdrop panoramas: `BackdropId = 'coast' | 'city' | 'mountains'`, about 680–830×81–129 RGB (`src/assets/backdrop_*.png`).
  - Theme grade and tint.
  - Ground atlas (`course_atlas.png`, 1357×563).
  - Optional alpha scenery props (`src/game/sceneryAlpha.ts`), currently enabled only on Dry Creek hole 2.

## 8. Art standards measured from the repo

| Asset family | Measured size | Rendering |
|---|---|---|
| Casino table felts | 1059×369 (blackjack), 1937×589 (craps), 1774×865 (roulette), 550×220 (baccarat, from the new sheet) | DOM `<img>`, max **900 CSS px** wide (`.table-stage`, `.ww-table`), foreshortened oval with the dealer behind the far rail |
| Dealer animation atlases | Uniform cells in one horizontal strip: Velvet 211×200, Stick 195×148, Monique 200×210. JSON `{cell, headX, frames:{name:[i]}, heldBack}`. | 110–150 ms per frame (`DealerSprite.tsx:35, 62`; `Monique.tsx:45`) |
| Dealer still poses | Waifu and Winston about 192–291 × 237–261 per pose, different sizes, head-anchor x stored in `ww_meta.json` | Scaled 0.78 onto the felt, then about 1.56× to CSS, so currently **upscaled** |
| Dealer portraits | 152×160 (Monique), 240×248 (Stick), 102×111 (Waifu and Winston tiles) | Shown at 76×83 CSS px in the dialogue box |
| Encounter cast | Portraits about 72×82, `portrait.big` 130×99, poses about 86 px tall | Crisp nearest-neighbour scaling |
| Rotating backgrounds | 1920×1080 and 1920×300 headers, WebP RGB | `SceneBackdrop.tsx` |
| Casino exterior | 585×251 | Hub header and door card |
| Golfer | Horizontal atlases about 166–168 px tall; cut-ins 1536×256 | Phaser |

**Mixed densities:** the encounter cast is low-resolution pixel art, while casino dealers are painted about 3× denser. Any casino NPC who appears in a story encounter needs the cast-atlas format as well. See `ASSET_SPEC.md` §2.

## 9. Risks and gaps found by the audit

1. **No backend.** The sportsbook as specified (licensed feed, secrets held on a server, an authoritative wager ledger) needs infrastructure that doesn't exist.
   - Saves are per-browser, with no accounts, so a server-side ledger has no identity to key on.
2. **Game time and real time.** The career clock is in-game weeks (`profile.careerClock`), while real fixtures settle in real time. These need a design decision.
3. **Name collision.** `course_desert_palms` (golf course) and the Desert Palms Casino share a name. That's fine if they are one resort; it needs stating.
4. **Story gating.** The game is stuck in Act I, so any expansion content gated on act needs another gate.
5. **Four dialogue styles across the casino** (see §5).
6. **Blackjack mid-hand reload gap** (pre-existing; see §5).
7. **New `TransactionType` values** are required for new money kinds. They are additive, but an older build can't import a newer save. That is already true for schema versions.

## 10. Addendum (revision 2, 2026-11-23): systems the new features touch

| System | What exists | Where | Relevance |
|---|---|---|---|
| Sponsor | A single `career.sponsor: Sponsor \| null` (`{id, name, weekly, winBonus, untilSeason}`) plus `relationships.sponsor` (0–100) | `src/career/types.ts`; offered by story `sunline_offer` (`src/career/stories.ts`) | Becomes the compatibility mirror for `sponsorDeals` |
| Sponsor money | Weekly pay in `advanceWeek` (`engine.ts:527`); win bonus in `applyTournamentResult` (`engine.ts:453`); sponsor-day action (`engine.ts:215`) | `src/career/engine.ts` | Suspension and termination act by changing the mirror; no logic change needed |
| Renewal | At season end, if `relationships.sponsor >= 60 && fame >= 30`, the deal is renewed with a raise; otherwise it ends | `engine.ts:752` | Switch the input to `confidence` |
| Inbox | `{id, at, title, body, tone}`, newest first, **capped at 40**, no choices | `engine.ts:53`; shown in `CareerHub.tsx:282` | Actionable mail needs a new table (`mailThreads`) |
| Choices | `pendingStory` pop-ups (one at a time; `StoryDialog.tsx`); story `Effects` (money, energy, form, fame, stats, rel, flags, grant, sponsor) | `src/career/stories.ts`, `engine.resolveStory` | Formal warnings can reuse the pop-up; effects gain `conduct` |
| Energy | `career.energy` 0–100; actions cost or give energy; weekly regen | `engine.ts:130-222`, `stats.energyRegen` | Drinks and fatigue adjust it |
| Form (confidence) | `career.form` −10..+10; affects `playerRating` (`form × 0.6`) | `stats.ts:48` | An existing "confidence" lever for encounters and golf |
| Golf feel | `shotModifiers(c, pressure)`: a `tired` ×1.25 multiplier below 40 energy; `playerRating(c, {round, pressure})` | `src/career/stats.ts:45-82` | Fatigue hook point (optional input) |
| Encounter skill | `judgeDrive` / `judgePutt` / `simChallenge` | `src/story/challenge.ts` | Confidence hook point |
| Casino stats | `casinoWagered`, `casinoReturned`, `casinoBiggestWin` flags via `engine.recordCasino` | `engine.ts:256` | Tips and drinks must stay out of these |
| Starting money | `START_MONEY = 2500` | `src/career/config.ts:14` | $100K is about 40× the start |
| `richEnough` | A flag set when the balance reaches $30,000 during week advance | `engine.ts` (`advanceWeek`) | Precedent for balance milestones (not a peak tracker) |
