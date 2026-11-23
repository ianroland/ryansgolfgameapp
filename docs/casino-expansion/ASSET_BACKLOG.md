# Asset backlog and production checklist (revision 3)

- **Sources:** `SPRITE_ASSET_BACKLOG.csv` (handoff), the repo audit, and bible v0.2 (tipping, drinks, sponsors).
- **Sizes:** from `ASSET_SPEC.md`.
- **Nothing here exists as a production asset unless "Current coverage" says so.**

- **Priority:** P0 blocks its gate; P1 is needed for the gate; P2 is polish.
- **Gate:** the slice or gate that first needs the asset (see `ROADMAP.md`).
- **Status:**
  - `REUSE`
  - `REUSE_OR_REPAIR`
  - `TO_DESIGN`: concept approval first
  - `TO_CREATE`: the spec is final once approved

## Matrix

### Slice 1: Desert Palms Regulars (unlocks, lobby, tipping)

| ID | Pri | Asset | Deliverables (exact) | Coverage | Blockers |
|---|---|---|---|---|---|
| ENV-001 | P0 | Camera reference | `docs/casino-expansion/ref_table_camera.png` | **Exists** | — |
| UI-008 | P0 | Lobby door cards | 3 × 1200×520 panels + 2 locked overlays + frame | **In game (pack v1, prototype).** WB and MS panels have a **painted padlock** at the bottom centre that shows even when unlocked. | Clean WB and MS panels without the lock |
| TIP-001 | P0 | Tip tray / toke box | 220×160 RGBA | None | — |
| TIP-002 | P0 | Tip buttons | 3 × 128×128 (small, medium, large) × 3 states | None | Q14 (denominations; art is blank either way) |
| TIP-003 | P1 | Tip flight FX | 6 f @ 128×128 | None | — |
| REL-001 | P0 | Heart pips | 3 × 48×48 (up, down, neutral) | None | — |
| REL-002 | P0 | Tier badges | 5 × 128×128 | None | Q4 (tier display) |
| REL-003 | P1 | Tier-up banner | 900×160 + 6 f shine | None | — |
| REL-004 | P2 | "Remembered" icon | 64×64 | None | — |
| UI-003 | P1 | Choice panel | Frame 900×220; button plate 600×72 × 3 states; meter 400×24 | CSS `rpg-box` works meanwhile | Q4 |

### Slice 2: Last Call (bar, drinks, condition, sponsors)

| ID | Pri | Asset | Deliverables (exact) | Coverage | Blockers |
|---|---|---|---|---|---|
| NPC-007 | P0 | **Desert Palms bartender** | Stills idle, serve, pour, listen, refuse, react_tip; loops idle 4 f, pour 4–6 f, shake 4–6 f — all 640×640; 8 faces 256×256; big portrait 512×512; encounter cast set (§2b) | None | Character concept + name (PROPOSED) |
| BAR-001 | P0 | Desert Palms back bar | 1920×1080 WebP | None | — |
| BAR-002 | P0 | Desert Palms counter foreground | 1920×380 RGBA | None | — |
| DRK-001–014 | P0 | Drink props | 14 × 160×200, full + empty each: beer, red wine, champagne, martini, margarita, old fashioned, highball, Desert Palms signature, cola, sparkling water, mocktail, coffee, energy drink, water | None | Menu list (PROPOSED) |
| DRK-015 | P1 | Menu card frame | 900×1200 | None | — |
| DRK-016 | P2 | Coaster | 96×48 | None | — |
| CND-001 | P0 | Condition icons | 4 × 64×64 (distinct shapes) + fatigue 64×64 | None | — |
| MAIL-001 | P0 | Mail client frame | 1100×760 | Inbox is plain text today (`CareerHub.tsx`) | Q19 |
| MAIL-002 | P0 | Sunline Apparel logo | 512×256 (fictional) + letterhead 1000×140 | Text only in game | — |
| MAIL-003 | P0 | Status stamps | 6 × 320×120 (notice, formal warning, probation, bonus suspended, terminated, reinstated); no words | None | — |
| MAIL-004 | P1 | Confidence gauge | Track 400×64 + marker 48×48 | None | — |
| MAIL-005 | P2 | Spare sponsor logos | 3 × 512×256 + letterheads | None | Q21 |
| NPC-010 | REUSE | Sponsor rep | Mr. Dawson cast atlas | **Exists** (`src/assets/characters/sponsor_dawson.*`) | — |

### Gate 4+: Keno, events, existing dealers

