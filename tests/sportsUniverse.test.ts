import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { migrateSportsWorld, planSportsMigration, sportsSeedOf, sportsWorldOf, ticketsOf, withBook, bookTotalsOf } from '../src/career/sportsbook';
import { newCareerState } from '../src/career/engine';
import { settleTicket, type Ticket } from '../src/sports/bets';
import { boardFor, findGame, rostersFor, rosterVersion, seasonOf, type WorldRef } from '../src/sports/book';
import { SEASON_FORMAT } from '../src/sports/demo';
import { HOF_RULE } from '../src/sports/history/honors';
import { forgetChain, processSeason, registerState, stateFor, UNIVERSE, type EvolveRef, type OffseasonOutput } from '../src/sports/universe/chain';
import { curve, LEAGUE_IDS, PROTECTED, sportOfLeague, worldFromState, type UState } from '../src/sports/universe/model';
import { draftOrderLive, validateState } from '../src/sports/universe/offseason';
import type { Selection } from '../src/sports/slip';
import { newCareer, reload, RYAN } from './helpers';

const careersCanon = JSON.parse(readFileSync('src/sports/history/data/careers.json', 'utf8')).careers;
const canonNames = new Set(UNIVERSE.canonNames);

/**
 * Runs a chain from 2027 for `years` off-seasons and keeps every output, plus each season's draft
 * order (the chain only keeps recent seasons in memory, as the app does).
 */
function run(seed: number, years: number): { ref: EvolveRef; outs: OffseasonOutput[]; states: UState[]; orders: Record<string, { order: string[]; champion: string }>[] } {
  const ref = { seed, historyFrom: 1, evolveFrom: 2 };
  forgetChain(ref);
  const outs: OffseasonOutput[] = [];
  const orders: Record<string, { order: string[]; champion: string }>[] = [];
  const states: UState[] = [stateFor(ref, 1, (s) => seasonOf(ref, s))];
  for (let s = 1; s <= years; s++) {
    const o = processSeason(ref, s, (x) => seasonOf(ref, x));
    const played = seasonOf(ref, s);
    orders.push(Object.fromEntries(LEAGUE_IDS.map((l) => [l, { order: draftOrderLive(played.leagues[l]), champion: played.leagues[l].champion }])));
    outs.push(o);
    states.push(o.next);
  }
  return { ref, outs, states, orders };
}
const hash = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0, 16);

describe('Phase D part 3: the 2027 → 2028 transition', () => {
  let r: ReturnType<typeof run>;
  beforeAll(() => { r = run(5150, 1); }, 120_000);

  it('2028 has new rosters built from 2027, not the 2027 rosters again', () => {
    const [s27, s28] = r.states;
    expect(s27).toBe(UNIVERSE.start);
    expect(s28.year).toBe(2028);
    validateState(s28, UNIVERSE);
    const ids27 = new Set(Object.values(s27.rosters).flatMap((x) => Object.values(x).flat()));
    const ids28 = Object.values(s28.rosters).flatMap((x) => Object.values(x).flat());
    expect(ids28.filter((id) => !ids27.has(id)).length).toBeGreaterThan(40);
    expect(rostersFor(r.ref, 1)).toBe('history');
    expect(rostersFor(r.ref, 2)).toBe('evolved');
    const w28 = seasonOf(r.ref, 2).world;
    expect(w28.players).toHaveLength(656);
    expect(w28.players.every((p) => p.age === 2028 - s28.players.find((x) => x.i === p.id)!.b)).toBe(true);
    // The 2027 season itself is untouched: the fixed carry-over rosters, as in v0.19.7.
    expect(seasonOf(r.ref, 1).world.players.map((p) => p.id)).toEqual(seasonOf({ seed: 5150, historyFrom: 1 }, 1).world.players.map((p) => p.id));
  });

  it('runs the off-season steps in order and records them', () => {
    expect(r.outs[0].summary.steps).toEqual(['season final', 'tickets settled (service)', 'standings and champions', 'player stats', 'awards and records', 'retirements', 'hall of fame', 'rookie class', 'draft', 'rosters replenished', 'development', 'schedule (engine)', 'validated']);
  });

  it('the 2028 schedule is complete for all four leagues', () => {
    const s = seasonOf(r.ref, 2);
    for (const l of LEAGUE_IDS) {
      const per = new Map<string, number>();
      for (const g of s.leagues[l].regular) for (const t of [g.home, g.away]) per.set(t, (per.get(t) ?? 0) + 1);
      expect(per.size).toBe(8);
      expect([...per.values()].every((n) => n === SEASON_FORMAT[sportOfLeague(l)].gamesPerTeam)).toBe(true);
      expect(s.leagues[l].champion).toBeTruthy();
    }
  });
});

