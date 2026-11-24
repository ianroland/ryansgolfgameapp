# Spin to Win: implementation report

Version 0.20.2. This report answers the handoff brief, kept as `docs/casino/SPIN_WHEEL_BRIEF.md`.

## Rules (approved by the owner, 2026-11-24)

The owner chose the **classic casino money wheel** ("Big Six"). It replaces the concept art's sample labels (5 to 1000) and its sample payout table: ten equal slices paying those amounts would return about 200 times the bet on average.

There are 54 equal slots, each equally likely, so the odds a player can count on the wheel are the real odds. Bets go on one or more symbols. When the wheel stops, the bet on the symbol at the pointer pays its number **to 1**, and that bet's stake comes back too. Every other bet loses.

| Symbol | Slots | Pays | Return |
|---|---|---|---|
| $1 | 24 | 1 to 1 | 88.9% |
| $2 | 15 | 2 to 1 | 83.3% |
| $5 | 7 | 5 to 1 | 77.8% |
| $10 | 4 | 10 to 1 | 81.5% |
| $20 | 2 | 20 to 1 | 77.8% |
| Casino emblem (palm, buffalo or mountain) | 1 | 40 to 1 | 75.9% |
| Star | 1 | 40 to 1 | 75.9% |

- **Chips:** 1, 5, 10, 25, 50 and 100, as in the art. At most $500 can go on one symbol.
- **Where the rules live:** `src/casino/wheel.ts`, with a fixed slot order.
- **Slot order:** the slots are evenly spread, so no two of the rarer symbols sit side by side. The emblem and the star are opposite each other.
- **No real money:** the game uses in-game money only. Odds never depend on the bankroll.

## Integrity

`CasinoService.spinWheel` runs in one transaction:

1. It checks the bets.
2. It draws the slot: one unbiased crypto draw over the 54 slots (`cryptoInt`).
3. It debits the stake.
4. It credits the payout.
5. It saves the result as `wheelLast`, adds it to the 20-spin history `wheelHistory`, and updates the casino stats.

The wheel only starts turning after that transaction has finished. The animation goes to `rotationFor(slot)`, and a test checks that every slot, at every stopping offset, ends exactly under the pointer.

- **Reload mid-spin:** checked in the browser. A reload during a spin shows the same result and the bank is not paid again.
- **Paying twice:** each ledger entry has a key tied to the spin, and each payout is capped at 41 times the stake (`MAX_RETURN.wheel`).
- **Save export and import:** carry the spin through the career's flags, like the other casino games.

## Art (`tools/cut_spin_wheel.py` → `src/assets/casino/spin/`, `atlas.json`)

The source sheets are kept unchanged in `art/source_sheets/spin_wheel/`. `atlas.json` records every crop rectangle, every size, and the overlay geometry on each cabinet.

- **Cabinets:** each casino's machine is used whole. Its wheel centre and radius were found from the gold rim and checked by eye.
- **Drawn over the art:**
  - the wheel, as SVG: 54 segments, labels, the emblem slot and a fixed hub;
  - the pay table, the bet total and the SPIN button, because the painted payouts were sample art.
- **Cut from the sheet:** the casino emblems (as circles), pointers, SPIN buttons (normal and dimmed), panels, the CREDITS, BET and WIN meters, and the 1 to 100 chip buttons. The slate background was removed by flood fill.
- **Not used:** the sample wedge set (its values aren't in the game), the motion-blur wheel frames (the wheel is drawn live), the sparkle bits, and the second style reference sheet.

## Play

- **Where:** Casino → **Spin to Win**, in all three casinos.
- **Betting:** tap a symbol to add the chip. Right-click clears that symbol. **Clear** clears all of them.
- **Spinning:** **SPIN**, or **Space** or **Enter**.
- **Reduced motion:** the wheel jumps straight to the result.
- **No dealer:** the floor's drink server still comes round.
- **Phones:** the bet symbols wrap to four per row.

## Tests and build

- **Tests:** `tests/wheel.test.ts` covers:
  - the slot counts and the spacing;
  - the exact return for each symbol;
  - that the draw has no bias;
  - every outcome's settlement;
  - the bet checks;
  - pointer alignment for every slot;
  - money through the casino: one debit and one payout per spin, kept across a reload, with a ledger integrity check;
  - refusal of bad spins.
- **Full suite and build:** both pass; see the 0.20.2 commit.
- **Browser:** played in all three casinos at desktop width, and on a phone (390 px) at Morongo Sky.

Screenshots: `docs/casino/screenshots/spin_wheel_three_casinos.webp`, `spin_wheel_phone.webp`.

## Unresolved

- The art's sample wedges (5 to 1000) and its sample PAYOUTS table aren't used.
- The game draws its own wheel. A clean, empty wheel face from the artist, with no printed labels, could replace the drawn colours if wanted.
