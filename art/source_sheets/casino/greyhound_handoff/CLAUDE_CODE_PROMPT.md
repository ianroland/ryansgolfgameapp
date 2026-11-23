# CLAUDE CODE — DESERT PALMS GREYHOUND SPRITE INTEGRATION

Use the three images in `references/` and `greyhound_asset_spec.json` as the supplied handoff. Read them before coding.

GOAL: Replace placeholder greyhound drawings in the existing playable six-lane racing screen with clean, legible 16-bit pixel-art running animations. Preserve gameplay exactly.

IMPORTANT SOURCE RULES
- `original_casino_sprite_sheet.png` is the original aesthetic/character reference. Its bottom rows contain racing dogs but are NOT a production-ready uniform atlas.
- `animation_concept_NOT_ATLAS.png` is a VISUAL MOCKUP ONLY. Do not naively crop its 48 cells: several frames and jacket numbers are inconsistent.
- `current_greyhound_game_screen.png` shows the actual betting/racing/results UI and lane geometry.
- If you cannot generate eight DISTINCT clean poses per dog from supplied artwork, do not pretend you did. Build a smaller verified cycle from usable original art, or report the need for corrected art. Do not generate fabricated frames by shifting an identical pose.

SIX CANONICAL RACERS
1 red — Dusty Trail
2 blue — Velvet Rocket
3 white — Palm Springs Pete
4 yellow — Sandstorm Sally
5 orange — Coyote Ugly
6 green — Snake Eyes

IMPLEMENTATION
1. Inspect the codebase for current greyhound rendering, race timing, result generation, UI layout, sprite loading, and asset paths.
2. Create a transparent, tightly normalized dog-only sprite atlas (or six transparent strips) and machine-readable frame metadata, ONLY from actual verified usable frames. All dogs face right and have the same visual scale and ground baseline. No labels, backgrounds, track, UI, shadows baked into sprites, or duplicate jacket numbers.
3. Correct every jacket to its canonical number and color. Ensure each frame has one dog and four legs/limbs read clearly at game scale.
4. Render dogs centered vertically in each existing lane with feet aligned to the lane baseline. Use nearest-neighbor scaling and preserve crisp pixel edges.
5. Animate frame changes by elapsed time, independently of the simulated race position. Start/finish and win-order must remain controlled by existing game state, not animation frame or image width.
6. Preserve the existing betting screen, six lanes, odds, payouts, race results, save state, and controls. Do not rewrite race mechanics or introduce a new racing system.
7. Provide screenshots of betting, mid-race, and results screens, plus a frame contact sheet at native size and game-rendered size. Validate all six dogs and all jackets.
8. Run existing tests, add regression tests for racer mapping and sprite indexing, and report missing frames or other unresolved asset problems.

DELIVERABLES
- Validated atlas or individual transparent frame strips
- Frame metadata and asset-loading changes
- Updated dog renderer
- Screenshots and test report
- A concise list of any remaining art gaps

FIRST CHECK: Before making changes, report whether the provided images contain enough unique clean poses to create the requested animation. If not, integrate only validated assets and explicitly list what new art is required. Never call a concept sheet a finished sprite atlas.
