import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { leagueById } from '../src/sports/demo';
import type { HistoryData } from '../src/sports/history/data';
import { historySeason, type HistorySeason } from '../src/sports/history/games';
import { historyRoster } from '../src/sports/history/rosters';
import { careerOf, gameLines, rates, seasonStats, type PlayerSeason, type StatLine } from '../src/sports/history/stats';

const data: HistoryData = {
  players: JSON.parse(readFileSync('src/sports/history/data/players.json', 'utf8')).players,
  seasons: JSON.parse(readFileSync('src/sports/history/data/seasons.json', 'utf8')).seasons,
};
const careers = JSON.parse(readFileSync('src/sports/history/data/careers.json', 'utf8'));
const S = (id: string) => data.seasons.find((s) => s.id === id)!;
const H = new Map<string, HistorySeason>();
const P = new Map<string, PlayerSeason[]>();
const h = (id: string) => H.get(id) ?? (H.set(id, historySeason(data, S(id))), H.get(id)!);
const stats = (id: string) => P.get(id) ?? (P.set(id, seasonStats(data, h(id)).players), P.get(id)!);
const of = (id: string, player: string) => stats(id).find((p) => p.playerId === player)!;
const sum = (ls: StatLine[], k: string) => ls.reduce((a, l) => a + (l[k] ?? 0), 0);
// A spread of seasons across every league and era, plus every anchor season.
const SAMPLE = ['gdc-1972', 'gdc-1983', 'gdc-1998', 'gdc-2025', 'ccl-1974', 'ccl-1987', 'ccl-1996', 'ccl-2012', 'igl-1976', 'igl-1985', 'igl-1994', 'igl-2016', 'fhl-1978', 'fhl-1989', 'fhl-2002', 'fhl-2019'];

describe('Phase C: stats add up to every game', () => {
  beforeAll(() => SAMPLE.forEach(h), 600_000);

  it('each game\'s lines reproduce its real totals', () => {
    for (const id of SAMPLE) {
      const hs = h(id);
      const sport = leagueById(hs.season.league).sport;
      const rosters = new Map(Object.keys(hs.season.records).map((t) => [t, historyRoster(data, hs.season, t)]));
      for (const g of [...hs.regular, ...hs.playoffs.flatMap((x) => x.games)]) {
        const lines = gameLines(g, rosters);
        const team = (t: string) => [...lines].filter(([pid]) => rosters.get(t)!.some((p) => p.id === pid)).map(([, l]) => l);
        const [home, away] = [team(g.home), team(g.away)];
        for (const l of lines.values()) for (const v of Object.values(l)) expect(v).toBeGreaterThanOrEqual(0);
        if (sport === 'basketball') {
          expect(sum(home, 'pts'), g.id).toBe(g.result.homeScore);
          expect(sum(away, 'pts'), g.id).toBe(g.result.awayScore);
          for (const side of [home, away]) {
            expect(sum(side, 'min')).toBe(240 + 25 * g.result.ot);
            for (const l of side) {
              expect(l.fga).toBeGreaterThanOrEqual(l.fgm);
              expect(l.fg3a).toBeGreaterThanOrEqual(l.fg3m);
              expect(l.fta).toBeGreaterThanOrEqual(l.ftm);
              expect(l.reb).toBe(l.oreb + l.dreb);
              expect(l.pts).toBe(2 * (l.fgm - l.fg3m) + 3 * l.fg3m + l.ftm);
            }
          }
        } else if (sport === 'baseball') {
          expect(sum(home, 'r'), g.id).toBe(g.result.homeScore);
          expect(sum(away, 'r'), g.id).toBe(g.result.awayScore);
          expect(sum(away, 'p_r'), g.id).toBe(g.result.homeScore);
          expect(sum(home, 'p_h')).toBe(sum(away, 'h'));
          expect(sum(away, 'p_k')).toBe(sum(home, 'so'));
          expect(sum(home, 'w') + sum(away, 'w')).toBe(1);
          expect(sum(home, 'l') + sum(away, 'l')).toBe(1);
          for (const l of [...home, ...away]) if (l.ab !== undefined) expect(l.h).toBeLessThanOrEqual(l.ab);
        } else if (sport === 'football') {
          for (const side of [home, away]) {
            expect(sum(side, 'rec_yds')).toBe(sum(side, 'pass_yds'));
            expect(sum(side, 'rec')).toBe(sum(side, 'pass_cmp'));
            expect(sum(side, 'rec_td')).toBe(sum(side, 'pass_td'));
            for (const l of side) if (l.pass_att) expect(l.pass_cmp).toBeLessThanOrEqual(l.pass_att);
          }
          const tds = g.result.box.reduce((a, b) => a + (b.extra?.td ?? 0), 0);
          expect(sum(home, 'rec_td') + sum(home, 'rush_td') + sum(away, 'rec_td') + sum(away, 'rush_td'), g.id).toBe(tds);
        } else {
          const so = g.result.so ? 1 : 0;
          expect(sum(home, 'g') + sum(away, 'g'), g.id).toBe(g.result.homeScore + g.result.awayScore - so);
          const gl = [...home, ...away].filter((l) => l.g_gp);
          expect(gl).toHaveLength(2);
          expect(sum(gl, 'ga') + so).toBe(g.result.homeScore + g.result.awayScore);
          for (const l of gl) expect(l.sv).toBe(l.sa - l.ga);
          expect(sum(gl, 'w')).toBe(1);
        }
      }
    }
  });

  it('pitching wins and losses equal team records', () => {
    for (const id of ['gdc-1972', 'gdc-1998', 'gdc-2025']) {
      const s = S(id);
      for (const t of Object.keys(s.records)) {
        const mine = stats(id).filter((p) => p.teamId === t).map((p) => p.regular);
        expect([sum(mine, 'w'), sum(mine, 'l')], `${id} ${t}`).toEqual(s.records[t]);
      }
    }
  });
});

