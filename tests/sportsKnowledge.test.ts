import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildBoard } from '../src/sports/archive/board';
import { buildShared } from '../src/sports/archive/shared';
import type { HistoryData } from '../src/sports/history/data';
import { freeSeason, mergeForward } from '../src/sports/history/forward';
import { historySeason } from '../src/sports/history/games';
import { buildExtension, type Extension } from '../src/sports/knowledge/exportPack';
import { liveContextOf } from '../src/sports/knowledge/live';
import { retrieve, type KFact, type KIndex, type NpcSportsProfile } from '../src/sports/knowledge/retrieve';
import { HISTORY_REVISION, liveContextSchema } from '../src/sports/knowledge/schema';
import { buildKnowledgePack, FORBIDDEN_KEYS, sha256 } from '../src/sports/lore/exportPack';
import { importLorePack } from '../src/sports/lore/importPack';
import { bundledLore } from '../src/sports/lore/service';

const DIR = join(__dirname, `../exports/sports-lore-${HISTORY_REVISION}`);
const read = (f: string) => JSON.parse(readFileSync(f, 'utf8'));
const disk = (f: string) => readFileSync(join(DIR, f), 'utf8');
const facts: KFact[] = JSON.parse(disk('knowledge/facts.json'));
const index: KIndex = JSON.parse(disk('knowledge/index.json'));
const raw = {
  players: read('src/sports/history/data/players.json').players, seasons: read('src/sports/history/data/seasons.json').seasons,
  honors: read('src/sports/history/data/honors.json'), forward: read('src/sports/history/data/forward.json'), archive: read('src/sports/history/data/archive.json'),
};
const shared = buildShared(raw);
const board = buildBoard(shared, null);
const F = (id: string) => facts.find((f) => f.id === id)!;
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe('the NPC Factory pack on disk', () => {
  let ext: Extension;
  const pkgVersion = read(join(__dirname, '../package.json')).version;
  const bible = buildKnowledgePack(undefined, pkgVersion);
  beforeAll(() => {
    const data: HistoryData = { players: raw.players, seasons: raw.seasons };
    const merged = mergeForward(data, raw.forward);
    ext = buildExtension({ shared, board, lore: bundledLore(), replay: (s) => (s.year <= 2025 ? historySeason(data, s) : freeSeason(merged, s)), gameVersion: pkgVersion, bibleManifest: bible.files['manifest.json'] });
  }, 300_000);

  it('is current: the bible files and the history/knowledge extension rebuild identically', () => {
    expect(ext.problems).toEqual([]);
    const onDisk = (readdirSync(DIR, { recursive: true }) as string[]).filter((f) => f.includes('.')).map((f) => f.replaceAll('\\', '/')).sort();
    expect(onDisk).toEqual(Object.keys({ ...bible.files, ...ext.files }).sort());
    for (const [f, c] of Object.entries({ ...bible.files, ...ext.files })) if (!/manifest\.json$/.test(f)) expect(disk(f), f).toBe(c);
  });

  it('a sports-lore/1 importer still reads it; the extension manifest hashes every file', () => {
    const files = Object.fromEntries(Object.keys(bible.files).map((f) => [f, disk(f)]));
    const r = importLorePack(files, { sha256 });
    expect(r.issues.filter((i) => i.severity === 'error')).toEqual([]);
    const m = JSON.parse(disk('knowledge.manifest.json'));
    expect(m.contract).toBe('sports-lore/2');
    expect(m.base.manifest_sha256).toBe(`sha256-${sha256(disk('manifest.json'))}`);
    for (const [f, h] of Object.entries(m.hashes as Record<string, string>)) expect(`sha256-${sha256(disk(f))}`, f).toBe(h);
    expect(m.scope.to).toBe(2026);
  });

  it('nothing private, nothing from a save, nothing from the future', () => {
    const walk = (v: unknown): string[] => (Array.isArray(v) ? v.flatMap(walk) : v && typeof v === 'object' ? Object.entries(v).flatMap(([k, x]) => [k, ...walk(x)]) : []);
    for (const f of Object.keys(ext.files).filter((x) => x.endsWith('.json') && !x.startsWith('schemas/'))) expect(walk(JSON.parse(disk(f))).filter((k) => FORBIDDEN_KEYS.test(k)), f).toEqual([]);
    expect(Math.max(...facts.map((f) => f.known_from))).toBeLessThanOrEqual(2027);
    expect(facts.every((f) => f.year <= 2027 && f.known_from >= f.year)).toBe(true);
    expect(JSON.parse(disk('history/seasons.json')).every((s: { year: number }) => s.year <= 2026)).toBe(true);
  });
});

