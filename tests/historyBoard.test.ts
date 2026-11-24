import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { sportsWorldOf } from '../src/career/sportsbook';
import { buildBoard, SPORT_AWARD, type Board, type SaveHistory } from '../src/sports/archive/board';
import { fmtValue, RECORD_CATS } from '../src/sports/archive/records';
import { buildSaveHistory, type StoredYear } from '../src/sports/archive/save';
import { buildShared, loadShared, type SharedArchive } from '../src/sports/archive/shared';
import { seasonOf } from '../src/sports/book';
import { LEAGUES, type LeagueId } from '../src/sports/demo';
import { FOUNDED } from '../src/sports/history/honors';
import { forgetChain, processSeason, type EvolveRef } from '../src/sports/universe/chain';
import { initialNav, navReduce } from '../src/ui/history/nav';
import { historySeason } from '../src/sports/history/games';
import { freeSeason, mergeForward } from '../src/sports/history/forward';
import { seasonStats } from '../src/sports/history/stats';
import { newCareer } from './helpers';

const read = (f: string) => JSON.parse(readFileSync(f, 'utf8'));
const files = () => ({
  players: read('src/sports/history/data/players.json').players,
  seasons: read('src/sports/history/data/seasons.json').seasons,
  honors: read('src/sports/history/data/honors.json'),
  forward: read('src/sports/history/data/forward.json'),
  archive: read('src/sports/history/data/archive.json'),
});
const shared: SharedArchive = buildShared(files());
const careers = read('src/sports/history/data/careers.json').careers;
const ledger = read('src/sports/history/data/seasons.json').seasons as { id: string; league: LeagueId; year: number; champion: string; runnerUp: string }[];
const fwd = read('src/sports/history/data/forward.json');
const OFFICIAL: Record<LeagueId, [string, string, string, number]> = {
  gdc: ['Grand Diamond League', "The Workingman's League", 'Founders Cup', 1972],
  ccl: ['Crown Ball League', "The Players' League", 'The Crown', 1974],
  igl: ['Amigo League Football', 'The Saturday League', 'Iron Bowl', 1976],
  fhl: ['Federal Hockey League', 'The Northern Eight', 'Frost Cup', 1978],
};
const L4 = LEAGUES.map((l) => l.id);
/** A save chain's stored years, the way the service stores them (2027 on). */
function chainSave(seed: number, completed: number, ref: EvolveRef = { seed, historyFrom: 1, evolveFrom: 2 }): SaveHistory {
  forgetChain(ref);
  const rows: StoredYear[] = [];
  let state = null;
  for (let s = ref.evolveFrom - 1; s <= completed; s++) {
    const o = processSeason(ref, s, (x) => seasonOf(ref, x));
    rows.push({ year: o.summary.year, summary: o.summary, lines: o.lines });
    state = o.next;
  }
  return buildSaveHistory({ ref, season: completed + 1, week: 1, rows, state });
}

