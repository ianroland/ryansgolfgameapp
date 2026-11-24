# Nationwide Sports Universe: historical canon

- Contract: `sports-lore/1` · canon revision `0.1.0-draft` · status **proposed**
- Scope: 1972-2026. Seasons from 2027 are simulated per save and are not in this pack.
- Original fictional lore, not a claim about real professional sports. Proposed canon: draft until approved. Team names are not legally cleared.

Files: `manifest.json`, `leagues.json`, `teams.json`, `people.json`, `events.json`, `rivalries.json`, `championships.json`, `franchise_history.json`, `dialogue_rules.json`. JSON Schemas (draft 2020-12) are in `schemas/`.

## Rules for NPC lines

- Historical knowledge is gated by the in-game sports year. An NPC never knows a fact dated in or after the current sports year.
- A line claiming firsthand attendance must be plausible for the NPC's age at the time (proposed minimum age 8).
- Personality can shape opinion, never the official facts.
- Every lore-based line must reference one or more event IDs.
- Live scores, injuries, betting lines and bankroll values are injected by the game, never written into NPC lines.
- Unwritten history stays unwritten: no invented champions, records or founding clubs, and an absent record is not a drought.
- Game-simulated seasons (2027 on) belong to one save and are never presented as shared canon.
- Each fact carries a knowledge tier (casual, fan, specialist, historian) and a year. Embed this pack's canon revision and the event ids in every lore line.
- Unwritten history is marked as such (null fields, `winner_unknown`, `year_unknown`, `inference_pending_approval`). Do not fill it in.

## Open questions

- **q1.** Confirm the four founding years and trophy names.
- **q2.** Approve or revise the 16 anchor events and named legends.
- **q3.** Decide the original 1970s franchises, relocations and expansions. The current 32 cities are not assumed to be founding cities.
- **q4.** Fill missing championship years and opponents in a later canon pass.
- **q5.** Confirm whether Burlington's pre-2019 Frost Cup was in 1995.
- **q6.** Confirm Darius King's and Leon Mercer's CCL teams.
- **q7.** Define historic season formats and playoffs only as needed by the anchor facts.
- **q8.** Decide how lore is revealed if the game ever starts before 2027. Today every career starts in 2027, so all 1972-2026 lore is past history.
- **q9.** The bible gives no founding club count for the CCL (the other three leagues say eight). Confirm.
- **q10.** The 1996 CCL champion beat three higher seeds, so the 1996 playoffs had at least three rounds. Today's format has two. Confirm the 1996 playoff size.
- **q11.** Marco Salazar (Phoenix) and Calvin Redd (Las Vegas) are placed on those teams by reading the event text. Confirm.
- **q12.** Events name teams by their current city (for example 'Milwaukee pitcher', 1983). The import reads these as the current franchises playing in those cities in those years. Confirm, or say which events refer to earlier franchises.
- **q13.** IGL football rookie quarterback Mason Vale shares a surname with cocktail server Celeste Vale. No relation is established. Confirm or rename.