describe('ten and twenty-five seasons', () => {
  let ten: ReturnType<typeof run>;
  let long: ReturnType<typeof run>;
  beforeAll(() => {
    ten = run(777, 10);
    long = run(2026, 25);
  }, 600_000);

  it('every season: 32 valid rosters, no retired, duplicated or over-age players', () => {
    for (const { states, outs } of [ten, long]) {
      const retiredEver = new Set<string>();
      states.forEach((st, k) => {
        validateState(st, UNIVERSE);
        const onRoster = Object.values(st.rosters).flatMap((x) => Object.values(x).flat());
        expect(onRoster).toHaveLength(656);
        expect(Object.values(st.rosters).flatMap((x) => Object.keys(x))).toHaveLength(32);
        for (const id of onRoster) expect(retiredEver.has(id), id).toBe(false);
        for (const p of st.players) {
          expect(Number.isFinite(p.L)).toBe(true);
          if (!PROTECTED[p.i]) expect(st.year - 1 - p.b).toBeLessThan(44);
        }
        if (k < outs.length) for (const x of outs[k].summary.retired) retiredEver.add(x.i);
      });
    }
  });

  it('players age from the season year, develop smoothly, and decline late', () => {
    const { states } = long;
    let youngUp = 0, young = 0, oldDown = 0, old = 0;
    for (let k = 1; k < states.length; k++) {
      const prev = new Map(states[k - 1].players.map((p) => [p.i, p]));
      for (const p of states[k].players) {
        const q = prev.get(p.i);
        if (!q) { expect(p.d).toBe(states[k].year); continue; }
        expect(p.b).toBe(q.b);
        const d = p.L - q.L;
        expect(d).toBeGreaterThanOrEqual(-6.05);
        expect(d).toBeLessThanOrEqual(5.05);
        const age = states[k].year - p.b;
        if (age <= p.pk - 2) { young++; if (d > 0) youngUp++; }
        if (age >= 34) { old++; if (d < 0) oldDown++; }
      }
    }
    expect(youngUp / young).toBeGreaterThan(0.75);
    expect(oldDown / old).toBeGreaterThan(0.75);
    // Curves: rising to the peak, flat at it, falling after; durable veterans decline slower.
    expect(curve('football', 'standard', 26, 22)).toBeLessThan(curve('football', 'standard', 26, 25));
    expect(curve('basketball', 'durable', 27, 36)).toBeGreaterThan(curve('basketball', 'standard', 27, 36));
    expect(curve('hockey', 'standard', 27, 40)).toBeLessThan(curve('hockey', 'standard', 27, 34) - 8);
  });

  it('player counts stay level: retirements are replaced by drafts and reserves', () => {
    long.outs.forEach((o, k) => {
      const reserveBefore = new Set(long.states[k].players.filter((p) => p.r === 1).map((p) => p.i));
      for (const l of LEAGUE_IDS) {
        const c = o.summary.counts[l];
        expect(c.rostered).toBe(Object.values(UNIVERSE.composition[l]).reduce((a, b) => a + b, 0) * 8);
        // Every rostered retirement is filled by a returning reserve or a draftee, exactly.
        const fromRoster = o.summary.retired.filter((x) => x.l === l && !reserveBefore.has(x.i)).length;
        expect(c.drafted + c.returned).toBe(fromRoster);
        expect(c.active).toBe(c.rostered + c.reserves);
      }
    });
    const L = long.states.map((s) => s.players.reduce((a, p) => a + p.L, 0) / s.players.length);
    expect(Math.max(...L) - Math.min(...L)).toBeLessThan(3); // no talent inflation over 25 years
  });

  it('drafts: unique new ids and names, worst team first, champion last, full positional balance', () => {
    const ids = new Set(long.states[0].players.map((p) => p.i));
    const names = new Set([...canonNames]);
    long.outs.forEach((o, k) => {
      for (const d of o.summary.draft) {
        expect(ids.has(d.i), d.i).toBe(false);
        ids.add(d.i);
        expect(names.has(d.n), d.n).toBe(false);
        names.add(d.n);
        expect(d.i).toMatch(new RegExp(`^${d.l}_d${o.summary.year + 1}_\\d{3}$`));
      }
      for (const l of LEAGUE_IDS) {
        const picks = o.summary.draft.filter((d) => d.l === l);
        expect(picks.map((d) => d.overall)).toEqual(picks.map((_, i) => i + 1));
        const { order, champion } = long.orders[k][l];
        expect(order.at(-1)).toBe(champion);
        const r1 = picks.filter((d) => d.round === 1).map((d) => order.indexOf(d.t));
        expect(r1).toEqual([...r1].sort((a, b) => a - b));
      }
    });
  }, 120_000);

  it('career records add up: canon + each season, seasons and titles only ever grow', () => {
    const { states, outs } = long;
    for (let k = 0; k < outs.length; k++) {
      const before = states[k].careers;
      const after = states[k + 1].careers;
      for (const [id, c] of Object.entries(after)) {
        const b = before[id];
        if (!b) continue;
        expect(c.n).toBeGreaterThanOrEqual(b.n);
        expect(c.ti).toBeGreaterThanOrEqual(b.ti);
        const line = outs[k].lines[id]?.r ?? {};
        for (const [stat, v] of Object.entries(c.tot)) expect(v).toBe((b.tot[stat] ?? 0) + (stat in line ? line[stat] : 0));
      }
    }
    // The canon totals are never rewritten.
    const vale = long.states.at(-1)!.careers.igl_mason_vale;
    expect(vale.tot.pass_yds).toBeGreaterThanOrEqual(careersCanon.igl_mason_vale.r.pass_yds);
  });

  it('awards every year; records only move up; championships and droughts are tracked', () => {
    long.outs.forEach((o, k) => {
      for (const l of LEAGUE_IDS) {
        const y = o.summary.leagues[l];
        const a = (name: string) => y.awards.filter((x) => x.award === name);
        expect(a('Most Valuable Player')).toHaveLength(1);
        expect(a('Championship MVP')[0].teamId).toBe(y.champion);
        for (const roy of a('Rookie of the Year')) expect(long.states[k].players.find((p) => p.i === roy.playerId)!.d).toBe(o.summary.year);
        for (const r of y.records) expect(r.value).toBeGreaterThanOrEqual(r.previous);
        expect(o.next.titles[y.champion]).toContain(o.summary.year);
      }
      for (const kind of ['game', 'season', 'career', 'team'] as const) {
        for (const top of long.states[k].book[kind]) {
          const now = o.next.book[kind].filter((r) => r.league === top.league && r.stat === top.stat);
          expect(Math.max(...now.map((r) => r.value))).toBeGreaterThanOrEqual(top.value);
        }
      }
    });
  });

  it('Hall of Fame: once per player, five years after the final season, at the existing bar', () => {
    const seen = new Set<string>();
    for (const o of long.outs) {
      for (const h of o.summary.hallOfFame) {
        expect(seen.has(h.i)).toBe(false);
        seen.add(h.i);
        expect(h.y).toBe(o.summary.year + 1);
        expect(h.sc).toBeGreaterThanOrEqual(UNIVERSE.threshold[h.l]);
      }
    }
    for (const st of long.states) for (const p of st.pending) {
      expect(p.y).toBe(p.f + HOF_RULE.waitYears);
      expect(p.s).toBeGreaterThanOrEqual(HOF_RULE.minSeasons);
    }
    expect(seen.size).toBeGreaterThan(5);
    expect(seen.has('gdc_elias_voss')).toBe(false); // already inducted in canon
  });

  it('Mason Vale is protected; nobody else is', () => {
    expect(Object.keys(PROTECTED)).toEqual(['igl_mason_vale']);
    for (const o of long.outs) expect(o.summary.retired.some((x) => x.i === 'igl_mason_vale')).toBe(false);
  });

  it('is deterministic, and resuming from a stored state gives the same future', () => {
    const again = run(777, 10);
    expect(hash(again.outs.map((o) => o.summary))).toBe(hash(ten.outs.map((o) => o.summary)));
    expect(hash(again.states.at(-1))).toBe(hash(ten.states.at(-1)));
    // A reload at 2031: the stored state (through JSON) continues identically.
    const ref = { seed: 777, historyFrom: 1, evolveFrom: 2 };
    forgetChain(ref);
    registerState(ref, 5, JSON.parse(JSON.stringify(ten.states[4])));
    const resumed: OffseasonOutput[] = [];
    for (let s = 5; s <= 10; s++) resumed.push(processSeason(ref, s, (x) => seasonOf(ref, x)));
    expect(hash(resumed.map((o) => o.summary))).toBe(hash(ten.outs.slice(4).map((o) => o.summary)));
  }, 300_000);

  it('two saves share the history but grow different futures', () => {
    expect(hash(ten.outs[2].summary.leagues)).not.toBe(hash(long.outs[2].summary.leagues));
    expect(ten.states[0]).toBe(long.states[0]);
  });
});