describe('History Board: shared history (no save seasons yet)', () => {
  const b = buildBoard(shared, buildSaveHistory({ ref: { seed: 1, historyFrom: 1, evolveFrom: 2 }, season: 1, week: 5, rows: [], state: null }));

  it('four leagues with their official names, nicknames, trophies and founding years', () => {
    for (const l of L4) expect([b.league(l).name, b.league(l).nickname, b.league(l).trophy, b.league(l).founded]).toEqual(OFFICIAL[l]);
    for (const f of ['src/sports/archive/board.ts', ...['HistoryBoard', 'Overview', 'Seasons', 'Champions', 'Players', 'Records', 'Awards', 'HallOfFame', 'Moments', 'Review', 'TeamPage', 'common'].map((x) => `src/ui/history/${x}.tsx`)]) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/Grand Diamond Circuit|Crown Court League|Iron Gridiron League|Frostline Hockey League|Coach of the Year'/);
    }
  });

  it('seasons run from each founding year to 2026 without gaps; 2027 is not archived while in progress', () => {
    for (const l of L4) {
      const ys = b.seasons(l).map((s) => s.year);
      expect(ys[0]).toBe(FOUNDED[l]);
      expect(ys).toEqual(Array.from({ length: 2026 - FOUNDED[l] + 1 }, (_, i) => FOUNDED[l] + i));
      expect(b.season(l, 2027)).toBeUndefined();
    }
    expect(b.lastCompleted).toBe(2026);
    expect(b.reviewYears()).toEqual([2026]);
  });

  it('every championship matches the ledger, the 2026 season, the playoffs, the title counts and the review', () => {
    for (const l of L4) {
      const titles = b.titles(l);
      for (const s of b.seasons(l)) {
        const src = s.year <= 2025 ? ledger.find((x) => x.id === s.id)! : fwd.seasons.find((x: { id: string }) => x.id === s.id);
        expect([s.champion, s.runnerUp], s.id).toEqual([src.champion, src.runnerUp]);
        expect(s.source).toBe(s.year <= 2025 ? 'canon' : 'shared');
        const final = s.series![2];
        expect(final.winner).toBe(s.champion);
        expect(new Set([final.high, final.low])).toEqual(new Set([s.champion, s.runnerUp]));
        expect(titles.get(s.champion)).toContain(s.year);
        const champWins = final.games.filter(([hh, hs, as]) => ((hs > as) === !!hh ? final.high : final.low) === s.champion).length;
        expect(s.finalWins![0]).toBe(champWins);
        expect(champWins).toBe(b.league(l).sport === 'football' ? 1 : 4);
      }
    }
    const r = b.review(2026)!;
    for (const x of r.leagues) expect(x.champion).toBe(b.season(x.league, 2026)!.champion);
    expect(r.source).toBe('shared');
  });

  it('the archive lines are the published career totals', () => {
    const t = b.totals();
    let checked = 0;
    for (const [id, c] of Object.entries(careers) as [string, { r: Record<string, number> }][]) {
      const p = shared.byId.get(id)!;
      if (p.f >= 2025) continue; // still played in 2026, which careers.json (1972-2025) doesn't include
      for (const [k, v] of Object.entries(c.r)) expect(t.get(id)!.r[k] ?? 0, `${id} ${k}`).toBe(v);
      if (++checked > 400) break;
    }
  });

  it('players: legends and draftees are findable, with stable ids and no duplicates', () => {
    const all = b.players();
    expect(new Set(all.map((p) => p.i)).size).toBe(all.length);
    expect(all.length).toBe(shared.players.length);
    const bellamy = b.player('ccl_andre_bellamy')!;
    expect(bellamy).toMatchObject({ n: 'Andre Bellamy', l: 'ccl', status: 'retired', first: 1999, last: 2014, legend: true });
    expect(bellamy.teams).toEqual(['ccl_forge', 'ccl_monsoon']);
    expect(b.player('igl_mason_vale')!.status).toBe('active');
    expect(all.filter((p) => p.n.toLowerCase().includes('voss')).map((p) => p.i)).toContain('gdc_elias_voss');
    expect(all.some((p) => p.i.includes('_d2027_') && p.source === 'shared')).toBe(true);
  });

  it('record books: computed from the lines, with the bible feats in place', () => {
    for (const l of L4) {
      const rec = b.records(l);
      const lines = b.allLines().filter((x) => x.league === l);
      for (const cat of rec.cats.filter((c) => !c.qualify)) {
        const top = rec.season.get(cat.key)![0];
        if (top) expect(top.value).toBe(Math.max(...lines.map((x) => x.r[cat.key] ?? 0)));
      }
      for (const cat of rec.cats.filter((c) => c.qualify)) for (const row of rec.season.get(cat.key)!) expect(cat.qualify!.season(b.linesOf(row.playerId).find((x) => x.year === row.year)!.r)).toBe(true);
    }
    const gdc = b.records('gdc');
    expect(gdc.season.get('nohit')![0]).toMatchObject({ playerId: 'gdc_elias_voss', year: 1983, value: 3 });
    expect(gdc.season.get('w')![0]).toMatchObject({ playerId: 'gdc_elias_voss', value: 13 });
    expect(b.records('ccl').career.get('pts')![0]).toMatchObject({ playerId: 'ccl_andre_bellamy' });
    expect(b.records('fhl').game.find((g) => g.stat === 'sv')).toMatchObject({ playerId: 'fhl_viktor_soren', value: 71, year: 1989 });
    expect(fmtValue(0.4062, 'avg')).toBe('.406');
    expect(RECORD_CATS.baseball.map((c) => c.key)).toEqual(expect.arrayContaining(['hr', 'h', 'avg', 'w', 'p_k', 'nohit']));
    const team = b.records('gdc').team;
    expect(team.titles[0].count).toBe(Math.max(...[...b.titles('gdc').values()].map((y) => y.length)));
    expect(team.comebacks.some((c) => c.year === 1998 && c.winner === 'gdc_firebirds' && c.deficit === '1-3')).toBe(true);
  });

  it('awards: an MVP and the sport award every season; no rookie award where none qualified; no Coach of the Year', () => {
    const noRookie: string[] = [];
    for (const l of L4) {
      const sport = b.league(l).sport;
      for (const s of b.seasons(l)) {
        expect(s.awards.filter((a) => a.award === 'Most Valuable Player')).toHaveLength(1);
        expect(s.awards.filter((a) => a.award === SPORT_AWARD[sport])).toHaveLength(1);
        if (!s.awards.some((a) => a.award === 'Rookie of the Year')) noRookie.push(s.id);
        expect(s.awards.some((a) => /coach/i.test(a.award))).toBe(false);
      }
      expect(noRookie).toContain(`${l}-${FOUNDED[l]}`); // founding rosters were signings, not rookies
    }
    expect(noRookie.length).toBeGreaterThan(4);
  });

  it('Hall of Fame: ledger members, Voss as the only Legend, the 2026 and 2027 classes; candidates are not predictions', () => {
    const h = b.hallOfFame();
    expect(new Set(h.map((x) => x.i)).size).toBe(h.length);
    expect(h.filter((x) => x.pathway === 'legends').map((x) => [x.i, x.year])).toEqual([['gdc_elias_voss', 1997]]);
    expect(h.filter((x) => x.source === 'canon' && x.pathway === 'statistical')).toHaveLength(97);
    expect(h.filter((x) => x.year === 2026)).toHaveLength(5);
    expect(h.filter((x) => x.year === 2027)).toHaveLength(5);
    expect(Math.max(...h.map((x) => x.year))).toBe(2027);
    for (const c of b.candidates()) {
      const p = b.player(c.i)!;
      expect(p.status).toBe('retired');
      expect(c.seasons).toBeGreaterThanOrEqual(8);
      expect(c.eligible).toBeGreaterThan(b.now);
      expect(h.some((x) => x.i === c.i)).toBe(false);
    }
  });

  it('historic moments: the bible events with provenance, the legendary comebacks and the record runs', () => {
    const m = b.moments();
    for (const id of ['gdc-1983-001', 'fhl-1989-001', 'igl-1994-001', 'gdc-1998-001', 'fhl-2002-001', 'fhl-2019-001']) expect(m.find((x) => x.id === id)?.provenance, id).toBe('bible+games');
    expect(m.find((x) => x.id === 'gdc-2011-001')!.provenance).toBe('bible');
    const legendary = m.filter((x) => x.type === 'Comeback' && x.text.includes('legendary'));
    expect(legendary.map((x) => `${x.league}-${x.year}`).sort()).toEqual(['ccl-1997', 'fhl-2023', 'gdc-2025']);
    expect(m.some((x) => x.id === 'lead:ccl_andre_bellamy:ppg' && x.text.includes('2002, 2003, 2005, 2007'))).toBe(true);
  });

  it('reading the board never changes the shared data', () => {
    const f = files();
    const before = createHash('sha256').update(JSON.stringify(f)).digest('hex');
    const s2 = buildShared(f);
    const b2 = buildBoard(s2, null);
    for (const l of L4) { b2.records(l); b2.seasons(l); b2.titles(l); }
    b2.players(); b2.hallOfFame(); b2.candidates(); b2.moments(); b2.review(2026); b2.totals(); b2.allLines();
    expect(createHash('sha256').update(JSON.stringify(f)).digest('hex')).toBe(before);
  });

  it('the archive file matches a fresh replay of the games (no staleness)', () => {
    const f = files();
    const data = { players: f.players, seasons: f.seasons };
    const merged = mergeForward(data, f.forward);
    for (const id of ['gdc-1983', 'ccl-2002', 'igl-1994', 'fhl-1989', 'fhl-2026']) {
      const season = [...f.seasons, ...f.forward.seasons].find((x: { id: string }) => x.id === id);
      const h = season.year <= 2025 ? historySeason(data, season) : freeSeason(merged, season);
      const fresh = seasonStats(season.year <= 2025 ? data : merged, h).players;
      const stored = shared.linesOf(id);
      expect(stored).toHaveLength(fresh.length);
      for (const p of fresh) {
        const x = stored.find((y) => y.playerId === p.playerId)!;
        expect(x.team).toBe(p.teamId);
        expect(x.r).toEqual(Object.fromEntries(Object.entries(p.regular).filter(([, v]) => v !== 0)));
      }
      expect(shared.series.get(id)!.map((x) => x.winner)).toEqual(h.playoffs.map((x) => x.winner));
    }
  }, 60_000);

  it('loads the archive on demand', async () => {
    const s = await loadShared();
    expect(s.seasons).toHaveLength(208);
    expect(await loadShared()).toBe(s);
  });
});

