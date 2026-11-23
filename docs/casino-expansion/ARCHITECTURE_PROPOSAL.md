# Architecture proposal (revision 3)

Status: **PROPOSAL for Gate 1.** Nothing here is implemented. Paths marked *new* don't exist yet.
Revision 2 (2026-11-23) applies bible v0.2:
- Both unlocks are on bankroll peak.
- New systems: tipping, hospitality and condition, sponsor confidence.
- New shared layers: conduct and mail.

## Design rules

1. **One bankroll, one path.** Every chip, tip, drink, buy-in, award and ticket goes through `EconomyService.post()` with a deterministic idempotency key.
2. **Rules are pure; services do the money.** This is the same split as `src/casino/*.ts` with `CasinoService`.
3. **No wager state lives only in React.** Anything that has taken money is saved before it's animated.
4. **Permanent unlocks never re-lock.**
5. **Data-driven content:** locations, NPCs, menus, events, mail templates, paytables.
6. **[CONFIRMED] Casino outcomes are sealed.** Nothing in condition, tipping, relationships or reputation is passed into a casino rules module or RNG. This is enforced by module boundaries and by a test (below).
7. **Consequences need evidence.** Sponsor penalties come only from logged conduct events, never from a raw "visited the casino" or "had a drink" signal.

## Module map

```
src/expansion/        (new)  locations.ts · unlocks.ts · milestones.ts · reputation.ts
src/npc/              (new)  registry.ts · relationship.ts · goodwill.ts (tips) · events.ts · dialogue.ts
src/hospitality/      (new)  menus.ts · condition.ts (units, levels, decay, fatigue) · effects.ts
src/conduct/          (new)  log.ts (conduct events) · signals.ts (weekly aggregation)
src/sponsors/         (new)  deals.ts · confidence.ts · obligations.ts · ladder.ts · mailTemplates.ts
src/mail/             (new)  threads.ts: actionable inbox threads (wraps career.inbox)
src/poker/            (new)  core + variants + ai
src/golf/skins.ts     (new)
src/casino/keno.ts    (new)
src/sportsbook/ + server/  (new, Gate 6)
src/services/
  expansionService.ts (new)  unlocks, lobby, visits
  npcService.ts       (new)  relationships, tips, events
  hospitalityService.ts (new) orders, condition
  sponsorService.ts   (new)  weekly evaluation, responses
  casinoService.ts    (existing) gains keno; reads location limits
```

## Dependency map

```
                          ┌──────────────────────────── EconomyService.post (existing, central) ─────────────────────────────┐
                          │                    │ milestones.onPosted (same txn)                                              │
                          ▼                    ▼                                                                             │
 tip / drink / keno / buy-in / award      unlocks (WB $100K, MS $1M peak)  ──►  location registry ──► lobby UI               │
                          │                                                         │                                        │
         ┌────────────────┼─────────────────────────┐                               ▼                                        │
         ▼                ▼                         ▼                      reputation per location ◄──── conduct log          │
  npcState (dealers,   condition (visit-scoped)   conduct log ◄── incidents (encounter outcomes), big-loss         ▲       │
  bartenders, hosts)     │        │                  │             streaks, missed obligations, perf. decline      │       │
   │  goodwill (tips)    │        │                  ▼                                                             │       │
   │  memories           │        │           sponsor confidence ──► ladder ──► mail threads (inbox) ──► responses ─┘       │
   │                     │        │                  │                                     │                               │
   ▼                     ▼        ▼                  ▼                                     ▼                               │
 event engine ◄── condition gates (dialogue, cut-off, seating)            sponsor deal status ──► weekly sponsor_income ───┘
   │                     │
   ├─► poker invitations (relationship tier + reputation + not drunk now)
   ├─► skins invitations (host relationship + reputation)
   ▼                     ▼
 encounters/challenges  golf: fatigue ─► shotModifiers / playerRating (tournament + skins)
```

