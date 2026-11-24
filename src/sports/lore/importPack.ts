/**
 * Importing a sports-lore pack (for example a revised canon from NPC Factory or the writers).
 * Pure: the caller supplies file contents and, optionally, a SHA-256 function. Nothing is written.
 */
import { LORE_FILE_NAMES, SCHEMA_VERSION, type LorePack } from './schema';
import { errorsOf, parsePack, validatePack, type LoreIssue, type ValidateOptions } from './validate';

export interface ImportOptions extends ValidateOptions {
  /** Hex SHA-256 of a string. When given, manifest.hashes are verified. */
  sha256?: (content: string) => string;
  /** The canon currently in use. When given, the import must not remove its ids or go backwards. */
  current?: LorePack;
}

export interface ImportResult { ok: boolean; pack: LorePack | null; issues: LoreIssue[] }

/** Compare two canon revisions (semver; a pre-release sorts before its release). */
export function compareRevision(a: string, b: string): number {
  const p = (s: string) => {
    const [core, pre] = s.split('-', 2);
    return { n: core.split('.').map(Number), pre: pre ?? null };
  };
  const x = p(a);
  const y = p(b);
  for (let i = 0; i < 3; i++) if (x.n[i] !== y.n[i]) return x.n[i] - y.n[i];
  if (x.pre === y.pre) return 0;
  if (x.pre === null) return 1;
  if (y.pre === null) return -1;
  return x.pre < y.pre ? -1 : 1;
}

const idsOf = (p: LorePack) => [
  ...p.leagues.map((x) => x.id),
  ...p.teams.map((x) => x.id),
  ...p.people.map((x) => x.id),
  ...p.events.map((x) => x.id),
  ...p.rivalries.map((x) => x.id),
  ...p.championships.map((x) => x.id),
];

export function importLorePack(files: Record<string, string>, opts: ImportOptions = {}): ImportResult {
  const issues: LoreIssue[] = [];
  const fail = (code: string, path: string, message: string): ImportResult => ({ ok: false, pack: null, issues: [...issues, { severity: 'error', code, path, message }] });

  if (!files['manifest.json']) return fail('FILE_MISSING', 'manifest.json', 'No manifest.json.');
  let manifest: { schema_version?: unknown; hashes?: Record<string, string> };
  try {
    manifest = JSON.parse(files['manifest.json']);
  } catch {
    return fail('JSON', 'manifest.json', 'manifest.json is not valid JSON.');
  }
  if (manifest.schema_version !== SCHEMA_VERSION) {
    const v = String(manifest.schema_version);
    return fail('UNSUPPORTED_SCHEMA', 'manifest.schema_version', /^sports-lore\/\d+$/.test(v) ? `This game reads ${SCHEMA_VERSION}; the pack is ${v}.` : `Not a sports-lore pack (${v}).`);
  }
  if (opts.sha256 && manifest.hashes) {
    for (const [name, h] of Object.entries(manifest.hashes)) {
      if (files[name] === undefined) issues.push({ severity: 'error', code: 'FILE_MISSING', path: name, message: 'Listed in manifest.hashes but not supplied.' });
      else if (`sha256-${opts.sha256(files[name])}` !== h) issues.push({ severity: 'error', code: 'HASH', path: name, message: 'SHA-256 does not match the manifest.' });
    }
  }
  const raw: Record<string, unknown> = {};
  for (const name of LORE_FILE_NAMES) {
    if (files[name] === undefined) continue;
    try {
      raw[name] = JSON.parse(files[name]);
    } catch {
      issues.push({ severity: 'error', code: 'JSON', path: name, message: 'Not valid JSON.' });
    }
  }
  const parsed = parsePack(raw);
  issues.push(...parsed.issues);
  if (!parsed.pack) return { ok: false, pack: null, issues };
  issues.push(...validatePack(parsed.pack, opts));

  if (opts.current) {
    const cur = opts.current.manifest.canon_revision;
    const inc = parsed.pack.manifest.canon_revision;
    if (compareRevision(inc, cur) < 0) issues.push({ severity: 'error', code: 'REVISION_OLDER', path: 'manifest.canon_revision', message: `${inc} is older than the current ${cur}.` });
    const next = new Set(idsOf(parsed.pack));
    for (const id of idsOf(opts.current)) {
      if (!next.has(id)) issues.push({ severity: 'error', code: 'ID_REMOVED', path: id, message: `${id} disappears. Breaking id changes need an explicit migration.` });
    }
  }
  const ok = errorsOf(issues).length === 0;
  return { ok, pack: ok ? parsed.pack : null, issues };
}
