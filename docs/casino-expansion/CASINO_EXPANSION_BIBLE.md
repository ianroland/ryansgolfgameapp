# RYAN'S ROAD TO THE LPGA: CASINO SECRETS & RIVALRIES EXPANSION BIBLE

Version **0.3** planning canon · 2026-11-23 · Status: **PREPRODUCTION, no implementation authorised.**
v0.1 was supplied in the preproduction handoff. Its sections are kept here and updated; the change log is at the end.

Every decision is tagged **[CONFIRMED]** (decided by the author) or **[PROPOSED]** (needs approval). Untagged text is design intent.

## 1. Creative vision

- The casino is a persistent second career and social RPG, inspired by the encounters and surprise opportunities in *Vegas Stakes*.
- Golf and the casino share one fictional bankroll and one persistent world, but remain distinct activities.
- Casino scenes should feel alive: recognisable dealers and bartenders, recurring rivals, optional conversations, secret invitations, and escalating exclusivity.
- Choices have consequences that reach Ryan's golf career and sponsors.
- Keep the retro 32-bit / Neo Geo-inspired visuals, the humour and the established characters.
- **[CONFIRMED]** This is not a real-money gambling product. There is no purchase, redemption, withdrawal, trading or cash-out of wagering currency.

## 2. Canon decisions

| Decision | Status |
|---|---|
| Casino order: (1) Desert Palms, (2) The White Buffalo, (3) Morongo Sky | [CONFIRMED] |
| **Desert Palms** is available immediately | [CONFIRMED] |
| **The White Buffalo** unlocks permanently the **first time Ryan's total bankroll reaches $100,000** | [CONFIRMED] (replaces v0.1's cumulative-career-earnings rule) |
| **Morongo Sky** unlocks permanently the **first time Ryan's total bankroll reaches $1,000,000** | [CONFIRMED] |
| **All income sources count** toward the bankroll for both unlocks, casino winnings included | [CONFIRMED] |
| Neither unlock is ever revoked when the bankroll later falls | [CONFIRMED] |
| Dealer relationships can lead to hidden Seven Card Stud, No-Limit Hold'em and Omaha Hi-Lo | [CONFIRMED] |
| Hidden golf courses at White Buffalo and Morongo Sky with private skins matches against pro-level golfers; **real players are not approved**, so pros are fictional by default | [CONFIRMED] |
| Fictional-money sportsbook informed by real fixtures, odds and verified results, plus Keno | [CONFIRMED] |
| Vegas Stakes-style NPC encounters; characters remember choices | [CONFIRMED] |
| **Dealer tipping** (§8) | [CONFIRMED] as a feature; numbers [PROPOSED] |
| **Casino drinks and hospitality** (§9) | [CONFIRMED] as a feature; prices, modifiers and thresholds [PROPOSED] |
| **Sponsor confidence** (§10) | [CONFIRMED] as a feature; thresholds [PROPOSED] |
| Normal casino visits and moderate drinking never automatically trigger sponsor penalties | [CONFIRMED] |
| **Casino-specific soundtracks** (§13a) | [CONFIRMED] as a feature; tracks, instrumentation, BPM and arrangements [PROPOSED] |
| Tipping and drinks never alter casino odds, rules or payouts | [CONFIRMED] |

## 3. Proposed details (not ratified)

- **[PROPOSED]** **White Buffalo:** a desert resort in ivory, turquoise, copper and warm gold, with harder games, higher limits, and its own regulars and staff.
- **[PROPOSED]** **Morongo Sky:** sky-high luxury, with private rooms, elite VIPs, high-stakes tables and a private course.
- **[PROPOSED]** **Private course working titles:** *The Outlaw Nine* (9 holes, White Buffalo) and *The Sky Club* (18 holes, Morongo Sky).
- **[PROPOSED]** **Poker routes:**
  - Stud through a White Buffalo old-guard regular.
  - Hold'em through a Winston relationship chain.
  - Omaha Hi-Lo through a Morongo VIP invitation.