**Casino rules modules (`blackjack.ts`, `baccarat.ts`, `threeCard.ts` and the rest, plus the poker engine) are deliberately absent from the graph.** They take no input from condition, goodwill, relationships or reputation.

## 1. Locations and unlocks [CONFIRMED thresholds]

```ts
const UNLOCK_RULES = [
  { id: 'unlock:white_buffalo', kind: 'peak_bankroll', threshold: 100_000 },   // CONFIRMED
  { id: 'unlock:morongo_sky',  kind: 'peak_bankroll', threshold: 1_000_000 }, // CONFIRMED
];
```

- **Hook:** `milestones.onPosted(txn)` runs inside `EconomyService.post()`, in the same Dexie transaction.
  - It keeps `peakBalance`.
  - When `balanceAfter` crosses a threshold for the first time, it writes the unlock record: `{id, at, trigger:'live', txnId, value}`.
- **The new tables join `EconomyService.tables`**, so every existing money transaction already has them in scope. The audit confirmed every caller spreads `economy.tables`.
- **Every income source counts** [CONFIRMED]: prize money, sponsor payments, wages, stories, casino, skins, sportsbook. No type filtering.
- **Never revoked** [CONFIRMED]. Nothing deletes unlock rows. Import validates them, but doesn't recompute them downward.
- **Existing saves:** the backfill uses `max(ledger.balanceAfter)` (see the save plan).
- **Notifications are sent after commit**, through `notifier`, plus an inbox item. A first-visit cinematic flag is kept separately.
- **[PROPOSED]** If a save unlocks White Buffalo before its content ships, the lobby shows "Unlocked: opening soon".

```ts
type LocationId = 'desert_palms' | 'white_buffalo' | 'morongo_sky';
interface LocationDef {
  id: LocationId; name: string; unlock: UnlockId | null;           // null = Desert Palms (open from the start)
  games: CasinoGameId[]; limits: Partial<Record<CasinoGameId, TableLimits>>;   // limits PROPOSED
  dealers: Partial<Record<CasinoGameId, NpcId>>; bar: { bartender: NpcId; menu: DrinkId[] };
  privateRooms: PrivateRoomId[]; hiddenCourses: CourseId[];
  art: { exterior: string; floor: string; header: string; doorCard: string; palette: string };
}
```

- `CasinoPanel` becomes a lobby. Each unlocked location reuses the same table components with its own limits and dealers. There are no per-location copies of the rules.
- **[PROPOSED]** One casino activity per week covers one location (Q7).

## 2. NPC relationships, goodwill and tipping

```ts
interface NpcState {
  npcId; relationship: number;          // 0-100 = base + goodwill (shown as a tier)
  base: number;                          // conversations, events, quests (uncapped within 0-100)
  goodwill: number;                      // from tips only, 0..GOODWILL_CAP (PROPOSED 15)
  tips: { lifetime: number; count: number; largest: number; visitsTipped: string[] /* last 8 visit keys */; lastAt?: GameTime };
  drinks?: { count: number; spend: number; naCount: number };   // bartenders
  visits: number; lastSeen: GameTime;
  memories: { key: string; at: GameTime }[]; flags: Record<string, unknown>; cooldowns: Record<string, GameTime>;
}
```

### Tip flow (`npcService.tip(npcId, amount, tipId)`), one transaction

1. **Validate:** casino open; not mid-hand (the table reports its phase); amount from the allowed list for this location; bankroll covers it.
2. **Debit:** `post({type:'tip', amount:-x, sourceId:npcId, key:'tip:<npcId>:<tipId>'})`. A double click with the same `tipId` changes nothing.
3. **Goodwill gain** (`goodwill.ts`, pure, all numbers **PROPOSED**):

