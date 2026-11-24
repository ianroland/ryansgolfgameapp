# Video Poker & Keno: machine art

Version 0.20.0. One cabinet on the casino floor, **Video Poker & Keno**, with a switch on top between the two games. There's no dealer; the floor's drink server comes round as at the tables. Rules and money are in `src/casino/videoPoker.ts`, `src/casino/keno.ts` and `CasinoService`. The art is presentation only.

## Sources

The source sheets are kept unchanged in `art/source_sheets/machines/`. `tools/cut_machines.py` cuts them into `src/assets/casino/machines/<theme>_<piece>.webp` and writes `machines.json`, which records sizes, atlas grids, 9-slice insets and meter windows.

| Sheet | Theme | Used for |
|---|---|---|
| `videopoker_sheet.png` | base | Marquee, screen frame, printed paytable, the 52-card deck and back, HOLD, Deal/Draw/Bet (normal and lit), sparkles |
| `keno_sheet.png` | base | Marquee, **balls 1–80** (the board everywhere), Draw/Clear, bet and win meters (every machine), pay-card frame, sparkle burst |
| `desert_palms_keno.png` | dp | Desert Palms keno: marquee, palm board frame, pay-card frame, Draw/Clear, sunset band behind the result line, sparkles |
| `white_buffalo_videopoker.png` | wb | White Buffalo video poker: marquee, screen frame, paytable frame, deck and back, HOLD, Deal/Draw/Bet, sparkles |
| `morongo_sky_machines.png` | ms | Morongo Sky: casino sign and the KENO / VIDEO POKER signs, screen and board frames, both pay frames, Draw/Clear and Deal/Draw/Bet (normal and lit), HOLD, card back, both sparkle sets |
| `card_tables_v2_concept.png` | none | Not used yet: awaiting a decision (see below) |

## Each casino's machine (`src/ui/casino/machineThemes.ts`)

| Casino | Video poker | Keno |
|---|---|---|
| Desert Palms | base | dp (base balls) |
| The White Buffalo | wb | base (no White Buffalo keno sheet yet) |
| Morongo Sky | ms (base deck) | ms (base balls) |

## Changes to the art (flagged)

- **King of diamonds:** on the base and White Buffalo decks it had a heart in its corner. The corner diamond from the Queen of diamonds on the same sheet is copied over it. The source sheets are unchanged.
- **Morongo Sky deck: not used.** Its King of hearts shows a diamond. Its small black corner suits are unreadable blobs, so the black face cards (which have no centre pip) can't be told apart. Morongo Sky uses the base deck with its own purple card back.
- **Paytable columns:** the printed paytables have 3 value columns, but the game pays 1 to 5 coins. On the base paytable the five columns are drawn over the printed value area; the hand names are the art's own. On the White Buffalo and Morongo Sky frames, the whole table is drawn inside the frame.
- **Frames with printed lines inside** (the pay cards and pay frames) are drawn without their centre plus a matching panel colour, because their printed rows would not line up with the table.
- **Sparkles on dark tiles** are keyed by brightness so only the light shows.
- Everything else is crop only. WebP at quality 92, 1.6 MB for all 62 pieces.

## Gaps (missing, not faked)

- Desert Palms keno balls: the sheet has 1–20 and 80 only, so the board uses the base balls (cream and gold, which suit Desert Palms).
- No White Buffalo keno art.
- No art for the coin-value buttons, Bet Max, Quick Pick or the game switch. These are CSS, styled to match.

## Card tables v2 (`card_tables_v2_concept.png`): not integrated

These are nine new blackjack, Three Card Poker and baccarat table looks, three per casino. They would replace the current, approved card scenes, so they wait for approval. Two of them also disagree with the game:

- Blackjack's felt reads **"DEALER HITS SOFT 17"**, but the game's dealer **stands on all 17s**. That's a rules change, not art.
- Three Card Poker's felt has **two seats** (two Pair Plus / Ante / Play sets), but the game plays one hand.

Each table is also about 512×340 inside a shared sheet, smaller than the current scenes (about 570×550).
