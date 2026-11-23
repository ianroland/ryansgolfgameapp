# Casino Craps Tables — Claude Code handoff V1

Three separately generated **full-frame 1672×941 RGBA PNG** craps scenes, one per casino. No cropping from a composite sheet; each image includes its entire table and surrounding environment. The files are opaque backgrounds (RGBA container, alpha 255), not isolated transparent table sprites.

## Files
- `tables/desert_palms/craps_full_scene.png`
- `tables/white_buffalo/craps_full_scene.png`
- `tables/morongo_sky/craps_full_scene.png`
- `CONTACT_SHEET.png` — visual comparison only
- `manifest.json` — paths and specs
- `CLAUDE_CODE_PROMPT.md` — integration instructions

## Important production limitations
The illustrations contain **baked-in table markings, dice icons, and payout text**; some may not reflect the game's actual supported bets or mathematically correct paytables. They are **approved art-direction backgrounds**, not certified functional craps layouts. The images are complete, unwarped, and independently generated, but they have not been tested in the running game. Preserve the existing betting system and render interactive chips, dice, dealer, labels, and UI above the background. Where markings conflict, request clean-felt art rather than silently changing game rules.
