# Sportsbook: design document

- **Status:** proposed, for approval. **No implementation and no final assets.**
- **Game:** Ryan's Road to the LPGA, v0.17.0.
- **Scope:** a self-contained feature. It doesn't change golf scoring, any existing casino game, casino unlocks or the shared bankroll rules.

Every number in this document (season lengths, ratings, limits, house edge, probabilities) is **PROPOSED** and will live in one config file.

---

## 1. Goals and principles

1. **A living fictional sports world.** Four leagues, 32 teams and hundreds of players with careers that run through rookie seasons, prime, decline and retirement, all across Ryan's golf seasons.
2. **Fictional only:**
   - No real leagues, teams, players, logos or feeds.
   - Results come from fictional attributes through a deterministic simulation.
   - Money is the game's own currency; there's no real-money anything.
3. **Deterministic and testable.**
   - Every game, draft, trade, injury and retirement comes from a saved seed plus the date.
   - The same save gives the same results on any machine.
   - Reloading can't change a result.
4. **Fair and transparent betting.**
   - Odds come from the same model that plays the games, plus a disclosed house margin.
   - Nothing else influences odds or outcomes: no NPC relationship, drink effect, tip, Ryan's golf, luck stats or difficulty.
5. **Self-contained.**
   - Its own module and save tables.
   - The only touch points are: the shared ledger (bets and payouts); the casino lobby and phone UI (entry points); the game calendar (time); and NPC Factory content (sportsbook personalities, at build time).
6. **Cheap to run.**
   - The simulation only runs when game time advances.
   - Box scores are rebuilt from the seed on demand instead of being stored.

## 2. Architecture

```
src/sports/                       pure, no React, no I/O (unit-testable)
  config.ts        every tunable number (PROPOSED)
  universe.ts      leagues, teams, initial generation from a seed
  names.ts         original name generator (player, coach, venue)
  players.ts       attributes, development, aging, injuries, retirement
  sim/<sport>.ts   game simulation per sport (baseball, basketball, football, hockey)
  schedule.ts      season schedules, calendar mapping
  season.ts        standings, tiebreakers, playoffs, awards, champions
  offseason.ts     draft, rookies, trades, free agency, retirements, renewal
  odds.ts          win probabilities → lines (moneyline, spread, total), margin
  bets.ts          bet slips, parlays, settlement (pure)
  news.ts          templated news items from events (original templates)
  history.ts       champions, awards, records, retired legends

src/services/sportsService.ts     advances the world with game time; reads and writes save tables
src/services/sportsbookService.ts places and settles bets through EconomyService (ledger)
src/ui/sports/                    phone app + sportsbook lounge screens
```

**The data flow:**
1. **Ryan's career week advances** (existing career flow). `sportsService.advanceTo(gameDate)` then simulates every scheduled game up to that date, in date order.
   - It writes compact results and standings.
   - It emits news items.
   - It runs off-season steps when a league's calendar reaches them.
2. **Bet settlement.** `sportsbookService.settle()` settles any open tickets whose games are final.
   - It posts payouts through `EconomyService.post` (new ledger types `sports_bet` and `sports_payout`).
   - Idempotency keys are `bet:<ticketId>` and `payout:<ticketId>`.
3. **The UI** reads from the save tables. Box scores and play-by-play are regenerated from (seed, gameId) on demand.

**Determinism.** One RNG stream per purpose, derived as `hash(worldSeed, purpose, id)`.
- Game: `game:<gameId>`
- Draft: `draft:<league>:<season>`
- Injury: `injury:<playerId>:<date>`
- Generation, trades, retirements: their own streams.
- Each result depends only on the world state at that date plus its stream. A replay with the same seed reproduces everything, which the tests rely on.

## 3. Calendar: one game clock

- **Ryan's career calendar** is the master clock (seasons and weeks, already in the game).
- **Sports dates:**
  - Each Ryan week = 7 sports days.
  - A Ryan season = one sports year, with the four leagues staggered across it the way real sports are.
- **Proposed league calendars** (sports-year weeks; regular-season games per team in brackets):

