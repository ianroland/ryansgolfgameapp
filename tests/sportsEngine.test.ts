import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { playBasketball, teamStrength } from '../src/sports/basketball';
import { SPORTS_CONFIG } from '../src/sports/config';
import { SEASON_FORMAT, teamsOf } from '../src/sports/demo';
import { stream } from '../src/sports/rng';
import { roundRobin, seasonSchedule, validateSchedule } from '../src/sports/schedule';
import { createWorld, playBasketballSeason, standingsOf, type BasketballSeason } from '../src/sports/season';

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
    expect(s.awards.mvp.ppg).toBeGreaterThan(10);
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