describe('facts agree with the history and the History Board', () => {
  it('every championship, Hall of Fame entry and top record', () => {
    for (const L of ['gdc', 'ccl', 'igl', 'fhl'] as const) {
      for (const s of board.seasons(L)) {
        const f = F(`f.championship.${s.id}`);
        expect(f.data).toMatchObject({ champion: s.champion, runner_up: s.runnerUp });
        expect(f.known_from).toBe(s.year + 1);
      }
      for (const cat of board.records(L).cats) {
        const top = board.records(L).career.get(cat.key)![0];
        if (top) expect(F(`f.record.career.${L}.${cat.key}.1`).athletes).toEqual([top.playerId]);
      }
    }
    for (const h of board.hallOfFame()) expect(F(`f.hall_of_fame.${h.i}`).known_from).toBe(h.year);
    expect(F('f.hall_of_fame.gdc_elias_voss').provenance).toBe('approved_canon');
    expect(F('f.final.igl-1994').text).toContain('24–20');
    expect(F('f.comeback.gdc:h1998:po:final:gdc_firebirds-gdc_lamplighters')).toMatchObject({ tier: 'casual', events: ['gdc-1998-001'], provenance: 'proposed_canon' });
    expect(F('f.trade.ccl-2008.ccl_andre_bellamy').text).toMatch(/not identified/);
    expect(facts.some((f) => /coach/i.test(f.text))).toBe(false);
  });

  it('the dialogue prompt\'s example ids exist', () => {
    const prompt = readFileSync(join(__dirname, '../docs/sports-lore/NPC_FACTORY_PROMPT.md'), 'utf8');
    for (const m of prompt.matchAll(/"(f\.[a-z_]+\.[^"]+)"/g)) expect(facts.some((f) => f.id === m[1]), m[1]).toBe(true);
    expect(disk('NPC_FACTORY_PROMPT.md')).toBe(prompt);
  });
});

