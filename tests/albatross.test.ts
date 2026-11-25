import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { milestoneTrophyId } from '../src/catalog/trophies';
import * as E from '../src/career/engine';
import { holedLongShotChance, simHole } from '../src/career/field';
import {
  activeCourse,
  completeRound,
  computeStandings,
  finalizeTournament,
  findTournament,
  parsOf,
  startTournament,
  type TournamentResult,
} from '../src/career/tournament';
import { checksum } from '../src/core/checksum';
import { rng } from '../src/golf/math';
import { CURRENT_SCHEMA_VERSION, STORES_V1 } from '../src/persistence/db';
import {
  albatrossId,
  detectAlbatrosses,
  finalHoleStrokes,
  holeToPar,
  isAlbatross,
  isVerifiedRecord,
  rankByCount,
  type AlbatrossRecord,
} from '../src/records/albatross';
import { buildTournamentEvent } from '../src/services/tournamentPipeline';
import { createServices } from '../src/services';
import { playTournament, setCareer } from './careerHelpers';
import { newCareer, reload, RYAN } from './helpers';

/** Albatross on every par 5 Ryan plays, par everywhere else. */
const albatrossOnPar5s = (par: number) => (par === 5 ? 2 : par);

describe('albatross detection', () => {
  it('par 5 in 2 and par 4 in 1 are albatrosses', () => {
    expect(isAlbatross(5, 2)).toBe(true);
    expect(isAlbatross(4, 1)).toBe(true);
    expect(holeToPar(5, 2)).toBe(-3);
  });

  it('an eagle is not an albatross, and nothing else is either', () => {
    expect(isAlbatross(5, 3)).toBe(false); // eagle
    expect(isAlbatross(4, 2)).toBe(false); // eagle
    expect(isAlbatross(3, 1)).toBe(false); // ace on a par 3 is an eagle
    expect(isAlbatross(5, 1)).toBe(false); // condor (−4) is not exactly −3
    expect(isAlbatross(4, 0)).toBe(false);
    expect(isAlbatross(5, 2.5)).toBe(false);
  });

  it('penalty strokes are part of the final hole score', () => {
    // Two swings, but one went in the water: 3 on a par 5 is an eagle.
    expect(finalHoleStrokes(2, 1)).toBe(3);
    expect(isAlbatross(5, finalHoleStrokes(2, 1))).toBe(false);
    expect(isAlbatross(5, finalHoleStrokes(2, 0))).toBe(true);
  });
});

