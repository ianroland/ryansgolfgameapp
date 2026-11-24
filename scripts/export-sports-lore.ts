/**
 * Writes the NPC Factory knowledge pack to exports/sports-lore-<history revision>/: the
 * sports-lore/1 bible files (unchanged) plus the sports-lore/2 history and knowledge extension.
 * Run: npx vite-node scripts/export-sports-lore.ts
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import pkg from '../package.json';
import { buildBoard } from '../src/sports/archive/board';
import { buildShared } from '../src/sports/archive/shared';
import type { HistoryData } from '../src/sports/history/data';
import { freeSeason, mergeForward } from '../src/sports/history/forward';
import { historySeason } from '../src/sports/history/games';
import { buildExtension } from '../src/sports/knowledge/exportPack';
import { HISTORY_REVISION } from '../src/sports/knowledge/schema';
import { buildKnowledgePack } from '../src/sports/lore/exportPack';
import { bundledLore } from '../src/sports/lore/service';

const read = (f: string) => JSON.parse(readFileSync(f, 'utf8'));
const bible = buildKnowledgePack(undefined, pkg.version);
if (bible.stripped.length) throw new Error(`Refusing to export: forbidden keys found at ${bible.stripped.join(', ')}`);
const raw = {
  players: read('src/sports/history/data/players.json').players, seasons: read('src/sports/history/data/seasons.json').seasons,
  honors: read('src/sports/history/data/honors.json'), forward: read('src/sports/history/data/forward.json'), archive: read('src/sports/history/data/archive.json'),
};
const data: HistoryData = { players: raw.players, seasons: raw.seasons };
const merged = mergeForward(data, raw.forward);
const shared = buildShared(raw);
const ext = buildExtension({
  shared, board: buildBoard(shared, null), lore: bundledLore(),
  replay: (s) => (s.year <= 2025 ? historySeason(data, s) : freeSeason(merged, s)),
  gameVersion: pkg.version, bibleManifest: bible.files['manifest.json'],
});
if (ext.problems.length) throw new Error(`Refusing to export:\n${ext.problems.slice(0, 20).join('\n')}`);
for (const old of ['sports-lore-0.1.3-draft', `sports-lore-${HISTORY_REVISION}`]) rmSync(join('exports', old), { recursive: true, force: true });
const out = join('exports', `sports-lore-${HISTORY_REVISION}`);
const files = { ...bible.files, ...ext.files };
let bytes = 0;
for (const [name, content] of Object.entries(files)) {
  mkdirSync(dirname(join(out, name)), { recursive: true });
  writeFileSync(join(out, name), content);
  bytes += Buffer.byteLength(content);
}
console.log(`Wrote ${Object.keys(files).length} files (${(bytes / 1048576).toFixed(1)} MB) to ${out}; ${ext.facts.length} facts`);
