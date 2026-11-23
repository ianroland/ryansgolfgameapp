# Canon, proposals and open questions (revision 3)

## CONFIRMED

- Casino order: **Desert Palms**, then **The White Buffalo**, then **Morongo Sky**.
- **Desert Palms** is available immediately.
- **White Buffalo** unlocks permanently the first time Ryan's **total bankroll reaches $100,000**. This replaces the earlier career-earnings rule; former Q1 is resolved.
- **Morongo Sky** unlocks permanently the first time the bankroll reaches **$1,000,000**.
- **All income sources count** towards the bankroll. Neither unlock is ever revoked.
- Hidden Stud, No-Limit Hold'em and Omaha Hi-Lo are reached through relationships.
- Hidden skins courses at White Buffalo and Morongo Sky, with **fictional** pros.
- Fictional-money sportsbook with real data, plus Keno.
- Vegas Stakes-style encounters with memory.
- Existing cast preserved: Waifu, Winston, Velvet Vega, Madame Monique, Stick Lady.
- **Dealer tipping:**
  - Tips are debited from the bankroll.
  - Lifetime total, count and frequency are tracked per dealer.
  - Relationship effects reflect generosity and consistency.
  - Dialogue reacts.
  - History persists.
  - Diminishing returns.
  - **No effect on odds or payouts.**
- **Drinks and hospitality:**
  - Bartenders and menus; alcoholic and non-alcoholic drinks; purchases debited.
  - Buzz and intoxication; stamina penalties; next-day fatigue.
  - Luck and confidence modifiers for encounters and relevant golf only; NPC reactions.
  - **Never rigs casino games.**
- **Sponsor confidence:**
  - Per-sponsor rating.
  - Escalating inbox warnings with response choices.
  - Bonus suspension, termination and lost future payments are possible.
  - Redemption is possible.
  - **Normal casino visits and moderate drinking don't trigger penalties.**
- **Casino soundtracks:**
  - Desert Palms: smooth jazz and funk; White Buffalo: desert blues; Morongo Sky: electronic lounge and house.
  - Lobby, floor, bar and VIP cues; seamless loops; crossfades; ducking; stings.
  - Separate volumes, mute, autoplay-safe, loaded on demand, data-driven registry.
  - Original music only.
- No real-money mechanics. All new dialogue is draft until approved.

## PROPOSED (marked wherever used)

- **Location looks:** palettes and names styling; course working titles (*The Outlaw Nine*, *The Sky Club*).
- **Poker routes:** Stud via an old-guard regular, Hold'em via Winston, Omaha via a VIP. Stud fixed-limit; Omaha pot-limit 8-or-better.
- **Relationships:** 0–100 with tiers (80 is not a confirmed threshold). Reputation per location.
- **Tipping numbers:**
  - Denominations $5/$25/$100 per location.
  - Gain 1.2 × log2(1 + tip ÷ context).
  - Caps: +3 per tip, +5 per visit.
  - Goodwill cap +15.
  - Consistency bonus up to +50%.
  - Confirmation for large tips while drunk.
- **Drinks numbers:**
  - Unit thresholds: sober 0, buzzed 1–2, tipsy 3–4, drunk 5+.
  - Condition scoped to the visit, decaying per hand or spin.
  - Fatigue when the peak is 3+ units: energy −10 next week, plus round-1 golf penalties (`tired` ×1.15, rating −2).
  - Cut-off at drunk. Prices.
  - Setting to hide alcohol.
- **Sponsor numbers:**
  - Ladder thresholds 60 / 45 / 30 / 15.
  - The 40%-of-bankroll loss signal over 4 weeks.
  - Probation tasks; renewal on confidence.
  - Migrated sponsors start at confidence ≥ 30.
- **Mechanics from this plan:**
  - Save v3 tables.
  - One visit per week covers one location.
  - At most one event per visit.
  - No poker rake.
  - The poker odd-chip rule.

## OPEN: blocks implementation

