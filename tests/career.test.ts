import { describe, expect, it } from 'vitest';
import * as E from '../src/career/engine';
import { TOURS } from '../src/career/config';
import { buildPools } from '../src/career/field';
import { playerRating, shotModifiers, skillPointCost } from '../src/career/stats';
import {
  completeRound, computeStandings, eligibility, finalizeTournament, findTournament, payoutShares, seasonSchedule,
  startTournament, validateResult,
} from '../src/career/tournament';
import { isDomainError } from '../src/core/errors';
import { newCareer, RYAN, START } from './helpers';
import { playTournament, setCareer, topUp } from './careerHelpers';

const fresh = () => E.newCareerState(7);
const simAll = (c: ReturnType<typeof fresh>, id: string) => {
  const def = findTournament(id)!;
  let a = startTournament(def, c, 'sim');
  while (a.round < def.rounds) a = completeRound(a, def, c);
  return finalizeTournament(a, def, c.playerId);
};

describe('weekly loop (engine)', () => {
  it('a new career: 18-year-old amateur, week 1, starter stats', () => {
    const c = fresh();
    expect(c).toMatchObject({ age: 18, status: 'amateur', tourCard: 'none', season: 1, week: 1, actionsUsed: 0 });
    expect(c.inbox[0].title).toMatch(/Welcome/);
  });

  it('training raises a stat, costs energy and uses one of three activities', () => {
    const c = fresh();
    const o = E.doAction(c, 'train_putting');
    expect(o.career.stats.putting).toBeGreaterThan(c.stats.putting);
    expect(o.career.energy).toBe(c.energy - 15);
    expect(o.career.actionsUsed).toBe(1);
    expect(c.actionsUsed).toBe(0); // pure: input untouched
    let x = o.career;
    x = E.doAction(x, 'rest').career;
    x = E.doAction(x, 'social').career;
    expect(() => E.doAction(x, 'rest')).toThrow(/No time left/);
  });

  it('work pays through a uniquely keyed money op', () => {
    const c = fresh();
    const a = E.doAction(c, 'job');
    const b = E.doAction(a.career, 'job');
    expect(a.money[0]).toMatchObject({ amount: 350, type: 'job_wage' });
    expect(a.money[0].key).not.toBe(b.money[0].key);
  });

  it('advancing the week charges rent, restores energy and resets activities', () => {
    let c = E.doAction(fresh(), 'train_power').career;
    const o = E.advanceWeek(c, { balance: 1000, livingCost: 250, homeEnergy: 0 });
    c = o.career;
    expect(c.week).toBe(2);
    expect(c.actionsUsed).toBe(0);
    expect(c.energy).toBeGreaterThan(75);
    expect(o.money).toContainEqual(expect.objectContaining({ amount: -250, type: 'living_costs', key: 'living:1:1' }));
  });

  it('can never overdraw: short on rent pays what it can and hurts form', () => {
    const o = E.advanceWeek(fresh(), { balance: 100, livingCost: 250, homeEnergy: 0 });
    expect(o.money.find((m) => m.type === 'living_costs')?.amount).toBe(-100);
    expect(o.career.form).toBeLessThan(0);
    expect(o.career.inbox[0].title).toBe('Behind on rent');
  });

  it('story events block the week until answered, and choices apply their effects', () => {
    let c = fresh();
    c.pendingStory = { storyId: 'mom_car', title: 't', body: 'b', choices: [] };
    expect(E.advanceBlocker(c)).toMatch(/event/);
    expect(E.storyChoiceBlocker(c, 0, 100)).toBe('Not enough money');
    const o = E.resolveStory(c, 0, 1000);
    c = o.career;
    expect(c.pendingStory).toBeNull();
    expect(o.money[0]).toMatchObject({ amount: -500, type: 'story' });
    expect(c.relationships.mom).toBe(82);
    expect(c.storiesSeen).toContain('mom_car');
  });

  it('skill points cost more the better the skill', () => {
    expect([30, 55, 75, 90].map(skillPointCost)).toEqual([1, 2, 3, 4]);
    const c = fresh();
    c.skillPoints = 1;
    const o = E.spendSkillPoint(c, 'nerve');
    expect(o.career.stats.nerve).toBe(31);
    expect(o.career.skillPoints).toBe(0);
    expect(() => E.spendSkillPoint(o.career, 'nerve')).toThrow(/skill point/);
  });

  it('better skills mean a better sim rating and steadier shots', () => {
    const a = fresh();
    const b = fresh();
    for (const k of Object.keys(b.stats) as (keyof typeof b.stats)[]) b.stats[k] = 80;
    expect(playerRating(b)).toBeGreaterThan(playerRating(a) + 30);
    const ma = shotModifiers(a, 0.8);
    const mb = shotModifiers(b, 0.8);
    expect(mb.aimWobbleDeg).toBeLessThan(ma.aimWobbleDeg);
    expect(mb.puttPowerWobble).toBeLessThan(ma.puttPowerWobble);
    expect(mb.meterSpeed).toBeLessThan(ma.meterSpeed);
    expect(mb.strength).toBeGreaterThan(ma.strength);
  });
});