```
ratio      = amount / max(tableMin, avgBetThisVisit)
gainRaw    = 1.2 * log2(1 + ratio)                         // generous ≈ +1.2, 3× ≈ +2.4, 30× ≈ +6
gainTip    = min(gainRaw, 3)                               // per-tip cap
gainVisit  = min(gainTip, 5 − alreadyThisVisit)            // per-visit cap
consistency= 1 + 0.1 * min(visitsTippedInLast8, 5)         // up to +50% for regular tippers
goodwill   = min(GOODWILL_CAP, goodwill + gainVisit * consistency * (1 − goodwill/GOODWILL_CAP)^0.5)
```

   - The **hard goodwill cap** (+15) means tips alone can never take a dealer past a mid tier (for example "Friendly").
   - The upper tiers need `base` from conversations and events.
4. **Record** the tip in the totals and append a row to `relationshipLog` (`kind:'tip'`, amount, delta, visit key).
5. **Dialogue event:** `tip_first`, `tip_small`, `tip_generous`, `tip_huge` (the cap reached on one tip earns a "that's too much" line), `tip_regular` (the consistency streak). Picked by the unified dialogue engine with anti-repeat and quiet mode. Lines are **draft**.
6. **Isolation:**
   - Tips are excluded from `casinoWagered` and `casinoReturned`. They get their own `tipsLifetime` stat.
   - The table's rules state isn't touched.

**When Ryan is drunk** (`condition.level >= 'drunk'`): tips of $100 or more need a confirmation (player protection; **PROPOSED**).

## 3. Hospitality and condition

```ts
interface DrinkDef { id; name; kind: 'alcoholic' | 'na'; price: number; units: number; energy: number; confidence: number; locations: LocationId[]; signature?: boolean; flavour: string }
interface Condition { units: number; peakUnits: number; sessionKey: string; drinksThisVisit: number; lastDecayTick: number }
type Level = 'sober' | 'buzzed' | 'tipsy' | 'drunk';   // thresholds PROPOSED: 0, 1–2, 3–4, 5+
```

- **Ordering a drink** (`hospitalityService.order(drinkId, orderId)`):
  - Debit `type:'hospitality'`, key `drink:<orderId>`.
  - Units increase. A `relationshipLog` row is written for the bartender.
  - Non-alcoholic orders count the same towards the bartender relationship.
  - Bartender dialogue fires.
  - **Cut-off:** at `drunk`, the bartender refuses alcoholic drinks and offers water (**PROPOSED**).
- **Time model:**
  - The career clock is weekly, and a casino visit happens inside a week.
  - So condition is **visit-scoped**: units decay per "tick", where one tick is one completed hand, spin, race or keno draw, or one minute of real time in the lobby (**PROPOSED**).
  - Condition resets when the week advances.
- **Fatigue:**
  - On week advance, `peakUnits` of 3 or more (**PROPOSED**) becomes `fatigue` for the next week: energy −10 at the start of the week.
  - If a tournament or skins match is played that week, the hangover modifiers below apply to round 1 only.
- **Effects** (`hospitality/effects.ts`), applied only where allowed:

| Consumer | Effect | Status |
|---|---|---|
| Casino rules / RNG / payouts | **none** | CONFIRMED |
| Casino UI | Line choice; optional gentle screen sway (an accessibility setting turns it off); confirmations for large actions | PROPOSED |
| Energy | Alcohol −2 per unit; coffee or energy drink +3 (capped per visit) | PROPOSED |
| Encounters | `confidence` adds to challenge judging (`story/challenge.ts`) and story rolls; buzzed +small, drunk −larger; unlocks "liquid courage" options | PROPOSED |
| Golf (fatigue only) | `shotModifiers`: the `tired` multiplier ×1.15; `playerRating` −2 for round 1 | PROPOSED |
| NPCs | Dealers suggest water, hosts delay seating, a rival takes advantage in an encounter | PROPOSED |
| Conduct | **None from drinking itself.** Only explicit encounter outcomes tagged `incident` | CONFIRMED (bible §9) |

