import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { demoSlate, TEAMS } from '../src/sports/demo';
import { buildKnowledgePack, FORBIDDEN_KEYS, sha256 } from '../src/sports/lore/exportPack';
import { compareRevision, importLorePack } from '../src/sports/lore/importPack';
import type { LorePack } from '../src/sports/lore/schema';
import {
  bundledLore, bundledLoreIssues, canClaimFirsthand, canKnow, checkSimulated, knownFacts, leagueTimeline, lore, npcLoreContext, rivalrySummary,
  sportsYearForSeason, teamHistory, type LoreViewer,
} from '../src/sports/lore/service';
import { errorsOf, validatePack } from '../src/sports/lore/validate';
import { stakeCheck } from '../src/sports/slip';
import { createWorld, playLeagueSeason } from '../src/sports/season';

const REGISTRY = TEAMS.map((t) => ({ id: t.id, league: t.league, city: t.city, displayName: t.displayName }));
const L = bundledLore();
/** A mutable copy for negative tests. */
const copy = (): LorePack => structuredClone(L) as LorePack;
const codes = (p: LorePack) => errorsOf(validatePack(p)).map((i) => i.code);
const NOW: LoreViewer = { year: 2027, tier: 'historian' };

describe('sports-lore/1 canon pack', () => {
  it('is valid, versioned and still a draft', () => {
    expect(bundledLoreIssues()).toEqual([]);
    expect(L.manifest.schema_version).toBe('sports-lore/1');
    expect(L.manifest.canon_revision).toBe('0.1.0-draft');
    expect(L.manifest.canon_status).toBe('proposed');
    expect(L.events.every((e) => e.status === 'draft')).toBe(true);
  });

  it('matches the game registry for all 32 teams (ids, leagues, cities)', () => {
    expect(L.teams).toHaveLength(32);
    expect(errorsOf(validatePack(L, { registry: REGISTRY }))).toEqual([]);
    for (const t of L.teams) expect(TEAMS.find((g) => g.id === t.id)!.displayName.startsWith(`${t.city} ${t.nickname}`), t.id).toBe(true);
  });

  it('has exactly the 16 anchor events', () => {
    expect(L.events.map((e) => e.id).sort()).toEqual([
      'ccl-1974-001', 'ccl-1987-001', 'ccl-1996-001', 'ccl-2008-001',
      'fhl-1978-001', 'fhl-1989-001', 'fhl-2002-001', 'fhl-2019-001',
      'gdc-1972-001', 'gdc-1983-001', 'gdc-1998-001', 'gdc-2011-001',
      'igl-1976-001', 'igl-1985-001', 'igl-1994-001', 'igl-2016-001',
    ]);
  });

  it('has the four founding years, trophies and current schedules', () => {
    expect(L.leagues.map((l) => [l.id, l.founded, l.trophy, l.current_format.games_per_team])).toEqual([
      ['gdc', 1972, 'Founders Cup', 42],
      ['ccl', 1974, 'The Crown', 28],
      ['igl', 1976, 'Iron Bowl', 14],
      ['fhl', 1978, 'Frost Cup', 28],
    ]);
    // Modern schedule lengths are not applied to history: only facts the anchors state are recorded.
    expect(L.leagues.every((l) => l.current_format.effective_year === null)).toBe(true);
    expect(lore.league('igl')!.known_historic_formats.map((h) => h.season)).toEqual([1985, 2015]);
  });

  it('writes no history that the bible leaves open', () => {
    const est = L.championships.filter((c) => c.status === 'established');
    expect(est.map((c) => c.id).sort()).toEqual(['ccl-1987', 'ccl-1988', 'ccl-1989', 'ccl-1996', 'ccl-2012', 'fhl-2002', 'fhl-2019', 'gdc-1998', 'igl-1985', 'igl-1994', 'igl-2016']);
    const c2009 = L.championships.find((c) => c.id === 'ccl-2009')!;
    expect([c2009.status, c2009.champion]).toEqual(['winner_unknown', null]);
    expect(L.championships.find((c) => c.id === 'fhl-1995')!.status).toBe('inference_pending_approval');
    expect(L.championships.find((c) => c.id === 'igl-cle-1983-1986')).toMatchObject({ status: 'year_unknown', season: null, window: { count: 2 } });
    for (const p of ['per_darius_king', 'per_leon_mercer']) expect(lore.person(p)!.affiliations).toEqual([]);
    expect(L.leagues.every((l) => l.founding.founding_franchise_ids === null)).toBe(true);
    expect(L.franchiseHistory.every((f) => f.founding_city === null && f.relocations === null && f.current_since === null)).toBe(true);
    // Every other season since founding is shown as unwritten, not as a drought or a guess.
    const t = leagueTimeline('gdc', NOW);
    expect(t.ledger).toHaveLength(2026 - 1972 + 1);
    expect(t.counts).toEqual({ established: 1, unwritten: 54, pending: 0 });
  });
});

