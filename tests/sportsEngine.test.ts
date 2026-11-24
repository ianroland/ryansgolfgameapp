import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { playBasketball, teamStrength } from '../src/sports/basketball';
import { SPORTS_CONFIG } from '../src/sports/config';
import { SEASON_FORMAT, teamsOf } from '../src/sports/demo';
import { stream } from '../src/sports/rng';
import { roundRobin, seasonSchedule, validateSchedule } from '../src/sports/schedule';
import { createWorld, playBasketballSeason, playLeagueSeason, standingsOf, type BasketballSeason, type LeagueSeason } from '../src/sports/season';

const CCL = teamsOf('ccl').map((t) => t.id);
const seasons = new Map<number, BasketballSeason>();
const seasonFor = (seed: number) => {
  if (!seasons.has(seed)) seasons.set(seed, playBasketballSeason(createWorld(seed), 1));
  return seasons.get(seed)!;
};

describe('random streams', () => {
  it('the same seed and purpose give the same sequence; different purposes differ', () => {
    const a = stream(7, 'game', 'x');
    const b = stream(7, 'game', 'x');
    const c = stream(7, 'game', 'y');
    const seq = (r: ReturnType<typeof stream>) => Array.from({ length: 5 }, () => r.next());
    const sa = seq(a);
    expect(seq(b)).toEqual(sa);
    expect(seq(c)).not.toEqual(sa);
  });
});

describe('schedules', () => {
  it('one round-robin of 8 teams is 7 rounds of 4 games, every pair once', () => {
    const rr = roundRobin(CCL);
    expect(rr).toHaveLength(7);
    for (const rd of rr) expect(rd).toHaveLength(4);
    expect(new Set(rr.flat().map(([a, b]) => [a, b].sort().join('|'))).size).toBe(28);
  });

  it("every sport's approved format gives a valid balanced schedule (each pair split evenly home and away)", () => {
    for (const [sport, fmt] of Object.entries(SEASON_FORMAT)) {
      for (const seed of [1, 2, 3]) {
        const games = seasonSchedule(CCL, fmt.meetingsPerOpponent, stream(seed, 'schedule', sport), `t:${sport}`);
        expect(games).toHaveLength((fmt.gamesPerTeam * 8) / 2);
        expect(validateSchedule(games, CCL, fmt.meetingsPerOpponent), `${sport} seed ${seed}`).toEqual([]);
      }
    }
  });

  it('the validator catches an unbalanced schedule', () => {
    const games = seasonSchedule(CCL, 4, stream(1, 's'), 't');
    const broken = games.map((g, i) => (i === 0 ? { ...g, home: g.away, away: g.home } : g));
    expect(validateSchedule(broken, CCL, 4).length).toBeGreaterThan(0);
  });
});

describe('world and rosters', () => {
  it('a world is fully determined by its seed', () => {
    expect(createWorld(42)).toEqual(createWorld(42));
    expect(createWorld(42)).not.toEqual(createWorld(43));
  });

  it('each team has 10 players, two per position, with unique names and ids', () => {
    const w = createWorld(5);
    for (const t of CCL) {
      const r = w.players.filter((p) => p.teamId === t);
      expect(r).toHaveLength(10);
      for (const pos of SPORTS_CONFIG.basketball.positions) expect(r.filter((p) => p.pos === pos)).toHaveLength(2);
    }
    expect(new Set(w.players.map((p) => p.name)).size).toBe(w.players.length);
    expect(new Set(w.players.map((p) => p.id)).size).toBe(w.players.length);
    for (const p of w.players) {
      expect(p.overall).toBeGreaterThanOrEqual(25);
      expect(p.potential).toBeGreaterThanOrEqual(p.overall);
    }
  });

  it('injured players sit out and weaken their team', () => {
    const w = createWorld(9);
    const roster = w.players.filter((p) => p.teamId === CCL[0]);
    const healthy = teamStrength(roster);
    const star = healthy.rotation[0].player;
    const hurt = teamStrength(roster.map((p) => (p.id === star.id ? { ...p, injuryGames: 5 } : p)));
    expect(hurt.rotation.map((x) => x.player.id)).not.toContain(star.id);
    expect(hurt.offense + hurt.defense).toBeLessThan(healthy.offense + healthy.defense);
  });
});