describe('retrieval rules', () => {
  const npc = (p: Partial<NpcSportsProfile>): NpcSportsProfile => ({ year: 2027, tier: 'casual', ...p });

  it('never before known_from', () => {
    const r = retrieve(facts, index, npc({ year: 1999, tier: 'historian' }));
    expect(r.every((f) => f.known_from <= 1999)).toBe(true);
    expect(ids(r)).toContain('f.championship.gdc-1998');
    expect(ids(r)).not.toContain('f.championship.gdc-1999');
    expect(ids(retrieve(facts, index, npc({ year: 2003, tier: 'historian' }), { event: 'fhl-2002-001' }))).toContain('f.final.fhl-2002');
    expect(retrieve(facts, index, npc({ year: 2002, tier: 'historian' }), { event: 'fhl-2002-001' })).toEqual([]);
  });

  it('tiers: casual knows casual; fans know their league and teams; specialists their leagues; historians all', () => {
    expect(retrieve(facts, index, npc({ tier: 'casual' })).every((f) => f.tier === 'casual')).toBe(true);
    const fan = retrieve(facts, index, npc({ tier: 'fan', leagues: ['igl'], favoriteTeams: ['fhl_snowowls'] }));
    expect(fan.every((f) => f.tier === 'casual' || (f.tier === 'fan' && (f.league === 'igl' || f.teams.includes('fhl_snowowls'))))).toBe(true);
    expect(ids(fan)).toContain('f.franchise.fhl_snowowls');
    const spec = retrieve(facts, index, npc({ tier: 'specialist', leagues: ['ccl'] }));
    expect(spec.filter((f) => f.tier === 'specialist').every((f) => f.league === 'ccl')).toBe(true);
    expect(spec.some((f) => f.tier === 'historian')).toBe(false);
    expect(retrieve(facts, index, npc({ tier: 'historian' }))).toHaveLength(facts.filter((f) => f.known_from <= 2027).length);
  });

  it('hometown teams count like favourites, and favourites rank first', () => {
    const phx = retrieve(facts, index, npc({ tier: 'fan', leagues: [], hometown: { city: 'Phoenix', state: 'AZ' } }));
    expect(ids(phx)).toContain('f.franchise.gdc_firebirds');
    expect(phx.find((f) => f.id === 'f.franchise.gdc_firebirds')!.why).toBe('home team');
    const fav = retrieve(facts, index, npc({ tier: 'fan', favoriteTeams: ['ccl_forge'] }), { limit: 10 });
    expect(fav.every((f) => f.teams.includes('ccl_forge'))).toBe(true);
  });

  it('firsthand memories need the NPC to have been 8 or older', () => {
    const r = (birthYear: number) => retrieve(facts, index, npc({ tier: 'casual', birthYear }), { event: 'gdc-1998-001' }).find((f) => f.kind === 'championship')!;
    expect(r(1985).firsthand).toBe(true);
    expect(r(1995).firsthand).toBe(false);
  });

  it('queries by team, athlete, rivalry, kind and use', () => {
    expect(retrieve(facts, index, npc({ tier: 'historian' }), { athlete: 'ccl_andre_bellamy' }).length).toBeGreaterThan(5);
    const riv = bundledLore().rivalries.find((x) => x.teams.includes('ccl_comets') && x.teams.includes('ccl_voltage'))!.id;
    const rv = retrieve(facts, index, npc({ tier: 'historian' }), { rivalry: riv });
    expect(ids(rv)).toContain('f.rivalry.ccl_comets.ccl_voltage');
    expect(rv.every((f) => f.rivalry === riv)).toBe(true);
    expect(retrieve(facts, index, npc({ tier: 'historian' }), { kinds: ['grudge'], team: 'gdc_lamplighters' }).every((f) => f.kind === 'grudge' && f.teams.includes('gdc_lamplighters'))).toBe(true);
    expect(retrieve(facts, index, npc({ tier: 'historian' }), { uses: ['legend'] }).length).toBeGreaterThan(100);
  });

  it('the shipped retrieve.mjs behaves exactly like the game\'s module', async () => {
    const mjs = await import(join(DIR, 'knowledge/retrieve.mjs'));
    for (const p of [npc({ tier: 'fan', leagues: ['gdc'], favoriteTeams: ['fhl_rivets'], hometown: { city: 'Boston', state: 'MA' }, birthYear: 1980 }), npc({ year: 1990, tier: 'specialist' }), npc({ tier: 'historian', leagues: ['igl'] })]) {
      expect(mjs.retrieve(facts, index, p, { limit: 50 })).toEqual(retrieve(facts, index, p, { limit: 50 }));
    }
  });
});

describe('live context', () => {
  it('only games already played, in the published shape, labelled as this save', () => {
    const ctx = liveContextOf({ seed: 7, historyFrom: 1, evolveFrom: 2 }, 1, 6);
    expect(liveContextSchema.safeParse(ctx).success).toBe(true);
    expect(ctx).toMatchObject({ year: 2027, week: 6, scope: 'save' });
    for (const l of ctx.leagues) {
      expect(l.standings).toHaveLength(8);
      expect(l.recent.every((g) => g.week < 6)).toBe(true);
    }
  });
});