**Hook points in existing code** (they read new inputs; no rewrite):
- `stats.ts` `shotModifiers` and `playerRating` gain an optional `fatigue` input.
- `story/challenge.ts` `judgeDrive` and `judgePutt` gain an optional `confidence` input.
- `engine.advanceWeek` gains a fatigue step.

## 4. Conduct log (shared evidence)

```ts
interface ConductEvent { id; at: GameTime; kind: 'incident' | 'big_loss_streak' | 'missed_obligation' | 'poor_decision' | 'good_deed' | 'appearance_done'; weight: number; source: string; locationId?: LocationId; visibleToSponsor: boolean }
```

| Kind | Written by |
|---|---|
| `incident` | Encounter outcomes with `effects.conduct` |
| `poor_decision` / `good_deed` | Story and encounter outcomes |
| `big_loss_streak` | The weekly evaluator: casino net over the last 4 weeks below −40% of the average bankroll (**PROPOSED**). Normal play, or a single bad night, doesn't qualify. |
| `missed_obligation` / `appearance_done` | The obligations module |

**Who reads it:** sponsors (confidence), casino reputation (incidents at that location), and NPC memories (they remember a scene).

## 5. Sponsor confidence

- **Today:** a single `career.sponsor: Sponsor | null`, with `relationships.sponsor` (0–100) used for renewal at season end (`engine.ts:752`).
  - Weekly pay is in `advanceWeek` (`engine.ts:527`); the win bonus is in `applyTournamentResult` (`engine.ts:453`).
  - Sponsors are offered through stories (`sunline_offer`).

```ts
interface SponsorDeal {
  sponsorId; name; status: 'active' | 'probation' | 'suspended_bonus' | 'terminated' | 'expired';
  confidence: number;                 // 0-100
  terms: { weekly; winBonus; untilSeason };
  expectations: { maxMissedCutStreak; targetMoneyRank?; appearancesPerSeason };   // PROPOSED per sponsor
  obligations: { id; kind: 'appearance' | 'charity' | 'media'; dueWeek: GameTime; done?: GameTime }[];
  warningLevel: 0 | 1 | 2 | 3; strikes: number; probation?: { until: GameTime; tasks: string[] };
  history: { at: GameTime; delta: number; reason: string }[];   // capped, newest first
}
```

