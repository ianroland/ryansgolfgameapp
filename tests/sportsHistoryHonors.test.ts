import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { HistoryData } from '../src/sports/history/data';
import { historySeason } from '../src/sports/history/games';
import { comebacks, drafts, FOUNDED, GAME_STATS, HOF_RULE, seasonHonors, seasonValue, transactions, winStreaks } from '../src/sports/history/honors';
import { seasonStats, type StatLine } from '../src/sports/history/stats';
import { leagueById } from '../src/sports/demo';

const data: HistoryData = {
  players: JSON.parse(readFileSync('src/sports/history/data/players.json', 'utf8')).players,
  seasons: JSON.parse(readFileSync('src/sports/history/data/seasons.json', 'utf8')).seasons,
};
const honors = JSON.parse(readFileSync('src/sports/history/data/honors.json', 'utf8'));
const careers = JSON.parse(readFileSync('src/sports/history/data/careers.json', 'utf8')).careers;
const P = new Map(data.players.map((p) => [p.i, p]));
const S = (id: string) => data.seasons.find((s) => s.id === id)!;

/** Rebuilds one season's honours from scratch, exactly as the build does. */
function rebuild(id: string) {
  const s = S(id);
  const h = historySeason(data, s);
  const finalIds = new Set(h.playoffs[2].games.map((g) => g.id));
  const finals = new Map<string, StatLine>();
  const games: { id: string; lines: Map<string, StatLine> }[] = [];
  const { players } = seasonStats(data, h, (g, lines) => {
    games.push({ id: g.id, lines });
    if (finalIds.has(g.id)) for (const [pid, l] of lines) {
      const f = finals.get(pid) ?? {};
      for (const [k, v] of Object.entries(l)) f[k] = (f[k] ?? 0) + v;
      finals.set(pid, f);
    }
  });
  return { h, players, games, ...seasonHonors(data, h, players, finals) };
}

