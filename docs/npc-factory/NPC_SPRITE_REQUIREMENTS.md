# NPC portrait and expression requirements

## Presentation rules

| Status | Rule |
|---|---|
| EXISTING | At casino tables, NPCs appear only in the dialogue panel: portrait, name, relationship tier, and the line. There are no full-body sprites at tables (`SHOW_TABLE_DEALER_SPRITES = false`). |
| EXISTING | Story encounters and story scenes may use full-body poses (cast atlases). |
| EXISTING | The art direction is 1990s Neo Geo-style pixel art. Images are drawn with `image-rendering: pixelated`, except smooth-downscaled painted assets such as chips. |
| PROPOSED | Packs supply portraits. Full-body poses are optional, and only for story scenes. |

## Portrait specification (PROPOSED for packs)

| Property | Requirement |
|---|---|
| Format | PNG, RGBA, real transparency (no matte, no halo); sRGB |
| Canvas | **256 × 256** per expression (displayed at 40–96 CSS px; the collapsed panel uses 40 px) |
| Framing | Head and shoulders, centred, with the eyes at about 40% from the top. The same framing for every expression of an NPC, so swaps don't jump. |
| Padding | 8–16 px of transparent margin; nothing touching the edge |
| Background | Transparent. The panel draws the frame and colours. |
| Aspect | Never stretched. The game fits it with `object-fit: contain`. |
| Text | None baked in: no names or captions |
| Size budget | 60 KB or less per portrait after optimisation |

**Delivery options**
- **Preferred:** individual files, `sprites/<npc_id>/<expression>.png`.
- **Also accepted:** one sheet plus a frames JSON (`{ "<expression>": { "x", "y", "w", "h" } }`), matching how `src/assets/characters/*.json` already works.

## Expression sets

- **Every NPC must have:** `neutral` (or a declared `defaultExpression`).
- **Recurring NPCs:** 6 or more. Common ids:
  - `neutral`, `friendly`, `playful`, `impressed`, `concerned`, `annoyed`, `firm`, `scheming`
  - plus the cast set: `happy`, `angry`, `surprised`, `worried`, `laughing`, `confident`, `disappointed`
- **Background NPCs:** may have only `neutral`, or 2–3 expressions.
- **Cocktail servers (planned):** `friendly`, `playful`, `impressed`, `concerned`, `annoyed`, `firm` (servers pack V1).

## Fallback (game side, PROPOSED `ExpressionResolver`)

1. The requested expression.
2. The NPC's declared `aliases` for that expression (for example `worried` → `disappointed`, which the cast sheets already do).
3. The NPC's `defaultExpression`, then `neutral`.
4. A category placeholder (a silhouette in the casino's frame colour), clearly marked as a placeholder in the dev build.
5. The game never shows a broken image, and never borrows another NPC's face.

## Existing art the game keeps

| Character group | Current art |
|---|---|
| Ryan and the 10 cast members | Atlases in `src/assets/characters/`: 8 named expressions, with "worried" reusing "disappointed" on cast sheets |
| Dealers | Velvet Vega (single portrait), Stick Lady (5 faces), Monique (expression strip), Waifu and Winston (face strips) |

None of this art is replaced by the import. It's wrapped by adapters.

## Casino panel theming

- **Panel colours:** come from the casino, not the portrait.
  - Desert Palms: gold.
  - The White Buffalo: copper and turquoise.
  - Morongo Sky: platinum and purple.
- **Portraits:** should read on dark purple, dark teal and dark green backgrounds. Avoid portrait backgrounds that are only very dark.
