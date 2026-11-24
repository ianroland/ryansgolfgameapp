import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { migrateSportsWorld, planSportsMigration, SPORTS_WORLD_VERSION, sportsSeedOf, sportsWorldOf, ticketsOf } from '../src/career/sportsbook';
import { newCareerState } from '../src/career/engine';
import { boardFor, findGame, gamesOf, rostersFor, seasonOf, type BookGame } from '../src/sports/book';
import { leagueById, SEASON_FORMAT } from '../src/sports/demo';
import type { HistoryData } from '../src/sports/history/data';
import {
  buildForward, compositionOf, draftOrder, freeSeason, LEAGUE_IDS, ledgerEnd, liveRosters2027, mergeForward, type ForwardData,
} from '../src/sports/history/forward';
import { HISTORICAL_LEGENDS, HOF_RULE } from '../src/sports/history/honors';
import { historyRoster } from '../src/sports/history/rosters';
import { historyWorld, packLive } from '../src/sports/liveRosters';
import type { Selection } from '../src/sports/slip';
import { newCareer, RYAN } from './helpers';

const read = (f: string) => JSON.parse(readFileSync(f, 'utf8'));
const data: HistoryData = { players: read('src/sports/history/data/players.json').players, seasons: read('src/sports/history/data/seasons.json').seasons };
const honors = read('src/sports/history/data/honors.json');
const careers = read('src/sports/history/data/careers.json').careers;
const stored = read('src/sports/history/data/forward.json');
const fwd: ForwardData = stored;
const [o26, o27] = fwd.offseasons;
const merged = mergeForward(data, fwd);
const byId = new Map(merged.players.map((p) => [p.i, p]));
const base = new Map(data.players.map((p) => [p.i, p]));
const end = ledgerEnd(data);

describe('Phase D part 2: Hall of Fame Legends pathway and legendary comebacks', () => {
  it('keeps the 97 statistical inductees and adds Voss on the Legends pathway once eligible', () => {
    const stat = honors.hallOfFame.filter((x: { pathway: string }) => x.pathway === 'statistical');
    expect(stat).toHaveLength(97);
    const legends = honors.hallOfFame.filter((x: { pathway: string }) => x.pathway === 'legends');
    expect(legends).toEqual([expect.objectContaining({ playerId: 'gdc_elias_voss', year: 1992 + HOF_RULE.waitYears, event: 'gdc-1983-001' })]);
    // Not everyone in the bible: only the owner-approved list.
    expect(HISTORICAL_LEGENDS.map((l) => l.playerId)).toEqual(['gdc_elias_voss']);
    expect(honors.hallOfFame.some((x: { playerId: string }) => x.playerId === 'ccl_calvin_redd')).toBe(false);
  });

  it('tags exactly the three 0-3 comebacks, with their results unchanged', () => {
    const tagged = honors.records.comebacks.filter((c: { tags?: string[] }) => c.tags?.includes('legendary_comeback'));
    expect(tagged.map((c: { league: string; year: number }) => `${c.league}-${c.year}`).sort()).toEqual(['ccl-1997', 'fhl-2023', 'gdc-2025']);
    for (const c of tagged) {
      expect(c.deficit).toBe('0-3');
      expect(data.seasons.find((s) => s.league === c.league && s.year === c.year)!.champion === c.winner || c.seriesId.includes('semifinal')).toBe(true);
    }
  });

  it('documented gaps stay gaps: one trade, no Coach of the Year', () => {
    expect(honors.transactions).toHaveLength(1);
    expect(honors.awards.some((a: { award: string }) => /coach/i.test(a.award))).toBe(false);
  });
});