const pickOf = (g: ReturnType<typeof boardFor>['games'][number], side: 'home' | 'away'): Selection => {
  const l = g.lines.find((x) => x.market === 'moneyline' && x.side === side)!;
  return { gameId: g.id, market: 'moneyline', side, point: null, american: l.american, label: side };
};

describe('the universe in a save', () => {
  it('season rollover: tickets settle first, the off-season runs once and is stored, a reload continues it', async () => {
    const { s, dbName } = await newCareer();
    const c0 = await s.career.getCareer();
    const ref = sportsWorldOf(c0) as EvolveRef;
    expect(ref).toMatchObject({ historyFrom: 1, evolveFrom: 2 });
    // A bet on a hockey semifinal (week 29), then the career moves to week 30 and on into season 2.
    const g = boardFor(ref, 1, 29, 'fhl').games[0];
    const start = await s.economy.getBalance(RYAN);
    await s.db.careers.put({ ...(await s.career.getCareer()), week: 29 });
    await s.sportsbook.place({ picks: [pickOf(g, 'home')], stake: 30, parlay: false, lounge: 'desert_palms', requestId: 'late' });
    await s.db.careers.put({ ...(await s.career.getCareer()), week: 30 });
    await s.career.advanceWeek();
    const c1 = await s.career.getCareer();
    expect([c1.season, c1.week]).toEqual([2, 1]);
    const [t] = ticketsOf(c1);
    expect(t.status).not.toBe('open');
    const game = findGame(ref, 1, g.id)!.game;
    expect(t.legs[0].final).toEqual([game.result.homeScore, game.result.awayScore]);
    expect(t.legs[0].rv).toBe(rosterVersion(ref, 1));

    const r1 = await s.sportsUniverse.processDue();
    expect(r1).toEqual({ years: [2027] });
    const c2 = await s.career.getCareer();
    expect(c2.flags.sportsYearDone).toBe(2027);
    expect(c2.inbox[0].title).toBe('Sports 2027: the year in review');
    const rows = await s.db.sportsYears.toArray();
    expect(rows.map((r) => r.id)).toEqual(['sy:2027']);
    expect(rows[0].steps.at(-1)).toBe('validated');
    expect(await s.sportsUniverse.processDue()).toEqual({ years: [] });
    expect(await s.db.sportsYears.count()).toBe(1);
    const sportsTx = (await s.economy.listTransactions(RYAN)).filter((x) => x.type === 'sports_bet' || x.type === 'sports_payout');
    expect(sportsTx.reduce((a, x) => a + x.amount, 0)).toBe(-30 + t.payout);
    void start;
    const pays = (await s.economy.listTransactions(RYAN)).filter((x) => x.type === 'sports_payout');
    expect(pays.reduce((a, x) => a + x.amount, 0)).toBe(t.payout);
    await s.economy.verifyIntegrity(RYAN);

    // Reload: the stored 2028 state is what the board uses, identical to the computed one.
    const before = seasonOf(ref, 2).world.players.map((p) => `${p.id}:${p.overall}`);
    forgetChain(ref);
    const s2 = await reload(s, dbName);
    await s2.sportsUniverse.prime();
    expect(seasonOf(ref, 2).world.players.map((p) => `${p.id}:${p.overall}`)).toEqual(before);
    expect(await s2.sportsUniverse.processDue()).toEqual({ years: [] });
    const years = await s2.sportsUniverse.years();
    expect(years.map((y) => y.year)).toEqual([2027]);
    expect(Object.keys((await s2.sportsUniverse.lines(2027))!).length).toBeGreaterThan(600);
  }, 120_000);

  it('several seasons at once, export and import keep the same universe', async () => {
    const { s } = await newCareer();
    await s.db.careers.put({ ...(await s.career.getCareer()), season: 5, week: 1 });
    expect((await s.sportsUniverse.processDue()).years).toEqual([2027, 2028, 2029, 2030]);
    const rows = (await s.db.sportsYears.toArray()).sort((a, b) => a.year - b.year);
    expect(rows.map((r) => r.state !== null)).toEqual([false, true, true, true]);
    const ref = sportsWorldOf(await s.career.getCareer()) as EvolveRef;
    const w5 = seasonOf(ref, 5).world.players.map((p) => `${p.id}:${p.teamId}:${p.overall}`);
    const file = await s.saves.exportSave();
    const { s: t } = await newCareer();
    await t.saves.importSave(file);
    forgetChain(ref);
    await t.sportsUniverse.prime();
    expect(await t.sportsUniverse.processDue()).toEqual({ years: [] });
    expect(seasonOf(ref, 5).world.players.map((p) => `${p.id}:${p.teamId}:${p.overall}`)).toEqual(w5);
    expect((await t.sportsUniverse.years()).map((y) => y.year)).toEqual([2027, 2028, 2029, 2030]);
  }, 180_000);

  it('a ticket priced on another roster version is never graded, and holds the off-season', async () => {
    const { s } = await newCareer();
    const c = await s.career.getCareer();
    const ref = sportsWorldOf(c);
    const g = boardFor(ref, 1, 2, 'ccl').games[0];
    await s.sportsbook.place({ picks: [pickOf(g, 'home')], stake: 20, parlay: false, lounge: 'desert_palms', requestId: 'rv' });
    const cur = await s.career.getCareer();
    const tickets = ticketsOf(cur).map((t): Ticket => ({ ...t, legs: t.legs.map((l) => ({ ...l, rv: 'other' })) }));
    await s.db.careers.put({ ...withBook(cur, tickets, bookTotalsOf(cur)), season: 2, week: 1 });
    expect(settleTicket(tickets[0], ref, 2, 1)).toBeNull();
    const r = await s.sportsUniverse.processDue();
    expect(r.years).toEqual([]);
    expect(r.blocked).toMatch(/1 open ticket/);
    const after = await s.career.getCareer();
    expect(ticketsOf(after)[0].status).toBe('open');
    expect((await s.economy.listTransactions(RYAN)).filter((x) => x.type === 'sports_payout')).toHaveLength(0);
  }, 120_000);
});