describe('road to the LPGA (engine)', () => {
  it('amateurs play amateur events; pros play the Pro Series and Q-School', () => {
    const am = fresh();
    const s = seasonSchedule(1);
    const amEvent = s.find((d) => d.tour === 'amateur')!;
    const mini = s.find((d) => d.tour === 'mini')!;
    const q1 = s.find((d) => d.qStage === 1)!;
    expect(eligibility(amEvent, am).ok).toBe(true);
    expect(eligibility(mini, am).ok).toBe(false);
    const pro = E.turnPro(am).career;
    expect(pro.status).toBe('pro');
    expect(pro.qschool.nextStage).toBe(1);
    expect(pro.achievements.turned_pro).toBeDefined();
    expect(eligibility(amEvent, pro).ok).toBe(false);
    expect(eligibility(mini, pro).ok).toBe(true);
    expect(eligibility(q1, pro).ok).toBe(true);
    expect(eligibility(s.find((d) => d.qStage === 2)!, pro).ok).toBe(false);
    expect(eligibility(s.find((d) => d.tour === 'epson')!, pro).ok).toBe(false);
    expect(eligibility(s.find((d) => d.tour === 'lpga')!, pro).ok).toBe(false);
  });

  it('Q-Series top 20 earns an LPGA card that takes effect next season', () => {
    let c = E.turnPro(fresh()).career;
    c.qschool = { season: 1, nextStage: 3, result: null };
    const def = findTournament('qschool-1-s3')!;
    let a = startTournament(def, c, 'full');
    while (a.round < def.rounds) {
      a.playerHoles = a.playerHoles.map((_, i) => Math.max(1, [4, 3, 5, 4, 4, 3, 4, 5, 4][i] - 2));
      a = completeRound(a, def, c);
    }
    c = { ...c, active: a, entered: [def.id] };
    const r = finalizeTournament(a, def, c.playerId);
    c = E.applyTournamentResult(c, r).career;
    expect(c.qschool.result).toBe('lpga');
    expect(c.tourCard).toBe('none');
    c.week = 30;
    c = E.advanceWeek(c, { balance: 10_000, livingCost: 250, homeEnergy: 0 }).career;
    expect(c).toMatchObject({ season: 2, week: 1, age: 19, tourCard: 'lpga', entered: [] });
  });

  it('Epson Tour top 15 graduate; LPGA players outside the top 100 lose their card', () => {
    const c = fresh();
    c.status = 'pro';
    c.tourCard = 'epson';
    c.seasonEarnings = { [`epson:${c.playerId}`]: 90_000, 'epson:x': 5 };
    c.week = 30;
    const up = E.advanceWeek(c, { balance: 1000, livingCost: 0, homeEnergy: 0 }).career;
    expect(up.tourCard).toBe('lpga');

    const d = fresh();
    d.status = 'pro';
    d.tourCard = 'lpga';
    d.seasonEarnings = Object.fromEntries(Array.from({ length: 120 }, (_, i) => [`lpga:g${i}`, 100_000 + i]));
    d.seasonEarnings[`lpga:${d.playerId}`] = 10;
    d.week = 30;
    expect(E.advanceWeek(d, { balance: 1000, livingCost: 0, homeEnergy: 0 }).career.tourCard).toBe('epson');
  });

  it('a strong finish brings fame, skill points and news', () => {
    const c = fresh();
    const r = simAll({ ...c, stats: { power: 99, accuracy: 99, shortGame: 99, putting: 99, nerve: 99, fitness: 99 }, form: 10 }, 'amateur-1-w2');
    const o = E.applyTournamentResult({ ...c, entered: ['amateur-1-w2'] }, r);
    expect(o.career.fame).toBeGreaterThan(0);
    expect(o.career.skillPoints).toBeGreaterThan(c.skillPoints);
    expect(o.career.totals.events).toBe(1);
    expect(o.career.inbox[0].title).toMatch(/Amateur/);
  });
});