| ID | Pri | Asset | Deliverables | Coverage | Blockers |
|---|---|---|---|---|---|
| UI-001 | P0 | Keno board | Frame 1600×900; ball 96×96 blank; roll 6 f optional; hopper 400×900 optional | None | — |
| ENC-001 | P1 | Casino encounter backdrop (Desert Palms floor and bar) | 2 × 737×232 WebP | Only range and lounge exist | Q12 |
| NPC-006 | P1 | Existing dealer upgrades | See the table below | Partial | — |
| FX-001 | P2 | Dealer loops | Real 2–4+ frame loops | Velvet, Stick and Monique yes; Waifu and Winston no | — |

### Gate 5: White Buffalo, poker, skins

| ID | Pri | Asset | Deliverables | Coverage | Blockers |
|---|---|---|---|---|---|
| ENV-002 | P0 | WB exterior | Day and night 1920×1080; signage layer; header 1920×300 | None | Concept |
| ENV-003 | P0 | WB floor | 1920×1080 + foreground | None | Concept |
| NPC-001 | P0 | WB dealer | §2a full set | None | Concept, game |
| NPC-002 | P0 | Old-guard poker host | §2a + §2b sets | None | Concept, script |
| NPC-008 | P0 | **WB bartender** | As NPC-007 | None | Concept |
| BAR-003/004 | P0 | WB back bar + counter | 1920×1080 + 1920×380 | None | Concept |
| DRK-017 | P1 | WB signature drink | 160×200 full + empty | None | — |
| UI-004 | P0 | VIP door + invitation | Door 512×768 (locked / unlocking 4–6 f / open); card 900×600 | None | — |
| ENV-006 | P1 | Stud room | 1920×1080 + felt 1800×720 + zones | None | Q5 |
| NPC-004 | P1 | Poker rivals ×5 | 6 seat stills + idle 4 f @ 320×320; 8 faces | None | Archetypes |
| UI-005/006 | P1 | Cards, chips, pot HUD | Card back 256×360; chips 6 × 128×128; button and bring-in markers 96×96; pot plates 360×96 | Cards CSS; chips 52×51 | Keep CSS cards? |
| GOLF-001 | P1 | Outlaw Nine | Backdrop 800×129; 4–6 props; reveal 1920×1080 | None | Concept |
| GOLF-003 | P1 | Skins overlay | Plate 960×160; carry token 64×64; burst 6 f | None | Q9 |
| NPC-005 | P1 | Fictional pros ×2 | §2b set; faces 256; optional golfer atlas h168 | None | No real likenesses |
| ENV-008 | P1 | Hold'em room | 1920×1080 + felt + zones | None | — |

### Gate 7: Morongo Sky, sportsbook

| ID | Pri | Asset | Deliverables | Coverage | Blockers |
|---|---|---|---|---|---|
| ENV-004/005 | P0 | MS exterior and floor | As ENV-002/003 | None | Concept |
| NPC-003 | P0 | VIP host | §2a + §2b | None | Concept |
| NPC-009 | P0 | **MS mixologist** | As NPC-007 | None | Concept |
| BAR-005/006 | P0 | MS bar back + counter | As BAR-001/002 | None | Concept |
| DRK-018 | P1 | MS signature drink | 160×200 | None | — |
| ENV-007 | P1 | VIP poker room | As ENV-006 | None | — |
| GOLF-002 | P1 | The Sky Club | 2 backdrops 800×129; props; reveal | None | Concept |
| UI-002 | P0 | Sportsbook board | Frame 1600×900; lamps 3 × 96×48 | None | SB0 |
| FX-002 | P2 | Door reveal | 6–10 f @ 512×768 | None | — |

### Existing dealer gaps (NPC-006)

| Dealer | Exists | Gap |
|---|---|---|
| Velvet Vega | Animation atlas 211×200 (idle 10, deal 1, win 3, special 3, loss 6); 1 portrait 170×196 | 8 faces @ 256; a card-free deal loop; a `react_tip` pose |
| Stick Lady | Animation atlas 195×148; 8 faces @ 240×248 | `react_tip`; encounter cast set if she speaks in events |
| Madame Monique | Atlas 200×210 (idle 5, spin 9, emote 6); 4 faces @ 152×160 | 4 more faces; `react_tip` |
| Waifu | 4 stills (different canvases); 8 framed faces 102×111 | 640×640 canvas, idle and deal loops, unframed 256 faces, `react_tip` |
| Winston | 4 stills; 8 framed faces 102×111 | Same as Waifu, **plus a card-free deal pose** |