describe('the forward layer is reproducible and leaves the ledger alone', () => {
  let rebuilt: ForwardData;
  beforeAll(() => { rebuilt = buildForward(data); }, 120_000);

  it('rebuilding gives the stored 2026 and 2027 data exactly', () => {
    expect(rebuilt.offseasons).toEqual(stored.offseasons);
    expect(rebuilt.seasons).toEqual(stored.seasons);
    expect(packLive(liveRosters2027(data, rebuilt))).toEqual(read('src/sports/data/live2027.json'));
  });

  it('1972-2025 players and seasons are unchanged; only 2026 extends careers', () => {
    expect(merged.seasons.slice(0, data.seasons.length)).toEqual(data.seasons);
    data.players.forEach((p, ix) => {
      const m = merged.players[ix];
      expect({ ...m, f: 0, s: [] }).toEqual({ ...p, f: 0, s: [] });
      expect(m.s.map(([t, a, b]) => [t, a, Math.min(b, 2025)])).toEqual(p.s.map(([t, a, b]) => [t, a, Math.min(b, 2025)]).concat(m.s.length > p.s.length ? [m.s.at(-1)!.map((x, i) => (i === 2 ? Math.min(Number(x), 2025) : x)) as [string, number, number]] : []));
    });
    // Part 1 totals untouched.
    expect(honors.awards).toHaveLength(803);
    expect(Object.keys(careers)).toHaveLength(4534);
  });
});

describe('retirements and the rookie intake', () => {
  it('the active pool is 715: 656 on 2025 rosters, 38 reserves, 21 listed 2026 debuts', () => {
    expect(end.onRoster.size).toBe(656);
    expect(end.reserves).toHaveLength(38);
    expect(data.players.filter((p) => p.d === 2026)).toHaveLength(21);
    expect(data.players.filter((p) => p.f >= 2025)).toHaveLength(715);
  });

  it('only active players retire, once, never a named legend, and are gone the next season', () => {
    const was26 = new Set([...end.onRoster, ...end.reserves]);
    const was27 = new Set([...Object.values(o26.rosters).flatMap((r) => Object.values(r).flat()), ...o26.reserves]);
    for (const [o, was] of [[o26, was26], [o27, was27]] as const) {
      const onNext = new Set(Object.values(o.rosters).flatMap((r) => Object.values(r).flat()));
      for (const id of o.retired) {
        expect(was.has(id), id).toBe(true);
        expect(byId.get(id)!.a).toBeUndefined();
        expect(onNext.has(id)).toBe(false);
        expect(o.reserves.includes(id)).toBe(false);
      }
    }
    expect(o26.retired.filter((id) => o27.retired.includes(id))).toEqual([]);
    expect(o26.retired.concat(o27.retired).includes('igl_mason_vale')).toBe(false);
  });

  it('draftees are new players debuting that year, with unique ids and names and realistic ages', () => {
    const names = new Set(data.players.map((p) => p.n));
    for (const o of [o26, o27]) {
      for (const p of o.newPlayers) {
        expect(base.has(p.i)).toBe(false);
        expect(p.d).toBe(o.year);
        expect(names.has(p.n), p.n).toBe(false);
        names.add(p.n);
        const ages = data.players.filter((x) => x.l === p.l && x.d > 1980).map((x) => x.d - x.b);
        expect(p.d - p.b).toBeGreaterThanOrEqual(Math.min(...ages));
        expect(p.d - p.b).toBeLessThanOrEqual(Math.max(...ages));
      }
      expect(o.draft.map((d) => d.playerId).sort()).toEqual(o.newPlayers.map((p) => p.i).sort());
    }
    // Signed debuts are v0.4's own listed 2026 players.
    for (const id of o26.signed) expect(base.get(id)!.d).toBe(2026);
  });

  it('draft order is worst first, champion last, and overall picks run 1..n per league', () => {
    for (const o of [o26, o27]) {
      for (const l of LEAGUE_IDS) {
        const picks = o.draft.filter((d) => d.league === l);
        expect(picks.map((d) => d.overall)).toEqual(picks.map((_, i) => i + 1));
        const prev = o.year === 2026 ? end.seasons[l] : fwd.seasons.find((s) => s.league === l)!;
        const order = draftOrder(prev);
        expect(order.at(-1)).toBe(prev.champion);
        const r1 = picks.filter((d) => d.round === 1).map((d) => order.indexOf(d.teamId));
        expect(r1).toEqual([...r1].sort((a, b) => a - b));
      }
    }
  });
});