- **[PROPOSED]** A relationship scale of 0–100 with named tiers. 80 is **not** a confirmed threshold.
- **[PROPOSED]** All stakes, limits, prices, tip sizes, drink effects and sponsor thresholds in this bible are examples to be tuned.

## 4. Core design pillars

1. Relationships unlock experiences, not just menus.
2. Surprises are optional, paced and consequential. No dialogue spam during hands.
3. Permanent discoveries persist in saves.
4. Casino games have correct rules, explainable outcomes and consistent bankroll accounting.
5. **Nothing Ryan buys, drinks or tips changes a casino game's odds or payouts.**
6. Hidden golf uses the existing golf engine and adds skins scoring, rather than duplicating the shot simulation.
7. **Consequences are proportionate and recoverable.** Penalties need sustained or explicit misbehaviour, and every penalty has a path back.
8. No new system may silently break existing golf, casino, save or UI flows.

## 5. Progression and persistence

- **[CONFIRMED]** Both new casinos unlock on **peak bankroll**: the first time the balance reaches $100,000 (White Buffalo) and $1,000,000 (Morongo Sky).
- The check happens inside the central ledger path (`EconomyService.post`), so every source of income can trigger it: prize money, sponsors, jobs, stories, casino wins, skins, sportsbook payouts.
- Unlocks are stored as permanent records.
- **Existing saves** are recognised from the ledger's recorded running balance, which is exact. A save that already passed a threshold is unlocked on first load after release.
- First visits, cinematics, secret poker invitations, hidden-course discoveries and rival milestones each keep their own flags.

## 6. Dealer relationships and NPC encounters

- **Persistent NPC profiles** hold:
  - Relationship and tier.
  - Visit history.
  - **Tip history.**
  - **Drink history** (bartenders).
  - Dialogue state, event flags, personal quests, rivalry state, and memories of significant actions.
- **What moves a relationship:**
  - Conversation, repeated meaningful interaction, narrative choices, and **consistent, proportionate tipping** (§8).
  - It never comes from losing money.
- **Event definitions are data-driven:** eligibility, weight, cooldown, choices, effects, dialogue ids, and follow-up chains.
- Dealer dialogue is event-driven and never interrupts card animation.
- **Existing characters:** Waifu (baccarat, composed, subtly witty), Winston (Three Card Poker, warm, charismatic), Velvet Vega (blackjack), Madame Monique (roulette) and Stick Lady (craps). Their appearance and approved lines don't change.
- New White Buffalo and Morongo Sky casts, including bartenders, are designed in a separate script-approval pass.
- **[CONFIRMED]** All new dialogue is draft until approved.

## 7. Secret poker circuit

- **Games:** Seven Card Stud, No-Limit Texas Hold'em, Omaha Hi-Lo.
- **[PROPOSED]** Standard structures:
  - Stud: fixed-limit.
  - Omaha Hi-Lo: pot-limit, 8-or-better.
- **Shared engine:** deck and shuffle, seats, button and turn order, blinds or antes, action validation, betting rounds, minimum raises, pots and side pots, showdown, evaluation, rake policy, AI and deterministic test seeds.
- **Variant requirements:**
  - Stud needs antes, the bring-in, upcards and street order.
  - Hold'em needs preflop, flop, turn and river, plus no-limit all-in rules.
  - Omaha Hi-Lo uses exactly two hole cards plus three board cards, a separate high and low, the no-qualifying-low case, split and quartered pots, and an odd-chip policy.
- Private rooms unlock permanently through invitations and story events. Rival AI is believable and not omniscient.
- **[PROPOSED]** A host may decline to seat Ryan while he's visibly drunk (§9). It's a delay, never a permanent loss.

## 8. Dealer tipping

