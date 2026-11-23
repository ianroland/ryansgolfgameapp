# Waifu (Baccarat) and Winston (Three Card Poker): integration notes

Version 0.14.0 · 2026-11-23

## What shipped

| Piece | Where |
|---|---|
| Baccarat rules (8 decks, third-card tableau, payouts, shoe, bead road) | `src/casino/baccarat.ts` |
| Three Card Poker rules (ranks, qualify, Ante/Play, Ante Bonus, Pair Plus) | `src/casino/threeCard.ts` |
| Money (atomic baccarat hand; saved Three Card hand; single debit/credit keys) | `CasinoService.playBaccarat / startThreeCard / finishThreeCard` |
| Tables, dealers, dialogue box | `src/ui/casino/WWTables.tsx` |
| Draft dialogue (event-driven, anti-repeat, quiet mode) | `src/casino/wwDialogue.ts`, `src/casino/dialogue/*.json` |
| Sprite cutter | `tools/cut_waifu_winston.py` (source: `art/source_sheets/Retro_Casino_Pixel_Art_Asset_Sheet.png`) |
| Tests | `tests/baccarat.test.ts`, `tests/threeCard.test.ts`, `tests/wwDealers.test.ts` |

Rendering layers, back to front: dealer pose, felt, props (chip tray and shoe), cards, bet chips, labels.
No layer has cards or chips painted in.

## Saves

Everything is additive in `career.flags`: `baccaratShoe`, `baccaratHistory`, `threeCardPending`.
Old saves need no migration. A missing or unreadable shoe is replaced by a freshly shuffled one.

## Money

- **Baccarat:** debit, deal and credit all happen in one transaction (`casino:<round>:bet:main` / `:pay:main`).
- **Three Card Poker:**
  - The Ante and Pair Plus are debited when the hand is dealt. The hand is then saved.
  - Play is debited once on Play (`:bet:play`).
  - Everything is credited once (`:pay:main`). A replay returns null.
- Each game has a ceiling on how much a round can return per dollar staked: baccarat 9×, Three Card Poker 41×.

## Proposed (not yet approved)

- **Limits:**
  - Baccarat: $10–$1,000 per spot.
  - Three Card Poker: Ante $10–$500; Pair Plus $5–$250.
- **Banker commission:** floored to whole dollars, because the bank holds whole dollars. For example, $25 on Banker pays $23.
- **Pair Plus paytable** (from the brief, 40/30/6/4/1): house edge 2.32%. The brief's figures are kept as written.

## Dialogue

All lines in both JSON files are `draft`. The box shows a **Draft** tag until each line's `status` becomes `approved`.
The "…at the Palms, mon!" line on the original sheet is not used; the JSON has no accent writing, and a test enforces that.

## Art status

| Asset | Status |
|---|---|
| Waifu poses: idle, deal, present, think | Clean transparent cut from the new sheet. **Stills only, no animation frames.** |
| Winston poses: idle, present, point, think | Clean transparent cut. **Stills only.** |
| 8 faces each | Clean, no captions. Face names were assigned by eye and need confirming. |
| Baccarat and Three Card felts | Clean, blank felt. Labels are drawn by the game. At the 551 px source width the felt is upscaled about 1.6× on desktop and looks a little soft. **A 2× source would be sharper.** |
| Chip tray, red and blue shoes | Clean. |
| Video poker cabinet, marquee, buttons | Cut and kept for Milestone 1 (not wired in yet). |
| First pack (`DESERT_PALMS_WAIFU_WINSTON_ALPHA_ASSETS.zip`) | **Not used.** Its keying removed the hair, its crops have baked labels, and some poses had cards painted in. |

Still needed before calling the art production-ready:

1. 2–4 frame loops for idle and dealing (optional; the tables work with stills).
2. Felts at 2× resolution.
3. A dealing or reaching pose without cards for Winston. The sheet has none, so his deal uses the idle pose.
4. Confirmation of which face is which emotion. Waifu's first-row faces and Winston's "grin" versus "smirk" were assigned by eye.