| League | Sport | Regular season | Playoffs | Off-season events |
|---|---|---|---|---|
| GDC | Baseball | weeks 10–35 (56 games) | weeks 36–38 | Draft week 40 |
| CCL | Basketball | weeks 36–3 next year (42 games) | weeks 4–6 | Draft week 8 |
| IGL | Football | weeks 30–47 (14 games) | weeks 48–50 | Draft week 2 |
| FHL | Hockey | weeks 34–9 next year (42 games) | weeks 10–12 | Draft week 14 |

- **Season lengths** are compressed from real sports (8 teams; fewer games) to keep the world small and readable.
- **Off-season:** trades, free agency and retirements happen in each league's off-season window.

## 4. Leagues and teams (APPROVED 2026-11-23: nationwide)

The nationwide alignment supersedes the earlier fictional-city proposal.

- **Team IDs** are stable franchise ids (league + nickname). A city change only updates the display name.
- **Team identity in the UI:** colour squares. League logos and team crests are deferred.
- **Clearance:** these names are fictional and **not legally cleared** for commercial release. Worth checking first: *Phoenix Firebirds*, which was the name of a real minor-league baseball team, and *Oklahoma City Thunderherd*, which sits close to an existing Oklahoma City franchise name.

### Grand Diamond Circuit (GDC): baseball, 42 games (6 per opponent)

| Team ID | Official name | City | Colours |
|---|---|---|---|
| `gdc_lamplighters` | Boston Lamplighters | Boston, MA | navy / brass |
| `gdc_ore_haulers` | Pittsburgh Ore Haulers | Pittsburgh, PA | copper / charcoal |
| `gdc_gilas` | Tucson Gilas | Tucson, AZ | orange / black |
| `gdc_paddlers` | St. Louis Paddlers | St. Louis, MO | teal / white |
| `gdc_firebirds` | Phoenix Firebirds | Phoenix, AZ | red / gold |
| `gdc_loons` | Minneapolis Loons | Minneapolis, MN | forest green / cream |
| `gdc_millers` | Milwaukee Millers | Milwaukee, WI | wheat / brown |
| `gdc_kingfishers` | Charleston Kingfishers | Charleston, SC | royal blue / orange |

### Crown Court League (CCL): basketball, 28 games (4 per opponent)

| Team ID | Official name | City | Colours |
|---|---|---|---|
| `ccl_voltage` | Los Angeles Voltage | Los Angeles, CA | electric blue / black |
| `ccl_monsoon` | Miami Monsoon | Miami, FL | silver / storm purple |
| `ccl_anchors` | Baltimore Anchors | Baltimore, MD | navy / red |
| `ccl_jackrabbits` | Denver Jackrabbits | Denver, CO | sage / tan |
| `ccl_comets` | Chicago Comets | Chicago, IL | purple / white |
| `ccl_dustdevils` | Las Vegas Dustdevils | Las Vegas, NV | sand / rust |
| `ccl_forge` | Detroit Forge | Detroit, MI | steel / orange |
| `ccl_satellites` | Seattle Satellites | Seattle, WA | black / cyan |

### Iron Gridiron League (IGL): football, 14 games (2 per opponent)

| Team ID | Official name | City | Colours |
|---|---|---|---|
| `igl_thunderherd` | Oklahoma City Thunderherd | Oklahoma City, OK | brown / gold |
| `igl_undertow` | Jacksonville Undertow | Jacksonville, FL | sea green / navy |
| `igl_rockslides` | Salt Lake City Rockslides | Salt Lake City, UT | red rock / grey |
| `igl_harvesters` | Omaha Harvesters | Omaha, NE | gold / green |
| `igl_highlanders` | Asheville Highlanders | Asheville, NC | tartan green / white |
| `igl_squall` | New Orleans Squall | New Orleans, LA | aqua / grey |
| `igl_smokejumpers` | Portland Smokejumpers | Portland, OR | orange / black |
| `igl_ironclads` | Cleveland Ironclads | Cleveland, OH | iron / crimson |

### Frostline Hockey League (FHL): hockey, 28 games (4 per opponent)