describe('rosters, ages and schedules', () => {
  it('every 2026 and 2027 roster has the 2025 composition; no player on two teams or retired', () => {
    for (const o of [o26, o27]) {
      const all = Object.values(o.rosters).flatMap((r) => Object.values(r).flat());
      expect(new Set(all).size).toBe(all.length);
      expect(all).toHaveLength(656);
      for (const id of all) expect(o.retired.includes(id) || o.reserves.includes(id)).toBe(false);
      for (const l of LEAGUE_IDS) {
        const comp = compositionOf(data, l);
        for (const ids of Object.values(o.rosters[l])) {
          const c: Record<string, number> = {};
          for (const id of ids) c[byId.get(id)!.p] = (c[byId.get(id)!.p] ?? 0) + 1;
          expect(c).toEqual(comp);
        }
      }
    }
  });

  it('players age a year each season: 2026 rosters at 2026, the live rosters at 2027', () => {
    for (const s of fwd.seasons) for (const t of Object.keys(s.rosters)) for (const p of historyRoster(merged, s, t)) expect(p.age).toBe(2026 - byId.get(p.id)!.b);
    const live = historyWorld(1).players;
    expect(live).toHaveLength(656);
    for (const p of live) expect(p.age).toBe(2027 - byId.get(p.id)!.b);
    expect(new Set(live.map((p) => p.id)).size).toBe(656);
  });

  it('2026 seasons are complete and consistent: full schedules, real playoffs, champion from the final', () => {
    for (const s of fwd.seasons) {
      const sport = leagueById(s.league).sport;
      const h = freeSeason(merged, s);
      expect(h.season).toEqual(s);
      const per = new Map<string, number>();
      const pairs = new Map<string, number>();
      for (const g of h.regular) {
        for (const t of [g.home, g.away]) per.set(t, (per.get(t) ?? 0) + 1);
        const k = [g.home, g.away].sort().join('|');
        pairs.set(k, (pairs.get(k) ?? 0) + 1);
        expect(g.result.homeScore).not.toBe(g.result.awayScore);
      }
      expect([...per.values()].every((n) => n === SEASON_FORMAT[sport].gamesPerTeam)).toBe(true);
      expect(pairs.size).toBe(28);
      expect([...pairs.values()].every((n) => n === SEASON_FORMAT[sport].meetingsPerOpponent)).toBe(true);
      const w = Object.values(s.records).reduce((a, r) => a + r[0], 0);
      const l = Object.values(s.records).reduce((a, r) => a + r[1], 0);
      expect(w).toBe(l);
      expect(w).toBe(h.regular.length);
      const [s1, s2, f] = h.playoffs;
      expect([s1.high, s1.low, s2.high, s2.low]).toEqual([s.seeds[0], s.seeds[3], s.seeds[1], s.seeds[2]]);
      expect(new Set([f.high, f.low])).toEqual(new Set([s1.winner, s2.winner]));
      expect(s.champion).toBe(f.winner);
      expect(s.runnerUp).toBe(f.loser);
      for (const x of h.playoffs) expect(Math.max(...Object.values(x.wins))).toBe(Math.ceil(x.bestOf / 2));
    }
  }, 120_000);
});

describe('2026 awards, records and Hall of Fame', () => {
  const h26 = stored.honors2026;
  it('one MVP and one championship MVP per league; the rookie award goes to a 2026 debut', () => {
    for (const s of fwd.seasons) {
      const a = h26.awards.filter((x: { league: string }) => x.league === s.league);
      expect(a.filter((x: { award: string }) => x.award === 'Most Valuable Player')).toHaveLength(1);
      expect(a.find((x: { award: string }) => x.award === 'Championship MVP').teamId).toBe(s.champion);
      const roy = a.find((x: { award: string }) => x.award === 'Rookie of the Year');
      expect(byId.get(roy.playerId)!.d).toBe(2026);
      for (const x of a) expect(Object.values(s.rosters).flat().map((ix) => merged.players[ix].i)).toContain(x.playerId);
    }
    expect(h26.champions.map((c: { champion: string }) => c.champion)).toEqual(fwd.seasons.map((s) => s.champion));
  });

  it('record marks compare against the 1972-2025 books and never rewrite them', () => {
    for (const r of h26.records) {
      expect(['new record', 'ties record', 'top 5']).toContain(r.verdict);
      if (r.verdict === 'new record') expect(r.value).toBeGreaterThan(r.previous);
      if (r.verdict === 'ties record') expect(r.value).toBe(r.previous);
    }
    expect(honors.records.game.every((r: { year: number }) => r.year <= 2025)).toBe(true);
  });

  it('Hall of Fame class of 2026: final season 2021, eight seasons, not already in', () => {
    const inBefore = new Set(honors.hallOfFame.map((x: { playerId: string }) => x.playerId));
    expect(h26.hallOfFame.length).toBeGreaterThan(0);
    for (const x of h26.hallOfFame) {
      expect(base.get(x.playerId)!.f).toBe(2021);
      expect(careers[x.playerId].n).toBeGreaterThanOrEqual(HOF_RULE.minSeasons);
      expect(inBefore.has(x.playerId)).toBe(false);
      expect(x.year).toBe(2026);
    }
  });
});

