/**
 * The sports-lore/2 extension of the NPC Factory pack: the generated history (1972-2026) and the
 * knowledge facts, added beside the unchanged sports-lore/1 bible files. Build time only.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { z } from 'zod';
import { FORBIDDEN_KEYS } from '../lore/exportPack';
import { buildKnowledge, refTargets, type BuildInput } from './build';
import { CONTRACT, HISTORY_REVISION, KNOWLEDGE_FILES, liveContextSchema, type Fact } from './schema';

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const keysOf = (v: unknown): string[] => (Array.isArray(v) ? v.flatMap(keysOf) : v && typeof v === 'object' ? Object.entries(v).flatMap(([k, x]) => [k, ...keysOf(x)]) : []);

export interface Extension { files: Record<string, string>; facts: Fact[]; problems: string[] }

export function buildExtension(input: BuildInput & { gameVersion: string; bibleManifest: string }): Extension {
  const { files: data, facts } = buildKnowledge(input);
  const problems: string[] = [];
  const files: Record<string, string> = {};
  // Validate every file against its schema and the privacy guard.
  for (const [name, schema] of Object.entries(KNOWLEDGE_FILES)) {
    const r = (schema as z.ZodType).safeParse(data[name]);
    if (!r.success) problems.push(`${name}: ${r.error.issues[0].path.join('.')} ${r.error.issues[0].message}`);
    const bad = keysOf(data[name]).filter((k) => FORBIDDEN_KEYS.test(k));
    if (bad.length) problems.push(`${name}: forbidden keys ${[...new Set(bad)].join(', ')}`);
    // Large tables are written compactly, the rest readably.
    files[name] = /games|player_seasons|player_careers|facts|index/.test(name) ? `${JSON.stringify(data[name])}\n` : `${JSON.stringify(data[name], null, 1)}\n`;
    files[`schemas/${name.replace('.json', '.schema.json')}`] = `${JSON.stringify({ $id: `${CONTRACT}/${name}`, title: `${CONTRACT} ${name}`, ...z.toJSONSchema(schema as z.ZodType, { target: 'draft-2020-12' }) }, null, 2)}\n`;
  }
  files['schemas/knowledge/live_context.schema.json'] = `${JSON.stringify({ $id: `${CONTRACT}/live_context`, title: `${CONTRACT} live context (run time, never stored)`, ...z.toJSONSchema(liveContextSchema, { target: 'draft-2020-12' }) }, null, 2)}\n`;
  const targets = refTargets(data);
  for (const f of facts) for (const r of f.refs) if (!targets.has(r)) problems.push(`${f.id} cites missing ${r}`);
  // The reference retrieval code, as plain JavaScript (the game's own module, types stripped).
  const src = readFileSync(new URL('./retrieve.ts', import.meta.url), 'utf8');
  files['knowledge/retrieve.mjs'] = `// Generated from src/sports/knowledge/retrieve.ts (types stripped). Do not edit; re-export instead.\n${stripTypeScriptTypes(src, { mode: 'strip' }).replace(/[ \t]+$/gm, '')}`;
  files['HISTORY_AND_KNOWLEDGE.md'] = readme(facts);
  files['NPC_FACTORY_PROMPT.md'] = readFileSync(new URL('../../../docs/sports-lore/NPC_FACTORY_PROMPT.md', import.meta.url), 'utf8');
  const count = (k: string) => (Array.isArray(data[k]) ? (data[k] as unknown[]).length : k === 'history/games.json' ? (data[k] as { rows: unknown[] }).rows.length : null);
  const hashes: Record<string, string> = {};
  for (const [k, v] of Object.entries(files).sort()) hashes[k] = `sha256-${sha256(v)}`;
  files['knowledge.manifest.json'] = `${JSON.stringify({
    contract: CONTRACT,
    history_revision: HISTORY_REVISION,
    status: 'proposed',
    base: { contract: 'sports-lore/1', manifest: 'manifest.json', manifest_sha256: `sha256-${sha256(input.bibleManifest)}` },
    scope: { from: 1972, to: 2026, note: 'Shared history only. Seasons from 2027 are simulated per save and are never in this pack; the game passes them at run time (live context).' },
    provenance: {
      approved_canon: 'Fixed by an owner decision.',
      proposed_canon: 'The history ledger and the league bible: draft until approved.',
      derived_statistic: 'Computed by a published rule from the generated games (awards, leaders, records, totals).',
      generated_history: 'Deterministic generated detail: game scores, series lengths, drafts, the 2026 season.',
    },
    counts: Object.fromEntries(Object.keys(KNOWLEDGE_FILES).map((k) => [k, count(k)])),
    files: Object.keys(hashes),
    hashes,
    'x-export': { exported_by: "Ryan's Road to the LPGA", game_version: input.gameVersion },
  }, null, 2)}\n`;
  return { files, facts, problems };
}

function readme(facts: Fact[]): string {
  const by = (k: keyof Fact) => Object.entries(facts.reduce<Record<string, number>>((m, f) => ((m[String(f[k])] = (m[String(f[k])] ?? 0) + 1), m), {})).map(([a, b]) => `${a} ${b.toLocaleString('en-US')}`).join(', ');
  return [
    `# History and knowledge (${CONTRACT}, history revision ${HISTORY_REVISION})`,
    '',
    'This extends the bible pack (`manifest.json`, contract `sports-lore/1`, unchanged) with the generated history of all four leagues, 1972-2026, and a knowledge layer for NPC dialogue. Everything is **proposed canon** until approved. The extension\'s own manifest is `knowledge.manifest.json` (hashes of every file).',
    '',
    '- "Athlete" means a sports player. The word "player" is reserved for the game\'s human player and is never a key.',
    '- Ids are stable across revisions: teams (`ccl_monsoon`), athletes (`ccl_andre_bellamy`), seasons (`ccl-2002`), series and games (as in the game), bible events (`fhl-1989-001`).',
    '- Seasons from 2027 belong to one save and are never here. The game can pass the season in progress at run time (`schemas/knowledge/live_context.schema.json`); never store it as canon.',
    '',
    '## history/',
    '',
    '| File | Contents |',
    '|---|---|',
    '| seasons.json | Every league season: standings (wins, losses; hockey losses include overtime losses before 2026), seeds, champion, runner-up, origin |',
    '| games.json | Every game (columnar): week and day of the league calendar, teams, score, winner, overtime periods or extra innings, shootout, bible events |',
    '| playoff_series.json | Every series: seeds, winner, wins, its games, comeback deficit, legendary flag |',
    '| championships.json | Every title: trophy, result, deciding game, championship MVP, participants, bible events |',
    '| players.json | Every athlete: position, birth year, debut, final season, teams by years, status entering 2027, Hall of Fame, draft |',
    '| player_seasons.json | Every athlete season (columnar per league), regular season and playoffs |',
    '| player_careers.json | Career totals |',
    '| awards.json, leaders.json | Annual awards and statistical leaders. There is no Coach of the Year (no coaches in the data) |',
    '| records.json | Record books (top 5): season, career, single game, team |',
    '| hall_of_fame.json | Inductees through 2027 with pathway (statistical, or Historical Legends) |',
    '| drafts.json, transactions.json | Drafts; the one trade on record (its other pieces are unidentified) |',
    '',
    '## knowledge/',
    '',
    `\`facts.json\` holds ${facts.length.toLocaleString('en-US')} structured facts. Each has an id, kind, the year it is about, \`known_from\` (the first sports year it can be known), league, teams, athletes, bible events, rivalry, knowledge tier, a plain factual sentence, structured data, \`refs\` (the history records it restates) and provenance.`,
    '',
    `- By kind: ${by('kind')}`,
    `- By tier: ${by('tier')}`,
    `- By provenance: ${by('provenance')}`,
    '',
    '`index.json` lists fact ids by league, team, athlete, year, bible event and rivalry, and franchises by city and state (for an NPC\'s hometown). `retrieve.mjs` is the reference retrieval: the same code the game runs.',
    '',
    '## Rules',
    '',
    '1. Never before `known_from`: an NPC in sports year Y knows a fact only if `known_from <= Y`.',
    '2. Tiers: casual facts for everyone; fan facts for followers of the league or of a team involved (favourite or hometown); specialist facts for followers of the league; historian facts for historians.',
    '3. Firsthand memories only if the NPC was at least 8 that year.',
    '4. Every line built from facts carries their ids and this history revision. Opinions and tone may vary; the facts may not.',
    '5. No invention: no unstated scores, players, coaches, quotes or outcomes; unwritten bible history stays unwritten.',
    '',
  ].join('\n');
}
