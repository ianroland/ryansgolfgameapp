/**
 * Builds the sanitized sports-lore knowledge pack for NPC Factory: the nine canon files, JSON
 * Schemas, a README and SHA-256 hashes. Canon only: no save state, bankroll, simulated seasons,
 * player data or secrets. Build-time only (uses node:crypto); the game UI never imports this file.
 */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { LORE_FILE_NAMES, LORE_FILES, PACK_KEY, type LorePack } from './schema';
import { bundledLore } from './service';

/** Keys that must never appear in an exported lore pack. */
export const FORBIDDEN_KEYS = /^(bankroll|balance|money|save|saveId|save_id|ledger|player|playerId|user|email|token|secret|password|simulated|namespace)$/i;

export const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

function stripForbidden(v: unknown, path: string, found: string[]): unknown {
  if (Array.isArray(v)) return v.map((x, i) => stripForbidden(x, `${path}[${i}]`, found));
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) {
      if (FORBIDDEN_KEYS.test(k)) found.push(`${path}.${k}`);
      else out[k] = stripForbidden(x, `${path}.${k}`, found);
    }
    return out;
  }
  return v;
}

export interface ExportResult { files: Record<string, string>; stripped: string[]; dir: string }

export function buildKnowledgePack(pack: LorePack = bundledLore(), gameVersion = 'dev'): ExportResult {
  const files: Record<string, string> = {};
  const stripped: string[] = [];
  const json = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`;
  for (const name of LORE_FILE_NAMES.slice(1)) files[name] = json(stripForbidden(pack[PACK_KEY[name]], name, stripped));
  for (const name of LORE_FILE_NAMES) {
    files[`schemas/${name.replace('.json', '.schema.json')}`] = json({
      $id: `sports-lore/1/${name}`,
      title: `sports-lore/1 ${name}`,
      ...z.toJSONSchema(LORE_FILES[name], { target: 'draft-2020-12' }),
    });
  }
  const m = pack.manifest;
  files['README.md'] = [
    `# ${m.title}`,
    '',
    `- Contract: \`${m.schema_version}\` · canon revision \`${m.canon_revision}\` · status **${m.canon_status}**`,
    `- Scope: ${m.historical_scope.from}-${m.historical_scope.to}. Seasons from ${m.game_start_year} are simulated per save and are not in this pack.`,
    `- ${m.notice}`,
    '',
    'Files: `manifest.json`, `leagues.json`, `teams.json`, `people.json`, `events.json`, `rivalries.json`, `championships.json`, `franchise_history.json`, `dialogue_rules.json`. JSON Schemas (draft 2020-12) are in `schemas/`.',
    '',
    '## Rules for NPC lines',
    '',
    ...pack.dialogueRules.rules.map((r) => `- ${r.text}`),
    '- Each fact carries a knowledge tier (casual, fan, specialist, historian) and a year. Embed this pack\'s canon revision and the event ids in every lore line.',
    '- Unwritten history is marked as such (null fields, `winner_unknown`, `year_unknown`, `inference_pending_approval`). Do not fill it in.',
    '',
    '## Open questions',
    '',
    ...m.open_questions.map((q) => `- **${q.id}.** ${q.text}`),
    '',
  ].join('\n');
  const hashes: Record<string, string> = {};
  for (const [k, v] of Object.entries(files).sort()) hashes[k] = `sha256-${sha256(v)}`;
  files['manifest.json'] = json(stripForbidden({ ...m, hashes, 'x-export': { exported_by: 'Ryan\'s Road to the LPGA', game_version: gameVersion, contract: m.schema_version } }, 'manifest.json', stripped));
  return { files, stripped, dir: `sports-lore-${m.canon_revision}` };
}