- **[CONFIRMED] What it does:**
  - Tips come out of Ryan's bankroll.
  - The game tracks, per dealer: lifetime total, number of tips, and how often Ryan tips.
  - Generosity and consistency affect the relationship.
  - Dealers react to tipping in their dialogue.
  - Relationship history is kept permanently.
  - Diminishing returns stop a player buying maximum friendship with one huge tip.
- **[CONFIRMED]** Tips never change a game's odds, rules or payouts. A tip is not a wager. "Betting for the dealer" (tokes riding on a hand) is **not** included, because it would add a wager.
- **[PROPOSED] Mechanics:**
  - Tips can be given **between hands or spins only**, from a small tip tray: $5, $25 or $100, scaled per location.
  - **Generosity** is judged against context: the tip divided by the larger of the table minimum and Ryan's average bet this visit.
  - **Gain per tip** grows with the logarithm of that ratio and is capped per tip.
  - Tip gains are also capped **per visit** and **per week**.
  - Tips build a separate **goodwill** score per dealer, **capped at +15** relationship points. The higher tiers can only be reached through conversations, events and quests. This is the main safeguard against buying friendship.
  - **Consistency** (tipping on several of the last few visits) earns a small bonus. A huge single tip earns a memorable line, but little more than a generous one.
  - Not tipping never lowers a relationship. At most, a dealer may make a light remark after a big win with no tip. That is dialogue only.
- Tips show as their own line in the stats. They are not counted as casino wagers or losses.

## 9. Casino drinks and hospitality

- **[CONFIRMED] What it does:**
  - Bartenders and drink menus.
  - Alcoholic and non-alcoholic drinks.
  - Purchases come out of the bankroll.
  - Temporary buzz and intoxication.
  - Stamina penalties and possible fatigue the next day.
  - Luck or confidence modifiers that affect story encounters and relevant golf mechanics.
  - NPC dialogue and encounters that respond to Ryan's condition.
- **[CONFIRMED]** Drinks **never** rig casino games: no change to RNG, odds, rules or payouts.
- **[PROPOSED] Bars and menus:**
  - Each casino has a bar and a bartender NPC with a relationship of their own.
  - Menus are data: name, kind, price, strength (units; 0 for non-alcoholic), energy effect, flavour text, and the location where it's sold.
  - Each location has a signature drink.
- **[PROPOSED] Condition** is measured in units, which decay as the visit goes on:

| Level | Units |
|---|---|
| Sober | 0 |
| Buzzed | 1–2 |
| Tipsy | 3–4 |
| Drunk | 5+ |

  - Condition is **visit-scoped**: it decays as Ryan plays, and resets when the week advances.
  - A high peak during the visit converts into **fatigue** for the next week: lower energy, and for a tournament played that week, slightly larger shot wobble.
- **[PROPOSED] Effects allowed:**
  - Energy costs.
  - A small confidence bonus when buzzed, a larger penalty when drunk. This affects encounter challenges and story rolls, and unlocks "liquid courage" dialogue options.
  - Golf modifiers through the existing `shotModifiers` and `playerRating` inputs.
  - NPC reactions: a dealer suggests water, a bartender cuts Ryan off, a host declines to seat him.
- **[PROPOSED] Player protections:**
  - A confirmation before large bets or large tips while drunk.
  - Non-alcoholic drinks give the same social benefit with the bartender as alcoholic ones.
  - A setting to hide alcohol content (non-alcoholic menu only).
- **Incidents** happen only through explicit encounter outcomes (for example, a scene at the bar while drunk). Drinking by itself is never an incident.

## 10. Sponsor confidence

- **[CONFIRMED] What it does:**
  - Each sponsor has a confidence rating.
  - Sponsors watch for **sustained** reckless behaviour, alcohol-related **incidents**, poor decisions, missed obligations, and declining performance.
  - Warnings escalate through the existing inbox, and Ryan can respond with choices.
  - Possible consequences: bonus suspension, contract termination, lost future payments.
  - Ryan can redeem himself and recover his reputation.
- **[CONFIRMED]** Normal casino visits and moderate drinking don't trigger penalties.
- **[PROPOSED] Signals** (weekly):