describe('stroke-play tournaments', () => {
  it("fields come from persistent pools and include Ryan (the rival only on the women's tours)", () => {
    const c = fresh();
    const def = findTournament('amateur-1-w2')!;
    const a = startTournament(def, c, 'sim');
    expect(a.entrants).toHaveLength(TOURS.amateur.fieldSize);
    expect(a.entrants.map((e) => e.id)).toContain(c.playerId);
    // The Amateur Circuit is a men's field: Kayla joins Ryan's fields from Q-School on.
    expect(a.entrants.map((e) => e.id)).not.toContain(c.rivalId);
    expect(buildPools(1)).toEqual(buildPools(1));
  });

  it('is deterministic and validates', () => {
    const c = fresh();
    const a = simAll(c, 'amateur-1-w5');
    const b = simAll(c, 'amateur-1-w5');
    expect(a).toEqual(b);
    expect(validateResult(a)).toEqual({ ok: true });
  });

  it('applies the cut: missed-cut players stop after round 2 and earn nothing', () => {
    const c = fresh();
    c.status = 'pro';
    c.tourCard = 'lpga';
    const r = simAll(c, 'lpga-1-w2');
    const mc = r.standings.filter((s) => !s.madeCut);
    expect(mc.length).toBeGreaterThan(0);
    expect(r.standings.filter((s) => s.madeCut).length).toBeGreaterThanOrEqual(36);
    for (const s of mc) {
      expect(s.rounds).toHaveLength(2);
      expect(s.prize).toBe(0);
      expect(s.posLabel).toBe('MC');
    }
  });

  it('pays out at most the purse, best finishers most, with ties sharing equally', () => {
    const shares = payoutShares(36);
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    for (let i = 1; i < shares.length; i++) expect(shares[i]).toBeLessThan(shares[i - 1]);
    const def = findTournament('epson-1-w2')!;
    const paid = payoutShares(def.paidPlaces);
    const entrants = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }];
    const round = (n: number) => Array(9).fill(n);
    const st = computeStandings(def, entrants, { a: [round(4), round(4), round(4)], b: [round(5), round(5), round(5)], c: [round(5), round(5), round(5)] }, round(4));
    expect(st.map((s) => s.posLabel)).toEqual(['1', 'T2', 'T2']);
    expect(st[1].prize).toBe(st[2].prize);
    expect(st[1].prize).toBe(Math.round(((paid[1] + paid[2]) * def.purse) / 2));
    expect(st.reduce((a, x) => a + x.prize, 0)).toBeLessThanOrEqual(def.purse);
  });

  it('a tie for the lead goes to a playoff: one winner, decided by countback', () => {
    const def = findTournament('epson-1-w2')!;
    const entrants = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
    const r1 = [4, 4, 4, 4, 4, 4, 4, 4, 4];
    const strongFinish = [5, 5, 4, 4, 4, 4, 4, 3, 3];
    const st = computeStandings(def, entrants, { a: [r1, r1, r1], b: [r1, r1, strongFinish] }, r1);
    expect(st[0]).toMatchObject({ id: 'b', position: 1, posLabel: '1', playoff: true });
    expect(st[1]).toMatchObject({ id: 'a', position: 2, posLabel: '2' });
    expect(st[0].prize).toBeGreaterThan(st[1].prize);
  });

  it('validation re-derives everything: tampering is caught', () => {
    const r = simAll(fresh(), 'amateur-1-w8');
    const unsealed = structuredClone(r);
    unsealed.scores[r.playerId][0][0] = 1;
    expect(validateResult(unsealed).ok).toBe(false);
    const forged = structuredClone(r);
    forged.authority.source = 'player' as 'tournament_engine';
    expect(validateResult(forged)).toMatchObject({ ok: false, reason: /engine/ });
  });
});