| Team ID | Official name | City | Colours |
|---|---|---|---|
| `fhl_polars` | Anchorage Polars | Anchorage, AK | white / ice blue |
| `fhl_narwhals` | Providence Narwhals | Providence, RI | teal / silver |
| `fhl_sawblades` | Buffalo Sawblades | Buffalo, NY | green / steel |
| `fhl_borealis` | Duluth Borealis | Duluth, MN | green / violet |
| `fhl_floes` | Portland Floes (Maine) | Portland, ME | white / navy |
| `fhl_yetis` | Bozeman Yetis | Bozeman, MT | white / purple |
| `fhl_rivets` | Toledo Rivets | Toledo, OH | steel / yellow |
| `fhl_snowowls` | Burlington Snowowls (Vermont) | Burlington, VT | white / gold |

## 5. Players

- **Rosters** (per team, proposed):

| League | Active roster | Prospects |
|---|---|---|
| Baseball | 16 | 4 |
| Basketball | 10 | 3 |
| Football | 24 starters + depth | 5 |
| Hockey | 18 | 4 |

- **About 680 active players** across the four leagues, plus prospects.
- **Identity:**
  - Original generated names (a first-name and surname bank, as with golf competitors).
  - Age, position, handedness or shooting side, birthplace (fictional city), and a personality tag (clutch, streaky, iron man, injury-prone, leader, hothead).
- **Attributes:** 0–100, sport-specific, with 4–6 per position. For example:

| Sport | Attributes |
|---|---|
| Baseball | contact, power, discipline, speed, fielding; pitchers: velocity, control, stamina |
| Basketball | shooting, inside, playmaking, rebounding, defense |
| Football | the main skill for the position, speed, strength, awareness |
| Hockey | skating, shooting, passing, checking; goalies: reflexes, positioning |

- **Ratings shown to players:** an overall per player (star rating).
- **Hidden:** potential and peak age.
- **Development and aging:** a curve per sport with a peak age (proposed):

| Sport | Peak age |
|---|---|
| Basketball | 27 |
| Baseball and hockey | 28 |
| Football | 26 |

  - Each season, players move toward their potential before the peak and decline after it, plus seeded variance.
  - A "breakout" or "bust" event is possible (rare).
- **Injuries:**
  - Each game draws a small injury chance per involved player, scaled by sport and by the injury-prone tag.
  - Length is days to a season, from a distribution.
  - Injured players sit out. News is generated, and team strength (and so odds) reflects it.
- **Retirement:** a chance from age, decline and injury history, decided in the off-season.
  - Great careers get a "legend" history entry.
  - Retired players stay in history (name, career totals, awards).

## 6. Seasons, playoffs, history

- **Schedules:** balanced, with every team meeting every other team equally, and home and away alternating. Generated per season from the league seed.
- **Standings:** win %, then tiebreakers (head-to-head, then point or run difference, then a seeded coin flip). Hockey uses points (2 for a win, 1 for an overtime loss).
- **Playoffs:** top 4 per league.

| League | Format |
|---|---|
| Basketball, hockey | Best-of-5 semis, best-of-7 final |
| Baseball | Best-of-5 / best-of-7 |
| Football | Single games |

- **Championship trophy:** each league has its own fictional trophy name.
- **Awards:** MVP, Rookie of the Year, top defender/pitcher/goalie, Comeback Player.
- **History:** champions, awards, records (season and career), and retired legends. All of it persists across Ryan's career and is browsable in the phone app.

## 7. Off-season: draft, rookies, trades, free agency

- **Draft:**
  - In reverse standings order, with no lottery in v1.
  - Two rounds per league.
  - Prospects are generated from the draft seed with hidden potential, and rookies join rosters.
- **Trades:**
  - A few per off-season per league, from simple team-need logic (a team weak at a position trades surplus for need).
  - Each trade is checked so overall value is close.
  - Results in news.
- **Free agency:**
  - Contracts in years only; there are no salaries in v1, which keeps it simple.
  - Expiring players re-sign or move, weighted by age and team need.
- **Roster limits:** enforced. Undrafted generated players fill gaps.

## 8. News and following teams

- **News items** come from events using original templates, so there's no AI and no network:

| Kind | Examples |
|---|---|
| Results | Upsets, blowouts, walk-offs, overtime winners |
| Milestones | 500th career hit, hat tricks, triple-doubles |
| Players | Injuries and returns, breakouts, slumps |
| Off-season | Trades, draft picks, retirements, award winners |
| Seasons | Playoff clinches, champions |