**Slice 1 needs none of these.** Tip reactions use the existing faces and poses (Waifu/Winston `present`, Velvet `win`, Stick `call`, Monique `emote`). Existing art is never replaced without approval.

### Music (CONFIRMED feature; tracks PROPOSED) [revision 3]

| ID | Pri | Cue | Style brief (PROPOSED) | Deliverables |
|---|---|---|---|---|
| MUS-DP-1…4 | P1 (AU2) | Desert Palms lobby (main theme), floor, bar, VIP | 1990s smooth jazz and funk, Rhodes, slap bass, retro synth, 92–100 BPM | 4 loops per §8 |
| MUS-DP-S1…3 | P1 (AU2) | Desert Palms stings: win small, win big, loss | Same palette | 3 stings |
| MUS-WB-1…4 + S1…3 | P1 (AU3) | White Buffalo cues and stings | Desert blues, slide guitar, organ, cinematic percussion, 68–80 BPM | 4 loops + 3 stings |
| MUS-MS-1…4 + S1…3 | P1 (AU4) | Morongo Sky cues and stings | Electronic lounge and house, luxury synth, 118–124 BPM | 4 loops + 3 stings |

All original. No commercial recordings.

## Top 10 to commission next (exact sizes)

1. **TIP-001/002 tipping kit:** tray 220×160; 3 tip buttons 128×128 × 3 states.
2. **REL-001/002 relationship feedback:** heart pips 3 × 48×48; tier badges 5 × 128×128.
3. **UI-008 lobby door cards:** 3 × 1200×520, plus 2 locked silhouettes.
4. **NPC-007 Desert Palms bartender:**
   - 6 stills, and loops (idle 4 f, pour 4–6 f, shake 4–6 f), all 640×640.
   - 8 faces 256×256; portrait 512×512.
   - Encounter cast set.
5. **BAR-001/002 Desert Palms bar:** back 1920×1080; counter foreground 1920×380.
6. **DRK-001–014 drinks:** 14 × 160×200, full and empty.
7. **CND-001 condition and fatigue icons:** 5 × 64×64.
8. **MAIL-001–003 sponsor mail:** frame 1100×760; Sunline logo 512×256 + letterhead 1000×140; 6 stamps 320×120.
9. **UI-001 Keno board:** frame 1600×900; ball 96×96.
10. **ENV-002/003 White Buffalo:** exterior day and night 1920×1080, signage layer, header 1920×300; floor 1920×1080 + foreground. These are needed soon: the $100K unlock is reachable fairly early in a career.

## Production checklist for ChatGPT

Paste this into every batch request:

> **Target:** Ryan's Road to the LPGA, a 32-bit / Neo Geo-inspired painted pixel style. The palette is deep purple, emerald felt and warm gold, plus approved location palettes.
>
> **Camera:**
> - Casino tables: a wide, foreshortened oval from the player's seat, with the dealer behind the far rail. **Not top-down.**
> - Bars: the same eye level, with the bartender behind the counter facing the player.
>
> **Deliver:**
> - Isolated **RGBA PNGs with real transparency**: no checkerboard, gradient or halo.
> - **Nothing playable painted in:** no cards, chips, glasses or drinks on the counter, no text, labels, prices, logos with words, or buttons.
> - Every pose and frame of a character on the **same canvas**, with the same head-centre x and the same desk or counter line.
> - Loops as **real consecutive frames**, not different poses.
> - Fictional people and fictional brands only.
>
> **Per file:** the exact size listed. **Per batch:** `manifest.json` (canvas, anchors, frame order, fps, zone polygons), a contact sheet as a separate file, provenance/licence notes, and the QA checklist (`ASSET_SPEC.md` §7).

**Batch order:**

| Batch | What | Notes |
|---|---|---|
| 1 | Tipping kit, relationship feedback, lobby door cards | Slice 1 |
| 2 | Desert Palms bartender **concept** (full figure + 8 thumbnails) | For approval only |
| 3 | Bartender production set; bar back + counter; 14 drinks; condition icons; sponsor mail kit | Slice 2 |
| 4 | Keno board; casino encounter backdrops | Gate 4 |
| 5 | White Buffalo concepts | Exterior, floor, bar, dealer, old-guard host, bartender: approval only |
| 6 | White Buffalo production + poker rivals + Stud room | Gate 5 |
| 7 | Outlaw Nine + fictional pros | Gate 5c |
| 8+ | Morongo Sky, sportsbook board, FX | Gate 7 |

**Acceptance:** each file is checked in the game at its target size before it's called production-ready. Concept sheets and automated crops are never used as production sprites.