- **Compatibility:**
  - `career.sponsor` **stays the field existing code pays from.**
  - `sponsorService` keeps it in step with the primary active deal:
    - Bonus suspension sets `winBonus` to 0 on the mirror (the deal's real terms are kept).
    - Termination sets `career.sponsor = null`.
  - So `advanceWeek` and `applyTournamentResult` need no logic change.
  - Multiple sponsors (**PROPOSED**, later) would pay through `sponsorService` directly.
- **Weekly evaluation** (inside the week-advance transaction):
  - Confidence drifts towards 60.
  - Then signals apply: conduct events since the last week (weighted), obligations missed or done, performance against expectations, good results.
  - Then the ladder (**PROPOSED** thresholds, bible §10). Each step down sends a templated **mail thread**; each step up sends a thank-you note.
- **Guarantees, enforced by tests:**
  - A season with weekly casino visits, moderate drinks (peak below 3 units), and normal wins and losses produces **zero** negative conduct events and no sponsor mail. [CONFIRMED requirement]
  - Payments already made are never reversed.
- **Renewal:** at season end, renewal uses `confidence` (in place of `relationships.sponsor`). The existing value seeds `confidence` on migration.

## 6. Actionable mail (inbox threads)

- **Today:** `career.inbox` holds `{id, at, title, body, tone}`, capped at 40 (`engine.ts:53`), and is shown on the Career hub. Story choices use `pendingStory` (one at a time).
- **Proposal:** a `mailThreads` table with `{id, from, subject, messages[], status: 'open'|'answered'|'expired', options?: {id,label,hint}[], deadline?, source}`.
  - The existing inbox row is still written (a title like "Email from Sunline Apparel"), so old UI and old saves behave as before.
  - A new Mail view lists threads.
  - Answering calls `sponsorService.respond(threadId, optionId)`, which re-validates the option against the template, applies effects once, and marks the thread answered.
  - An unanswered thread expires at its deadline with its "ignore" outcome.
- **Also used for:** poker and skins invitations, location unlock letters, bartender or host notes.

## 7. Reputation per location

- `locationState.reputation` (0–100, start 50).
- **Up:** completed events, regular visits, consistent tipping (small, capped).
- **Down:** incidents at that location.
- Gates events and invitations, alongside relationships.

## 8. Invitations: poker and skins

```
eligible(invite) = relationship(host).tier >= T  &&  reputation(location) >= R  &&  locationUnlocked
                   && !(condition.level === 'drunk' && invite.requiresSober)       // delays, never cancels
```

- An invite arrives as an event at the table, or as a mail thread.
- Accepting it writes a permanent `unlock:room:<id>` or `unlock:course:<id>`.
- Tiers and thresholds are **PROPOSED** per invite.
- **Skins matches** use the round renderer with the fatigue modifiers above. Buy-ins and awards go through the ledger (unchanged from revision 1).

## 9. Poker, skins, Keno and sportsbook (carried over from revision 1)

### Poker (`src/poker`, new)

- **Shared core:** seeded deck, seats, button, blinds or antes, action validator.
- **Betting modes:** no-limit (min-raise = last full raise; a short all-in doesn't reopen action), pot-limit (Omaha, PROPOSED) and fixed-limit with bring-in and completion (Stud).
- **Side pots** are built from contributions. **[PROPOSED]** The odd chip goes to the first seat left of the button; in Hi-Lo, to the high half.
- **Evaluators:**
  - 7-card high.
  - Omaha: exactly 2 hole cards + 3 board cards.
  - 8-or-better low with the A-5 wheel. With no qualifying low, high scoops; quartering is supported.
  - All tested against known hand-count tables.
- **AI:** personality profiles that see only public information and their own cards. Seeded per hand.
- **Money:**
  - One buy-in debit (`poker:<session>:buyin`). Chips live in the session.
  - One cash-out credit (`poker:<session>:cashout`).
  - The session and the current hand's journal (seed + actions) are saved, so a reload resumes with exact stacks.
  - **[PROPOSED]** No rake.

### Skins (`src/golf/skins.ts`, new)

- New `CourseDef`s go in `COURSES` but **not** in `venues.ts`, so they never appear on the tour schedule.
- A `SkinsView` drives `RoundScene` hole by hole, as `TournamentView` does.
- Opponents use `simHole` with their rating and profile.
- The unique low wins the skin plus any carries; a tie carries.
- The final-carry rule is open (Q9).
- One buy-in debit and one award credit per match. The match is saved after each hole.

### Keno (`src/casino/keno.ts`, new)

- Pick 1–10 of 80; 20 drawn with `cryptoInt` and Fisher–Yates.
- The paytable is versioned data with an exact RTP test.
- One atomic transaction for debit, draw and credit. The animation replays the saved draw.

### Sportsbook (Gate 6)

```
Provider (licensed, TBD) → server ingest → odds cache → GET /markets
Client POST /tickets {marketId, selection, oddsVersion, stake, idempotencyKey} → server ticket ledger
Results → idempotent settlement (corrections: reversal + re-settle) → client sync mirrors stake/payout into the local ledger (type 'sportsbook')
```

- Needs a backend, a provider, an identity scheme and a legal review (see RISKS R1–R4).
- Stale or offline feeds show their status; a simulated league is always labelled.

## 9a. Casino soundtracks (revision 3; CONFIRMED feature, not implemented)

### What exists (audited in `src/audio/sound.ts`)

- **`SoundEngine` routing:** a master gain feeding **separate music and SFX buses**.
- **Settings:** `{sfx, music, muted}` are saved in `localStorage` (`ryans-road-sound`), with sliders and a mute toggle in `SoundMenu.tsx`. This already covers requirement 7 and part of 8.
- **Autoplay:** the `AudioContext` resumes on the first user gesture, and a wanted cue is replayed when audio unlocks. This covers the rest of requirement 8.
- **Music files** are auto-discovered from `src/assets/audio/music/`. Only their **URLs** are bundled; the audio is fetched and decoded when first played, so loading on demand (requirement 9) is mostly there.
- **Gaps:**
  - `MUSIC_NAMES` is a closed list (`title, menu, course, victory`).
  - `playMusic` stops the old track and fades the new one in over 1.2 s, so there's **no crossfade**.
  - Loops play the whole buffer: **no loop points**.
  - **No ducking.**
  - **No stings registry.**
  - Each track has a built-in synth fallback.

### Plan (extends the engine, doesn't replace it)

```ts
// src/audio/musicRegistry.ts (data only)
interface MusicCue {
  id: string;                 // matches LocationDef.music cue ids, e.g. 'desert_palms_floor'
  location: LocationId | 'global'; room: 'lobby' | 'floor' | 'bar' | 'vip' | 'sting';
  title: string;              // PROPOSED working title
  files: { ogg: string; m4a: string };   // both: Safari needs AAC
  loop?: { startSample: number; endSample: number };   // seamless loop region
  gainDb: number;             // per-track trim after loudness matching
  bpm?: number;               // PROPOSED, informational
  stingFor?: 'win_small' | 'win_big' | 'loss';
}
```

- **`MusicDirector`** (`src/audio/musicDirector.ts`, new) sits on the existing music bus:
  - **`setCue(id)`:**
    - Lazy-load the cue (fetch, decode, cache the current and previous cue).
    - **Equal-power crossfade** over 1.5 s between two voices.
    - Loop with `AudioBufferSourceNode.loopStart/loopEnd`.
  - **`duck(reason, on)`:** a dedicated duck gain node that dips about 10 dB, with a 150 ms attack and 600 ms release. Reasons are reference-counted (dialogue, sponsor warning) so overlapping ducks don't fight.
  - **`sting(kind)`:** a one-shot on the music bus, with the bed briefly ducked. Stings are suppressed when the bed is muted or the music volume is 0.
  - **Policy:** autoplay, mute and volume all come from the existing engine.
- **Hook already in place (Slice 1):**
  - `LocationDef.music` holds `{lobby, floor, bar, vip}` cue ids for every casino.
  - `requestCasinoMusic(cue)` in `src/expansion/music.ts`, called by the lobby today, is the single entry point. When the director lands it forwards there; until then it only records the request.
- **Callers later:**
  - Room changes (lobby, floor, bar, VIP) call `requestCasinoMusic`.
  - Dealer and NPC dialogue boxes call `duck('dialogue')`; sponsor warning mail calls `duck('sponsor')`.
  - `celebrateWin` calls `sting`.
- **Tests:** registry validity (files exist, loop region inside the length, unique ids, every `LocationDef` cue present); director logic with a fake `AudioContext` (crossfade ramps, duck reference counting, lazy load only on request); no network fetch at boot.

## 10. Tests that guard the confirmed rules

- **Sealed outcomes:** each casino rules module, run with the same seed and inputs, gives byte-identical results whether Ryan is sober or drunk, and with relationship 0 or 100. The rules modules also take no `condition` or `npc` imports; a lint-style test scans the imports.
- **Unlock on any income:** crossing $100K or $1M through each money path unlocks, and a later fall keeps the unlock.
- **Tipping can't buy friendship:** a single $1,000,000 tip leaves goodwill at or below the cap, and the tier at or below the goodwill ceiling.
- **Moderate behaviour is penalty-free:** a simulated season produces no sponsor penalty.
- **Idempotency:** tips, drinks and mail responses can't apply twice.
