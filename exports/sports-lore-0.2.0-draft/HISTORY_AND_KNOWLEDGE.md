# History and knowledge (sports-lore/2, history revision 0.2.0-draft)

This extends the bible pack (`manifest.json`, contract `sports-lore/1`, unchanged) with the generated history of all four leagues, 1972-2026, and a knowledge layer for NPC dialogue. Everything is **proposed canon** until approved. The extension's own manifest is `knowledge.manifest.json` (hashes of every file).

- "Athlete" means a sports player. The word "player" is reserved for the game's human player and is never a key.
- Ids are stable across revisions: teams (`ccl_monsoon`), athletes (`ccl_andre_bellamy`), seasons (`ccl-2002`), series and games (as in the game), bible events (`fhl-1989-001`).
- Seasons from 2027 belong to one save and are never here. The game can pass the season in progress at run time (`schemas/knowledge/live_context.schema.json`); never store it as canon.

## history/

| File | Contents |
|---|---|
| seasons.json | Every league season: standings (wins, losses; hockey losses include overtime losses before 2026), seeds, champion, runner-up, origin |
| games.json | Every game (columnar): week and day of the league calendar, teams, score, winner, overtime periods or extra innings, shootout, bible events |
| playoff_series.json | Every series: seeds, winner, wins, its games, comeback deficit, legendary flag |
| championships.json | Every title: trophy, result, deciding game, championship MVP, participants, bible events |
| players.json | Every athlete: position, birth year, debut, final season, teams by years, status entering 2027, Hall of Fame, draft |
| player_seasons.json | Every athlete season (columnar per league), regular season and playoffs |
| player_careers.json | Career totals |
| awards.json, leaders.json | Annual awards and statistical leaders. There is no Coach of the Year (no coaches in the data) |
| records.json | Record books (top 5): season, career, single game, team |
| hall_of_fame.json | Inductees through 2027 with pathway (statistical, or Historical Legends) |
| drafts.json, transactions.json | Drafts; the one trade on record (its other pieces are unidentified) |

## knowledge/

`facts.json` holds 3,593 structured facts. Each has an id, kind, the year it is about, `known_from` (the first sports year it can be known), league, teams, athletes, bible events, rivalry, knowledge tier, a plain factual sentence, structured data, `refs` (the history records it restates) and provenance.

- By kind: award 819, championship 208, comeback 23, draft 200, drought 12, final 208, franchise 50, grudge 82, hall_of_fame 108, leader 840, legend 9, record 405, rivalry 4, semifinal 416, standings 208, trade 1
- By tier: fan 840, specialist 1,183, casual 226, historian 1,344
- By provenance: derived_statistic 2,305, proposed_canon 431, approved_canon 3, generated_history 854

`index.json` lists fact ids by league, team, athlete, year, bible event and rivalry, and franchises by city and state (for an NPC's hometown). `retrieve.mjs` is the reference retrieval: the same code the game runs.

## Rules

1. Never before `known_from`: an NPC in sports year Y knows a fact only if `known_from <= Y`.
2. Tiers: casual facts for everyone; fan facts for followers of the league or of a team involved (favourite or hometown); specialist facts for followers of the league; historian facts for historians.
3. Firsthand memories only if the NPC was at least 8 that year.
4. Every line built from facts carries their ids and this history revision. Opinions and tone may vary; the facts may not.
5. No invention: no unstated scores, players, coaches, quotes or outcomes; unwritten bible history stays unwritten.