describe('validation catches bad canon', () => {
  it('duplicate ids, unknown teams and wrong leagues', () => {
    let p = copy();
    p.events[1].id = p.events[0].id;
    expect(codes(p)).toContain('DUPLICATE_ID');
    p = copy();
    p.events.find((e) => e.id === 'gdc-1998-001')!.teams.push('gdc_nowhere');
    expect(codes(p)).toContain('UNKNOWN_TEAM');
    p = copy();
    p.rivalries[0].teams = ['ccl_voltage', 'fhl_polars'];
    expect(codes(p)).toContain('TEAM_LEAGUE');
    expect(errorsOf(validatePack(L, { registry: REGISTRY.filter((r) => r.id !== 'fhl_rivets') })).map((i) => i.code)).toContain('REGISTRY');
  });

  it('chronology: nothing before a league existed, nothing past 2026, spans in order', () => {
    let p = copy();
    p.events.find((e) => e.id === 'fhl-1989-001')!.span.start = 1975;
    expect(codes(p)).toContain('CHRONOLOGY');
    p = copy();
    p.championships.find((c) => c.id === 'fhl-2019')!.season = 2031;
    expect(codes(p)).toContain('CHRONOLOGY');
    p = copy();
    p.events.find((e) => e.id === 'igl-2016-001')!.facts[0].year = 2014;
    expect(codes(p)).toContain('CHRONOLOGY');
  });

  it('trophies must match their league', () => {
    const p = copy();
    p.championships.find((c) => c.id === 'gdc-1998')!.trophy = 'Frost Cup';
    expect(codes(p)).toContain('TROPHY');
  });

  it('championships: no duplicates, no contradictions with events, no invented winners', () => {
    let p = copy();
    p.championships.push({ ...structuredClone(p.championships.find((c) => c.id === 'igl-1994')!), id: 'igl-1994-b' });
    expect(codes(p)).toContain('DUPLICATE_CHAMPIONSHIP');
    p = copy();
    p.championships.find((c) => c.id === 'igl-1994')!.champion = 'igl_squall';
    p.championships.find((c) => c.id === 'igl-1994')!.runner_up = 'igl_thunderherd';
    expect(codes(p)).toContain('CONTRADICTION');
    p = copy();
    p.championships.find((c) => c.id === 'ccl-2012')!.champion = null;
    expect(codes(p)).toContain('INCOMPLETE');
    p = copy();
    p.championships.find((c) => c.id === 'ccl-2009')!.champion = 'ccl_monsoon';
    expect(codes(p)).toContain('CONTRADICTION');
  });

  it('first titles, droughts and undated titles stay consistent', () => {
    const add = (p: LorePack, id: string, league: 'ccl' | 'fhl' | 'igl', season: number, champion: string, trophy: string) =>
      p.championships.push({ id, league, season, trophy, champion, runner_up: null, status: 'established', events: ['ccl-1996-001'], notes: 'test', cite: [{ source: 'src.bible', locator: 'test' }] });
    let p = copy();
    add(p, 'ccl-1990', 'ccl', 1990, 'ccl_dustdevils', 'The Crown');
    expect(codes(p)).toContain('CONTRADICTION'); // 1996 was Las Vegas's first title
    p = copy();
    add(p, 'fhl-2005', 'fhl', 2005, 'fhl_snowowls', 'Frost Cup');
    expect(codes(p)).toContain('CONTRADICTION'); // inside the 1996-2018 drought
    p = copy();
    add(p, 'igl-1983', 'igl', 1983, 'igl_rockslides', 'Iron Bowl');
    expect(codes(p)).toEqual([]); // one non-Cleveland year still leaves room for two Cleveland titles
    add(p, 'igl-1986', 'igl', 1986, 'igl_rockslides', 'Iron Bowl');
    expect(codes(p)).toContain('CONTRADICTION'); // now there is no room
  });

  it('an approved canon may not carry draft content', () => {
    const p = copy();
    p.manifest.canon_status = 'approved';
    expect(codes(p)).toContain('CANON_STATUS');
  });
});

