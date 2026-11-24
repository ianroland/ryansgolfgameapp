/**
 * Writes the sanitized sports-lore knowledge pack for NPC Factory to exports/<dir>/.
 * Run: npx vite-node scripts/export-sports-lore.ts
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import pkg from '../package.json';
import { buildKnowledgePack } from '../src/sports/lore/exportPack';

const { files, stripped, dir } = buildKnowledgePack(undefined, pkg.version);
if (stripped.length) throw new Error(`Refusing to export: forbidden keys found at ${stripped.join(', ')}`);
const out = join('exports', dir);
rmSync(out, { recursive: true, force: true });
for (const [name, content] of Object.entries(files)) {
  mkdirSync(dirname(join(out, name)), { recursive: true });
  writeFileSync(join(out, name), content);
}
console.log(`Wrote ${Object.keys(files).length} files to ${out}`);