- **Each item:** a headline, a 1–3 sentence body, an image tag (a generic news picture) and team crests.
- **Follow teams:** Ryan can follow up to 4 teams. Followed teams get priority news and a weekly digest in the phone inbox.
- **Volume control:** at most N items per week (proposed 8), favouring followed teams and big events.

## 9. Sportsbook locations

- **One sportsbook lounge per casino**, reached from the casino floor (a "Sportsbook" tab beside the games):

| Casino | Lounge | Opens |
|---|---|---|
| Desert Palms | Palms Sports Bar: big tube TVs and neon | Open from the start |
| The White Buffalo | Firelight Lounge: wood, copper, a stone fireplace | With the casino's existing $100K unlock |
| Morongo Sky | Skybox: purple neon, glass, a skyline view | With the casino's existing $1M unlock |

- **One shared bankroll and one ticket book** across all three. The lounges differ in art and personality only, not in odds.
- **Optional:** a later "VIP board" at Morongo Sky with higher limits.

## 10. Phone interface

An in-game phone opens from the HUD anywhere. Its apps:

| App | What it shows |
|---|---|
| **Scores** | Today, yesterday and this week per league; final and upcoming; tap a game for its box score (rebuilt from the seed) |
| **Standings** | Per league, with playoff picture and brackets |
| **News** | The feed (followed teams first) and the weekly digest |
| **Teams** | Roster, injuries, schedule, history; follow and unfollow |
| **Tickets** | Open and settled bets, potential payouts, results per leg |

- **Placing bets:** on the phone, view only in v1. Bets are placed in a lounge, which keeps betting tied to casino visits like the other games.
- **Proposed decision:** allow phone betting later behind a setting.

## 11. Betting mechanics

**Markets (pre-game only in v1; no live betting):**
- **Moneyline:** who wins.
- **Spread:** baseball run line ±1.5, hockey puck line ±1.5, basketball and football points.
- **Totals:** over/under.
- **Futures** (later phase): champion and MVP.

**Odds:**
- **Fair probability:**
  1. The model estimates each team's win probability from the same team-strength numbers the simulation uses: active roster ratings, injuries, home advantage, recent form.
  2. This is calibrated with a quick pre-simulation of N seeded "shadow" games. Those use a separate RNG stream, so they never consume the real game's randomness.
- **Margin:**
  - The house adds a margin (proposed 4.5% overround). Lines are rounded to American odds steps.
  - Spreads and totals use the median of the shadow results, priced at about −110 both sides.
- **Shown to players:** American odds (+150 / −120) with a toggle for decimal. The implied-probability tooltip includes the house margin.
- **Never affects odds or outcomes:** NPC relationships, drink effects, tips, Ryan's golf results or stats, lounge or casino, or difficulty. Enforced with a boundary test, as the casino has today.

**Single bets:**
- **Stakes:** proposed $5 minimum. Maximums: $1,000 per bet at Desert Palms, $2,500 at White Buffalo, $10,000 at Morongo Sky.
- **Ticket:** stores the line and odds *as offered*, which locks them.
- **Settlement:** at final, through the ledger.
- **Pushes** (an exact spread or total) refund the stake.

**Parlays:**
- **Legs:** 2 to 6, from different games. Same-game parlays are excluded in v1 because they're correlated.
- **Payout:** the product of the legs' decimal odds.
  - A pushed leg drops out and the parlay is recalculated without it.
  - A void leg (game postponed) also drops out.
  - If every leg pushes or voids, the stake is refunded.
- **Maximum payout cap:** proposed 100× stake, or $50,000.

**Ledger:**
- Placing a bet posts `sports_bet` (−stake, key `bet:<ticketId>`).
- Settling posts `sports_payout` (+return, key `payout:<ticketId>`).
- Ticket state is saved in the same transaction as the ledger posting, as dealer tips already are.
- A double click or reload can never charge or pay twice.

**Responsible design:**
- In-game currency only; no real-money purchase anywhere.
- A ticket history with net results is always visible.
- Optional session reminders, using the existing casino tone.