describe('basketball games', () => {
  it('a game is deterministic for its stream; no ties; box score adds up', () => {
    const w = createWorld(3);
    const [h, a] = [CCL[0], CCL[1]];
    const r = (t: string) => w.players.filter((p) => p.teamId === t);
    const g1 = playBasketball('g', h, a, r(h), r(a), stream(3, 'game', 'g'));
    const g2 = playBasketball('g', h, a, r(h), r(a), stream(3, 'game', 'g'));
    expect(g1).toEqual(g2);
    expect(g1.homeScore).not.toBe(g1.awayScore);
    const sum = (t: string) => g1.box.filter((b) => r(t).some((p) => p.id === b.playerId)).reduce((s, b) => s + b.points, 0);
    expect([sum(h), sum(a)]).toEqual([g1.homeScore, g1.awayScore]);
  });
});

describe('a full basketball season', () => {
  it('is identical when replayed with the same seed (no rerolls)', () => {
    expect(playBasketballSeason(createWorld(11), 1)).toEqual(playBasketballSeason(createWorld(11), 1));
    expect(playBasketballSeason(createWorld(11), 2).champion === undefined).toBe(false);
  });

  it('plays the approved 28 games per team on the calendar, two rounds a week', () => {
    const s = seasonFor(21);
    expect(s.regular).toHaveLength(112);
    for (const t of CCL) expect(s.regular.filter((g) => g.home === t || g.away === t)).toHaveLength(SEASON_FORMAT.basketball.gamesPerTeam);
    const weeks = new Set(s.regular.map((g) => g.week));
    expect(weeks.size).toBe(14);
    expect(Math.min(...weeks)).toBe(SPORTS_CONFIG.calendar.basketball!.startWeek);
    expect(Math.max(...weeks) + 2).toBeLessThanOrEqual(30);
  });

  it('standings add up and are ordered by record, with every tie broken', () => {
    const s = seasonFor(21);
    expect(s.standings.reduce((a, r) => a + r.w, 0)).toBe(112);
    for (const r of s.standings) {
      expect(r.w + r.l).toBe(28);
      expect(r.home[0] + r.home[1]).toBe(14);
    }
    for (let i = 1; i < s.standings.length; i++) expect(s.standings[i - 1].w).toBeGreaterThanOrEqual(s.standings[i].w);
    expect(new Set(s.standings.map((r) => r.team)).size).toBe(8);
  });

  it('head-to-head breaks a two-way tie', () => {
    const g = (home: string, away: string, hs: number, as: number, i: number) => ({ id: `x${i}`, round: i, week: 1, home, away, result: { id: `x${i}`, home, away, homeScore: hs, awayScore: as, ot: 0, box: [] } });
    const games = [g('a', 'b', 100, 90, 1), g('b', 'c', 120, 80, 2), g('c', 'a', 100, 99, 3)];
    // a, b, c all 1-1; a beat b, b beat c, c beat a: a three-way cycle falls to point difference.
    const rows = standingsOf(games, ['a', 'b', 'c'], () => 0);
    expect(rows.map((r) => r.team)).toEqual(['b', 'a', 'c']);
    // a and b both 1-1; a beat b, though b has the far better point difference: head-to-head wins.
    const two = standingsOf([g('a', 'b', 101, 100, 1), g('c', 'a', 150, 100, 2), g('b', 'd', 150, 50, 3), g('c', 'd', 100, 90, 4)], ['a', 'b', 'c', 'd'], () => 0);
    expect(two.map((r) => r.team)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('playoffs: top four, best-of-5 semifinals and a best-of-7 final, with a champion', () => {
    const s = seasonFor(21);
    const top4 = s.standings.slice(0, 4).map((r) => r.team);
    const [s1, s2, f] = s.playoffs;
    expect([s1.high, s1.low, s2.high, s2.low]).toEqual([top4[0], top4[3], top4[1], top4[2]]);
    for (const sr of [s1, s2, f]) {
      const need = Math.ceil(sr.bestOf / 2);
      expect(Math.max(...sr.wins)).toBe(need);
      expect(sr.games.length).toBeGreaterThanOrEqual(need);
      expect(sr.games.length).toBeLessThanOrEqual(sr.bestOf);
      expect(sr.games[0].home).toBe(sr.high);
    }
    expect([s1.bestOf, f.bestOf]).toEqual([5, 7]);
    expect(new Set([f.high, f.low])).toEqual(new Set([s1.winner, s2.winner]));
    expect(s.champion).toBe(f.winner);
  });

  it('awards go to real players: MVP played most games; Finals MVP is on the champion', () => {
    const s = seasonFor(21);
    const byId = new Map(s.players.map((p) => [p.id, p]));
    expect(byId.has(s.awards.mvp.playerId)).toBe(true);
    expect(byId.get(s.awards.finalsMvp.playerId)?.teamId).toBe(s.champion);
    expect(s.awards.mvp.perGame).toBeGreaterThan(10);
  });
});

describe('realism across many seasons', () => {
  const all = Array.from({ length: 24 }, (_, i) => seasonFor(100 + i));
  const games = all.flatMap((s) => s.regular);

  it('scoring, home advantage and overtime are in realistic ranges', () => {
    const avg = games.reduce((a, g) => a + g.result.homeScore + g.result.awayScore, 0) / games.length;
    const homeWin = games.filter((g) => g.result.homeScore > g.result.awayScore).length / games.length;
    const otRate = games.filter((g) => g.result.ot > 0).length / games.length;
    expect(avg).toBeGreaterThan(200);
    expect(avg).toBeLessThan(232);
    expect(homeWin).toBeGreaterThan(0.53);
    expect(homeWin).toBeLessThan(0.63);
    expect(otRate).toBeGreaterThan(0.01);
    expect(otRate).toBeLessThan(0.1);
  });

  it('better teams win more (team quality correlates with record), but upsets happen', () => {
    const xs: number[] = [];
    const ys: number[] = [];
    all.forEach((s, i) => {
      const w = createWorld(100 + i);
      for (const r of s.standings) {
        xs.push(w.quality[r.team]);
        ys.push(r.w / 28);
      }
    });
    const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    const mx = mean(xs);
    const my = mean(ys);
    const cov = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
    const corr = cov / Math.sqrt(xs.reduce((s, x) => s + (x - mx) ** 2, 0) * ys.reduce((s, y) => s + (y - my) ** 2, 0));
    expect(corr).toBeGreaterThan(0.5);
    const topSeedTitles = all.filter((s) => s.champion === s.standings[0].team).length;
    expect(topSeedTitles).toBeGreaterThan(2);
    expect(topSeedTitles).toBeLessThan(all.length);
  });

  it('injuries happen, at a modest rate', () => {
    const perSeason = all.map((s) => s.injuries.length);
    const avg = perSeason.reduce((a, b) => a + b, 0) / perSeason.length;
    expect(avg).toBeGreaterThan(2);
    expect(avg).toBeLessThan(25);
  });
});

describe('engine boundaries', () => {
  it('the engine never reads money, saves, NPCs, drinks, golf or casino code', () => {
    const dir = join(__dirname, '../src/sports');
    for (const f of readdirSync(dir).filter((x) => /\.tsx?$/.test(x) && x !== 'demo.ts' && x !== 'themes.ts' && x !== 'slip.ts')) {
      expect(readFileSync(join(dir, f), 'utf8'), f).not.toMatch(/from '\.\.\/(services|persistence|npc|casino|golf|career|ui)/);
    }
  });
});

describe('all four leagues (Phase 2b)', () => {
  const LEAGUE_IDS = ['gdc', 'ccl', 'igl', 'fhl'] as const;
  const runs = new Map<string, LeagueSeason[]>();
  const seasonsOf = (league: (typeof LEAGUE_IDS)[number], n = 10) => {
    const k = `${league}:${n}`;
    if (!runs.has(k)) runs.set(k, Array.from({ length: n }, (_, i) => playLeagueSeason(createWorld(300 + i), league, 1)));
    return runs.get(k)!;
  };

  it('a world has full rosters for all 32 franchises, by sport', () => {
    const w = createWorld(77);
    const size = { gdc: 16, ccl: 10, igl: 24, fhl: 18 } as const;
    for (const lg of LEAGUE_IDS) for (const t of teamsOf(lg)) expect(w.players.filter((p) => p.teamId === t.id), t.id).toHaveLength(size[lg]);
    expect(new Set(w.players.map((p) => p.name)).size).toBe(w.players.length);
    const hockey = w.players.filter((p) => p.teamId === 'fhl_polars');
    expect(hockey.filter((p) => p.pos === 'G')).toHaveLength(2);
    expect(w.players.filter((p) => p.teamId === 'gdc_lamplighters' && p.pos === 'SP')).toHaveLength(4);
  });

  it('every league season replays identically from the same seed', () => {
    for (const lg of LEAGUE_IDS) expect(playLeagueSeason(createWorld(5), lg, 3)).toEqual(playLeagueSeason(createWorld(5), lg, 3));
  });

  it('each league plays its approved schedule inside Ryan\'s 30-week season, playoffs included', () => {
    for (const lg of LEAGUE_IDS) {
      const s = seasonsOf(lg, 1)[0];
      const fmt = SEASON_FORMAT[s.sport];
      for (const t of teamsOf(lg)) expect(s.regular.filter((g) => g.home === t.id || g.away === t.id)).toHaveLength(fmt.gamesPerTeam);
      const weeks = s.regular.map((g) => g.week);
      expect(new Set(weeks).size, lg).toBe(14);
      expect(Math.min(...weeks)).toBe(SPORTS_CONFIG.calendar[s.sport].startWeek);
      const lastPlayoffWeek = Math.max(...s.playoffs.flatMap((x) => x.games.map((g) => g.week)));
      expect(lastPlayoffWeek, lg).toBeLessThanOrEqual(30);
    }
  });

  it('baseball plays three-game series: same teams, same park, three days running', () => {
    const games = seasonSchedule(CCL, 6, stream(4, 'x'), 'b', 3);
    expect(validateSchedule(games, CCL, 6)).toEqual([]);
    const byDay = (d: number) => games.filter((g) => g.round === d).map((g) => `${g.home}-${g.away}`).sort();
    for (let d = 0; d < 42; d += 3) {
      expect(byDay(d + 1)).toEqual(byDay(d));
      expect(byDay(d + 2)).toEqual(byDay(d));
    }
  });

  it('box scores add up: baseball runs and hockey goals match the score', () => {
    for (const g of seasonsOf('gdc', 1)[0].regular.slice(0, 40)) {
      const runs = g.result.box.reduce((s, b) => s + (b.extra?.r ?? 0), 0);
      expect(runs).toBe(g.result.homeScore + g.result.awayScore);
    }
    for (const g of seasonsOf('fhl', 1)[0].regular.slice(0, 40)) {
      const goals = g.result.box.reduce((s, b) => s + (b.extra?.g ?? 0), 0);
      expect(goals).toBe(g.result.homeScore + g.result.awayScore - (g.result.so ? 1 : 0));
    }
  });

  it('hockey standings: two points a win, one for an overtime or shootout loss', () => {
    const s = seasonsOf('fhl', 1)[0];
    for (const r of s.standings) {
      expect(r.pts).toBe(r.w * 2 + r.otl);
      expect(r.w + r.l + r.otl).toBe(28);
    }
    const otLosses = s.regular.filter((g) => g.result.ot > 0).length;
    expect(s.standings.reduce((a, r) => a + r.otl, 0)).toBe(otLosses);
    for (let i = 1; i < s.standings.length; i++) expect(s.standings[i - 1].pts).toBeGreaterThanOrEqual(s.standings[i].pts);
  });

  it('football: a tie counts half a win; playoffs are single games with a neutral-site final', () => {
    const g = (home: string, away: string, hs: number, as: number, i: number) => ({ id: `f${i}`, round: i, week: 1, home, away, result: { id: `f${i}`, home, away, homeScore: hs, awayScore: as, ot: 1, box: [] } });
    const rows = standingsOf([g('a', 'b', 20, 20, 1), g('c', 'b', 10, 17, 2)], ['a', 'b', 'c'], () => 0, 'football');
    expect(rows.map((r) => [r.team, r.w, r.l, r.t])).toEqual([['b', 1, 0, 1], ['a', 0, 0, 1], ['c', 0, 1, 0]]);
    const s = seasonsOf('igl', 1)[0];
    for (const sr of s.playoffs) {
      expect(sr.games).toHaveLength(1);
      expect(sr.games[0].result.homeScore).not.toBe(sr.games[0].result.awayScore);
    }
    expect(s.playoffs[2].games[0].result.neutral).toBe(true);
    expect(s.playoffs[0].games[0].result.neutral).toBeUndefined();
  });

  it('baseball\'s best-of-7 final uses the 2-3-2 home pattern', () => {
    for (const s of seasonsOf('gdc')) {
      const f = s.playoffs[2];
      const pattern = [true, true, false, false, false, true, true];
      f.games.forEach((g, i) => expect(g.home === f.high).toBe(pattern[i]));
    }
  });

  it('scoring, home advantage and extra time are realistic for each sport', () => {
    const bands = {
      gdc: { total: [7.5, 11], home: [0.51, 0.59], ot: [0.03, 0.15] },
      igl: { total: [38, 54], home: [0.49, 0.6], ot: [0.005, 0.1] },
      fhl: { total: [5, 7.2], home: [0.5, 0.61], ot: [0.08, 0.28] },
    } as const;
    for (const [lg, b] of Object.entries(bands)) {
      const games = seasonsOf(lg as 'gdc').flatMap((s) => s.regular);
      const total = games.reduce((a, g) => a + g.result.homeScore + g.result.awayScore, 0) / games.length;
      const home = games.filter((g) => g.result.homeScore > g.result.awayScore).length / games.length;
      const ot = games.filter((g) => g.result.ot > 0).length / games.length;
      expect(total, `${lg} total`).toBeGreaterThan(b.total[0]);
      expect(total, `${lg} total`).toBeLessThan(b.total[1]);
      expect(home, `${lg} home`).toBeGreaterThan(b.home[0]);
      expect(home, `${lg} home`).toBeLessThan(b.home[1]);
      expect(ot, `${lg} ot`).toBeGreaterThan(b.ot[0]);
      expect(ot, `${lg} ot`).toBeLessThan(b.ot[1]);
    }
    expect(seasonsOf('fhl').flatMap((s) => s.regular).some((g) => g.result.so)).toBe(true);
  });

  it('better teams win more in every sport', () => {
    for (const lg of ['gdc', 'igl', 'fhl'] as const) {
      const xs: number[] = [];
      const ys: number[] = [];
      seasonsOf(lg).forEach((s, i) => {
        const w = createWorld(300 + i);
        for (const r of s.standings) {
          xs.push(w.quality[r.team]);
          ys.push((r.w + r.t / 2) / (r.w + r.l + r.t + r.otl));
        }
      });
      const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
      const mx = mean(xs);
      const my = mean(ys);
      const corr = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / Math.sqrt(xs.reduce((s, x) => s + (x - mx) ** 2, 0) * ys.reduce((s, y) => s + (y - my) ** 2, 0));
      expect(corr, lg).toBeGreaterThan(0.35);
    }
  });

  it('awards go to real players on the right teams (no kickers)', () => {
    for (const lg of LEAGUE_IDS) {
      const s = seasonsOf(lg, 1)[0];
      const byId = new Map(s.players.map((p) => [p.id, p]));
      expect(byId.get(s.awards.mvp.playerId), lg).toBeTruthy();
      expect(byId.get(s.awards.mvp.playerId)!.pos).not.toBe('K');
      expect(byId.get(s.awards.finalsMvp.playerId)!.teamId, lg).toBe(s.champion);
    }
  });
});
