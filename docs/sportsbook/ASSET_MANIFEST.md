# Sportsbook asset manifest

Source of truth: `src/assets/sportsbook/manifest.json`. **Status:** the three lounge backgrounds are **installed** (validated 1672×941, PNG, opaque, no baked dynamic content). Every other asset is **missing** and uses a labelled placeholder. Exact pixel sizes; transparency as listed.

| Asset | Path | Size (px) | Count | Transparent | Used in | Notes |
|---|---|---|---|---|---|---|
| desert_palms.bg_lounge | `src/assets/sportsbook/desert_palms/bg_lounge.png` | 1672×941 | 1 | no (opaque) | ✅ INSTALLED · Sportsbook lounge background layer (src/sports/themes.ts art.background) | Opaque. Blank CRT/odds screens and empty counter: no text, odds, scores, menus, bankroll or NPC baked in. |
| desert_palms.odds_board_frame | `src/assets/sportsbook/desert_palms/odds_board_frame.png` | 1200×600 | 1 | yes | Frame around the live CRT board (art.boardFrame), drawn as a 9-slice | 9-slice compatible: corners and edges about 48 px, plain stretchable centre or a transparent centre; no text. |
| desert_palms.clerk | `src/assets/sportsbook/desert_palms/clerk_<expression>.png` | 256×256 | 6 | yes | Clerk portrait slot (DealerDialoguePanel) | Six expressions: friendly, playful, impressed, concerned, annoyed, firm. Ids and names to be set with NPC Factory. |
| white_buffalo.bg_lounge | `src/assets/sportsbook/white_buffalo/bg_lounge.png` | 1672×941 | 1 | no (opaque) | ✅ INSTALLED · Sportsbook lounge background layer (src/sports/themes.ts art.background) | Opaque. Blank CRT/odds screens and empty counter: no text, odds, scores, menus, bankroll or NPC baked in. |
| white_buffalo.odds_board_frame | `src/assets/sportsbook/white_buffalo/odds_board_frame.png` | 1200×600 | 1 | yes | Frame around the live CRT board (art.boardFrame), drawn as a 9-slice | 9-slice compatible: corners and edges about 48 px, plain stretchable centre or a transparent centre; no text. |
| white_buffalo.clerk | `src/assets/sportsbook/white_buffalo/clerk_<expression>.png` | 256×256 | 6 | yes | Clerk portrait slot (DealerDialoguePanel) | Six expressions: friendly, playful, impressed, concerned, annoyed, firm. Ids and names to be set with NPC Factory. |
| morongo_sky.bg_lounge | `src/assets/sportsbook/morongo_sky/bg_lounge.png` | 1672×941 | 1 | no (opaque) | ✅ INSTALLED · Sportsbook lounge background layer (src/sports/themes.ts art.background) | Opaque. Blank CRT/odds screens and empty counter: no text, odds, scores, menus, bankroll or NPC baked in. |
| morongo_sky.odds_board_frame | `src/assets/sportsbook/morongo_sky/odds_board_frame.png` | 1200×600 | 1 | yes | Frame around the live CRT board (art.boardFrame), drawn as a 9-slice | 9-slice compatible: corners and edges about 48 px, plain stretchable centre or a transparent centre; no text. |
| morongo_sky.clerk | `src/assets/sportsbook/morongo_sky/clerk_<expression>.png` | 256×256 | 6 | yes | Clerk portrait slot (DealerDialoguePanel) | Six expressions: friendly, playful, impressed, concerned, annoyed, firm. Ids and names to be set with NPC Factory. |
| league_logos | `src/assets/sportsbook/shared/leagues/<gdc|ccl|igl|fhl>_512.png` | 512×512 | 4 | yes | League tabs, history, news | Plus a 128x128 export of each (<id>_128.png). League initials only, no other text. |
| team_crests | `src/assets/sportsbook/shared/crests/<team_id>_256.png` | 256×256 | 32 | yes | Lines, scores, standings, team pages | Plus a 64x64 export (<team_id>_64.png). Must read at 32 px. Team ids are in src/sports/demo.ts. |
| ticket_base | `src/assets/sportsbook/shared/ticket_base.png` | 600×300 | 1 | yes | Tickets view, confirm dialog | 9-slice compatible; no printed text. |
| ticket_stamps | `src/assets/sportsbook/shared/stamp_<win|loss|push|void>.png` | 256×128 | 4 | yes | Settled tickets | Text WIN / LOSS / PUSH / VOID is the only allowed baked text. |
| phone_frame | `src/assets/sportsbook/shared/phone_frame.png` | 720×1280 | 1 | yes | In-game phone (Phase 4) | Transparent screen area. |
| phone_icons | `src/assets/sportsbook/shared/app_<scores|standings|news|teams|tickets>.png` | 128×128 | 5 | yes | Phone home screen (Phase 4) |  |
| sport_icons | `src/assets/sportsbook/shared/sport_<baseball|basketball|football|hockey>.png` | 64×64 | 4 | yes | League tabs, news |  |
| status_badges | `src/assets/sportsbook/shared/badge_<live|final|injured|trade|draft|retired>.png` | 64×64 | 6 | yes | Scores, news, team pages |  |
| news_pictures | `src/assets/sportsbook/shared/news_<id>.png` | 640×360 | 8 | no (opaque) | News feed | Generic, no faces: one game action per sport (4), trophy lift, injury bench, draft stage, retirement ceremony. |
| player_silhouettes | `src/assets/sportsbook/shared/silhouette_<sport>.png` | 256×256 | 4 | yes | Player profiles | One per sport. |

## Quality gate per delivered file
- Exact size checked in code; alpha checked (transparent where listed, opaque backgrounds).
- No dynamic text, odds, scores, bankroll, menus or NPCs baked in (except WIN/LOSS/PUSH/VOID stamps and league initials).
- Originals kept under `art/source_sheets/sportsbook/`; exports only in `src/assets/sportsbook/`.
- No real-world league or team marks.