## 12. NPC integration through NPC Factory

- **Sportsbook personalities are authored in NPC Factory:**
  - One clerk per lounge (an RPG portrait with 6 expressions).
  - Optional regulars: a stats nerd, a superstitious fan, a rival bettor.
- **Their content:** they use the agreed `npc-pack` contract (`docs/npc-factory/`). Categories: `sportsbook_clerk`, `patron`.
- **What they react to:**
  - Sports events: `sports.game_final`, `sports.upset`, `sports.champion_crowned`, `sports.player_retired`, …
  - Ryan's tickets: `sports.ticket_won`, `sports.ticket_lost`, `sports.parlay_hit`.
- **What they can do:**
  - Comment, joke and gossip, for example rumours about an injured star. **Rumours are flavour only:** the real injury information is already public in the phone app, so no hidden information affects betting.
  - Relationships use the existing tier system (tips allowed, as with dealers and servers). They never change odds, limits or outcomes.
- **Presentation:** the same `DealerDialoguePanel` (portrait, name, tier, collapsible). No full-body sprites at the counter.
- **Placeholder:** until NPC Factory delivers a pack, one placeholder clerk with draft lines can be used.

## 13. Separation from NPCs and alcohol

- **Independence:**
  - `src/sports/*` imports nothing from `src/npc`, `src/casino/servers` or `drinks`.
  - The sportsbook service reads no relationship or drink state when pricing or settling.
  - A test enforces this, mirroring the existing casino boundary tests.
- **Drinking:** the cocktail-server effects (social and stamina) don't apply to sports betting, because there are no "decision" mechanics in betting.
- **Open question:** should an impaired Ryan see a confirmation step before placing a bet? This would be UI-only, with no odds change.

## 14. Art requirements (none produced yet)

All pieces are original 1990s Neo Geo-style pixel art, with no real logos or likenesses. Final files are PNG RGBA unless noted.

| Asset | Count | Size | Notes |
|---|---|---|---|
| League logos | 4 | 512×512 (+ a 128×128 variant) | GDC, CCL, IGL, FHL; transparent; no text other than the league initials |
| Team crests | 32 | 256×256 (+ 64×64 for tables) | Readable at 32 px; transparent; colours from §4 |
| Sportsbook lounge backdrops | 3 | 1672×941 | Desert Palms (sports bar), White Buffalo (firelight lounge), Morongo Sky (skybox). No baked odds, scores or text on the screens; the game draws boards over blank screens |
| Odds board frame | 1 per casino (3) | 9-slice, about 1200×600 | Empty board with themed trim; the game renders lines |
| Bet ticket art | 1 + stamps | Ticket 600×300 (9-slice) | Single and parlay variants share it; WIN / LOSS / PUSH / VOID stamps 256×128 |
| Phone frame and app icons | 1 frame + 5 icons | Frame about 720×1280; icons 128×128 | Scores, Standings, News, Teams, Tickets; a 90s-handheld look |
| Sport icons | 4 | 64×64 | Baseball, basketball, football, hockey |
| Status badges | 6 | 64×64 | Live, Final, Injured, Trade, Draft, Retired |
| News pictures | 8 | 640×360 (16:9) | Generic, no faces: game action (one per sport, 4), trophy lift, injury bench, draft stage, retirement ceremony |
| Sportsbook clerk (RPG) | 1 per lounge (3), or 1 shared | 6 × 256×256 portraits | Per the NPC Factory portrait spec; expressions friendly, playful, impressed, concerned, annoyed, firm |
| Player silhouettes | 4 | 256×256 | One per sport, for profiles; no individual player portraits |

**Total:** 4 logos, 32 crests, 3 backdrops, 3 boards, ticket + 4 stamps, phone + 5 icons, 4 sport icons, 6 badges, 8 news pictures, 3 clerks (18 portraits) and 4 silhouettes.

## 15. Save data and compatibility

- **New save tables** (DB schema v4, a migration that only adds; nothing existing changes):

