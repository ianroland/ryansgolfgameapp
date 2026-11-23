# Casino Card Tables — V1

Three clean casino environment/table backgrounds cropped from the **user-approved** concept image, for use in Blackjack, Three Card Poker, and Baccarat (nine themed game presentations).

## What is production-usable now
- `backgrounds/<casino>/scene.png`: three PNG backgrounds, one per casino, each reused for the three games.
- No baked chips, cards, dealer sprites, action buttons, or betting text.
- The original source image is included for comparison.

## What is NOT production-ready
- The `guides/` PNGs are **illustrative alignment overlays**, NOT final felt lettering or clickable hitboxes. Do not ship them as part of the game UI.
- These scene images come from a concept-sheet crop, so they retain perspective and baked decorative emblems, and may need additional art refinement.
- The source does not specify dealer anchor, betting coordinates, or exact app viewport. Claude must inspect those in the project before overlay integration.
- No separate front-rail occlusion mask yet; create one only after verifying layering needs in-game.

## Rules
- Preserve native aspect ratio; do not stretch to the current table aspect ratio.
- Put dealer sprites, cards, chips, betting hitboxes, labels, and controls in independent layers.
- Maintain the existing game engines and betting rules.
- Do not touch Roulette or Craps in this pass.
