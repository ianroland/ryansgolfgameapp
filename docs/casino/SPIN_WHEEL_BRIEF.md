# CLAUDE CODE — SPIN WHEEL CASINO GAME IMPLEMENTATION
## Ryan's Road to the LPGA | Three Casino Themes

Implement a complete, playable Spin Wheel casino game in the EXISTING project. Inspect the repository, casino architecture, currency ledger, existing games, persistence, navigation, and UI before coding. Do not replace existing casino systems. Follow existing game conventions.

### Source artwork
- `art/source/spin_wheel_concept_sheet.png` — three machine concepts, wheel and button designs, themed panels, effects.
- `art/source/casino_table_style_reference.png` — approved Desert Palms, White Buffalo, Morongo Sky visual direction.
These are COMPOSITE CONCEPT ART, NOT transparent production sprites or validated atlases. Do not treat their dark backgrounds as alpha. Extract, mask, and clean elements as necessary; record each actual pixel crop in an atlas manifest. Rebuild UI lettering, numerical labels, and the rotating wheel procedurally for crisp, accurate text. Avoid relying on generated sample prize labels/payout tables as game rules.

### Three casino skins
- Desert Palms: tropical vintage Vegas, emerald felt, gold, magenta neon, palms.
- White Buffalo: rustic stone and wood, copper/gold, turquoise, buffalo motif.
- Morongo Sky: midnight violet, neon purple/blue, chrome/gold, mountain motif.
Use identical mechanics and wheel geometry across all three; theme the housing, pointer, buttons, typography and win effects. Respect established casino naming, navigation and unlock rules from source.

### Game concept
A fixed-segment vertical prize wheel, with a visible stationary pointer at 12 o'clock. Player chooses a permitted wager and presses SPIN. The engine commits a result once, then animates a decelerating wheel to that result. The pointer and final selected segment must agree exactly. Show the outcome, winnings, and updated credits. No mid-spin wagering or duplicate payouts. Disable actions while resolving. Support reduced-motion mode and keyboard controls.

### IMPORTANT: confirm game economy before implementing
The concept sheet shows example labels (5, 10, 20, 25, 50, 75, 100, 200, 500, 1000) but does NOT define a valid payout schedule, segment frequencies, probabilities, or wager multiplier. Do NOT use the concept art as an authoritative paytable. Find any existing game-design specification. If none exists, propose a mathematically explicit configurable paytable and expected return for owner approval; do not silently introduce a real-money-like exploit or arbitrary rewards. Do not use fake odds, change probabilities based on player balance, or let the animation decide outcomes. Clearly distinguish segment payout multiplier vs credit amount.

### Mechanics and integrity
- Reuse shared bankroll, bet validation, transaction IDs, ledger and game session state.
- Verify sufficient credits; debit exactly once at accepted spin, settle exactly once after committed result.
- Use existing random-number and persistence infrastructure, with appropriate unbiased selection; do not use visual rotation as RNG.
- Persist pending spin and committed result BEFORE/atomically with ledger transitions using existing app patterns; refresh/import/reload must not reroll or duplicate settlement.
- Display accessible odds/paytable once approved, including wager units and whether payouts include stake.
- Use deterministic testing injection for outcomes, never a predictable production seed if money-like balances matter.
- Add audit-friendly spin history and clear error recovery for interrupted sessions.

### Visual integration
- Extract usable cabinet components from source sheet, or recreate clean individual transparent PNG assets where composites are too entangled.
- Produce 3 theme-specific component sets and `atlas.json` with accurate dimensions and crop coordinates. Verify every asset visually, especially text and edges. Do not assert an atlas exists unless generated and tested.
- Implement the wheel as SVG/canvas/CSS with separate segments, labels and a fixed pointer, using nearest-neighbor rendering where pixel art is used.
- Preserve aspect ratio; fit desktop and mobile; no overlapping HUD or clipped pointer.
- Add short anticipation/spin/settle animations and optional glow/confetti; no mandatory flashing.

### Required tests
- Valid bet, insufficient funds, all prize outcomes, payout arithmetic, expected-return math, unbiased weighted selection, exact pointer alignment, spin disabled while busy, refresh during pending spin, duplicate settlement prevention, export/import, bankroll reconciliation, three casino themes, reduced motion, keyboard, and responsive UI.
- Run full test suite and production build, then browser smoke-test in all three casinos.

### Deliverables
1. Working game in existing casino navigation and unlock flow.
2. Three distinct casino themes matching approved references.
3. Extracted assets and verified manifest, plus documented extraction limitations.
4. Tested wager/payout configuration (or explicit owner-approval blocker if missing).
5. `docs/casino/SPIN_WHEEL_IMPLEMENTATION_REPORT.md` with files, rules, paytable, expected return, test/build results, screenshots and unresolved decisions.

Start by auditing the codebase and existing casino rules. Implement end to end, stopping only for a genuinely missing owner decision such as the paytable.