describe('older saves', () => {
  it('a v2 save keeps every season it has seen or bet on; migration is idempotent', () => {
    const base = newCareerState(9);
    const v2 = { ...base, flags: { seed: 9, sportsWorldV: 2, sportsHistoryFrom: 1, sportsWorldMigrated: '1.1' } };
    expect(planSportsMigration({ ...v2, season: 1, week: 12 })).toMatchObject({ historyFrom: 1, evolveFrom: 2 });
    // Already in 2028 on the fixed rosters (v0.19.7) with games played: 2028 stays fixed, 2029 evolves.
    const mid = migrateSportsWorld({ ...v2, season: 2, week: 12 });
    expect(mid.flags).toMatchObject({ sportsWorldV: 3, sportsHistoryFrom: 1, sportsEvolveFrom: 3, sportsWorldMigrated: '1.1' });
    const ref = sportsWorldOf(mid) as WorldRef;
    expect(rostersFor(ref, 2)).toBe('history');
    expect(rostersFor(ref, 3)).toBe('evolved');
    expect(migrateSportsWorld(mid)).toBe(mid);
    // Same season, nothing seen yet: it can evolve now.
    expect(planSportsMigration({ ...v2, season: 2, week: 1 })).toMatchObject({ evolveFrom: 2 });
    // An unmarked save half-way through season 3: history next season, off-seasons after that.
    expect(planSportsMigration({ ...base, flags: { seed: 9 }, season: 3, week: 9 })).toMatchObject({ historyFrom: 4, evolveFrom: 5 });
    expect(sportsSeedOf(mid)).toBe(sportsSeedOf(v2));
  });

  it('a legacy save that joins late evolves from its own base season', () => {
    const ref = { seed: 31, historyFrom: 3, evolveFrom: 4 };
    forgetChain(ref);
    const o = processSeason(ref, 3, (s) => seasonOf(ref, s));
    expect(o.summary.year).toBe(2029);
    expect(o.next.year).toBe(2030);
    validateState(o.next, UNIVERSE);
    expect(worldFromState(o.next, 31).players.every((p) => p.age === 2030 - o.next.players.find((x) => x.i === p.id)!.b)).toBe(true);
  }, 120_000);
});

describe('the shared 2027 starting point', () => {
  it('matches the v0.19.7 live rosters exactly and carries careers for everyone', () => {
    const st = UNIVERSE.start;
    validateState(st, UNIVERSE);
    expect(st.players).toHaveLength(682);
    expect(st.players.filter((p) => p.r === 1)).toHaveLength(26);
    const fixed = new Map(seasonOf({ seed: 1, historyFrom: 1 }, 1).world.players.map((p) => [p.id, p]));
    const built = worldFromState(st, 1);
    for (const p of built.players) {
      const f = fixed.get(p.id)!;
      expect([p.teamId, p.pos, p.attrs, p.age]).toEqual([f.teamId, f.pos, f.attrs, f.age]);
    }
    for (const p of st.players) {
      const c = st.careers[p.i];
      expect(c).toBeTruthy();
      for (const [k, v] of Object.entries(careersCanon[p.i]?.r ?? {})) if (k in c.tot) expect(c.tot[k]).toBeGreaterThanOrEqual(v as number);
    }
    expect(new Set(UNIVERSE.canonNames).size).toBe(UNIVERSE.canonNames.length);
    expect(UNIVERSE.hof2027.map((h) => h.i)).toHaveLength(5);
  });
});
