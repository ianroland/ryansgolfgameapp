# Asset specification

Status: **PROPOSAL for Gate 2** (revision 2: adds bartenders, the bar, drinks, tipping UI, sponsor mail graphics, relationship feedback and condition icons). The sizes are derived from the renderer as it is today (audit §8). Where the current art is upscaled, the spec asks for 2× so the new art is sharp on high-DPI screens.

## 0. Rules for every asset

1. **Real alpha.** Transparent PNG (RGBA) with alpha 0 outside the subject.
   - No checkerboard, no gradient, no solid "transparent-looking" background.
   - No halo: edge pixels must not carry the old background colour.
2. **Nothing playable baked in.** No cards, chips, dice, shoes, chip racks, **drinks or glasses on the counter**, betting text, labels, prices, logos-with-text or buttons painted into characters, tables, bars or rooms.
   - Props come as their own files.
   - **All text is drawn by the game.**
3. **Same canvas for every pose and frame of a character**, with the same anchor points (head-centre x, desk line or feet baseline y). The game swaps frames without the character jumping.
4. **Animation means real in-between frames.** A loop is 2–8 coherent frames of the same pose moving. Different poses don't count as an animation.
5. **One subject per file.** No labels, captions or contact-sheet borders inside a deliverable PNG. Contact sheets are separate files, for review only.
6. **Style:** 32-bit / Neo Geo-inspired painted pixel art, deep purple, emerald felt and warm gold. White Buffalo and Morongo Sky palettes are PROPOSED (bible §3) and need concept approval first.
7. **Camera:** casino tables are a **wide, foreshortened oval seen from the player's seat, with the dealer behind the far rail facing the player.** Never top-down.
8. **Fictional people only.** No real golfer names, faces or logos.

## 1. Casino table layer stack (as rendered in `WWTables.tsx`)

Back to front: room background, dealer, felt, props, cards, chips, labels and UI. The stage is at most **900 CSS px** wide.

| Asset | Canvas (px) | Notes |
|---|---|---|
| **Table felt** | **1800 × 720** RGBA | Foreshortened oval; rail included. Dealer notch centred on the far rail, spanning x ≈ 640–1320 (the same proportions as the current baccarat felt), with the felt starting at y ≈ 125 inside the notch. Betting zones may be painted as plain coloured or outlined shapes, **with no words or numbers**. Deliver a zone map (JSON polygons in canvas px). |
| Chip tray | 640 × 200 | Empty slots; the game draws chips. |
| Card shoe | 300 × 260 | Seen from the same camera. One per colour (red, blue). |
| Discard holder (if used) | 300 × 260 | Optional. |
| Chips | 128 × 128 each | Top-down coin view, matching `chip_5/25/100/500` (currently 52 × 51, upscaled). Denomination text is drawn by the game. |
| Room background behind the table | 1920 × 1080, WebP | Bokeh casino floor per location; no tables or people in the playable centre third. |

## 2. Characters

### 2a. Table dealers and hosts (casino scale)

Displayed about **300 CSS px** tall at the 900 px stage, so the source is drawn at 2×.

| Item | Spec |
|---|---|
| Pose canvas | **640 × 640** RGBA, every pose and every frame |
| Anchors | Head centre at **x = 320**. **Desk line at y = 600**: the far rail covers everything below it. Top of hair no higher than y = 40. |
| Required stills (per dealer) | `idle`, `deal` (reaching, **empty hands**), `present` (open palms), `think`, `react_win`, `react_lose` |
| Required loops | `idle` (4 frames, about 8 fps: breathing and a blink), `deal` (4–6 frames, reach out and back, **no card in hand**) |
| Optional loops | `win` (3–4), `lose` (3–4), `talk` (2–4, mouth only) |
| Atlas | One horizontal strip per character, `cell` 640 × 640, frame order as in the manifest. Matches the existing `dealer_*_anim.json` format: `{cell, headX, deskY, fps, frames:{name:[i,…]}}`. |
| Expressions | **8 × 256 × 256** RGBA, head and shoulders, **no frame, no caption**, eyes at y ≈ 110. Order matches `EXPRESSIONS` in `src/story/types.ts`: `neutral, happy, angry, surprised, worried, laughing, confident, disappointed`. |
| Big portrait | 512 × 512 RGBA (cinematics and invitations) |

