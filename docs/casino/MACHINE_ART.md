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

## Card tables v2 (`card_tables_v2_concept.png`): in the game since 0.20.1

`tools/cut_card_tables_v2.py` cuts the sheet into nine scenes, one per casino and game: `src/assets/casino/tables/<casino>/<game>_scene.webp`. It only crops: the top row's casino-name banners and the grid lines are left out. Layouts are per scene, in `src/expansion/tableThemes.ts`. The previous shared scenes are kept in `art/retired/card_scenes_v1/`, and `?tables=legacy` still shows the oldest tables in development builds.

- **Printed spots:** the felts print the betting spots, so the game's zones are invisible hit areas over them. Chips land on the printed spots, and a winning spot glows.
- **Blackjack:** the felt reads "Dealer hits soft 17", but the dealer **stands on all 17s** (rules unchanged). In game, that printed line is covered with "Dealer stands on all 17s" in the felt's colour (`ruleCover`). **Art fix wanted:** the felt line should read "Dealer stands on all 17s".
- **Three Card Poker:** the felt prints two seats. The game plays one hand on the left seat, and the right seat stays empty.
- **Size:** the scenes are about 500×300–320 (the old shared scene was 588×554, with more of the room above the table shown).