describe('albatrosses through the tournament pipeline', () => {
  it('records each one once, with stats, trophies, achievements and news', async () => {
    const { s, dbName } = await newCareer();
    const first = await playTournament(s, 'amateur-1-w2', { score: albatrossOnPar5s });
    const count = (x: TournamentResult) => x.pars.filter((p) => p === 5).length * x.def.rounds;
    // After one event: the first-albatross ball, but not yet the plaque.
    expect(count(first.result!)).toBeLessThan(5);
    expect(await s.db.trophies.get(milestoneTrophyId(RYAN, 'albatross_first'))).toBeDefined();
    expect(await s.db.trophies.get(milestoneTrophyId(RYAN, 'albatross_five'))).toBeUndefined();
    const out = await playTournament(s, 'amateur-1-w5', { score: albatrossOnPar5s });
    const r = out.result!;
    const expected = count(first.result!) + count(r);
    expect(expected).toBeGreaterThanOrEqual(5);

    const mine = await s.db.albatrosses.where('golferId').equals(RYAN).toArray();
    expect(mine).toHaveLength(expected);
    for (const a of mine) {
      expect(a).toMatchObject({ isPlayer: true, par: 5, strokes: 2, source: 'live' });
      expect(a.id).toBe(albatrossId(a.tournamentId, RYAN, a.round, a.holeNumber));
      expect(a.yards).toBeGreaterThan(400);
    }

    const c = await s.career.getCareer();
    expect(c.totals.albatrosses).toBe(expected);
    expect(c.totals.eagles).toBe(0); // albatrosses are not eagles
    expect(c.achievements.albatross).toBeTruthy();
    expect(c.achievements.albatross_5).toBeTruthy();
    expect(c.inbox.some((m) => m.title.startsWith('Ryan records his first career albatross'))).toBe(true);

    // Clubhouse trophies: the first-albatross ball and the five-albatross plaque.
    const ball = await s.db.trophies.get(milestoneTrophyId(RYAN, 'albatross_first'));
    const plaque = await s.db.trophies.get(milestoneTrophyId(RYAN, 'albatross_five'));
    expect(ball?.sourceTournamentId).toBe('amateur-1-w2');
    expect(plaque?.sourceTournamentId).toBe('amateur-1-w5');
    expect(plaque?.metadata.milestone).toMatch(/^Career albatross #5: Par 5 in 2/);

    // Reprocessing the same saved event changes nothing.
    const again = await s.pipeline.process(buildTournamentEvent(r));
    expect(again.status).toBe('duplicate');
    expect(await s.db.albatrosses.count()).toBe(expected + (await s.db.albatrosses.where('golferId').notEqual(RYAN).count()));
    expect(await s.records.reconcile()).toMatchObject({ added: 0, removed: 0 });

    // Persisted across a reload.
    const s2 = await reload(s, dbName);
    expect(await s2.db.albatrosses.where('golferId').equals(RYAN).count()).toBe(expected);
    expect((await s2.career.getCareer()).totals.albatrosses).toBe(expected);
  });

  it('keeps how Ryan holed it, when she played the hole herself', async () => {
    const { s } = await newCareer();
    const def = findTournament('amateur-1-w2')!;
    await setCareer(s, (c) => {
      c.season = def.season;
      c.week = def.week;
      c.pendingStory = null;
      c.energy = 100;
    });
    await s.career.enterTournament(def.id, 'full');
    let c = await s.career.getCareer();
    const par5 = parsOf(activeCourse(c.active!)).indexOf(5);
    await s.career.recordHole(par5, 2, 'Holed a 3-wood from 231 yds');
    await s.career.recordHole(par5 === 0 ? 1 : 0, 4, 'not kept: not an albatross');
    c = await s.career.getCareer();
    expect(Object.values(c.shotNotes ?? {})).toEqual(['Holed a 3-wood from 231 yds']);
    for (let i = 0; i < 6 && (await s.career.getCareer()).active; i++) await s.career.finishRound();
    const rec = await s.db.albatrosses.get(albatrossId(def.id, RYAN, 1, par5 + 1));
    expect(rec?.shot).toBe('Holed a 3-wood from 231 yds');
    expect((await s.career.getCareer()).shotNotes).toEqual({});
  });

  it('AI golfers earn verified albatrosses from their own hole scores', async () => {
    const { s } = await newCareer();
    const c = await s.career.getCareer();
    const def = findTournament('amateur-1-w2')!;
    let a = startTournament(def, c, 'sim');
    while (a.round < def.rounds) a = completeRound(a, def, c);
    let r = finalizeTournament(a, def, c.playerId);
    // Hand a rival in the field a par-5 two in round 1 (as the simulator can), and re-seal.
    const ai = r.entrants.find((e) => e.id !== r.playerId)!;
    const hole = r.pars.indexOf(5);
    r = reseal(r, (x) => {
      x.scores[ai.id][0][hole] = 2;
      x.standings = computeStandings(x.def, x.entrants, x.scores, x.pars);
    });
    await setCareer(s, (k) => k.entered.push(def.id));
    expect((await s.pipeline.process(buildTournamentEvent(r))).status).toBe('applied');
    const rec = await s.db.albatrosses.get(albatrossId(def.id, ai.id, 1, hole + 1));
    expect(rec).toMatchObject({ golferName: ai.name, isPlayer: false, strokes: 2, par: 5 });
    // Ryan earns nothing for someone else's albatross.
    expect(await s.db.trophies.get(milestoneTrophyId(RYAN, 'albatross_first'))).toBeUndefined();
  });
});

describe('the hole simulator', () => {
  it('produces albatrosses only as a rare outcome, never on par 3s, scaled by skill', () => {
    const count = (par: number, rating: number, n: number, seed: number) => {
      const r = rng(seed);
      let k = 0;
      for (let i = 0; i < n; i++) if (simHole(par, rating, r) - par === -3) k++;
      return k;
    };
    const N = 1_000_000;
    const elite = count(5, 80, N, 11);
    const expected = holedLongShotChance(5, 80) * N; // ≈ 64
    expect(elite).toBeGreaterThan(expected * 0.55);
    expect(elite).toBeLessThan(expected * 1.5);
    expect(count(3, 99, 200_000, 12)).toBe(0);
    expect(count(5, 30, N, 13)).toBeLessThan(elite);
    // Eagles stay far more common than albatrosses.
    const r = rng(14);
    let eagles = 0;
    for (let i = 0; i < 100_000; i++) if (simHole(5, 80, r) === 3) eagles++;
    expect(eagles).toBeGreaterThan(1000);
  });

  it('seeded batch: AI albatross frequency is realistic across 400 LPGA events', () => {
    const c = E.newCareerState(9);
    c.status = 'pro';
    c.tourCard = 'lpga';
    let albs = 0;
    let par5s = 0;
    let ai = 0;
    for (let i = 0; i < 400; i++) {
      const def = findTournament(`lpga-1-w${[2, 4, 6, 8][i % 4]}`)!;
      const k = { ...c, seed: 1000 + i } as typeof c;
      let a = startTournament(def, k, 'sim');
      a = { ...a, seed: 5000 + i };
      while (a.round < def.rounds) a = completeRound(a, def, k);
      const r = finalizeTournament(a, def, k.playerId);
      for (const rounds of Object.values(r.scores)) for (const h of rounds) h.forEach((_, j) => (par5s += r.pars[j] === 5 ? 1 : 0));
      const found = detectAlbatrosses(r, { source: 'live', sourceCareerEventId: 'x', recordedAtReal: new Date().toISOString() });
      albs += found.length;
      ai += found.filter((f) => !f.isPlayer).length;
    }
    const rate = albs / par5s;
    // Roughly one per 10-60 thousand par 5s: rare, but a long career will see some.
    expect(rate).toBeGreaterThan(1 / 60_000);
    expect(rate).toBeLessThan(1 / 8_000);
    expect(ai).toBeGreaterThan(0);
  });
});

describe('record book', () => {
  const rec = (golferId: string, season: number, week: number, golferName = golferId): AlbatrossRecord => ({
    id: albatrossId(`t${season}${week}`, golferId, 1, 3),
    golferId,
    golferName,
    isPlayer: false,
    tournamentId: `t${season}${week}`,
    tournamentName: 'Event',
    tour: 'lpga',
    tourName: 'LPGA Tour',
    major: false,
    season,
    week,
    gameDate: '2027-03-01T12:00:00.000Z',
    courseId: 'c',
    courseName: 'Course',
    round: 1,
    holeNumber: 3,
    holeName: 'Hole',
    par: 5,
    yards: 510,
    strokes: 2,
    source: 'live',
    sourceCareerEventId: 'e',
    recordedAtReal: '2026-11-21T00:00:00.000Z',
  });

  it('shares ranks for equal counts and orders ties by most recent, then name', () => {
    const rows = rankByCount(
      [rec('a', 1, 2), rec('a', 1, 4), rec('a', 2, 2), rec('b', 1, 6), rec('b', 3, 1), rec('c', 1, 8), rec('c', 2, 9), rec('d', 1, 3), rec('e', 1, 3)],
      { a: 40 },
      new Set(['d']),
    );
    expect(rows.map((r) => [r.golferId, r.count, r.rankLabel])).toEqual([
      ['a', 3, '1'],
      ['b', 2, 'T2'], // most recent (season 3) first
      ['c', 2, 'T2'],
      ['d', 1, 'T4'], // same week: name decides the display order only
      ['e', 1, 'T4'],
    ]);
    expect(rows[0].rounds).toBe(40);
    // Retired golfers stay in the record book.
    expect(rows.find((r) => r.golferId === 'd')?.status).toBe('Retired');
  });

  it('refuses to read albatrosses from a tampered record', async () => {
    const { s } = await newCareer();
    const out = await playTournament(s, 'amateur-1-w2');
    const r = structuredClone(out.result!);
    expect(isVerifiedRecord(r)).toBe(true);
    r.scores[r.playerId][0][r.pars.indexOf(5)] = 2; // edited without the engine's seal
    expect(isVerifiedRecord(r)).toBe(false);
  });
});

describe('save migration (v1 → v2)', () => {
  it('an existing v1 save opens with everything kept, and verified history is backfilled once', async () => {
    // Build a real career with albatrosses, then rewrite it as a v1 database.
    const { s } = await newCareer();
    await playTournament(s, 'amateur-1-w2', { score: albatrossOnPar5s });
    const tables: Record<string, unknown[]> = {};
    for (const name of Object.keys(STORES_V1)) tables[name] = await s.db.table(name).toArray();
    const expected = await s.db.albatrosses.count();
    s.db.close();
    // Legacy saves: no albatross total, albatrosses counted as eagles, no milestone trophies.
    const career = tables.careers[0] as ReturnType<typeof E.newCareerState>;
    const mineCount = career.totals.albatrosses!;
    delete career.totals.albatrosses;
    career.totals.eagles += mineCount;
    tables.trophies = (tables.trophies as { id: string }[]).filter((t) => !t.id.includes(':milestone:'));

    const name = `v1-${Date.now()}`;
    const v1 = new Dexie(name);
    v1.version(1).stores(STORES_V1);
    await v1.open();
    for (const [t, rows] of Object.entries(tables)) await v1.table(t).bulkAdd(rows);
    v1.close();

    const s2 = createServices(name);
    await s2.career.ensureCareer(RYAN);
    expect(s2.db.verno).toBe(CURRENT_SCHEMA_VERSION); // v1 opens straight up to the current version
    expect(await s2.db.tournaments.count()).toBe(1);
    expect(await s2.db.albatrosses.count()).toBe(0); // nothing invented on open
    const before = await s2.career.loadClubhouse(RYAN);
    expect(before.career.totals.events).toBe(1);

    const report = await s2.records.reconcile();
    expect(report).toMatchObject({ added: expected, removed: 0, skippedRecords: 0 });
    expect(report.trophies).toEqual([milestoneTrophyId(RYAN, 'albatross_first')]); // 4 so far: the plaque needs 5
    const after = await s2.career.getCareer();
    expect(after.totals.albatrosses).toBe(mineCount);
    expect(after.totals.eagles).toBe(0); // the old overcount is taken back out
    expect((await s2.db.albatrosses.toArray()).every((a) => a.source === 'backfill')).toBe(true);

    // Running it again is a no-op.
    expect(await s2.records.reconcile()).toMatchObject({ added: 0, removed: 0, trophies: [] });
    expect((await s2.career.getCareer()).totals.eagles).toBe(0);
  });

  it('a v1 save file imports, gains the record book, and forged records are dropped', async () => {
    const { s } = await newCareer();
    await playTournament(s, 'amateur-1-w2', { score: albatrossOnPar5s });
    const real = await s.db.albatrosses.count();
    const file = await s.saves.exportSave();
    expect(file.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);

    // As a v1 file.
    const old = structuredClone(file);
    old.schemaVersion = 1;
    delete old.tables.albatrosses;
    const { s: a } = await newCareer();
    await a.saves.importSave(old);
    expect(await a.db.albatrosses.count()).toBe(0);
    await a.records.reconcile();
    expect(await a.db.albatrosses.count()).toBe(real);

    // A v2 file with an albatross no stored result supports.
    const forged = structuredClone(file);
    const fake = { ...(forged.tables.albatrosses![0] as AlbatrossRecord), id: albatrossId('lpga-1-w20', RYAN, 1, 1), tournamentId: 'lpga-1-w20' };
    forged.tables.albatrosses!.push(fake);
    const { s: b } = await newCareer();
    await b.saves.importSave(forged);
    expect(await b.records.reconcile()).toMatchObject({ removed: 1 });
    expect(await b.db.albatrosses.get(fake.id)).toBeUndefined();
    expect(await b.db.albatrosses.count()).toBe(real);
  });
});

function reseal(r: TournamentResult, mutate: (x: TournamentResult) => void): TournamentResult {
  const x = structuredClone(r);
  mutate(x);
  const { authority, ...content } = x;
  x.authority = { ...authority, checksum: checksum(content) };
  return x;
}