### 2b. Same characters in Vegas Stakes-style encounters (cast scale)

`EncounterScene` draws the cast from small pixel atlases, crisp-scaled (`src/assets/characters/*.json`). Any casino NPC who **speaks in an encounter** needs this set as well. Without it, the encounter would show mixed pixel densities. (Open question Q12 asks whether casino encounters should use the casino-scale art instead.)

| Item | Spec (measured from the existing cast) |
|---|---|
| Portraits | 8 expressions on a **72 × 82** canvas each, plus `portrait.big` **130 × 99** |
| Full-body poses | **64 × 96** canvas, feet baseline y = 92. `idle` ×2, `talk` ×4, `confident` ×3, `celebrate` ×3, `disappointed` ×3 (the existing frame counts) |
| Packing | The tools pack frames into one atlas plus JSON. Deliver loose frames named `<npc>_<pose>_<nn>.png`. |

### 2c. Poker rivals (table avatars)

Seated around the far half of the oval, displayed about 150 CSS px tall.

| Item | Spec |
|---|---|
| Seat pose canvas | **320 × 320** RGBA, head centre x = 160, table line y = 300 |
| Stills | `idle`, `think`, `bet` (pushing **empty** hands forward), `fold` (cards are a separate layer), `win`, `lose` |
| Loop | `idle` 4 frames |
| Expressions | 8 × 256 × 256, the same as §2a |

### 2d. Fictional golf pros (skins rivals)

| Item | Spec |
|---|---|
| Encounter cast set | As in §2b |
| On-course golfer | Matches `golfer_*.png`: horizontal atlas, frame height **168**, same swing frame list as `golfer_curly.json`. Only needed if rivals are shown swinging; otherwise portraits only. |
| Skins HUD portrait | 8 expressions at 256 × 256 (as in §2a) |

### 2e. Bartenders (bar scale, same density as dealers) [NEW, revision 2]

The bar uses the table camera: the counter runs across the bottom of the stage, and the bartender stands behind it facing the player.

| Item | Spec |
|---|---|
| Pose canvas | **640 × 640** RGBA. Head centre x = 320; **counter line y = 600** (the counter foreground covers everything below). |
| Required stills | `idle`, `serve` (sliding forward, **empty hand**), `pour` (bottle allowed as costume; **no glass**: the game draws the drink), `listen` (leaning on the counter), `refuse` (polite hand up, for the cut-off), `react_tip` |
| Required loops | `idle` 4 frames (wipes the counter or polishes an **empty** cloth), `pour` 4–6 frames, `shake` 4–6 frames (cocktail shaker allowed; nothing in a glass) |
| Expressions | 8 × 256 × 256 (§2a order) |
| Encounter set | §2b cast-scale set (bartenders speak in encounters) |

## 3. Locations

| Asset | Canvas | Notes |
|---|---|---|
| Exterior establishing scene (day and night) | **1920 × 1080** WebP | Matches the rotating backgrounds (`src/assets/backgrounds/bg_*.webp`). Signage as a **separate** RGBA layer (no lettering in the base). |
| Hub header strip | **1920 × 300** WebP | Matches `header_*.webp`. |
| Door card (locked lobby tile) | 1200 × 520 PNG | Matches the `casino_exterior` aspect (585 × 251) at 2×. Also a darkened "locked" silhouette version. |
| Casino floor background | 1920 × 1080 WebP plus a foreground RGBA layer | No baked-in playable objects. |
| Private poker room | 1920 × 1080 background plus a felt (§1 spec) | Stud (White Buffalo), Hold'em (any), Omaha (Morongo). |
| Encounter backdrop (casino scenes) | **737 × 232** WebP | Same as `driving_range.webp` and `clubhouse_lounge.webp`; pixelated scaling. |
| VIP door / invitation | 512 × 768 RGBA | States: `locked`, `unlocking` (4–6 frames), `open`. |
| **Bar back** (per location) [NEW] | 1920 × 1080 WebP | Back bar, shelves, bottles, mirror, lighting. No bartender, no drinks on the counter. |
| **Bar counter foreground** [NEW] | 1920 × 380 RGBA | The front of the counter, with its top edge at y ≈ 60. Sits over the bartender's lower body. |

