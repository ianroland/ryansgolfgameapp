# NPC Factory brief: craps regulars' portraits

This brief covers nine portraits for the craps regulars. The owner approved the characters and their lines on 2026-11-24 (see `docs/casino/CRAPS_REGULARS.md`).

The **looks below are proposals**. They follow each regular's approved bio, and the owner can change any of them before or after the art is made.

## Delivery (game side is ready)

- **Where:** drop the files at `src/assets/casino/npcs/regulars/<id>/<face>.png`. The rail uses them automatically, so no code change is needed (`src/ui/casino/regularPortraits.ts`).
- **Faces:** three per regular.
  - `neutral`
  - `happy`: shown after they win on a roll.
  - `groan`: shown after they lose.
- **If faces are missing:** a missing face falls back to `neutral`. Until any file arrives, the rail shows coloured initials.
- **Spec:** the same as every casino portrait (`docs/npc-factory/NPC_SPRITE_REQUIREMENTS.md`):
  - 256 × 256 PNG with real transparency;
  - head and shoulders, eyes about 40% from the top, the same framing for all three faces;
  - 8–16 px of margin, no text, 60 KB or less;
  - 1990s Neo Geo-style pixel art, matching the dealers and servers.
- **Size on screen:** about 28–40 px on the rail, so faces need strong, readable silhouettes and expressions.

## The nine regulars

| id | Name | Casino | Proposed look | Accent colour |
|---|---|---|---|---|
| `gus_pettibone` | Gus Pettibone | Desert Palms | Seventies, retired neon-sign painter. White pompadour, big grin, paint-flecked bowling shirt in pink and teal, a pencil behind one ear. | `#ff4fa8` |
| `dee_ruiz` | Dolores "Dee" Ruiz | Desert Palms | Forties, a blackjack dealer on her night off. Dark hair in a low bun, small hoop earrings, a leather jacket over a plain top, dry half-smile. | `#2fbf71` |
| `wendell_fry` | Wendell Fry | Desert Palms | Late sixties, retired chemistry teacher. Round glasses, neat grey beard, cardigan over a collared shirt, delighted eyebrows. | `#ffd23a` |
| `walt_greer` | Walt Greer | The White Buffalo | Sixties rancher. Weathered face, grey moustache, felt cattleman's hat, denim jacket with a sheepskin collar, very little expression. | `#e0a060` |
| `corinne_bales` | Corinne Bales | The White Buffalo | Fifties, lake-house realtor. Blonde bob, turquoise blazer, a name-badge pin, a confident salesperson's smile. | `#3fb6b0` |
| `toby_fenn` | Tobias "Toby" Fenn | The White Buffalo | Sixties, retired long-haul trucker. Trucker cap, bushy salt-and-pepper beard, flannel shirt, loud open-mouthed laugh. | `#ff9a3c` |
| `victor_sloane` | Victor Sloane | Morongo Sky | Fifties restaurateur. Slicked-back silver hair, black suit with an open collar, a gold signet ring, poised and composed. | `#d9b8ff` |
| `anika_raman` | Anika Raman | Morongo Sky | Thirties poker pro. Shoulder-length dark hair, a dark hoodie under a fitted jacket, cool level gaze, faint smirk. | `#7ff0e6` |
| `rosalind_crane` | Rosalind Crane | Morongo Sky | Seventies, old desert money. Silver updo, double pearl strand, an emerald evening wrap, a warm "darling" smile. | `#e4c35a` |

**Faces:**
- **`happy`:** fits the person, for example Gus beaming, Walt's barely-there nod, Anika's smirk.
- **`groan`:** a mild reaction (wince, sigh, eye-roll), never anger at Ryan.

## Prompt to paste into NPC Factory

> Make portraits for nine casino background NPCs in 1990s Neo Geo pixel-art style, matching our existing dealer and cocktail-server portraits. Each is 256×256 PNG with real transparency: head and shoulders, centred, eyes about 40% from the top, 8–16 px of transparent margin, no text. Use identical framing across each character's three faces: `neutral`, `happy` (just won a bet) and `groan` (just lost a bet; mild, never angry). They display small (28–40 px), so use bold silhouettes and clear expressions.
> Characters (id: description): [paste the table above]
> Deliver as `sprites/<id>/<face>.png`, or as one sheet plus frames JSON. Keep every character fictional and non-stereotyped, with no logos or real brands.