describe('History Board: this save', () => {
  let a: Board;
  let bB: Board;
  beforeAll(() => {
    a = buildBoard(shared, chainSave(4242, 2));
    bB = buildBoard(shared, chainSave(777, 2));
  }, 180_000);

  it('2027 and 2028 come from the save, consistently across every view; 2029 is not shown', () => {
    for (const l of L4) {
      const s27 = a.season(l, 2027)!;
      expect(s27.source).toBe('save');
      expect(a.season(l, 2028)!.source).toBe('save');
      expect(a.season(l, 2029)).toBeUndefined();
      expect(a.titles(l).get(s27.champion)).toContain(2027);
      expect(s27.series![2].winner).toBe(s27.champion);
      expect(a.review(2027)!.leagues.find((x) => x.league === l)!.champion).toBe(s27.champion);
    }
    expect(a.reviewYears()).toEqual([2028, 2027, 2026]);
    expect(a.lastCompleted).toBe(2028);
    expect(a.review(2029)).toBeNull();
  });

  it('save draftees join the encyclopedia once, with careers that include their save seasons', () => {
    const all = a.players();
    expect(new Set(all.map((p) => p.i)).size).toBe(all.length);
    const rookie = all.find((p) => p.i.includes('_d2028_') && p.source === 'save')!;
    expect(rookie.draft?.year).toBe(2028);
    expect(a.linesOf(rookie.i).map((x) => x.year)).toEqual([2028]);
    const vale = a.totals().get('igl_mason_vale')!;
    expect(vale.years.slice(-3)).toEqual([2026, 2027, 2028]);
    expect(vale.sources.has('save')).toBe(true);
  });

  it('no spoilers: Hall of Fame classes only up to the current year', () => {
    expect(Math.max(...a.hallOfFame().map((h) => h.year))).toBeLessThanOrEqual(a.now);
  });

  it('two saves share the past but not the future', () => {
    for (const l of L4) expect(a.season(l, 2026)!.champion).toBe(bB.season(l, 2026)!.champion);
    expect(L4.map((l) => a.season(l, 2027)!.champion).join()).not.toBe(L4.map((l) => bB.season(l, 2027)!.champion).join());
  });

  it('save records appear beside the ledger with their provenance', () => {
    const books = L4.flatMap((l) => a.records(l).cats.flatMap((c) => [...a.records(l).season.get(c.key)!, ...a.records(l).career.get(c.key)!]));
    expect(books.every((r) => ['canon', 'shared', 'save', 'mixed'].includes(r.provenance))).toBe(true);
    for (const r of books.filter((x) => x.year)) expect(r.provenance).toBe(r.year! <= 2025 ? 'canon' : r.year === 2026 ? 'shared' : 'save');
  });
});