describe('the live leagues and save migration', () => {
  it('a plain seed is the original world; a marked save switches only from its season', () => {
    expect(rostersFor(77, 3)).toBe('generated');
    expect(rostersFor({ seed: 77, historyFrom: 2 }, 1)).toBe('generated');
    expect(rostersFor({ seed: 77, historyFrom: 2 }, 2)).toBe('history');
    const a = seasonOf(77, 1);
    const b = seasonOf({ seed: 77, historyFrom: 2 }, 1);
    expect(gamesOf(b.leagues.gdc).map((g) => g.result)).toEqual(gamesOf(a.leagues.gdc).map((g) => g.result));
    const h = seasonOf({ seed: 77, historyFrom: 1 }, 1);
    expect(new Set(h.world.players.map((p) => p.id))).toEqual(new Set(historyWorld(0).players.map((p) => p.id)));
    // Same players in every save, different games.
    const h2 = seasonOf({ seed: 78, historyFrom: 1 }, 1);
    expect(h2.world.players.map((p) => p.id)).toEqual(h.world.players.map((p) => p.id));
    expect(gamesOf(h2.leagues.ccl).map((g) => g.result.homeScore)).not.toEqual(gamesOf(h.leagues.ccl).map((g) => g.result.homeScore));
  }, 60_000);

  it('new careers start on the history rosters; the plan keeps a season with tickets or results on the old ones', () => {
    const c = newCareerState(5);
    expect(c.flags.sportsWorldV).toBe(SPORTS_WORLD_VERSION);
    expect(sportsWorldOf(c)).toEqual({ seed: sportsSeedOf(c), historyFrom: 1 });
    expect(planSportsMigration(c)).toBeNull();
    expect(migrateSportsWorld(c)).toBe(c);
    const legacy = { ...c, flags: { seed: 5 }, season: 2, week: 1 };
    expect(planSportsMigration(legacy)).toMatchObject({ historyFrom: 2 });
    expect(planSportsMigration({ ...legacy, week: 6 })).toMatchObject({ historyFrom: 3 });
    const leg = { gameId: 'x', league: 'gdc', season: 2, week: 1 };
    const withTicket = { ...legacy, flags: { seed: 5, sportsTickets: JSON.stringify([{ id: 't', status: 'won', legs: [leg] }]) } };
    expect(planSportsMigration(withTicket)).toMatchObject({ historyFrom: 3 });
    const once = migrateSportsWorld({ ...legacy, week: 6 });
    expect(migrateSportsWorld(once)).toBe(once);
    expect(once.flags).toMatchObject({ seed: 5, sportsWorldV: 2, sportsHistoryFrom: 3 });
  });
});

const pickOf = (g: BookGame, side: 'home' | 'away'): Selection => {
  const l = g.lines.find((x) => x.market === 'moneyline' && x.side === side)!;
  return { gameId: g.id, market: 'moneyline', side, point: null, american: l.american, label: side };
};