describe('knowledge tiers and the year clock', () => {
  const voss = lore.event('gdc-1983-001')!;
  const stat = voss.facts.find((f) => f.tier === 'specialist')!;
  const headline = voss.facts[0];

  it('casual viewers get headlines, specialists get stats in their own leagues', () => {
    expect(canKnow({ year: 2027, tier: 'casual' }, voss, headline)).toBe(true);
    expect(canKnow({ year: 2027, tier: 'casual' }, voss, stat)).toBe(false);
    expect(canKnow({ year: 2027, tier: 'specialist', leagues: ['gdc'] }, voss, stat)).toBe(true);
    expect(canKnow({ year: 2027, tier: 'specialist', leagues: ['fhl'] }, voss, stat)).toBe(false);
    expect(canKnow({ year: 2027, tier: 'historian', leagues: ['fhl'] }, voss, stat)).toBe(true);
  });

  it('fans know their own team\'s notable events even outside the leagues they follow', () => {
    const e = lore.event('gdc-2011-001')!;
    expect(canKnow({ year: 2027, tier: 'fan', leagues: ['ccl'] }, e, e.facts[0])).toBe(false);
    expect(canKnow({ year: 2027, tier: 'fan', leagues: ['ccl'], teams: ['gdc_kingfishers'] }, e, e.facts[0])).toBe(true);
  });

  it('nobody knows the future: facts dated in or after the current sports year are hidden', () => {
    for (const year of [1980, 1995, 2002, 2019, 2027]) {
      const facts = knownFacts({ year, tier: 'historian' });
      expect(facts.every((f) => f.year < year), String(year)).toBe(true);
    }
    expect(knownFacts({ year: 2019, tier: 'historian' }).some((f) => f.event === 'fhl-2019-001')).toBe(false);
    expect(knownFacts({ year: 2020, tier: 'historian' }).some((f) => f.event === 'fhl-2019-001')).toBe(true);
    // A rivalry span is revealed fact by fact.
    expect(knownFacts({ year: 1989, tier: 'casual' }, (e) => e.id === 'ccl-1987-001').map((f) => f.fact)).toEqual(['ccl-1987-001#f2', 'ccl-1987-001#f3']);
    const early = leagueTimeline('fhl', { year: 2010, tier: 'historian' });
    expect(early.ledger[0].season).toBe(2009);
    expect(early.ledger.some((r) => r.status === 'inference_pending_approval')).toBe(false); // its proof (2019) hasn't happened
  });

  it('the career clock: season 1 is 2027, so all 1972-2026 canon is past', () => {
    expect(sportsYearForSeason(1)).toBe(2027);
    expect(knownFacts({ year: sportsYearForSeason(1), tier: 'historian' })).toHaveLength(L.events.reduce((n, e) => n + e.facts.length, 0));
  });

  it('firsthand claims must fit the NPC\'s age', () => {
    expect(canClaimFirsthand('fhl-1989-001', 1975)).toBe(true);
    expect(canClaimFirsthand('fhl-1989-001', 1985)).toBe(false);
    expect(canClaimFirsthand('fhl-1989-001', null)).toBe(false);
  });

  it('NPC context carries event ids, the rules and the constraints for what it knows', () => {
    const c = npcLoreContext({ npcId: 'test_fan', tier: 'fan', leagues: ['igl'], teams: ['igl_squall'], birthYear: 1970 }, 2027);
    expect(c.loreRevision).toBe('0.1.0-draft');
    expect(c.facts.every((f) => /^[a-z]{3}-\d{4}-\d{3}#f\d+$/.test(f.fact))).toBe(true);
    expect(c.constraints).toContainEqual({ event: 'igl-1994-001', rule: 'NPCs may disagree with the call, but never say New Orleans officially won.' });
    expect(c.perspectives.map((p) => p.team)).toEqual(['igl_squall']);
    expect(c.firsthand).toContain('igl-1994-001');
    expect(c.facts.some((f) => f.tier === 'specialist')).toBe(false);
  });

  it('selectors: team history and rivalries', () => {
    const btv = teamHistory('fhl_snowowls', NOW)!;
    expect(btv.titles).toEqual([2019]);
    expect(btv.pendingTitles).toEqual([1995]);
    expect(teamHistory('igl_ironclads', NOW)!.undatedTitles).toEqual([expect.objectContaining({ count: 2, from: 1983, to: 1986 })]);
    expect(teamHistory('gdc_lamplighters', NOW)!.finalsLost).toEqual([1998]);
    expect(rivalrySummary('fhl-borealis-yetis', { year: 2002, tier: 'historian' })).toBeNull();
    expect(rivalrySummary('fhl-borealis-yetis', NOW)!.facts.length).toBeGreaterThan(0);
  });
});

describe('save-specific simulated history', () => {
  it('lives in a namespaced ledger, starts in 2027 and never overwrites canon', () => {
    const ok = [{ namespace: 'save:abc', league: 'fhl' as const, season: 2027, champion: 'fhl_yetis', runnerUp: 'fhl_polars' }];
    expect(checkSimulated(ok)).toEqual([]);
    expect(checkSimulated([{ ...ok[0], season: 2019 }]).map((i) => i.code)).toContain('CANON_OVERWRITE');
    expect(checkSimulated([{ ...ok[0], namespace: 'global' }]).map((i) => i.code)).toContain('NAMESPACE');
    expect(checkSimulated([{ ...ok[0], champion: 'gdc_loons' }]).map((i) => i.code)).toContain('UNKNOWN_TEAM');
    const before = JSON.stringify(L);
    const t = leagueTimeline('fhl', { year: 2029, tier: 'historian' }, [...ok, { ...ok[0], season: 2019, champion: 'fhl_floes' }]);
    expect(t.ledger.find((r) => r.season === 2027)).toMatchObject({ source: 'simulated', namespace: 'save:abc', champion: 'fhl_yetis' });
    expect(t.ledger.find((r) => r.season === 2019)).toMatchObject({ source: 'canon', champion: 'fhl_snowowls' });
    expect(JSON.stringify(L)).toBe(before);
    expect(Object.isFrozen(L.championships[0])).toBe(true);
  });
});

describe('export and import (NPC Factory knowledge pack)', () => {
  const { files, stripped } = buildKnowledgePack(L, 'test');

  it('exports the nine files, schemas and a README, with hashes and nothing private', () => {
    expect(stripped).toEqual([]);
    expect(Object.keys(files).filter((f) => !f.startsWith('schemas/')).sort()).toEqual([
      'README.md', 'championships.json', 'dialogue_rules.json', 'events.json', 'franchise_history.json', 'leagues.json', 'manifest.json', 'people.json', 'rivalries.json', 'teams.json',
    ]);
    expect(Object.keys(files).filter((f) => f.startsWith('schemas/'))).toHaveLength(9);
    expect(JSON.parse(files['schemas/events.schema.json']).$schema).toContain('2020-12');
    const walk = (v: unknown): string[] => (Array.isArray(v) ? v.flatMap(walk) : v && typeof v === 'object' ? Object.entries(v).flatMap(([k, x]) => [k, ...walk(x)]) : []);
    for (const [name, c] of Object.entries(files)) if (name.endsWith('.json') && !name.startsWith('schemas/')) expect(walk(JSON.parse(c)).filter((k) => FORBIDDEN_KEYS.test(k)), name).toEqual([]);
    // A pack that somehow carried save data is stripped.
    const dirty = copy() as LorePack & { manifest: { bankroll?: number } };
    (dirty.teams[0] as unknown as Record<string, unknown>).saveId = 'x';
    expect(buildKnowledgePack(dirty).stripped).toEqual(['teams.json[0].saveId']);
  });

  it('round-trips through import with hash verification', () => {
    const r = importLorePack(files, { sha256, registry: REGISTRY, current: L });
    expect(r.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(r.pack!.events).toEqual(L.events);
  });

  it('rejects tampering, the wrong contract, older revisions and removed ids', () => {
    expect(importLorePack({ ...files, 'events.json': files['events.json'].replace('24-20', '20-24') }, { sha256 }).issues.map((i) => i.code)).toContain('HASH');
    const m = JSON.parse(files['manifest.json']);
    expect(importLorePack({ ...files, 'manifest.json': JSON.stringify({ ...m, schema_version: 'sports-lore/2' }) }).issues.map((i) => i.code)).toEqual(['UNSUPPORTED_SCHEMA']);
    const older = importLorePack({ ...files, 'manifest.json': JSON.stringify({ ...m, canon_revision: '0.0.9' }) }, { current: L });
    expect(older.issues.map((i) => i.code)).toContain('REVISION_OLDER');
    const fewer = JSON.parse(files['rivalries.json']).slice(1);
    expect(importLorePack({ ...files, 'rivalries.json': JSON.stringify(fewer) }, { current: L }).issues.map((i) => i.code)).toContain('ID_REMOVED');
    // A newer revision that adds a fact imports cleanly.
    const ev = JSON.parse(files['events.json']);
    ev[0].facts.push({ id: 'f9', text: 'A newly approved detail.', year: ev[0].year, tier: 'historian' });
    const newer = importLorePack({ ...files, 'events.json': JSON.stringify(ev), 'manifest.json': JSON.stringify({ ...m, canon_revision: '0.2.0-draft' }) }, { current: L });
    expect(newer.ok).toBe(true);
    expect(compareRevision('0.1.0-draft', '0.1.0')).toBeLessThan(0);
  });

  it('the committed export in exports/ is current', () => {
    const dir = join(__dirname, '../exports/sports-lore-0.1.0-draft');
    const onDisk = (readdirSync(dir, { recursive: true }) as string[]).filter((f) => f.includes('.')).map((f) => f.replaceAll('\\', '/')).sort();
    const pkgVersion = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8')).version;
    const fresh = buildKnowledgePack(L, pkgVersion).files;
    expect(onDisk).toEqual(Object.keys(fresh).sort());
    for (const f of onDisk) if (f !== 'manifest.json') expect(readFileSync(join(dir, f), 'utf8'), f).toBe(fresh[f]);
  });
});

describe('boundaries: lore never touches the simulation, odds, bankroll or saves', () => {
  const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
  const importsOf = (p: string) => [...src(p).matchAll(/from '([^']+)'/g)].map((m) => m[1]);

  it('lore modules import only their own files, zod and node:crypto', () => {
    for (const f of readdirSync(join(__dirname, '../src/sports/lore')).filter((f) => f.endsWith('.ts'))) {
      for (const i of importsOf(`src/sports/lore/${f}`)) expect(i, f).toMatch(/^(\.\/|zod$|node:crypto$)/);
    }
  });

  it('the save layer, engine and slip do not import lore; the UI never imports the exporter', () => {
    const walk = (d: string): string[] => readdirSync(join(__dirname, '..', d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : e.name.endsWith('.ts') || e.name.endsWith('.tsx') ? [`${d}/${e.name}`] : []));
    for (const f of [...walk('src/persistence'), 'src/sports/season.ts', 'src/sports/slip.ts', 'src/sports/rng.ts']) expect(importsOf(f).some((i) => i.includes('lore')), f).toBe(false);
    for (const f of walk('src/ui')) expect(importsOf(f).some((i) => i.includes('exportPack') || i.includes('importPack')), f).toBe(false);
  });

  it('sports results and odds are identical before and after loading and querying lore', () => {
    const before = { s: playLeagueSeason(createWorld(41), 'fhl', 1), odds: demoSlate('ccl'), stake: stakeCheck(50, 2, true, 1000) };
    importLorePack(buildKnowledgePack(L).files, { sha256 });
    leagueTimeline('fhl', NOW);
    npcLoreContext({ npcId: 'x', tier: 'historian' }, 2027);
    const after = { s: playLeagueSeason(createWorld(41), 'fhl', 1), odds: demoSlate('ccl'), stake: stakeCheck(50, 2, true, 1000) };
    expect(after).toEqual(before);
  });
});