describe('legacy saves', () => {
  it('seasons played on the fixed rosters are rebuilt from their games and marked; generated seasons are noted', () => {
    const ref = { seed: 31, historyFrom: 1, evolveFrom: 3 };
    const save = chainSave(31, 2, ref);
    expect(save.replays.map((r) => r.year)).toEqual([2027]);
    const b = buildBoard(shared, save);
    const s27 = b.season('gdc', 2027)!;
    expect(s27.source).toBe('replay');
    expect(s27.awardsRecorded).toBe(false);
    expect(s27.champion).toBe(seasonOf(ref, 1).leagues.gdc.champion);
    const vale = b.totals().get('igl_mason_vale')!;
    expect(vale.years).toContain(2027);
    expect(b.coverage('igl_mason_vale').join(' ')).toMatch(/rebuilt/);
    expect(b.review(2027)!.note).toMatch(/fixed 2027 rosters/);
    const gen = buildSaveHistory({ ref: { seed: 5, historyFrom: 3, evolveFrom: 4 }, season: 3, week: 1, rows: [], state: null });
    expect(gen.generatedYears).toEqual([2027, 2028]);
    expect(buildBoard(shared, gen).coverage('igl_mason_vale').join(' ')).toMatch(/original generated leagues/);
  }, 120_000);

  it('a completed season not yet filed is flagged, not shown', () => {
    const save = buildSaveHistory({ ref: { seed: 2, historyFrom: 1, evolveFrom: 2 }, season: 3, week: 1, rows: [], state: null });
    expect(save.pendingYears).toEqual([2027, 2028]);
    const b = buildBoard(shared, save);
    expect(b.season('ccl', 2027)).toBeUndefined();
    expect(b.coverage('igl_mason_vale').join(' ')).toMatch(/not yet filed/);
  });
});