## 4. UI pieces (art only; all text and numbers are drawn by the game)

| Asset | Canvas | Notes |
|---|---|---|
| Keno board frame | 1600 × 900 RGBA | Empty grid frame for 80 spots (10 × 8). Spots are rendered by the game. |
| Keno ball | 96 × 96 RGBA | Blank ball; the number is drawn by the game. A 6-frame roll loop is optional. |
| Keno draw tube or hopper | 400 × 900 RGBA | Optional. |
| Sportsbook board frame | 1600 × 900 RGBA | Empty rows and a header plate. A "LIVE", "STALE" or "SIMULATED" status lamp in 3 separate states (96 × 48). |
| Relationship panel frame | 900 × 220 RGBA | Matches the `rpg-box` dialogue frame; optional meter track 400 × 24. |
| Poker pot and HUD plates | 360 × 96 RGBA | Main pot and side-pot plates, empty. |
| Skins scoreboard plate | 960 × 160 RGBA | For the golf HUD, empty; also a carry-over token 64 × 64. |

### 4a. Drinks and hospitality [NEW, revision 2]

| Asset | Canvas | Notes |
|---|---|---|
| Drink props | **160 × 200** RGBA each, base of the glass at y = 192, centred x = 80 | Full and empty states per drink. The first set has 14 (backlog DRK-001–014): beer, red wine, champagne flute, martini, margarita, old fashioned, highball, and one signature cocktail per location ×3; non-alcoholic: cola, sparkling water, mocktail, coffee, energy drink, water. |
| Menu board / card frame | 900 × 1200 RGBA | Empty plates for 8–12 rows; the game draws names and prices. |
| Coaster | 96 × 48 | Where the served drink sits on the counter. |

### 4b. Tipping UI [NEW]

| Asset | Canvas | Notes |
|---|---|---|
| Tip tray / toke box | 220 × 160 RGBA | Sits on the felt near the dealer as a prop layer; empty. |
| Tip buttons | 128 × 128 each ×3 tiers (small, medium, large) | Blank chip faces with a heart or star motif; the amount is drawn by the game. States: idle, hover, disabled. |
| Tip flight FX | 6 frames @ 128 × 128 | Chip arc from the player to the tray. |

### 4c. Relationship feedback [NEW]

| Asset | Canvas | Notes |
|---|---|---|
| Heart pips | 48 × 48 ×3 | Up, down and neutral (shown briefly beside the dialogue portrait). |
| Tier badges | 128 × 128 ×5 | Blank emblem per tier; the tier name is drawn by the game. |
| Tier-up banner | 900 × 160 RGBA | Empty plate with sparkle; 6-frame shine loop. |
| "Remembered" toast icon | 64 × 64 | For moments an NPC will remember. |

### 4d. Sponsor mail [NEW]

| Asset | Canvas | Notes |
|---|---|---|
| Mail client frame | 1100 × 760 RGBA | Retro email window, matching the game's UI. Empty header, body and button areas. |
| Fictional sponsor logos | 512 × 256 RGBA each | Sunline Apparel first (it exists in the game as text only), plus 2–3 spares for later sponsors. No real brands. |
| Letterhead strip | 1000 × 140 RGBA per sponsor | Empty plate for the subject line. |
| Status stamps | 320 × 120 RGBA ×6 | Shapes and colours only; the words are drawn by the game. Covers: notice, formal warning, probation, bonus suspended, terminated, reinstated. |
| Confidence gauge | 400 × 64 track + 48 × 48 marker | Shown on the sponsor card. |
| Sponsor rep portrait | Reuse **Mr. Dawson** (`src/assets/characters/sponsor_dawson`) | Already in the cast. A casino-scale set only if he appears at a table. |

### 4e. Condition HUD [NEW]

| Asset | Canvas | Notes |
|---|---|---|
| Condition icon | 64 × 64 ×4 | Sober, buzzed, tipsy, drunk. Readable without colour (a different shape for each). |
| Fatigue icon | 64 × 64 | Shown on the career hub and golf HUD the next week. |
| Water glass prop | 160 × 200 | Offered by the bartender at the cut-off. |

