import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { LEAGUES, SEASON_FORMAT, leagueById, teamsOf } from '../src/sports/demo';
import type { HistoryData } from '../src/sports/history/data';
import { assignWinners, historySeason, type HistorySeason } from '../src/sports/history/games';
import { stream } from '../src/sports/rng';

const data: HistoryData = {
  players: JSON.parse(readFileSync('src/sports/history/data/players.json', 'utf8')).players,
  seasons: JSON.parse(readFileSync('src/sports/history/data/seasons.json', 'utf8')).seasons,
};
const changes = JSON.parse(readFileSync('src/sports/history/data/changes.json', 'utf8'));
const all = new Map<string, HistorySeason>();
const get = (id: string) => all.get(id)!;

describe('reconciled history dataset (v0.4 + owner decisions)', () => {
  it('covers every league season from founding to 2025, eight teams each', () => {
    for (const l of LEAGUES) {
      const founded = { gdc: 1972, ccl: 1974, igl: 1976, fhl: 1978 }[l.id];
      const years = data.seasons.filter((s) => s.league === l.id).map((s) => s.year);
      expect(years, l.id).toEqual(Array.from({ length: 2025 - founded + 1 }, (_, i) => founded + i));
    }
    expect(data.seasons).toHaveLength(204);
    const ids = new Set(teamsOf('gdc').concat(teamsOf('ccl'), teamsOf('igl'), teamsOf('fhl')).map((t) => t.id));
    for (const s of data.seasons) {
      expect(Object.keys(s.records).sort(), s.id).toEqual(teamsOf(s.league).map((t) => t.id).sort());
      for (const t of Object.keys(s.records)) expect(ids.has(t)).toBe(true);
    }
  });

  it('records add up and keep the anchors', () => {
    for (const s of data.seasons) {
      const games = SEASON_FORMAT[leagueById(s.league).sport].gamesPerTeam;
      expect(s.games, s.id).toBe(games);
      const rs = Object.values(s.records);
      for (const [w, l] of rs) expect(w + l).toBe(games);
      expect(rs.reduce((a, r) => a + r[0], 0)).toBe(rs.reduce((a, r) => a + r[1], 0));
    }
    const rec = (id: string, t: string) => data.seasons.find((s) => s.id === id)!.records[t];
    expect(rec('igl-1985', 'igl_ironclads')).toEqual([14, 0]);
    expect(rec('igl-2015', 'igl_highlanders')).toEqual([2, 12]);
  });

  it('owner decisions are applied', () => {
    const s = (id: string) => data.seasons.find((x) => x.id === id)!;
    expect([s('ccl-1978').champion, s('ccl-1978').runnerUp]).toEqual(['ccl_voltage', 'ccl_dustdevils']); // D3
    expect(data.seasons.filter((x) => x.champion === 'ccl_dustdevils' && x.year < 1996)).toEqual([]);
    expect(data.players.find((p) => p.i === 'ccl_andre_bellamy')!.f).toBe(2014); // D4
    const names = new Map<string, number>();
    for (const p of data.players) names.set(p.n, (names.get(p.n) ?? 0) + 1);
    expect([...names.values()].every((n) => n === 1)).toBe(true); // D5
    expect(data.players.filter((p) => p.a).map((p) => p.n).sort()).toEqual(['Andre Bellamy', 'Calvin Redd', 'Darius King', 'Elias Voss', 'Leon Mercer', 'Marco Salazar', 'Mason Vale', 'Owen Kessler', 'Viktor Soren']);
    for (const p of data.players) expect(p.d - p.b, p.i).toBeGreaterThanOrEqual(19); // D8
    expect(s('ccl-2009').champion).toBe('ccl_monsoon'); // D10
    expect(s('fhl-1995').champion).toBe('fhl_snowowls');
    expect(data.seasons.filter((x) => x.champion === 'fhl_snowowls' && x.year >= 1996 && x.year <= 2018)).toEqual([]);
    expect(changes.record_adjustments.length).toBe(data.seasons.filter((x) => x.adjusted).length);
  });

  it('every champion and runner-up qualify, on opposite sides of the bracket', () => {
    for (const s of data.seasons) {
      const c = s.seeds.indexOf(s.champion) + 1;
      const r = s.seeds.indexOf(s.runnerUp) + 1;
      expect(c > 0 && r > 0, s.id).toBe(true);
      expect([[1, 4], [2, 3]].some((h) => h.includes(c) && h.includes(r)), s.id).toBe(false);
      // Seeds follow the records (ties broken by the stored order).
      const w = s.seeds.map((t) => s.records[t][0]);
      expect([...w].sort((a, b) => b - a), s.id).toEqual(w);
      expect(Math.min(...w)).toBeGreaterThanOrEqual(Math.max(...Object.entries(s.records).filter(([t]) => !s.seeds.includes(t)).map(([, r]) => r[0])));
    }
    const s96 = data.seasons.find((x) => x.id === 'ccl-1996')!;
    expect(s96.seeds[3]).toBe('ccl_dustdevils'); // the lowest seed
  });

  it('rosters only hold players in their career window and on that team', () => {
    for (const s of data.seasons) for (const [t, ixs] of Object.entries(s.rosters)) for (const ix of ixs) {
      const p = data.players[ix];
      expect(p.l).toBe(s.league);
      expect(p.s.some(([team, a, b]) => team === t && a <= s.year && s.year <= b), `${p.i} ${t} ${s.year}`).toBe(true);
    }
  });
});

