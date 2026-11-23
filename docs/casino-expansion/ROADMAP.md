# Roadmap (revision 3)

Status: **PROPOSAL.** Each gate needs explicit approval before code is written. Revision 2 adds tipping, hospitality and sponsor confidence, and moves White Buffalo to a $100K bankroll unlock [CONFIRMED].

## Dependency graph

```
Gate 1 approvals (bible v0.2, OPEN_QUESTIONS)
        │
        ▼
F1 Save v3 + unlocks/milestones ──► F2 Peak-bankroll hook ($100K WB, $1M MS) in EconomyService.post
        │                                      │
        ├──► F3 Location registry + lobby ◄────┘
        │
        ├──► F4 NPC layer (npcState, relationshipLog, unified dialogue) ──► T1 Tipping (goodwill, caps, lines)
        │          │
        │          └──► F5 Event engine extensions (casino scenes, cooldowns, conduct effects, invites)
        │
        ├──► H1 Hospitality: bar, menus, bartender NPC (needs F4) ──► H2 Condition + fatigue hooks (golf, encounters)
        │
        ├──► C1 Conduct log (needs F5 for incidents) ──► SP1 Sponsor deals + confidence + ladder
        │                                                       └──► M1 Actionable mail threads (needs SP1 templates)
        │
        ├──► K1 Keno (needs F3)
        │
        ├──► WB1 White Buffalo (needs F3, F4, H1 for its bar; art A–D)
        │       ├──► P1 Poker core ──► P2 Stud ──► P3 Hold'em (Winston chain, needs T1/F5) ──► P4 Omaha (needs MS1)
        │       └──► S1 Skins core (uses H2 fatigue) ──► S2 Outlaw Nine
        ├──► MS1 Morongo Sky ──► S3 Sky Club
        └──► SB0 Sportsbook decision ──► SB1–SB3 (independent; ships last)
```

**Critical path:** F1 → F2 → F4 → T1/H1 → C1 → SP1.

Poker, skins and new locations branch off once F4 and F5 exist. The sportsbook stays isolated.

## First playable vertical slice: "Desert Palms Regulars" (IMPLEMENTED 2026-11-23, v0.15.0)

**Goal:** prove the foundations with the art that already exists, plus a small UI kit.

| # | Piece | Proves |
|---|---|---|
| 1 | **F1 + F2:** save v3, the peak-bankroll hook, backfill. White Buffalo ($100K) and Morongo Sky ($1M) unlock records. | Central money hook; permanent unlocks; migration |
| 2 | **F3:** casino lobby. Desert Palms open; White Buffalo and Morongo shown as locked tiles, or "Unlocked: opening soon" when earned. | Location registry; unlock UI |
| 3 | **F4 + T1:** NPC layer for the 5 existing dealers and **tipping** at every Desert Palms table between hands. Goodwill caps, tip totals, the relationship tier shown in the dialogue box, draft tip lines. | Money + relationship + dialogue + history, with zero effect on game outcomes |
| 4 | **One** draft relationship event: Winston, between hands, three choices, remembered. | Event pacing and persistence |

**Art needed:** the tipping UI kit, relationship feedback icons and lobby door cards (all small). No new characters.

**Exit tests:**
- Migration fixtures pass.
- A $100K or $1M crossing unlocks on every money path.
- The sealed-outcome test passes for all 7 house games.
- A $1M tip can't exceed the goodwill cap.
- Tips are idempotent across a double click and a reload.
- The full suite stays green.

## Slice 2: "Last Call" (after slice 1 is approved)

- **H1 + H2:**
  - The Desert Palms bar and one bartender (new art, P0).
  - Menu with alcoholic and non-alcoholic drinks.
  - Condition levels, cut-off, fatigue into next week's golf and encounters.
  - The setting to hide alcohol.
- **C1 + SP1 + M1:**
  - The conduct log.
  - Sponsor confidence for the existing sponsor flow (Sunline).
  - The warning ladder as mail threads with responses.
  - One redemption path.
- **Exit tests:**
  - A season of normal visits plus moderate drinking produces **no** sponsor penalty.
  - A scripted run of incidents goes through notice, warning, probation and recovery.
  - Hangover modifiers apply only to round 1 of the week.

## Audio track (independent, gated)

| Step | Contents | Needs |
|---|---|---|
| AU0 | Approve the music brief (styles CONFIRMED; tracks, BPM and arrangement PROPOSED) and the delivery spec (`ASSET_SPEC.md` §8) | You |
| AU1 | `musicRegistry` + `MusicDirector`: crossfade, loop points, ducking, stings. Wire up `requestCasinoMusic`. Uses existing synth or placeholder silence until tracks arrive. | AU0 |
| AU2 | Desert Palms cues (lobby, floor, bar, VIP) + 3 stings | Commissioned original tracks |
| AU3 / AU4 | White Buffalo and Morongo Sky cues, alongside gates 5a and 7a | Tracks |

AU1 can ship any time after Slice 1. It doesn't touch gameplay.

## Later milestones

| Gate | Slice | Contents | Needs |
|---|---|---|---|
| 4 | Keno + events | Keno at Desert Palms; 3–5 draft events per dealer; reputation | Q10; scripts |
| 5a | White Buffalo opens | Location, intro, bar + bartender, new dealer, regulars, higher limits | Art A–D (WB); Q2 |
| 5b | Poker core + Stud | Engine, fixed-limit Stud, 2–3 AI rivals, private room invite | Q5, Q6; art |
| 5c | Skins + Outlaw Nine | Skins core, 9 holes, 2 fictional pros, fatigue applies | Q8, Q9; course art |
| 5d | NL Hold'em | Winston invitation chain (relationship tier + reputation) | P1; script |
| 6 | Sportsbook backend | Provider, server, identity, settlement | SB0, legal, budget |
| 7a | Morongo Sky opens | Location, VIP host, premium bar, elite limits | Art |
| 7b | Omaha Hi-Lo | Hi-Lo evaluator, pot-limit, VIP invite | P1 |
| 7c | The Sky Club | 18 holes, championship skins | S1; art |
| 7d | Sportsbook client | Board, tickets, sync, feed status | Gate 6 |
| 7e | Multiple sponsors | A second sponsor at once, sponsor-specific expectations | SP1 |

## Test strategy

- **Pure modules:** exhaustive or seeded tests:
  - Evaluator hand counts.
  - Side pots.
  - Exact Keno RTP.
  - Skins carries.
  - Goodwill curves (cap, consistency, diminishing returns).
  - Condition decay and thresholds.
  - The sponsor ladder over scripted seasons.
- **Services:**
  - Idempotency.
  - Reload mid-state.
  - `verifyIntegrity` after every scenario.
- **Sealed outcomes:** same seed, same result, whatever the condition, relationship or reputation.
- **Migration:** v1 and v2 fixtures (peaks under $100K, between $100K and $1M, and over $1M; with and without a sponsor; with pending casino state).
- **UI:** Playwright screenshots at 1440×1000 and 390×844, outside CI as now.

## Scope boundaries

Outside every gate:
- Real money in any form.
- Real golfer likenesses.
- Scraped odds.
- Rewriting existing games or the golf engine.
- Animation faked from static poses.
- **Any modifier that reaches casino RNG, rules or payouts.**