| Signal | Counts when | Doesn't count |
|---|---|---|
| Reckless gambling | Casino losses over 4 weeks above about 40% of bankroll | Ordinary play |
| Incidents | Tagged encounter outcomes | Having a drink |
| Poor decisions | Story or encounter outcomes tagged with sponsor impact | — |
| Missed obligations | Scheduled appearances not done by their due week | — |
| Performance | Missed-cut streaks, money rank falling well below contract expectations | — |

- **[PROPOSED] Ladder** (confidence 0–100):

| Confidence | Stage |
|---|---|
| 60 or more | In good standing |
| Below 60 | Friendly note |
| Below 45 | Formal warning, with response choices |
| Below 30 | Probation: win bonus suspended |
| Below 15, or ignoring a probation deadline | Termination: future payments stop |

  - **Past payments are never clawed back.**
- **[PROPOSED] Responses:** apologise and commit (an obligation with a deadline), schedule a charity appearance (energy cost), push back (only works with strong recent results), or ignore it.
- **[PROPOSED] Redemption:** a probation task (for example, complete two appearances, no incidents for four weeks, one top-25 finish) restores the bonus. Good conduct also raises confidence every week.
- Confidence replaces the plain sponsor relationship value in contract renewal.

## 11. Hidden golf and skins

- Private courses are found through casino relationships, reputation and invitations.
- They use the existing golf physics, scoring and course pipeline. No separate shot engine.
- **Skins scoring:** a unique low score on a hole wins the current skin and any carried skins; a tie for low carries over.
- The rule for skins still carried after the last hole must be decided before implementation.
- **[PROPOSED]** Playing a skins match while fatigued (§9) uses the same golf penalties as a tournament.
- Buy-ins and awards go through the auditable fictional-money ledger.
- Fictional pros only.

## 12. Fictional-money sportsbook

- Real schedules, odds and results come from a licensed provider through a backend service. Pages are never scraped.
- The backend holds the credentials and an authoritative wager ledger.
- Each wager stores: odds snapshot, market, selection, event id, stake, accepted time and status.
- Markets lock correctly. Settlement uses only verified data, is idempotent, and handles corrections.
- When the feed is unavailable, the board shows its status. It may offer a separately labelled simulated league, which is never presented as live.
- No deposits, withdrawals, redemption, transfers or tradable credits. Platform and legal review is required before shipping.

## 13. Keno

- Choose 1–10 numbers from 1–80; 20 unique numbers are drawn.
- The paytable is shown and balanced.
- Randomness is fair and cryptographic, with deterministic seeds for tests.
- The animated draw only displays a result that was already computed.
- Fast-play option.
- **[PROPOSED]** Paytable and return.

## 13a. Casino-specific soundtracks

- **[CONFIRMED] Each casino has its own original musical identity:**

| Casino | Style |
|---|---|
| **Desert Palms** | 1990s smooth jazz and funk, electric piano, retro synth |
| **The White Buffalo** | Atmospheric desert blues, guitar, organ, cinematic percussion |
| **Morongo Sky** | Sophisticated electronic lounge, house, luxury synth |

- **[CONFIRMED] Requirements:**
  1. A distinct main theme per casino.
  2. Separate lobby, gaming floor, bar and VIP/poker cues.
  3. Seamless loops.
  4. Crossfades when switching casino or room.
  5. Music ducks during important dialogue and sponsor warnings.
  6. Short win and loss stings.
  7. Independent music and sound-effect volume.
  8. Respects mute and the browser's autoplay rules.
  9. Tracks load on demand, not all at start-up.
  10. Track names, files, loop points and gains live in a data-driven music registry.
- **[CONFIRMED] Original compositions only:** no copyrighted commercial recordings, and no uncleared samples.
- **[PROPOSED] Per-casino targets:**

