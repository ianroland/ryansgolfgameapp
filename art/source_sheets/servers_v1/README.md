# Ryan’s Road to the LPGA — Cocktail Server Dialogue Pack V1

**Status:** Draft dialogue and proposed balance, not approved final writing.

Contains three distinct server NPCs, six expressions each, event-based dialogue, Tito’s Double-only alcoholic orders, water, tips, table-side service, relationship hooks, and enforced refusal when Ryan is impaired.

## Sprite setup

You already have three downloaded 3×2 expression sheets. **They are not included in this ZIP.** Claude should inspect the real image files before cropping, not guess their grid bounds. The intended expression order (left to right, top row then bottom row) is: `friendly`, `playful`, `impressed`, `concerned`, `annoyed`, `firm`. The generated concepts may not perfectly match the semantic labels; visually verify and remap expressions if needed. Do not stretch faces. Preserve each portrait’s aspect ratio and keep any frame treatment consistent.

Suggested character IDs/names (provisional): Desert Palms = Maya Solis; White Buffalo = Nina Calder; Morongo Sky = Celeste Vale.

## Files
- `servers.json`: structured NPC metadata and dialogue events
- `system_config.json`: mechanics, triggers, and explicit proposals
- `DIALOGUE_REVIEW.csv`: editable line-by-line review
- `CLAUDE_CODE_PROMPT.md`: implementation brief

## Critical implementation notes
- Only alcoholic order: Tito’s Double. Water is allowed. No alcohol needed for progression.
- A server can refuse further alcohol; refusal must disable the order, not merely display a line. Tips cannot bypass refusal.
- Buffs/debuffs only affect RPG/social systems; no alteration to casino RNG, odds, or payouts.
- Avoid blocking active hands/spins/rolls.
- If prior alcohol system already exists, extend it; do not overwrite saves or duplicate state.
- All numerical thresholds, drink prices, relationship tiers, and character names in the pack are proposed defaults, adjustable after playtesting.
