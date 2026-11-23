# Ryan’s Road to the LPGA — Craps Table Background Integration

Integrate `CASINO_CRAPS_TABLES_V1.zip` as a **visual-only** update for Craps at Desert Palms, The White Buffalo, and Morongo Sky.

1. Read `README.md` and `manifest.json`; inspect all three full-frame PNGs.
2. Audit the current Craps implementation: canvas/DOM layout, current background, betting zones and their hitboxes, dealer/dice/chip positions, supported bets, odds, payouts, and responsive behavior.
3. Add a data-driven `crapsBackgroundByCasino` mapping using exact paths from the manifest. Use the existing casino IDs, adapting the mapping rather than duplicating game logic.
4. Display each PNG with **preserved 1672:941 aspect ratio**. No squashing, stretching, arbitrary center crop, or cutting off rails. If the existing game viewport has a different ratio, letterbox or adapt its container while preserving the full table.
5. Keep all live gameplay elements separate: chips, dice animations, point puck, dealers, betting amounts, controls, tooltips, and hitboxes. Do not make the decorative labels clickable by image position alone.
6. IMPORTANT: Backgrounds have baked-in illustrated bet names, dice icons and payouts. Audit every visible marking against the game’s actual supported rules and payouts. Do not treat artwork as authority, do not change the math to match the art, and do not show contradictory UI. If markings cannot be safely aligned or masked, keep the old table active and flag the need for clean-felt replacements.
7. Do not alter bankroll, ledger, RNG, wager settlement, tipping, relationships, casino unlocks, or any non-Craps game.
8. Validate in all three casinos at desktop and mobile widths. Test clicking every supported betting region, placing/removing bets, dice animation, point tracking, wins/losses, save/load, and switching casinos. Capture three in-game screenshots.
9. Report files changed, screenshot locations, mismatched labels, visual defects, and test results. Keep old Craps backgrounds as fallback.

Implement the safe visual portion now; report blockers rather than claiming untested artwork is production-ready.
