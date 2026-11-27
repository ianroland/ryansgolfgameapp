# Act II: The Grind (phase 2, he/him)

Built in 0.21.0 from the owner-approved outline "Ryan's Road: Acts II–IV Story Outline" (2026-11-27: "role with it"). Lines are approved under the standing approval (`docs/APPROVALS.md`). Tone: The Naked Gun with a dash of Leisure Suit Larry.

## How the story moves now

- `story.act` advances only through an encounter outcome's `act` field (`src/story/encounters.ts`). It never goes backwards.
- Entering a phase unlocks that phase's approved look (`HAIR_OF_PHASE` in `src/story/phase.ts`). Phase 2 only unlocks the bald look, and the player picks it. Phase 3 also switches Ryan into it.
- Every third-person line about Ryan, and Baba's pet name, is written with tokens (`{he} {him} {his} {himself} {Habibi}`). `ryanSay` fills them for the phase, and `localizeEncounter` fills a whole scene. A test checks that no story text hard-codes *habibi* and that every token is filled in every phase.
- When a scene has two cast members, whoever is speaking stands opposite Ryan.
- New scene location: `course_sunset` (the approved `bg_city_sunset` art).

## The scenes (in order, a few weeks apart)

| Id | Title | Cast | Opens when |
|---|---|---|---|
| `act2_motel_six_iron` | Motel Six Iron | Marty Mulligan | Act I, once the first Q-School is over (any result). **Every ending starts Act II.** |
| `act2_the_sponsor` | The Sponsor | Mr. Dawson, Biff | 2+ weeks later |
| `act2_rain_delay` | Rain Delay | Kayla | 2+ weeks after The Sponsor |
| `act2_monday_goose` | Monday Qualifier | Commissioner Clipboard (and a goose) | 2+ weeks after Rain Delay |
| `act2_sunday_dinner` | Sunday Dinner | Baba | 1+ week after the goose (0.21.1) |
| `act2_helicopter_dinner` | Dinner, Interrupted | Kayla, Biff | 4+ weeks after Rain Delay, and after Sunday Dinner |
| `act2_the_next_chapter` | The Next Chapter | Baba | 2+ weeks after Dinner, Interrupted. **Opens Act III and phase 3** (owner-approved draft, 0.22.0) |

## Waiting on

- **Baba's art is in** (0.21.1). The author's sheet was in `art/source_sheets/cast/` all along; `tools/cut_baba.py` cuts it into `src/assets/characters/baba.png`.
  - Strips are taken in order and scaled to one standing height.
  - The keying fringe is removed.
  - The portraits' blue squares are keyed out, and the 5 faces are mapped onto the 8 expressions.
- **The Next Chapter** shipped in 0.22.0, together with the phase 3 switch (`docs/story/PHASE_THREE.md`).
- **The frozen Story Bible.** The Rejection, The Arnold Palmer Drive and The Dossier slot in when it's available. Act II currently starts right after the first Q-School.
- **The quiet "What fits" thread.** These scenes are played straight and will go to the owner before they ship.
