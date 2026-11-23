# Ryan's Road to the LPGA

A golf RPG in the spirit of New Star Soccer. Ryan is 18, an amateur with a hand-me-down driver. Train her, manage her money, energy and relationships, climb from the Amateur Circuit through the SoCal Pro Series, Q-School and the Epson Tour to an LPGA Tour card, then build a career once she's there. Her clubhouse levels up with her fame and holds every trophy she wins.

Everything runs locally in the browser. There's no backend; saves live in IndexedDB (via Dexie).

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # 400 automated tests (Vitest + fake-indexeddb)
npm run build        # typecheck + production build
npm run build:single # one self-contained HTML file in dist-single/
```

Requires Node 20+.

## Website: ryansgolf.app

`npm run build:site` builds the whole website into `dist-site/`:

| URL | What |
|---|---|
| `/` | Landing page: title art, Play now / Play here (the game in a window on the page, with full screen), features, dev notes |
| `/play/` | The game on its own page |
| `/devnotes.json` | The dev notes (read by the landing page and the in-game "What's new") |

Saves are per domain, so "Play here" and `/play/` share the same career.

### Posting an update

1. Make your changes to the game.
2. Add an entry at the **top** of `devnotes.json` (version, date, title, items tagged `new`, `improved` or `fixed`).
3. Bump `"version"` in `package.json` to match.
4. Push to GitHub (or rebuild and re-upload). The site and the game's title screen show the new notes automatically.

### Hosting (pick one)

**Cloudflare Pages (recommended, free, deploys on every push):**
1. Put this project in a GitHub repository.
2. Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git → pick the repo.
3. Build command `npm run build:site`, output directory `dist-site`. Save and deploy.
4. Project → Custom domains → add `ryansgolf.app` (and `www.ryansgolf.app`). If the domain is registered at Cloudflare this is one click; otherwise Cloudflare shows the DNS records (or nameservers) to set at your registrar.

**Netlify:** same idea. `netlify.toml` already sets the build. New site from Git → pick the repo → Domain management → add `ryansgolf.app`. For a no-Git test, run `npm run build:site` and drag the `dist-site` folder onto app.netlify.com/drop.

`.app` domains only work over HTTPS; both hosts issue the certificate automatically once the domain points at them. `site/_headers` sets caching so updates show up right away while the game's art and code stay cached.

## Courses

The tour travels between six original 9-hole courses (`src/golf/courses/`):

| Course | Par | Character |
|---|---|---|
| Dry Creek Muni | 35 | The home muni: palms, a dry wash, a reservoir and a canal |
| Pacific Bluffs Links | 36 | Clifftop links: fescue, pot bunkers, the ocean down one side. Windy |
| Desert Palms Resort | 36 | Resort golf: wide, palms, waste sand and lakes. Scoreable |
| Lakeside Pines CC | 35 | Pines and water on six holes, including an island green |
| Skyline National | 36 | City parkland: tight, tree-lined, well bunkered |
| Highland Ridge | 36 | Championship test at altitude, used for majors and finales |

Each event's course is set in `src/career/venues.ts`. A course's `theme` sets its backdrop, sky tint and ground colour grade. Its `difficulty` (strokes per 9 holes) and `windiness` change how the simulated field scores. New holes are written as compact specs with `buildHole` (`src/golf/courses/build.ts`), where positions are measured along the hole. `tests/courses.test.ts` checks every hole: the tee and pin are on the right surfaces, yardages are sane, drives have somewhere dry to land, and the AI golfers score sensibly.

## Story: Ryan's look, the cast and encounters

- **Ryan's look** (`src/story/appearance.ts`). She has three hair choices: natural curls (Act I), bald (unlocks in Act II) and the auburn ponytail wig (unlocks in Act III). The visor is chosen separately. If a combination isn't drawn yet, `resolveLook` shows the closest look that is and lists what's missing. On the course Ryan still uses the existing golfer sprite (the wig look), because no swing frames exist yet for the curly or bald looks. Saves from before this system start in Act I with only the natural look; nothing in the story is assumed to have happened.
- **The cast** (`src/story/cast.ts`). Ryan plus 10 characters, each with a stable ID, eight portrait expressions and full-body poses. Cast sheets have seven drawn heads, so "worried" uses the "disappointed" head. Coach Martinez is Coach Dana from the People tab.
- **Encounters** (`src/story/encounters.ts`). Each encounter is data: nodes with lines, then a choice, a skill challenge, or an outcome. The engine re-walks the player's path through the same graph before applying anything. It applies the outcome once (money uses idempotency key `encounter:<id>`) and records the encounter as completed, so a unique one never repeats. Skip jumps to the next decision and never decides anything.
- **One blocking screen at a time** (`src/ui/blocking.ts`). Story dialogs (and their result screens), encounters and every `Dialog` register while they're open. A new encounter only opens when nothing is registered and no tournament screen is up.
- **Art pipeline.** Source sheets live in `art/source_sheets/`.
  - `tools/slice_sheet.py` cuts a sheet into separate transparent sprites with a manifest. It cleans hazy alpha, or keys out white from the border for RGB sheets.
  - `tools/cut_cast.py` cuts the cast sheet by its grid.
  - `tools/pack_characters.py` packs one 256-colour atlas plus JSON per character, and fails if a frame has soft alpha, no transparent corner, or a white fringe.
  - `tests/story.test.ts` decodes the shipped PNGs and checks the transparency again.

## Records: the Albatross Leaderboard

The **Records** tab is the record book. An albatross is a hole finished exactly three under par: a par 5 in 2 or a par 4 in 1. Eagles never count.

- **Where it comes from.** Every finished tournament stores every golfer's strokes on every hole, penalties included, sealed with a checksum. A pipeline subscriber (`src/services/recordsService.ts`) reads those final scores and writes one record per albatross. Each record has the stable ID `alb:<tournament>:<golfer>:r<round>:h<hole>`, so replaying a saved event can never add a second record, award a second trophy or post the news twice.
- **AI golfers.** The hole simulator (`simHole` in `src/career/field.ts`) has a rare "holed the long shot" outcome, scaled by skill. It's part of simulating the hole, never an extra roll after the score is known. A seeded 30-season LPGA batch gives about one albatross per 15,000 par 5s.
- **Views:** Career and Season (shared ranks for ties, most recent first within a tie), All-time log, Courses (filter by course and hole) and My albatrosses (with how Ryan holed it when she played the hole herself).
- **Rewards:** the ALBATROSS! celebration with its own sound (skippable). Clubhouse trophies for the 1st (Albatross Ball) and 5th (Five Albatross Plaque). Achievements Albatross! and Rare Bird. Inbox news.
- **Saves.** The database is now v2, which adds an `albatrosses` table and leaves everything else untouched. On load and after an import, `RecordsService.reconcile()` rebuilds the table from stored results that still pass their checksum. It adds any missing records, removes any that no result supports, and never invents one. v1 save files import and upgrade automatically.
- **Limits for now.** AI golfers only play the events Ryan plays, so "rounds" means tracked rounds. Independent AI careers and retirement are the next phase.

## Career stats

The **Stats** tab is built entirely from the stored tournament records, so it always matches what happened: career totals, a scoring breakdown (low round, par 3/4/5 averages, every hole from eagle to double bogey), prize money by season, a season-by-season table with your final ranking, your record against Kayla Brooks, your record on each course, and a tournament log with a hole-by-hole scorecard for every event. Logic lives in `src/career/careerStats.ts`.

## Casino

The **Casino** tab is Desert Palms, New Star Soccer style. A night there uses one of the week's three activities and 10 energy; once you're in, play as much as you like until next week.

- **Blackjack:** 6 decks, dealer stands on 17, blackjack pays 3:2, double and split. $10–$1,000.
- **Fairway Fortune slots:** three reels, golf symbols, three trophies pays 400×. Returns about 93% over time.
- **Craps:** Pass Line, Don't Pass, Pass Odds (true odds, up to 2×) and the Field. $5–$1,000.

Chips come straight out of the bank when you bet, and winnings go back in when the round settles (all in the ledger, type `casino`). Lose a lot and Mom may call; promise her a break and the casino closes for six weeks. Achievements: **Jackpot!** and **High Roller** (win $10,000 on one bet). Rules and odds live in `src/casino/`.

**Casino art.** Tables, the slot cabinet, dealers, chips and reel symbols are cut from `art/source_sheets/casino_*.png` by `python3 -I tools/cut_casino.py <sliced_dir> src/assets/casino`, which writes palette PNGs (alpha strictly 0/255) and `casino.json` (sizes, anchors, the cabinet's reel `windows` and `buttons`, the lever position). The cabinet is three layers: the live reels sit under the cabinet face, whose reel windows are real transparent holes, with the lever and button hotspots on top. `tests/casinoArt.test.ts` checks the PNGs themselves. The art is presentation only; every bet still goes through `services.casino`.

## Title screen and logo

`art/title_screen_source.png` and `art/logo_source.png` are your title-screen art and logo. The web copies are `src/assets/title_screen.webp` and `src/assets/logo_ryans_road.webp`. The title menu offers **Continue**, **New Career** (asks first and offers a backup) and **Load Career** (from a save file). Arrow keys or the d-pad move, Enter / Space / A choose, or click and tap.

## Sound

The game ships with built-in retro sound effects and chiptune music, all synthesized in the browser, so it works with no audio files. The 🔊 button in the top bar sets music and effects volume; **M** mutes anywhere.

**To use your own sounds,** drop audio files (`.mp3`, `.ogg`, `.wav` or `.m4a`) named after the sound into these folders, then restart `npm run dev` (or rebuild). Any file you add replaces that one built-in sound; the rest stay as they are.

`src/assets/audio/music/`

| File name | Plays |
|---|---|
| `title` | On the title screen (loops) |
| `menu` | Career, shop, clubhouse screens (loops) |
| `course` | During tournaments (loops) |
| `victory` | Reserved for a win jingle |

`src/assets/audio/sfx/`

| File name | Plays when |
|---|---|
| `ui_click`, `ui_confirm`, `ui_back`, `error` | Buttons (normal, main action, cancel), errors |
| `start` | Leaving the title screen |
| `week`, `story` | Next week; a story event pops up |
| `cash`, `buy`, `trophy`, `achievement` | Prize money / sponsor bonus, purchases, trophies, achievements |
| `win`, `missed_cut` | Winning a tournament; missing the cut |
| `meter_start`, `meter_set`, `swing` | Power meter starts, height set, backswing whoosh |
| `hit_driver`, `hit_iron`, `hit_wedge`, `hit_putt` | Impact, by club |
| `bounce_fairway`, `bounce_green`, `bounce_rough`, `bounce_bunker` | Ball lands on each surface |
| `tree`, `splash`, `cup` | Tree hit, water, ball drops in the hole |
| `cheer`, `clap`, `groan` | Crowd: birdie or better, par / close approach, bogey or a penalty |
| `albatross` | The ALBATROSS! celebration |

Example: `src/assets/audio/sfx/cup.mp3` replaces the hole-out sound. Keep effects short (under a second or two) and music loops seamless. Use audio you made or have a licence for. Browsers only allow sound after your first click or key press, which the title screen takes care of.

## How a career plays

**Each week** you get three activities, then press **Next week**:

| Group | Activities |
|---|---|
| Train | Driving range (Power), iron play (Accuracy), short-game area, putting green, gym (Fitness), visualisation (Nerve) |
| Life | Rest, hang out with Jess, call Mom, post a video (once you have some fame) |
| Work | Shifts at the club for money; sponsor appearances once you have a sponsor |

Training costs energy, and gains shrink as a skill gets higher. A coach you get on well with, a swing camp or a sports psychologist make training count for more. Rent comes out every week (more in bigger homes); fall short and Mom spots you, but your form suffers.

**Skill points** come from tournaments. Spend them on +1 to any skill (1 point below 50, rising to 4 points above 85).

**Story events** pop up between weeks: Jess's party, Coach Dana wanting to rebuild your swing, rival Kayla Brooks talking trash, a scholarship offer, an agent, a sponsor deal. Each has two or three choices with real consequences for energy, form, fame, money, skills and relationships.

**The road:**

1. **Amateur Circuit** (8 events a season, the State Women's Amateur is the big one). No prize money, just ranking points and fame.
2. **Turn pro** whenever you're ready. Pros play the **SoCal Pro Series** for prize money.
3. **LPGA Q-School:** Stage I (week 20, $3,500 entry) → Stage II (week 24) → Q-Series (week 28). Top 20 at Q-Series get an LPGA card for next season; 21–45 get Epson Tour status.
4. **Epson Tour:** the top 15 on the season money list graduate to the LPGA.
5. **LPGA Tour:** 14 events including four majors. Finish inside the top 100 on the money list to keep your card.

**Tournaments** are stroke play on Dry Creek Muni, with pins moving each round, a cut on the Epson and LPGA tours, ties sharing prize money, and playoffs for the title. Before each event you choose how to play it:

- **Quick Sim:** her skills, form, energy and nerve decide every hole.
- **Key Holes:** you play four holes a round yourself; the rest are simulated.
- **Full Round:** you play every hole.

On holes you play, Ryan's stats change how the swing feels: low Accuracy adds wobble to full shots, low Short Game to chips and pitches, low Putting to putts, low Power shortens carries, and low Nerve speeds up the power meter when you're contending. Better gear and a good caddie help.

**Fame** grows with good finishes, videos and press. It unlocks gear, sponsors and homes. Fame levels: Unknown → Local Talent → Rising Star → Tour Pro → Star → Legend.

**Clubhouse levels** are homes: Starter Pad → Coastal Condo (fame 25) → Hillside House (fame 50) → Champion's Estate (fame 75). Bigger homes unlock more furniture spots, grander trophy cabinets (3, 6, 8 and 12 shelves) and more energy each week. Decorate with rugs, plants, lamps, sofas, shelves and art. Every tournament win (and your Tour Card) is a trophy you can put on display. Achievements are tracked on the clubhouse Overview.

## Playing a hole

| Control | Keyboard | Gamepad |
|---|---|---|
| Aim | ← → (hold Shift for fine aim) | D-pad / left stick |
| Change club | ↑ ↓ | D-pad up/down |
| Curve (draw / fade) | Z / X | LB / RB |
| Swing | Space: start → set **power** → set **height** | A |
| Topspin / backspin | Hold ↑ / ↓ while setting height | Hold up/down |
| Putt | Space: start → set power | A |
| Fast-forward ball | Hold Space | Hold A |
| Hole flyover | F or ? (or the **? Flyover** button) | Y |
| Pause / sim rest of round | Esc | — |

Swing tips:
- **Power meter:** the red marker shows roughly where to stop for the pin. If you let the meter fall back to zero, the swing is cancelled.
- **Height meter:** low shots stay under the wind and run out; high shots stop quickly.
- **Backspin:** hold ↓ while setting height. Wedges check and spin back on the green.
- **Greens:** arrows show the slope, pointing downhill.
- **Touch screens:** on-screen buttons appear on phones and tablets. Landscape works best.

Water or out of bounds costs one stroke and you replay from the same spot. You pick up at par + 5.

### Golfer sprite

The player golfer comes from a sprite sheet. `art/golfer_sheet_source.png` is the source. `tools/extract_sprites.py` cuts it into a transparent atlas (`src/assets/golfer_atlas.png` and `.json`), anchoring each frame at the feet so the animation doesn't jitter. It also extracts the portrait. To swap in new art with the same layout, run:

```bash
python3 tools/extract_sprites.py art/golfer_sheet_source.png src/assets
```

`src/game/golferAnim.ts` maps game states to frames:

| Game state | Frames |
|---|---|
| Aiming | Idle loop |
| Power meter | Backswing frames, following the bar |
| Height locked | Downswing, with the ball launching on the impact frame |
| Ball in flight | Follow-through, then finish |
| Putting | Putt frames |
| After the shot | Reaction cut-in: celebrate / fist pump / hands on hips / shading eyes |

### Course art

`art/course_kit_source.png` is the course art kit. `tools/extract_course_kit.py` cuts it into:
- a sprite atlas (trees, bushes, flowers, rocks, flags, tee markers, yardage signs, bench, cooler, bin) with ground anchors;
- 64×64 ground tiles (fairway, rough, deep rough, green, sand, water);
- seamless backdrop panoramas.

```bash
python3 tools/extract_course_kit.py art/course_kit_source.png src/assets
```

How the course is drawn:
- **Ground:** `src/game/groundRenderer.ts` draws the ground per scanline at half resolution, sampling the tiles (mirror-tiled and mipmapped) from a per-hole surface map, with bunker lips, water banks and distance haze.
- **Scenery:** `src/game/scenery.ts` places the sprites per hole and depth-sorts them with the golfer and ball. Trees match the physics trees one-to-one.
- **Backdrops:** chosen per hole in `BACKDROP_FOR_HOLE`.

### UI kit and fonts

`art/ui_kit_source.png` is the UI asset pack. `tools/extract_ui_kit.py` cuts out the logo, menu icons, clubhouse interior sprites (couch, lamp, coffee table, bookshelf, plant, paintings, rug, window, shoes, golf bag) and the lake and sunset backdrops:

```bash
python3 tools/extract_ui_kit.py art/ui_kit_source.png src/assets
```

The mockups the UI follows are in `art/mockup_course.png` and `art/mockup_clubhouse.png`.

Fonts (both SIL Open Font License, bundled through Fontsource):
- **Jersey 15** for titles, tabs, buttons and big numbers;
- **Tiny5** for body text and HUD labels.


## Architecture

| Concern | Where | Notes |
|---|---|---|
| Names and tuning | `src/career/config.ts` | Game title, tours, schedules, Q-School, fame levels. All real-world names live here, so they can be swapped in one place. |
| Career RPG rules | `src/career/engine.ts` | Pure functions over `CareerState`: activities, skill points, turning pro, shop, entering events, applying results, advancing the week, season rollover, achievements. Each returns the next state plus money operations with idempotency keys. |
| Stats → golf | `src/career/stats.ts` | Sim rating and the shot modifiers used on holes you play. |
| Fields and sim golf | `src/career/field.ts` | Persistent player pools per tour (the same names recur; your rival moves up with you), and the statistical hole model. |
| Tournament engine | `src/career/tournament.ts` | Schedule, eligibility, rounds, cut, playoffs, standings, payouts, ranking points. Results are checksum-sealed and re-derived on validation. |
| Story events | `src/career/stories.ts` | Conditions, choices and effects. Add more here. |
| Shop | `src/career/shop.ts`, `src/catalog/items.ts`, `src/catalog/properties.ts` | Gear, lifestyle, furniture, homes and their zones. |
| Money (authoritative) | `src/services/economyService.ts` | Ledger is the source of truth; the balance snapshot is written in the same transaction; unique idempotency index. |
| Career service | `src/services/careerService.ts` | Runs each engine step inside one IndexedDB transaction together with its money, so career state and the ledger can't disagree. |
| **Tournament → career** | `src/services/tournamentPipeline.ts` | Validate → prize money → records → career consequences → trophies → processed record, in one transaction; notify after commit. Reprocessing never pays or awards twice. |
| Trophy awards | `src/services/trophyAwardService.ts` | One trophy per tournament (`trophy:<golfer>:<tournament>`); only through the pipeline. |
| Room editor, store, trophy display | `src/services/roomService.ts`, `storeService.ts`, `trophyDisplayService.ts` | Draft/commit layouts with optimistic concurrency; duplicate-safe purchases; placements keyed by trophy. |
| Persistence | `src/persistence/db.ts`, `schemas.ts` | Versioned Dexie schema; every write validated with Zod in Dexie hooks. |
| Saves | `src/services/saveService.ts` | Export/import with version checks; rows validated before an all-or-nothing replace; balances rebuilt from the ledger. |
| Scenes | `src/game/RoundScene.ts`, `ClubhouseScene.ts` | Phaser 4 views: the behind-the-golfer course renderer and the clubhouse room. |
| UI | `src/ui/**` | Career hub, schedule, shop, people, clubhouse, tournament flow, story dialogs. |

## Notes and known limits

- **Real names and marks.** "LPGA", "Epson Tour" and "Q-School" are trademarks of their owners, and the logo art includes the LPGA mark and a Nike swoosh. Fine for a personal project; swap the strings in `src/career/config.ts` and the marks in the art before any public release. Tournament names, players and sponsors are invented.
- **One course.** Every event is played at Dry Creek Muni (9 holes, par 35) with different pins each round. More courses can be added in `src/golf/courses/`.
- **New save format.** This is a new game, so it uses a new database (`ryans-road-to-the-lpga`). Old World Tour Golf: Underground saves aren't carried over.
- **Checksum.** The result checksum guards integrity against accidental or casual edits. It isn't anti-cheat: everything runs client-side.
- Furniture can't be resold yet.

## Ryan art checks

New Ryan sprites are checked against `ART_DIRECTION.md` (ryan-art-v1) before they go anywhere near the game:

```
python3 -I tools/check_ryan_art.py <folder> --phases p1 --only swing --review <out_dir>
python3 -I tools/test_check_ryan_art.py   # self-test on synthetic frames
```

FAIL means the frame can't be used: missing, not 320 × 256 RGBA, partial alpha, not resting on y = 240, trail heel off x = 112 at address, a planted foot sliding (heel ±2 px, lead toe ±3 px through impact), a drawn ball, or an exact duplicate. Feet are measured from the soles touching the ground only, so shoe outlines and cuffs above the ground don't count. WARN covers very similar poses (a small takeaway is expected to warn) and feet moving in release, follow-through and finish. Club shape and visibility, camera angle and costume still need a person: `--review` writes one strip per phase for that.