describe('anchor stats', () => {
  it('Elias Voss, 1983: 13-1 with three no-hitters', () => {
    const v = of('gdc-1983', 'gdc_elias_voss').regular;
    expect([v.w, v.l, v.nohit, v.p_gs]).toEqual([13, 1, 3, 14]);
    expect(rates('baseball', v).era).toBeLessThan(3);
  });
  it('Viktor Soren: 71 saves in the triple-overtime win over Buffalo', () => {
    const hs = h('fhl-1989');
    const g = hs.playoffs.flatMap((x) => x.games).find((x) => x.events.includes('fhl-1989-001'))!;
    const rosters = new Map(Object.keys(hs.season.records).map((t) => [t, historyRoster(data, hs.season, t)]));
    const line = gameLines(g, rosters).get('fhl_viktor_soren')!;
    expect([line.sv, g.result.ot, g.winner, g.loser]).toEqual([71, 3, 'fhl_polars', 'fhl_sawblades']);
  });
  it('Calvin Redd: 31 points off the bench in the 1996 clincher', () => {
    const hs = h('ccl-1996');
    const final = hs.playoffs[2];
    const g = final.games.at(-1)!;
    expect(g.decider && g.winner === 'ccl_dustdevils').toBe(true);
    const rosters = new Map(Object.keys(hs.season.records).map((t) => [t, historyRoster(data, hs.season, t)]));
    const l = gameLines(g, rosters).get('ccl_calvin_redd')!;
    expect([l.pts, l.gs]).toEqual([31, 0]);
    expect(rosters.get('ccl_dustdevils')!.findIndex((p) => p.id === 'ccl_calvin_redd')).toBe(5); // first off the bench
  });
  it('Andre Bellamy: exactly four scoring titles (2002, 2003, 2005, 2007), all before the 2008 trade', () => {
    const titles: number[] = [];
    for (let y = 1999; y <= 2014; y++) {
      const ss = stats(`ccl-${y}`).filter((p) => (p.regular.gp ?? 0) >= 17);
      const top = [...ss].sort((a, b) => b.regular.pts / b.regular.gp - a.regular.pts / a.regular.gp || a.playerId.localeCompare(b.playerId))[0];
      if (top.playerId === 'ccl_andre_bellamy') titles.push(y);
    }
    expect(titles).toEqual([2002, 2003, 2005, 2007]);
  }, 300_000);
  it('Marco Salazar doubled in Game 7 of the 1998 final', () => {
    const g = h('gdc-1998').playoffs[2].games[6];
    expect(g.result.box.find((b) => b.playerId === 'gdc_marco_salazar')!.extra!['2b']).toBeGreaterThan(0);
  });
});

describe('careers', () => {
  it('career totals are the sum of seasons, and rates are recomputed (never summed)', () => {
    for (const id of ['gdc_elias_voss', 'fhl_viktor_soren', 'ccl_andre_bellamy', 'igl_mason_vale']) {
      const p = data.players.find((x) => x.i === id)!;
      const seasons = data.seasons.filter((s) => s.league === p.l && s.year >= p.d && s.year <= Math.min(p.f, 2025)).map((s) => s.id);
      const mine = seasons.map((sid) => stats(sid).find((x) => x.playerId === id)).filter(Boolean) as PlayerSeason[];
      const c = careerOf(mine);
      const file = careers.careers[id];
      expect(file.r, id).toEqual(c.regular);
      expect(file.p, id).toEqual(c.playoffs);
      expect(file.n).toBe(mine.length);
    }
    const b = careers.careers.ccl_andre_bellamy.r;
    const r = rates('basketball', b);
    expect(r.fg_pct).toBeLessThan(1);
    expect(r.ppg).toBeCloseTo(b.pts / b.gp, 1);
    expect(careers.careers.ccl_andre_bellamy.t).toEqual(['ccl_forge', 'ccl_monsoon']);
  }, 600_000);

  it('the precomputed file covers every rostered player and records the anchor adjustments', () => {
    const rostered = new Set(data.seasons.flatMap((s) => Object.values(s.rosters).flat()).map((ix) => data.players[ix].i));
    expect(Object.keys(careers.careers).sort()).toEqual([...rostered].sort());
    expect(careers.adjustments.map((a: { event: string }) => a.event).sort()).toEqual(['ccl-1996-001', 'fhl-1989-001']);
  });

  it('is deterministic', () => {
    expect(seasonStats(data, historySeason(data, S('igl-1985'))).players).toEqual(stats('igl-1985'));
  });
});
