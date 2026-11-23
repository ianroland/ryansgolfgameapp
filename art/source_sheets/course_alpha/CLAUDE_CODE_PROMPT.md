# Claude Code — Course Scenery Sprite Integration (Alpha Pack)

You are working in Ryan’s Road to the LPGA. Inspect the existing course renderer and actual golf gameplay first. The attached video reference frames show a behind-golfer pseudo-3D camera, a mountain backdrop, fairway/green, water, flagstick, player, HUD and minimap.

## Asset pack
- `sprites/`: 16 individual transparent PNG candidates.
- `asset_manifest.json`: names, pixel dimensions, bottom-center anchors, decorative-only classification.
- `references/`: original generated sheet and two frames from gameplay footage.

## Critical quality note
These sprites were automatically isolated from a concept sheet with a baked-in checkerboard. They are **alpha assets**, not guaranteed final-production art. Inspect alpha edges, stray checker pixels and halos at 100% and against both dark and light course backgrounds. Fix or reject any sprite with visible artifacts. Do not claim all 16 are production quality without checking.

## Integration rules
1. Locate current course renderer, projection, world-space coordinates, terrain map, hit-testing, and collision logic. Do not replace them.
2. Use trees, shrubs, rocks, reeds, cart, sign, bench and bridge as visual decorations, subject to actual perspective and depth sorting.
3. Convert world-space size into screen-space using the **existing** camera/depth projection. Anchor each sprite at bottom center. Do not apply a single fixed CSS pixel size to all distances.
4. Preserve visibility of player, ball, flagstick, aiming controls, HUD and minimap. No decorations may cover critical UI.
5. Do not let decorative trees/rocks/carts affect shot physics, ball lies, terrain, collisions or minimap unless gameplay already defines those objects.
6. The bunker and pond PNGs are **decorative references only**. Do not overlay them onto fairways as playable hazards; hazard visuals must match existing authoritative terrain data.
7. Existing flagstick remains authoritative. Do not spawn a second flagstick.
8. Add restrained deterministic scene variation per hole or course theme, with a seed that does not change when the user redraws, reloads, or takes a shot. Avoid clutter.
9. Add image loading/fallbacks so missing assets never break play. Preserve save compatibility.
10. Check draw order, alpha transparency, performance and appearance at 1280x800 (reference video), 1920x1080 and 1366x768.

## Deliverables
- Implement an opt-in scenery layer first, not a full course redesign.
- Screenshot one tee view, one approach, one putting green, and a hole with water.
- List accepted/rejected sprites and any cleanup needed.
- Confirm no gameplay or scoring changes.

Use existing 32-bit-inspired arcade styling; avoid giant foreground objects or sprites that appear to float.