## 5. Golf: hidden courses

| Asset | Canvas | Notes |
|---|---|---|
| Backdrop panorama | **800 × 129** RGB, seamless left–right | Matches `backdrop_*.png` (680–830 × 81–129). Adds new `BackdropId`s (for example `mesa`, `sky_peaks`). |
| Course theme | — | Colour grade values only (code). |
| Alpha scenery props | Height 160–300 RGBA, ground contact at the bottom row | Matches `src/assets/course_alpha/*` (for example mesa rock, saguaro, copper fire pit, sky-club gazebo). |
| Establishing shot / course reveal | 1920 × 1080 WebP | Reveal FX as 6–10 frames, if wanted. |
| Clubhouse | 1920 × 1080 | Optional for the hub. |

## 5a. Casino lobby cards (pack v1, integrated in 0.15.0)

| Asset | Canvas | Status |
|---|---|---|
| Casino panel ×3 | 1200 × 520, no text other than the building signage | **Prototype in game.** White Buffalo and Morongo Sky have a padlock painted into the bottom centre of the art, which stays visible after unlocking. Needs clean replacements without the painted lock. |
| Locked overlay ×2 | 1200 × 520 RGBA (dark tint + padlock) | In game; fine |
| Card frame | 1200 × 520 RGBA | In game; fine |

## 6. Naming conventions

```
<location>_<subject>_<variant>.png         white_buffalo_exterior_night.webp
npc_<id>_<pose>.png / npc_<id>_<loop>_<nn>.png   npc_wb_host_deal_03.png
npc_<id>_face_<expression>.png              npc_wb_host_face_worried.png
table_<game>_felt.png + table_<game>_zones.json  table_stud_felt.png
prop_<name>.png                             prop_shoe_red.png
drink_<id>_<full|empty>.png                 drink_margarita_full.png
mail_<sponsor>_<part>.png                   mail_sunline_logo.png
fx_<name>_<nn>.png                          fx_tip_flight_03.png
ui_<panel>_<part>.png                       ui_keno_board_frame.png
course_<id>_backdrop.png / course_<id>_<prop>.png
```

- Lowercase, ASCII, no spaces.
- **Location ids:** `desert_palms`, `white_buffalo`, `morongo_sky`.
- NPC ids are given in `ASSET_BACKLOG.md`.

## 7. What each delivery ZIP must contain (bible §13)

1. Isolated PNGs or WebPs named as in §6.
2. A `manifest.json` per character or table: canvas, anchors, frame order, fps, zone polygons.
3. A contact sheet (review only), with the source sheet if permitted.
4. Provenance and licence notes.
5. A filled-in visual QA checklist (below).
6. Integration notes: which existing asset, if any, each file replaces. **Existing assets are never replaced without approval.**

### Visual QA checklist (per file)

- [ ] Alpha checked over black, white and magenta: no halo, no checkerboard.
- [ ] Canvas and anchors match the manifest.
- [ ] No baked cards, chips, text, labels or UI.
- [ ] Loop frames are consecutive motion, and the first and last frames join smoothly.
- [ ] The character matches the approved concept (silhouette, palette, outfit).
- [ ] Checked at the target size (300 px dealer, 76 px portrait, 900 px table).

## 8. Music and stings (CONFIRMED feature; details PROPOSED)

| Item | Spec |
|---|---|
| Composition | **Original only.** No commercial recordings, no uncleared samples. Licence and provenance note per file. |
| Delivery | WAV master (48 kHz / 24-bit), **plus** OGG Vorbis (q6) and AAC `.m4a` (192 kbps) for the game |
| Loops | 90–180 s. Seamless loop region given as **start and end samples** in the manifest. The file may carry an intro before the loop start. No fade at the loop end. |
| Loudness | Loops −16 LUFS integrated; stings −14 LUFS; true peak ≤ −1 dBTP |
| Stings | 1.5–4 s; natural decay tail; no loop |
| Naming | `<location>_<room>.ogg/.m4a` (for example `desert_palms_floor.ogg`); stings `<location>_sting_<win_small|win_big|loss>.*` |
| Manifest | `{id, title, bpm, key, loopStartSample, loopEndSample, lufs, gainDb, licence}` per file |