describe('migrating a save with live tickets', () => {
  it('settles what is final, keeps open tickets on their original games, pays once, keeps the bankroll whole', async () => {
    const { s } = await newCareer();
    // An older save: no world marker, part-way through season 1.
    const c0 = await s.career.getCareer();
    const { sportsWorldV: _v, sportsHistoryFrom: _f, ...oldFlags } = c0.flags;
    await s.db.careers.put({ ...c0, flags: oldFlags, week: 3 });
    const seed = sportsSeedOf(c0);
    expect(sportsWorldOf(await s.career.getCareer())).toBe(seed);
    const start = await s.economy.getBalance(RYAN);
    const wk3 = boardFor(seed, 1, 3, 'gdc').games;
    await s.sportsbook.place({ picks: [pickOf(wk3[0], 'home'), pickOf(wk3[1], 'away')], stake: 40, parlay: false, lounge: 'desert_palms', requestId: 'old' });
    // The older build moved on a week without settling.
    const c1 = await s.career.getCareer();
    await s.db.careers.put({ ...c1, week: 4 });
    const wk4 = boardFor(seed, 1, 4, 'gdc').games;
    await s.sportsbook.place({ picks: [pickOf(wk4[0], 'away')], stake: 25, parlay: false, lounge: 'desert_palms', requestId: 'open' });
    expect(await s.economy.getBalance(RYAN)).toBe(start - 105);

    const m1 = await s.sportsbook.migrateWorld();
    expect(m1).toMatchObject({ migrated: true, historyFrom: 2, settled: 2, open: 1 });
    const after1 = await s.career.getCareer();
    expect(after1.flags).toMatchObject({ sportsWorldV: 2, sportsHistoryFrom: 2 });
    const paid1 = ticketsOf(after1).filter((t) => t.status !== 'open').reduce((a, t) => a + t.payout, 0);
    expect(await s.economy.getBalance(RYAN)).toBe(start - 105 + paid1);

    // Again: nothing changes, nothing is paid twice.
    const m2 = await s.sportsbook.migrateWorld();
    expect(m2).toMatchObject({ migrated: false, settled: 0, open: 1 });
    expect(await s.economy.getBalance(RYAN)).toBe(start - 105 + paid1);

    // The open ticket settles on the same original-roster game it was priced on.
    await s.db.careers.put({ ...(await s.career.getCareer()), week: 5 });
    const done = await s.sportsbook.settleDue();
    expect(done).toHaveLength(1);
    const leg = done[0].legs[0];
    const game = findGame(seed, 1, leg.gameId)!.game;
    expect(leg.final).toEqual([game.result.homeScore, game.result.awayScore]);
    const all = ticketsOf(await s.career.getCareer());
    const paid = all.reduce((a, t) => a + t.payout, 0);
    expect(await s.economy.getBalance(RYAN)).toBe(start - 105 + paid);
    const tx = await s.economy.listTransactions(RYAN);
    expect(tx.filter((t) => t.type === 'sports_payout').reduce((a, t) => a + t.amount, 0)).toBe(paid);
    expect(new Set(tx.map((t) => t.idempotencyKey)).size).toBe(tx.length);
    await s.economy.verifyIntegrity(RYAN);
  }, 60_000);

  it('a migrated save survives export and import unchanged; an imported old save is migrated once', async () => {
    const { s } = await newCareer();
    const c = await s.career.getCareer();
    const { sportsWorldV: _v, sportsHistoryFrom: _f, ...oldFlags } = c.flags;
    await s.db.careers.put({ ...c, flags: oldFlags, week: 8 });
    const file = await s.saves.exportSave();
    const { s: t } = await newCareer();
    await t.saves.importSave(file);
    expect(sportsWorldOf(await t.career.getCareer())).toBe(sportsSeedOf(c));
    expect((await t.sportsbook.migrateWorld()).historyFrom).toBe(2);
    const migrated = await t.saves.exportSave();
    const { s: u } = await newCareer();
    await u.saves.importSave(migrated);
    expect((await u.sportsbook.migrateWorld()).migrated).toBe(false);
    expect(sportsWorldOf(await u.career.getCareer())).toEqual({ seed: sportsSeedOf(c), historyFrom: 2 });
  }, 60_000);

  it('a new career bets on the history rosters and settles on them', async () => {
    const { s } = await newCareer();
    const c = await s.career.getCareer();
    const ref = sportsWorldOf(c);
    const g = boardFor(ref, 1, 1, 'ccl').games[0] ?? boardFor(ref, 1, 2, 'ccl').games[0];
    await s.sportsbook.place({ picks: [pickOf(g, 'home')], stake: 10, parlay: false, lounge: 'desert_palms', requestId: 'h' });
    await s.db.careers.put({ ...(await s.career.getCareer()), week: g.week + 1 });
    const [t] = await s.sportsbook.settleDue();
    const game = findGame(ref, 1, g.id)!.game;
    expect(t.legs[0].final).toEqual([game.result.homeScore, game.result.awayScore]);
    expect(seasonOf(ref, 1).world.players.some((p) => p.id === 'igl_mason_vale')).toBe(true);
  }, 60_000);
});