describe('Phase D: awards, records and careers trace to the games', () => {
  it('every season has one MVP and one championship MVP from the champion', () => {
    for (const s of data.seasons) {
      const a = honors.awards.filter((x: { league: string; year: number }) => x.league === s.league && x.year === s.year);
      expect(a.filter((x: { award: string }) => x.award === 'Most Valuable Player')).toHaveLength(1);
      const f = a.filter((x: { award: string }) => x.award === 'Championship MVP');
      expect(f).toHaveLength(1);
      expect(f[0].teamId, s.id).toBe(s.champion);
      for (const x of a) expect(P.get(x.playerId)!.l).toBe(s.league);
    }
  });

  it('rookies are in their debut season, and none in a founding season', () => {
    for (const r of honors.awards.filter((x: { award: string }) => x.award === 'Rookie of the Year')) {
      expect(P.get(r.playerId)!.d).toBe(r.year);
      expect(r.year).not.toBe(FOUNDED[r.league as keyof typeof FOUNDED]);
    }
  });

  it('anchor honours match the bible', () => {
    const lead = (pid: string, stat: string) => honors.leaders.filter((x: { playerId: string; stat: string }) => x.playerId === pid && x.stat === stat).map((x: { year: number }) => x.year);
    // "Four-time scoring champion" Andre Bellamy, before the 2008 trade.
    expect(lead('ccl_andre_bellamy', 'ppg')).toEqual([2002, 2003, 2005, 2007]);
    const season = (stat: string, league: string) => honors.records.season.find((r: { stat: string; league: string }) => r.stat === stat && r.league === league);
    expect(season('nohit', 'gdc')).toMatchObject({ playerId: 'gdc_elias_voss', year: 1983, value: 3 });
    expect(season('w', 'gdc')).toMatchObject({ playerId: 'gdc_elias_voss', year: 1983, value: 13 });
    const saves = honors.records.game.find((r: { stat: string; league: string }) => r.stat === 'sv' && r.league === 'fhl');
    expect(saves).toMatchObject({ playerId: 'fhl_viktor_soren', year: 1989, value: 71 });
    // The 1998 Founders Cup comeback from 3-1 down.
    expect(honors.records.comebacks.some((c: { league: string; year: number; deficit: string; winner: string }) => c.league === 'gdc' && c.year === 1998 && c.deficit === '1-3' && c.winner === S('gdc-1998').champion)).toBe(true);
  });

  it('a rebuilt sample matches the stored file (no staleness)', () => {
    for (const id of ['gdc-1983', 'ccl-2002', 'igl-1994', 'fhl-1989']) {
      const r = rebuild(id);
      const stored = honors.awards.filter((x: { league: string; year: number }) => `${x.league}-${x.year}` === id);
      expect(r.awards, id).toEqual(stored);
      expect(r.leaders).toEqual(honors.leaders.filter((x: { league: string; year: number }) => `${x.league}-${x.year}` === id));
      expect(comebacks(r.h)).toEqual(honors.records.comebacks.filter((x: { league: string; year: number }) => `${x.league}-${x.year}` === id));
    }
  }, 120_000);

  it('single-game and single-season records are real lines and nothing in the sample beats them', () => {
    for (const id of ['ccl-1985', 'fhl-1989', 'gdc-2017', 'igl-1984']) {
      const r = rebuild(id);
      const sport = leagueById(r.h.season.league).sport;
      for (const [stat] of GAME_STATS[sport]) {
        const top = honors.records.game.filter((x: { stat: string; league: string }) => x.stat === stat && x.league === r.h.season.league) as { value: number; year: number; gameId: string; playerId: string }[];
        const max = Math.max(...r.games.flatMap((g) => [...g.lines.values()].map((l) => l[stat] ?? 0)));
        expect(max).toBeLessThanOrEqual(top[0].value);
        for (const t of top.filter((x: { year: number }) => x.year === r.h.season.year)) {
          const g = r.games.find((x) => x.id === t.gameId)!;
          expect(g.lines.get(t.playerId)![stat], t.gameId).toBe(t.value);
        }
      }
      for (const t of honors.records.season.filter((x: { year: number; league: string }) => x.year === r.h.season.year && x.league === r.h.season.league)) {
        expect(r.players.find((p) => p.playerId === t.playerId)!.regular[t.stat]).toBe(t.value);
      }
    }
  }, 120_000);

  it('career records equal the stored career totals', () => {
    for (const r of honors.records.career) expect(careers[r.playerId].r[r.stat], r.label).toBe(r.value);
  });

  it('team records: streaks fit the season record, titles match the champions list', () => {
    for (const r of honors.records.team.filter((x: { stat: string }) => x.stat === 'streak')) expect(r.value).toBeLessThanOrEqual(S(`${r.league}-${r.year}`).records[r.teamId][0]);
    expect(Math.max(...winStreaks(historySeason(data, S('igl-1985'))).values())).toBe(14);
    for (const r of honors.records.team.filter((x: { stat: string }) => x.stat === 'titles')) {
      expect(data.seasons.filter((s) => s.champion === r.teamId).length).toBe(r.value);
    }
    for (const r of honors.records.team.filter((x: { stat: string }) => x.stat === 'consecutive')) {
      for (let y = r.seasons[0]; y <= r.seasons[1]; y++) expect(S(`${r.league}-${y}`).champion).toBe(r.teamId);
    }
    for (const r of honors.records.team.filter((x: { stat: string; value: number }) => x.stat === 'drought' && x.value > 0)) {
      for (let y = r.seasons[0]; y <= r.seasons[1]; y++) expect(S(`${r.league}-${y}`).champion).not.toBe(r.teamId);
    }
  });

  it('drafts: one class per league year after founding, debut team picks, no pick repeated', () => {
    const d = honors.drafts;
    expect(new Set(d.map((x: { playerId: string }) => x.playerId)).size).toBe(d.length);
    for (const x of d) {
      const p = P.get(x.playerId)!;
      expect(x.year).toBe(p.d);
      expect(x.year).toBeGreaterThan(FOUNDED[p.l]);
      expect(x.teamId).toBe(p.s[0][0]);
    }
    expect(drafts(data, new Map()).length).toBe(d.length);
  });

  it('transactions come only from team changes in the data (Bellamy 2008 is the trade)', () => {
    expect(transactions(data)).toEqual(honors.transactions);
    expect(honors.transactions).toHaveLength(data.players.filter((p) => p.s.length > 1).length);
    expect(honors.transactions[0]).toMatchObject({ playerId: 'ccl_andre_bellamy', year: 2008, type: 'trade', from: 'ccl_forge', to: 'ccl_monsoon' });
  });

  it('Hall of Fame (proposed): eligible after the wait, enough seasons, no one twice', () => {
    expect(new Set(honors.hallOfFame.map((x: { playerId: string }) => x.playerId)).size).toBe(honors.hallOfFame.length);
    for (const x of honors.hallOfFame) {
      const p = P.get(x.playerId)!;
      expect(x.year).toBe(p.f + HOF_RULE.waitYears);
      expect(x.year).toBeLessThanOrEqual(2025);
      expect(careers[x.playerId].n).toBeGreaterThanOrEqual(HOF_RULE.minSeasons);
    }
  });

  it('season value is finite for every sport', () => {
    for (const sport of ['baseball', 'basketball', 'football', 'hockey'] as const) expect(Number.isFinite(seasonValue(sport, {}))).toBe(true);
  });
});