describe('through the services', () => {
  it('the board reads a real save\'s stored years and the career\'s world', async () => {
    const { s } = await newCareer();
    await s.db.careers.put({ ...(await s.career.getCareer()), season: 3, week: 1 });
    expect((await s.sportsUniverse.processDue()).years).toEqual([2027, 2028]);
    const c = await s.career.getCareer();
    const input = await s.sportsUniverse.historyInput();
    expect(input.rows.map((r) => r.year)).toEqual([2027, 2028]);
    const b = buildBoard(shared, buildSaveHistory({ ref: sportsWorldOf(c), season: c.season, week: c.week, rows: input.rows, state: input.state }));
    expect(b.lastCompleted).toBe(2028);
    const before = JSON.stringify(await s.db.sportsYears.toArray());
    b.players(); b.records('igl'); b.review(2028);
    expect(JSON.stringify(await s.db.sportsYears.toArray())).toBe(before);
  }, 120_000);
});

describe('navigation', () => {
  it('sections, league switching, drill-down and back', () => {
    let s = initialNav();
    s = navReduce(s, { type: 'section', section: 'players' });
    s = navReduce(s, { type: 'open', detail: { kind: 'player', id: 'ccl_andre_bellamy' } });
    expect(s.league).toBe('ccl');
    s = navReduce(s, { type: 'open', detail: { kind: 'team', id: 'ccl_monsoon' } });
    s = navReduce(s, { type: 'open', detail: { kind: 'team', id: 'ccl_monsoon' } });
    expect(s.stack).toHaveLength(2);
    s = navReduce(s, { type: 'back' });
    expect(s.stack.at(-1)).toEqual({ kind: 'player', id: 'ccl_andre_bellamy' });
    s = navReduce(s, { type: 'open', detail: { kind: 'season', league: 'fhl', year: 1989 }, replace: true });
    expect(s.stack).toEqual([{ kind: 'season', league: 'fhl', year: 1989 }]);
    s = navReduce(s, { type: 'league', league: 'gdc' });
    expect(s.stack).toEqual([]);
    s = navReduce(s, { type: 'back' });
    expect(s.section).toBe('players');
    s = navReduce(s, { type: 'section', section: 'review' });
    expect(s).toMatchObject({ section: 'review', stack: [] });
  });
});

describe('a large archive stays quick', () => {
  it('25 save seasons: the board builds its views in well under a second each', () => {
    const save = chainSave(9001, 25);
    expect(save.rows).toHaveLength(25);
    const t0 = performance.now();
    const b = buildBoard(shared, save);
    const t = (f: () => unknown) => { const s = performance.now(); f(); return performance.now() - s; };
    const timings = {
      seasons: t(() => L4.forEach((l) => b.seasons(l))),
      players: t(() => b.players()),
      totals: t(() => b.totals()),
      records: t(() => b.records('ccl')),
      hof: t(() => b.candidates()),
      moments: t(() => b.moments()),
      review: t(() => b.review(2051)),
      profile: t(() => b.linesOf('igl_mason_vale')),
    };
    for (const [k, v] of Object.entries(timings)) expect(v, k).toBeLessThan(1500);
    expect(performance.now() - t0).toBeLessThan(5000);
    expect(b.season('fhl', 2051)!.source).toBe('save');
    expect(b.players().length).toBeGreaterThan(shared.players.length + 2000);
  }, 300_000);
});