describe('winner assignment', () => {
  it('hits any realisable record exactly', () => {
    const teams = ['a', 'b', 'c', 'd'];
    const games = teams.flatMap((x, i) => teams.slice(i + 1).flatMap((y) => [{ home: x, away: y }, { home: y, away: x }]));
    for (const target of [{ a: 6, b: 0, c: 3, d: 3 }, { a: 3, b: 3, c: 3, d: 3 }, { a: 5, b: 4, c: 2, d: 1 }]) {
      const w = assignWinners(games, target, stream(1, 't', JSON.stringify(target)));
      for (const t of teams) expect(w.filter((x) => x === t).length).toBe(target[t as 'a']);
      w.forEach((x, i) => expect([games[i].home, games[i].away]).toContain(x));
    }
    expect(() => assignWinners(games, { a: 7, b: 0, c: 3, d: 2 }, stream(1, 'x'))).toThrow();
  });
});

describe('generated historical games (Phase B)', () => {
  beforeAll(() => {
    for (const s of data.seasons) all.set(s.id, historySeason(data, s));
  }, 600_000);

  it('every season plays its full schedule; standings reproduce the approved records', () => {
    for (const [id, h] of all) {
      const s = h.season;
      const games = SEASON_FORMAT[leagueById(s.league).sport].gamesPerTeam;
      expect(h.regular).toHaveLength((games * 8) / 2);
      const w = new Map<string, number>();
      const homes = new Map<string, number>();
      for (const g of h.regular) {
        expect(g.home === g.away, g.id).toBe(false);
        expect(g.result.homeScore === g.result.awayScore, g.id).toBe(false);
        expect(g.winner, g.id).toBe(g.result.homeScore > g.result.awayScore ? g.home : g.away);
        w.set(g.winner, (w.get(g.winner) ?? 0) + 1);
        homes.set(g.home, (homes.get(g.home) ?? 0) + 1);
      }
      for (const [t, [wins]] of Object.entries(s.records)) {
        expect(w.get(t) ?? 0, `${id} ${t}`).toBe(wins);
        expect(homes.get(t), `${id} ${t} home games`).toBe(games / 2);
      }
      expect(new Set(h.regular.map((g) => g.id)).size).toBe(h.regular.length);
    }
  });

  it('brackets follow the seeds and the ledger', () => {
    for (const [id, h] of all) {
      const s = h.season;
      const [semi1, semi2, final] = h.playoffs;
      expect(new Set([semi1.high, semi1.low])).toEqual(new Set([s.seeds[0], s.seeds[3]]));
      expect(new Set([semi2.high, semi2.low])).toEqual(new Set([s.seeds[1], s.seeds[2]]));
      expect([final.winner, final.loser], id).toEqual([s.champion, s.runnerUp]);
      for (const x of h.playoffs) {
        const need = Math.ceil(x.bestOf / 2);
        expect(x.wins[x.winner], `${x.id}`).toBe(need);
        expect(x.wins[x.loser]).toBeLessThan(need);
        expect(x.games.at(-1)!.winner).toBe(x.winner);
        for (const g of x.games) expect(g.winner).toBe(g.result.homeScore > g.result.awayScore ? g.home : g.away);
      }
      if (leagueById(s.league).sport === 'football') expect(final.games[0].result.neutral).toBe(true);
    }
  });

  it('anchor moments happen exactly as written', () => {
    const fin = (id: string) => get(id).playoffs[2];
    const seq = (id: string) => fin(id).games.map((g) => g.winner === fin(id).winner);
    expect(seq('gdc-1998')).toEqual([false, true, false, false, true, true, true]); // Boston led 3-1
    expect(fin('gdc-1998').winner).toBe('gdc_firebirds');
    const f02 = fin('fhl-2002');
    expect(f02.games).toHaveLength(7);
    expect(f02.games.filter((g) => g.result.ot).length).toBe(4);
    expect(f02.games[6].winner).toBe('fhl_yetis');
    expect(fin('fhl-2019').games).toHaveLength(6);
    const ib = fin('igl-1994').games[0];
    expect([ib.winner, ib.result.homeScore + ib.result.awayScore, Math.abs(ib.result.homeScore - ib.result.awayScore)]).toEqual(['igl_thunderherd', 44, 4]);
    const marathon = get('fhl-1989').playoffs.flatMap((x) => x.games).filter((g) => g.events.includes('fhl-1989-001'));
    expect(marathon).toHaveLength(1);
    expect(marathon[0]).toMatchObject({ winner: 'fhl_polars', loser: 'fhl_sawblades' });
    expect(marathon[0].result.ot).toBe(3);
    expect(get('ccl-1996').playoffs[0].winner).toBe('ccl_dustdevils'); // the 4 seed beat the 1 seed
    for (const y of [1987, 1988, 1989]) expect(new Set([fin(`ccl-${y}`).winner, fin(`ccl-${y}`).loser])).toEqual(new Set(['ccl_comets', 'ccl_voltage']));
    expect(get('igl-1985').regular.filter((g) => g.loser === 'igl_ironclads')).toEqual([]);
  });

  it('is deterministic', () => {
    for (const id of ['gdc-1983', 'ccl-2012', 'igl-2016', 'fhl-2019']) {
      const s = data.seasons.find((x) => x.id === id)!;
      expect(historySeason(data, s)).toEqual(get(id));
    }
  });

  it('scores look like their sport', () => {
    const avg = (lg: string) => {
      const gs = [...all.values()].filter((h) => h.season.league === lg).flatMap((h) => h.regular);
      return gs.reduce((a, g) => a + g.result.homeScore + g.result.awayScore, 0) / gs.length;
    };
    expect(avg('gdc')).toBeGreaterThan(6.5);
    expect(avg('gdc')).toBeLessThan(12);
    expect(avg('ccl')).toBeGreaterThan(180);
    expect(avg('ccl')).toBeLessThan(250);
    expect(avg('igl')).toBeGreaterThan(30);
    expect(avg('igl')).toBeLessThan(60);
    expect(avg('fhl')).toBeGreaterThan(4.5);
    expect(avg('fhl')).toBeLessThan(8);
  });
});