| Table | Holds |
|---|---|
| `sportsWorld` | 1 row: world seed, current sports date, league calendars, followed teams |
| `sportsTeams` | 32 rows: identity and current season record |
| `sportsPlayers` | about 900 rows: identity, attributes, potential (hidden), status, career totals |
| `sportsGames` | per game: id, date, teams, final score, key events (compact); box scores regenerated |
| `sportsHistory` | champions, awards, records, legends |
| `sportsNews` | rolling last 200 items (older ones are summarised in history) |
| `sportsTickets` | bets: legs, odds as offered, stake, state, ledger transaction ids |

- **Older saves:** the world is created the first time the sportsbook is opened. A pre-sportsbook save simply has no sports tables until then, and no history is invented backwards.
- **Export/import:** the new tables are added to the save file. `migrateSaveFile` gets a v3 → v4 step (empty tables).
- **Size:** about 900 players × about 250 bytes, plus about 300 games per season × about 60 bytes, plus news. That's under 0.5 MB per sports year. Box scores aren't stored, and old seasons are compacted to summaries after 5 years (proposed).

## 16. Performance

- **When it runs:** only at game-week advance. About 30–60 games per Ryan week across four leagues; each simulation is microseconds to a few milliseconds, so well under 50 ms per week on a phone.
- **Big jumps** (a skipped month) are processed in small batches with a progress note.
- **Loading:** the phone app loads data lazily per screen.
- **Background work:** none. Nothing runs between Ryan's actions.

## 17. Testing

- **Determinism:** the same seed gives identical seasons (schedules, scores, drafts, retirements).
- **Simulation realism bands:**
  - Average runs, points and goals per game within target ranges per sport.
  - The home-win rate is about 54–58%.
  - Better teams win more (rating to win-rate correlation).
- **House edge:** over simulated seasons, the book's expected hold matches the configured margin (±0.5%). Fair-odds calibration is checked against actual results.
- **Bet settlement:** every market, including pushes, voids, parlay recalculation and payout caps.
- **Idempotency:** replaying `bet:` or `payout:` keys does nothing.
- **Boundaries:** sports code never reads NPC or drink state; the casino and golf modules never read sports code.
- **Save:** migration v3 → v4; export/import round trip; an older save opens and creates its world lazily.

## 18. Phased development (each phase needs approval)

| Phase | Work | Visible |
|---|---|---|
| 1 | Universe and names generator, players, a simulation for one sport (basketball), schedules, standings; tests | No (dev page) |
| 2 | All four sports simulations + seasons, playoffs, history | No |
| 3 | Off-season: draft, rookies, development and aging, injuries, trades, free agency, retirements | No |
| 4 | Save tables + migration; calendar hook to Ryan's weeks | Background only |
| 5 | Phone app (scores, standings, news, teams); placeholder art | Yes |
| 6 | Odds + betting (singles, parlays), ledger types, tickets; Desert Palms lounge | Yes |
| 7 | White Buffalo and Morongo Sky lounges; NPC Factory clerk integration | Yes |
| 8 | Futures, follow-team digests, polish, final art | Yes |

## 19. Decisions needing your approval before any code

1. **Names:** the league and team names in §4, or your own. They need a clearance check either way.
2. **Calendar:** the league calendars in §3 and the compressed season lengths (56/42/14/42 games).
3. **Roster sizes:** about 680 active players, plus prospects, in §5.
4. **House margin:** 4.5% overround (§11).
5. **Stake limits** per casino ($1,000 / $2,500 / $10,000) and the parlay payout cap (100× or $50,000).
6. **Markets in v1:** moneyline, spread and totals, pre-game only. No live or same-game parlays. Futures in phase 8.
7. **Where bets are placed:** in the lounges only (v1), or from the phone too?
8. **Phone access:** available anywhere from the HUD, including during golf (view only)?
9. **Ledger types:** add `sports_bet` / `sports_payout` (they appear in the money history).
10. **Lounge unlocks:** White Buffalo and Morongo Sky lounges follow the existing casino unlocks ($100K / $1M). Is that OK?
11. **Impaired Ryan:** whether to add a UI-only confirmation step (§13).
12. **Sportsbook clerk:** per-lounge clerks from NPC Factory, or one placeholder clerk until NPC Factory delivers?
13. **Save schema v4 migration:** adds sports tables only.
14. **Art list (§14):** confirm counts and sizes before commissioning.
