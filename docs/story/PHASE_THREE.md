# Phase 3: the LPGA ladder (0.22.0)

The Next Chapter (`act2_the_next_chapter`, the Act II finale) moves the story to Act III. That starts phase 3: Ryan is she/her and wears the approved phase 3 look (the auburn ponytail wig and visor).

## What changes (`enterLpgaLadder` in `src/career/engine.ts`)

- **Ryan starts over at LPGA Q-School.** Her tour card resets and Q-School reopens: this season if it's before week 20, otherwise next season.
- **The ladder's names** come from `src/career/ladder.ts`: LPGA Q-School, then the Epson Tour, then the LPGA Tour. Tour ids and save keys don't change.
  - `ladderAt(c, season, week)` keeps the PGA names on anything played before the switch: tour pills on past events, albatross records, and trophies (by the tour name stamped when they were won).
- **Fields:** from phase 3, only the Amateur Circuit and the SoCal Pro Series are men's fields.
  - Q-School, Epson and LPGA get fresh women's pools (`lpgaLadderPools`, ids prefixed `w3_`).
  - Kayla is back in Ryan's fields.
  - The load-time pool tidy-up knows the phase, so it leaves those names alone.
- **Money lists:** this season's ladder money lists start fresh. The all-time list drops the PGA ladder's golfers and adds the new ones. Ryan's own money, results, records and trophies don't change.
- **Trophies:** the PGA Tour Card, Korn Ferry Tour Winner and PGA Tour Winner trophies also have LPGA names (LPGA Tour Card, Epson Tour Winner, LPGA Tour Winner). Each trophy shows the name for the ladder it was won on.
- **The Pink Jacket** was already tied to phase 3 and the Desert Rose Invitational on the top tour.

## Scene fixes found while building it

- A scene with no choice starts on its ending, and it now saves straight away, as any ending does.
- A scene keeps the phase and look it started in. The Next Chapter changes the phase as it is saved, but its words (*habibi* until Baba's switch) and Ryan's portrait stay put until it ends.
