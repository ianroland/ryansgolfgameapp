# NPC event vocabulary and mapping (PROPOSED)

These event names are proposals. **None of them exist in the game as named events today.** The "Existing source" column shows where the game already knows the fact, so an emitter can be added after the commit.

- **Every event carries:** `{ id, type, at: GameTime, location?, npcIds?: string[], witnesses?: string[], payload }`
  - `at` is in game time: season, week, day.
  - `npcIds` are the NPCs involved.
  - `witnesses` are the NPCs present (see the memory doc).
- **Payloads are facts only.** Listeners can't change the outcome that produced them.

## Golf

| Proposed event | Existing source | Status |
|---|---|---|
| `golf.tournament_completed` | `CareerEvent 'tournament_completed'` (`tournamentPipeline.ts`) | EXISTS as a career event: map 1:1 |
| `golf.tournament_won` / `golf.tournament_lost` | Derived from the completed result (position 1 or not) | Derivable |
| `golf.cut_missed` | Result `madeCut` | Derivable |
| `golf.rival_defeated` / `golf.rival_won` | `engine.ts`: rival comparison after a result (inbox "Kayla wins") | Derivable; logic exists inline |
| `golf.major_won` | `def.special` + win; trophies `lpga_major` | Derivable |
| `golf.ace` / `golf.albatross` / `golf.eagle` | Broadcast `MomentType` (ACE, ALBATROSS, EAGLE); albatross records | Derivable from the hole record |
| `golf.tour_card_earned` / `golf.tour_card_lost` | `seasonRollover` (`tourCard` changes), Q-Series result | Derivable |
| `golf.season_ended` | `seasonRollover` | Derivable |
| `golf.phase_changed` (Ryan's look, act) | `StoryState.act`, appearance | Derivable |
| `golf.sponsor_signed` / `golf.sponsor_ended` | `c.sponsor` changes (stories, rollover) | Derivable |

## Casino

| Proposed event | Existing source | Status |
|---|---|---|
| `casino.visit_started` | `casinoWeekKey`, `npcService.visit`, lobby `markSeen` | Derivable |
| `casino.location_unlocked` | `EconomyService.trackMilestones` → `unlocks` | EXISTS as a saved unlock |
| `casino.game_won` / `casino.game_lost` / `casino.push` | `casinoService.settle` per round (blackjack, craps, roulette, baccarat, three card, slots, greyhounds) | Derivable at settle |
| `casino.big_win` | `celebrateWin` tiers (`BigWin.tsx`) | Derivable (UI-side today; should be computed in the service) |
| `casino.dealer_tipped` | `npcService.tip` → `TipEvent` (`tip_first … tier_up`) | EXISTS (dealer-specific) |
| `npc.relationship_changed` / `npc.tier_reached` | `npcService` outcome (`tierBefore` / `tierAfter`), `relationshipLog` | EXISTS (dealers only) |
| `casino.dealer_line` (Waifu / Winston) | `WaifuEvent` / `WinstonEvent` | EXISTS as dialogue events |
| `casino.monique_event` | `MoniqueEvent` (greet_*, win_streak, loss_streak, extraordinary, …) | EXISTS as dialogue events |
| `casino.server_approach` / `casino.server_tipped` | — | MISSING (cocktail servers planned) |
| `casino.drink_ordered` / `casino.water_ordered` / `casino.drink_refused` | — | MISSING (servers pack V1 defines them) |
| `casino.intoxication_changed` | — | MISSING |
| `casino.insufficient_funds` | Waifu/Winston `insufficient_funds`; Monique `insufficient()` | EXISTS as dialogue events |
| `poker.invited` / `poker.opponent_defeated` / `poker.busted` | — | MISSING (secret poker planned; `RELATIONSHIP_HOOKS` is the extension point) |

## Story and social

| Proposed event | Existing source | Status |
|---|---|---|
| `story.encounter_completed` | `careerService.resolveEncounter` → `StoryState.encounters` | EXISTS (saved record) |
| `story.inbox_choice_made` | `stories.ts` choice resolution | Derivable |
| `npc.memory_added` | `NpcState.memories` (dealers) | EXISTS (dealers only) |
| `npc.rumor_learned` | — | MISSING |
| `npc.secret_revealed` | — | MISSING |
| `npc.insulted` / `npc.helped` | — | MISSING (no such player actions yet) |
| `sponsor.warning_issued` | — | MISSING (sponsor confidence planned in casino-expansion docs) |

## Gaps to close in the game, not in NPC Factory

1. **A tiny emitter** (`GameEvents.emit`) called after commits in `tournamentPipeline`, `casinoService.settle`, `npcService`, `careerService.resolveEncounter` and `seasonRollover`.
2. **Big-win tiers** move into a service function, so the event isn't UI-only.
3. **Cocktail server, drink and sponsor-confidence events** arrive with those features.

## Rules

- **Facts only.** An event never carries an instruction to alter odds, RNG, payouts, cards, dice or golf results.
- **Idempotency.** Events have stable ids (for example `golf.tournament_completed:<tournamentId>`), so re-processing after a reload can't double-apply memories.
- **Unknown event ids** in a pack fail validation.
