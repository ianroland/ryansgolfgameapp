# Sports lore: historical canon layer (`sports-lore/1`)

**Status:** canon revision `0.1.0-draft`, status `proposed`. Source: `03_SPORTS_UNIVERSE_HISTORY.md` (draft for approval). Original fictional lore; team names are not legally cleared.

This is a read-only reference layer. It never changes simulation RNG, standings, odds, betting outcomes, the bankroll, saves or the game clock. Tests enforce this (see below).

## Where things are

| Path | What it is |
|---|---|
| `src/sports/lore/pack/*.json` | The canon: `manifest`, `leagues`, `teams`, `people`, `events`, `rivalries`, `championships`, `franchise_history`, `dialogue_rules` |
| `src/sports/lore/schema.ts` | zod schemas for the nine files (the contract) |
| `src/sports/lore/validate.ts` | Validation: schema, versioning, ids, references, chronology, trophies, championship consistency |
| `src/sports/lore/service.ts` | Lookups, year and tier gating, UI and NPC selectors, the simulated-ledger merge |
| `src/sports/lore/importPack.ts` | Importing a revised pack (version, hash and id-stability checks) |
| `src/sports/lore/exportPack.ts` | Building the sanitized NPC Factory knowledge pack (build time only) |
| `exports/sports-lore-0.1.0-draft/` | The exported knowledge pack for NPC Factory, with JSON Schemas (draft 2020-12) |
| `tests/sportsLore.test.ts` | Acceptance tests (26) |

Regenerate the export with `npm run lore:export`. A test fails if the committed export is out of date.

## Versioning

- `schema_version` is the contract: `sports-lore/1`. The importer rejects any other value.
- `canon_revision` is the edition of the history (semver; `-draft` while proposed).
- `canon_status` is `proposed`, `approved` or `deprecated`. An approved canon may not carry a `-draft` revision or draft events.
- An import may add records but may not remove ids or go to an older revision. Breaking id changes need an explicit migration.

## What the canon records, and what it leaves open

- **Leagues:** founding year, trophy, identity, charter city where stated, founding club count where stated, current format, and the few historic format facts the anchors imply (IGL 14 games in 1985 and 2015; best-of-seven finals in GDC 1998 and FHL 2002; at least three CCL playoff rounds in 1996). Modern schedule lengths are not applied to history.
- **Teams:** the current 32, identical to the game registry (ids, leagues, cities). Registry hex colours stay in `src/sports/demo.ts`; the lore adds the named colours.
- **Events:** the 16 anchors. Each has dated facts with a knowledge tier, tags, unknowns, dialogue constraints, structured outcomes and claims (first title, drought), and citations back to the bible.
- **Championships:** 11 established results. Also:
  - 2009 CCL: Miami was a finalist; the winner is unwritten.
  - Cleveland's other two titles in 1983–1986: years unwritten.
  - Burlington 1995: a proposed inference, flagged and never shown as fact.
  - Every other season is "unwritten". An absent record is not a drought.
- **Franchise history:** founding city, founding membership, relocations and "in current city since" are all null (unwritten). Each team lists the years the anchor events place it in its current city.

## Knowledge gating

- A fact is known only if it is dated **before** the current sports year (the season in progress is not yet history). The sports year is `2026 + career season`, so every career starts in 2027 and all 1972–2026 canon is past. The gate still works for any earlier year.
- Tiers:
  - `casual`: headline facts.
  - `fan`: plus fan-level facts in the leagues they follow, or involving their own team.
  - `specialist`: plus stats and detail in the leagues they follow.
  - `historian`: everything.
- Firsthand claims need a known birth year and an age of at least 8 at the event.

## Simulated history

Seasons from 2027 on are simulated per save. They go in a separate ledger namespaced `save:<id>`. `checkSimulated` rejects any row dated before 2027, any row not namespaced, and any unknown team. Timelines show those rows with `source: 'simulated'`; canon is frozen and never changes. Saving the ledger arrives with Phase 4; nothing is written to saves today.

## In the game today

The sportsbook **History** board now shows the selected league's canon:
- founding, trophy and identity;
- the written champions, with proposed and unknown entries marked;
- a count of unwritten seasons;
- the anchor moments and rivalries.

It is tagged **Draft canon**. The earlier demo champions (invented 2024–2026 winners and MVPs) were removed, because canon leaves those seasons unwritten.

## Sample import

```ts
import { importLorePack } from './src/sports/lore/importPack';
import { bundledLore } from './src/sports/lore/service';
import { sha256 } from './src/sports/lore/exportPack';
// files: { 'manifest.json': '...', 'events.json': '...', ... } read from a pack folder
const r = importLorePack(files, { sha256, current: bundledLore(), registry });
if (!r.ok) console.table(r.issues); // nothing is applied unless ok
```

## NPC use

`npcLoreContext({ npcId, tier, leagues, teams, birthYear }, year)` returns:
- the facts the NPC may know, each with its event id;
- the canon revision;
- the constraints that bind those events (for example, never say New Orleans officially won in 1994; never imply Charleston players were proven culpable);
- the NPC's team perspectives (opinion only);
- the events they could have attended.

Live scores, injuries, lines and bankroll values are injected by the game, never written into lines.
