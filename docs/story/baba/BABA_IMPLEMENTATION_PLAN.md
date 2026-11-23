# Baba: implementation plan

**For author review. Nothing here has been implemented.**

This plan doesn't add story flags, relationship values or gameplay effects. Where a choice is needed, it sets out the options and leaves the decision to you.

It is based on the source documents ([FC] = Family Canon proposal, [SD] = Second Draft) and on a review of the current game code (v0.13.2).

---

## Blockers (must be settled before Scenes 2 and 3 can play)

**B1. The game never leaves Act I.**
- `story.act` starts at 1, and no code anywhere raises it.
- `hairUnlocked` never grows past the natural look, so the bald and wig looks stay locked.
- In a normal playthrough this means:
  - Ryan never reaches phase 2 or 3;
  - the Pink Jacket can't be earned;
  - Monique's phase lines never trigger;
  - Scenes 2 and 3 (phase 3) can never play.
- The tests reach Act III only by setting it directly.
- **This is not a Baba issue, but it blocks him.** The act transitions belong to story scenes (The Rejection, the Act I climax, Act II's milestones) that aren't in the game.
- **Decision needed:** what moves Ryan from Act I to II to III in the shipped game? Implementing your approved transition scenes is one route. A temporary rule, such as a career milestone, is another. I haven't changed anything, because career-phase progression is protected.

**B2. Story scenes can only start between weeks.**
- Encounters are offered when a week begins.
- They are blocked during a tournament ("Finish the tournament first").
- Scene 3 plays "the night before Sunday", between rounds 3 and 4. That needs a new hook between rounds. It would show the scene and change nothing in the round.

**B3. Scene 3's tournament isn't defined in the game.**
- The script says "Sunday at the Championship… before encounter 31".
- The game has no encounter 31; it has two encounters, both Biff in Act I.
- **Decision needed:** which event is "the Championship"? For example, the last event of the final LPGA season, or a specific major. Choosing one doesn't affect Pink Jacket eligibility.

**B4. The Rejection isn't in the game.**
- Scene 1 is placed "before The Rejection".
- The locked Rejection script isn't in the project, so its coffee-can patch can't be applied or checked.
- Scene 1 can still be built and placed in Act I; its plant (the can) would simply pay off later.

## What the scene engine already does (reused)

`src/story/encounters.ts` and `EncounterScene.tsx` already provide:

- a background for each location;
- cast actors with 8 portrait expressions and body poses;
- speaker nameplates;
- narrator lines;
- choices with a hint line;
- an optional drive or putt challenge;
- outcomes that carry effects, story bonds (0–100 per cast id) and a summary.

**Saving needs no new flags.** A finished encounter is stored once, with the full choice path, in `story.encounters`. It never repeats, and later scenes can read which choice was made.

Ryan's portraits follow his phase automatically (the approved expression sheet).

## New engine features the scripts need

| # | Feature | Needed by | Notes |
|---|---|---|---|
| E1 | Ryan voice-over lines (`RYAN (V.O.)`) | Scenes 1, 3 | A narration-styled line with Ryan's nameplate |
| E2 | Background change mid-scene | Scene 1 (green → shed) | Locations are currently one per scene |
| E3 | Stage-direction beats with a timed hold | All three ("Beat.", "Hold.", "Long hold.") | [SD] gives explicit timing notes |
| E4 | Prop and effect overlays | All three | Can, cooler, carton, gold tool, pitchfork, tee, badge, umbrella, torch light, sprinklers |
| E5 | A one-second memory flash (full-screen still) | Scene 2 | The same art is reused by the optional consumable |
| E6 | Speakers who aren't in the cast (no atlas) | Scene 3 (Security Guard); Scene 2's assistant is silent | A nameplate-only speaker, or new art |
| E7 | SFX cues on lines | All three | Squeak, clonk, "aaah", "bwoing", HISSSS, knee cracks |
| E8 | A between-rounds trigger | Scene 3 | See B2 |
| E9 | A "Baba" cast entry | All three | `id: 'baba'`, name "Baba", nameplate colour. Portraits from his sheet. |

## Relationship (no values proposed)

The scripts mark Baba ♥ and ♥♥ only, with values TBD. The game offers two ways to hold it:

| Option | How | Save impact |
|---|---|---|
| **A. Story bond** `baba` | Same mechanism Biff uses: `story.bonds.baba`, 0–100, default 50 | None. Bonds are already an open record. |
| **B. Classic person** | A new `PersonId` beside Mom, shown in the People panel, with "Call Baba" as a life action | Needs a type change, a starting value for new and existing careers, and People panel text. It also touches Mom's existing entry, which waits on the family amendment. |

**Recommendation:** start with A for the three scenes. B goes together with the family amendment if you approve it.

The ♥ amounts are yours to set.

---

## Scene 1: "Fifty From Three Feet"

| | |
|---|---|
| **Trigger** | Act I, phase 1, before The Rejection. **Proposal for you to confirm:** early in the career, before the first Biff encounter (which needs week ≥ 3). For example, the first week of season 1. Unique. |
| **Phase** | 1 (Ryan he/him) |
| **Characters** | Ryan (phase-1 portraits: approved). Baba. |
| **Baba animations needed** | Supplied: idle (arms crossed), talk primary and emphatic, concerned, BOBO MILKY give, think. **Not supplied:** pushing the reel mower (the scene's main action), a watch check, putting the can back on a shelf. |
| **Backgrounds** | **Missing:** the muni practice green at 6 a.m. with mist and mower stripes. The maintenance shed interior, with the can on a high shelf. |
| **Props** | **Missing:** the reel mower; the dented coffee can with "RYAN — PRO" on masking tape; the shed fridge; a BOBO MILKY carton sprite (the carton exists only as an illustration on the character sheet). |
| **Structure** | Lines → one choice (3 options) → a shared ending (putting montage line, "Again.", V.O.) |
| **Choices** | "Fifty-one. Fine." / "Make it a hundred." / "Can I have a BOBO MILKY first?" |
| **Proposed effects** | Relationship only ([SD]): Baba ♥ / ♥♥ / ♥. **No** putting-practice gain and **no** Energy cost; the first draft had them, and [SD] removed them. Values TBD. |
| **The fifty putts** | Written as narration, not gameplay. The engine's putt challenge *could* run here, but that would add a mechanic the script doesn't have, so I don't recommend it unless you ask. |
| **Save** | Stored as encounter `baba_fifty_from_three_feet` with its path. No flags. |
| **Plants** | The can and the mower. Both pay off only if The Rejection patch is approved and The Rejection is built. |
| **Conflicts** | The game has no "Pinnacle Tour" (its tours are Amateur, Mini, Q-School, Epson, LPGA). Act I's men's-tour path isn't in the game, so Scene 1's line about the Pinnacle qualifier has no matching event. |

## Scene 2: "Not For The Public"

| | |
|---|---|
| **Trigger** | Act III or IV (**your call**). Phase 3, mid-season, a tour week. Proposal: after one or more LPGA events, at the start of a tour week. Unique. Blocked by B1. |
| **Phase** | 3 (Ryan she/her) |
| **Characters** | Ryan (phase-3 portraits: approved). Baba. Biff (cast art in game). **Biff's assistant:** silent, but on screen, carrying the velvet cases, so art is needed. |
| **Baba animations needed** | Supplied: idle, BOBO MILKY give, angry/defend (pointing at the ball mark), talk, proud. **Not supplied:** watch check. |
| **Biff animations** | Kneeling with the tool, standing on it, raising the pitchfork, carrying the case. None are in Biff's current poses. |
| **Background** | **Missing:** a tour-stop practice green, mid-morning. The game has a driving range and a clubhouse lounge only. |
| **Props** | **Missing:** the cooler "NOT FOR THE PUBLIC"; carton sprites; the Aurum-X gold vial; two velvet cases; the solid-gold repair tool (engraved B.F. III, with a diamond) in three states: straight, U-bent, folded flat; the gold-plated pitchfork; the broken wooden tee; the ball mark before and after (twice the size); the gold flake on Biff's tooth; masking tape on the carton. |
| **Flashback** | **Missing:** one still of young Ryan at the muni with Baba handing over a carton (E5). |
| **Structure** | Linear. **No player choice.** |
| **Proposed effects** | Baba ♥ ([SD]). No Biff mood change (no row in the frozen mood table), no knowledge change, no carton added to inventory. |
| **Save** | Stored as encounter `baba_not_for_the_public`. No flags. |
| **Later payoff** | Flavour only: on Sunday, Biff's assistant carries the case with the tee. This needs the Sunday scene, which isn't in the game. |
| **Conflicts** | See the continuity report §4. Baba names himself "Her father" to Biff, who in canon is obsessed with Ryan's past. [SD] states there's no knowledge change; please confirm that's intended. |

## Scene 3: "Reading the Green"

| | |
|---|---|
| **Trigger** | The night after round 3 of "the Championship" (B3), before the final round. Phase 3. Unique. Blocked by B1, B2 and B3. Plays before encounter 31 (not in the game) and changes nothing in it. |
| **Phase** | 3 (Ryan she/her) |
| **Characters** | Ryan (phase 3). Baba. **Security Guard:** a new minor character with one line, so art or a nameplate-only speaker is needed. |
| **Baba animations needed** | Supplied: talk, concerned, proud, BOBO MILKY give. **Not supplied:** lying flat on the green reading grain with a torch; holding up the badge; opening the umbrella; sitting on the fringe under the umbrella; switching the torch off and on. |
| **Ryan animations** | Sitting on the fringe; soaked; leaning on his shoulder (choice 1). None exist in the approved Ryan art. |
| **Background** | **Missing:** the championship 18th green at night, with a half moon, a lake and crickets, plus a lighting state for torchlight only and moonlight only. |
| **Props and effects** | **Missing:** the torch beam (two sizes; the guard's is bigger); the faded, expired HEAD GROUNDSKEEPER badge on a lanyard; the umbrella; a sprinkler burst at exactly 11:00. |
| **Structure** | Lines → one choice (3 options) → a shared ending. |
| **Choices** | Lean on his shoulder / "Will you be there tomorrow?" / Tell him what she's carrying |
| **Proposed effects** | Baba ♥♥ / ♥ / (unspecified) ([SD]). **"Tell him" marks nothing** (author decision); it only unlocks Baba's reply. No Heat, no knowledge, no clues, no change to the round. |
| **Gameplay guard** | His green-reading gives no usable information ([SD] removed "breaks to the lake"). Nothing changes in the golf, the green or the Sunday round. |
| **The carton** | A story prop. Nothing is added to inventory unless the consumable is approved. |
| **Save** | Stored as encounter `baba_reading_the_green`, with its path. No flags. |

## The Rejection coffee-can patch

`REJECTION_COFFEE_CAN_PATCH.diff`: 15 wording edits, P1–P15.

**Not applied.**
- The Rejection is locked, and its script isn't in the project or the game.
- On approval: apply P1–P15 to the locked script, add a dated amendment note to its approval record, and only then build it.

**Flag.** `baba_coffee_can` replaces `mom_coffee_can`. Neither exists in any save, so no migration is needed.

**Dependency.** P13 names BOBO MILKY. If the name changes after the licensing check, P13 changes with it.

## BOBO MILKY: recommendation for the optional consumable system

Per your 22 Nov direction, BOBO MILKY ships as a **story prop only**: no inventory item, no bonus, no physics change. If you later want the consumable, this is the lowest-risk shape, taken from [FC]. Every number is a placeholder for you to set.

1. **Settle the name first.** [FC] could not verify a real product called BOBO MILKY, and "Bobo" is already used on milk drinks by other companies. The options, in order of safety:
   - an original in-game name with original packaging;
   - a licence from the maker;
   - the real name only after legal advice.

   Your carton art is original (red carton, cow, cedar). The open question is only the name. This isn't legal advice.
2. **Make the effect a stat input, never physics.** [FC] option A is a one-round Nerve bonus through the existing gear and lifestyle stat path. Option B uses Form instead. Shot timing and shot outcome code stay untouched either way.
3. **Keep it small and optional.**
   - One per round, no stacking, and a small carry limit.
   - Smaller than a top equipment bonus, so it is never required.
4. **Source it mainly from Baba.** Care packages every few weeks, or "Call Baba". It is never sold in pro shops: that's the gag.
5. **It would be the game's first consumable.** That means:
   - an inventory count in the career save, kept additively in flags;
   - a "drink before the round" step on the round-start screen;
   - a HUD icon.
   Allow about a day, plus tests showing physics and payouts are unchanged.
6. **Aurum-X stays Biff's.** It has no player effect and is never in any shop Ryan uses.

**Contradiction to resolve:** [SD] records "a modest one-round Nerve bonus through the existing stat path" as approved, while your 22 Nov brief says not to add gameplay bonuses or a consumable without approval. I've followed the 22 Nov brief.

## Suggested build order, once approved

1. Settle B1 (act progression). Without it, only Scene 1 is reachable.
2. Cut Baba's atlas from the supplied sheet. Re-index the out-of-order frame labels, clean the red fringe around some frames, and map his 5 portraits onto the engine's 8 expressions (details in the continuity report). Add the cast entry.
3. Build engine features E1–E7, then Scene 1, which is reachable today in Act I.
4. Build Scenes 2 and 3 once the art and B1–B3 are settled.
5. The Rejection with the patch, if the locked script is supplied and the patch is approved.
6. The family amendment items (Mom, Call Baba, the People panel), only if you authorize them.