| Casino | Tempo | Sound |
|---|---|---|
| Desert Palms | 92–100 BPM | Rhodes, slap bass, muted guitar, brushed kit, soft sax lead |
| White Buffalo | 68–80 BPM | Slide guitar, Hammond organ, frame drum and toms, sparse piano |
| Morongo Sky | 118–124 BPM | Four-on-the-floor house, Juno-style pads, glassy keys, filtered vocal chops (original) |

  - Bar cues are slower, drier versions of the floor cue. VIP/poker cues are tense and minimal.

## 14. Casino locations

- **Desert Palms:** the existing games and dealers, plus a bar, tipping, Keno and the sportsbook.
- **White Buffalo** (bankroll $100K): a social hub with higher limits, its own bar, old-guard Stud and the hidden desert skins course.
- **Morongo Sky** (bankroll $1M): elite gaming, VIP invitation chains, Omaha Hi-Lo, a premium bar, and the private championship skins course.
- **Shared systems:** all locations use one location registry, navigation, table systems, economy, NPC event engine, hospitality system and UI components.
- Unlocks and first-entry cinematics are separate flags.

## 15. Economy and game integrity

- One fictional bankroll ledger across golf and casino, with transaction ids, sources and timestamps.
- **[PROPOSED] New ledger types:** `tip`, `hospitality`, `keno`, `poker`, `skins`, `sportsbook`.
- Bets, tips and purchases can't be duplicated by a refresh or a double click.
- Casino play must stay optional for finishing the career.
- **[CONFIRMED]** Peak bankroll from any source unlocks locations. Gambling can therefore speed up unlocks; tuning keeps house games negative-expectation.

## 16. Art direction and asset production

- **Style:** retro 32-bit / Neo Geo; deep purple, emerald felt, warm gold; a palette per location.
- **Tables:** a wide, foreshortened oval with the dealer behind the far rail. Bars use the same idea: the bartender stands behind the counter facing the player.
- **Nothing gameplay draws may be baked into art:** no cards, chips, drinks, glasses, text, shoes or controls.
- Real alpha. Matching canvases and anchors for every pose. Real animation frames. Isolated expressions.
- **Batches:**
  - A: design references
  - B: NPC concepts, including bartenders
  - C: character sprites
  - D: environment and UI, including the bar, drink props, tipping UI, sponsor mail graphics and relationship feedback
  - E: golf
  - F: FX
- Each ZIP includes isolated PNGs, a manifest, a contact sheet, provenance notes, the QA checklist and integration notes.
- Nothing is "production ready" until it has been inspected in the target viewport.
- Exact sizes are in `ASSET_SPEC.md`.

## 17. Open design decisions

See `OPEN_QUESTIONS.md`. The White Buffalo earnings definition was resolved by moving to the bankroll rule.

## 18. Release gates

| Gate | What happens |
|---|---|
| 0 | Audit (done) |
| 1 | Approve the bible, open decisions and architecture |
| 2 | Approve the style guide and asset specs |
| 3 | Foundation: ledger milestones, unlocks, location registry, NPC layer, tipping |
| 4 | Hospitality, condition, sponsor confidence; Keno; first events |
| 5 | White Buffalo, plus private golf and poker slices |
| 6 | Sportsbook backend prototype |
| 7 | Morongo Sky, advanced poker and skins; QA and balancing |

## 19. Change control

- This document is planning canon. Nothing is coded, no assets are overwritten and no saves are migrated until a phase is explicitly authorised.

**Change log (v0.3, 2026-11-23):**
- Added §13a Casino-specific soundtracks (confirmed feature; musical details proposed).
- Slice 1 implemented: lobby, unlocks, dealer tipping.
- Lobby art pack v1 integrated as prototype art.

**Change log (v0.2, 2026-11-23):**
- White Buffalo unlock changed to a $100K bankroll peak.
- All income counts toward both unlocks.
- Added §8 Tipping, §9 Drinks and hospitality, and §10 Sponsor confidence.
- Added pillars 5 and 7.
- Updated the gates.