| # | Question | Blocks | Recommendation |
|---|---|---|---|
| Q2 | White Buffalo introduction: cinematic on first visit, or an invitation story? | WB1 | Short cinematic; the invitation story is optional |
| Q3 | Expansion triggers instead of story acts (the story is stuck in Act I)? | F5 | Own triggers |
| Q4 | ~~Relationship display~~ **Resolved (v0.15.1):** five tiers shown as name + badge (Acquaintance, Regular, Friend, Confidant, Inner Circle); score hidden; no decay. Thresholds still PROPOSED (`src/npc/config.ts`). | — | — |
| Q5 | Poker seats, buy-ins, rebuys, AI difficulty | P1, room art | 6 seats; buy-in bands per location |
| Q6 | Stud limit structure; Omaha pot-limit vs no-limit | P2, P4 | Fixed-limit Stud; pot-limit Omaha |
| Q7 | One weekly casino activity = one location? Travel cost to Morongo? | F3 | Yes; Morongo has a travel cost |
| Q8 | Skins: players, buy-in style, handicap | S1 | 4 players, per-match buy-in, no handicap |
| Q9 | Skins carried after the final hole | S1 | Sudden-death playoff |
| Q10 | Keno paytable and target return | K1 | ~90–92% RTP, published |
| Q11 | Sportsbook: backend, provider, budget, identity, real time vs game time | Gate 6 | Decide at SB0; ships last |
| Q12 | Encounters with casino NPCs: small cast-scale art (existing scene) or large dealer-scale art? | Art B/C | Existing scene, so speaking NPCs get cast sets |
| **Q13** | Tipping: should anything happen when Ryan **never** tips? Do tips raise casino **reputation** too? | T1 | No penalty, light dialogue only; small capped reputation gain |
| **Q14** | Tip denominations per location (and do Morongo tables expect bigger tips)? | T1 | $5/$25/$100 at Desert Palms, scaled ×2 at WB and ×5 at MS |
| **Q15** | Alcohol presence and rating: show alcoholic drinks by default, with a toggle to hide them? Any age gate? | H1 | Shown by default, toggle available; check the target store's rating rules |
| **Q16** | Condition time model: decay per hand/spin plus real minutes, reset at week advance (proposed). Or should a drinking night consume the rest of the week's actions? | H2 | Per-tick decay plus fatigue next week; no extra action cost |
| **Q17** | Do buzz modifiers ever **help** golf (for example, nerve when buzzed), or only hurt? | H2 | Only hurt golf; small help in encounters only |
| **Q18** | Sponsor signals: is heavy casino **winning** ever "reckless"? Is the loss signal measured against bankroll or income? | SP1 | Losses only, against average bankroll over 4 weeks |
| **Q19** | Sponsor responses: inside the existing Career-hub inbox (new Mail view), or as a pop-up like story events? | M1 | Mail view, plus a pop-up only for formal warnings |
| **Q20** | Termination: can a sponsor ever return the same season? Do past suspended bonuses get repaid on redemption? | SP1 | No return the same season; no back-pay |
| **Q21** | Multiple sponsors at once (bible says "individual sponsors"), or keep one sponsor for now? | SP1 / 7e | One now (matches the code); multiple later |
| **Q22** | Music sourcing: commission a composer, produce in-house, or use licensed royalty-free originals (with a licence on file)? | AU2 | Commission, or royalty-free originals with a written licence; never commercial recordings |
| **Q23** | Should the golf rounds and menus move to the same registry (replacing `title / menu / course / victory`)? | AU1 | Yes, once AU1 lands; keep the synth fallback |

## Non-blocking

- Display styling of new location names.
- `course_desert_palms` golf course vs Desert Palms Casino: the same resort?
- Agent name: Marty Mulligan (in `src/story/cast.ts`) or Marty Klein.
- Grand Clubhouse price ($7.5M proposed).
- 0.14.0 baccarat and Three Card table limits (proposed, awaiting approval).