describe('career service (atomic with the ledger)', () => {
  it('activities and weeks move money and career together, with an intact ledger', async () => {
    const { s } = await newCareer();
    await s.career.doAction('job');
    await s.career.advanceWeek();
    const st = await s.career.loadClubhouse(RYAN);
    expect(st.career.week).toBe(2);
    expect(st.balance).toBe(START + 350 - 250);
    const types = st.transactions.map((t) => t.type);
    expect(types).toEqual(['career_start_grant', 'job_wage', 'living_costs']);
    await expect(s.economy.verifyIntegrity(RYAN)).resolves.toBeUndefined();
  });

  it('rule violations become domain errors and change nothing', async () => {
    const { s } = await newCareer();
    const err = await s.career.enterTournament('lpga-1-w2', 'sim').catch((e) => e);
    expect(isDomainError(err, 'CAREER_RULE')).toBe(true);
    expect(await s.economy.getBalance(RYAN)).toBe(START);
    expect((await s.career.getCareer()).active).toBeNull();
  });

  it('entering charges entry + travel once and starts the tournament', async () => {
    const { s } = await newCareer();
    await setCareer(s, (c) => { c.week = 2; });
    await s.career.enterTournament('amateur-1-w2', 'sim');
    expect(await s.economy.getBalance(RYAN)).toBe(START - 100);
    const err = await s.career.enterTournament('amateur-1-w2', 'sim').catch((e) => e);
    expect(isDomainError(err, 'CAREER_RULE')).toBe(true);
    expect(await s.economy.getBalance(RYAN)).toBe(START - 100);
    expect((await s.career.getCareer()).active?.tournamentId).toBe('amateur-1-w2');
  });

  it('a full tournament flows through the pipeline: prize, record, totals', async () => {
    const { s } = await newCareer();
    const out = await playTournament(s, 'mini-1-w3', { setup: (c) => { c.status = 'pro'; } });
    expect(out.outcome?.status).toBe('applied');
    const c = await s.career.getCareer();
    expect(c.active).toBeNull();
    expect(c.totals).toMatchObject({ events: 1, wins: 1 });
    const prize = out.result!.standings[0].prize;
    expect(prize).toBeGreaterThan(0);
    expect(await s.economy.getBalance(RYAN)).toBe(START - 600 + prize);
    expect(await s.db.tournaments.get('mini-1-w3')).toBeDefined();
  });

  it('buying a home levels up the clubhouse and unlocks zones', async () => {
    const { s } = await newCareer();
    const locked = await s.career.buyHome('coastal_condo').catch((e) => e);
    expect(isDomainError(locked, 'CAREER_RULE')).toBe(true);
    await setCareer(s, (c) => { c.fame = 30; });
    await topUp(s, 50_000, 'house-money');
    await s.career.buyHome('coastal_condo');
    const st = await s.career.loadClubhouse(RYAN);
    expect(st.propertyDef.id).toBe('coastal_condo');
    expect(st.propertyDef.zones.find((z) => z.id === 'sofa_spot')?.reserved).toBe(false);
    expect(st.career.achievements.new_home).toBeDefined();
    expect(st.balance).toBe(START + 50_000 - 45_000);
    await s.career.advanceWeek();
    expect(await s.economy.getBalance(RYAN)).toBe(START + 50_000 - 45_000 - 600);
  });

  it('the Grand Clubhouse is the fifth home: above the Estate, bought with earnings alone (no Pink Jacket or major)', async () => {
    const { getPropertyDefinition, HOMES } = await import('../src/catalog/properties');
    const grand = getPropertyDefinition('grand_clubhouse');
    expect(HOMES.map((h) => h.id)).toEqual(['starter_pad', 'coastal_condo', 'hillside_house', 'champions_estate', 'grand_clubhouse']);
    expect(grand.tier).toBe(5);
    expect(grand.price).toBeGreaterThan(getPropertyDefinition('champions_estate').price);
    expect(grand.zones.every((z) => !z.reserved)).toBe(true);
    // A career with no wins, no majors and no trophies: money and fame are the only gates.
    const { s } = await newCareer();
    await setCareer(s, (c) => { c.fame = grand.minFame; });
    await topUp(s, grand.price, 'grand-money');
    expect((await s.career.getCareer()).totals.wins).toBe(0);
    expect(await s.db.trophies.count()).toBe(0);
    await s.career.buyHome('grand_clubhouse');
    const st = await s.career.loadClubhouse(RYAN);
    expect(st.propertyDef.id).toBe('grand_clubhouse');
    expect(st.balance).toBe(START);
  });
});
