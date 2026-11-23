import { describe, expect, it } from 'vitest';
import { careerStats } from '../src/career/careerStats';
import * as E from '../src/career/engine';
import { newCareer, RYAN } from './helpers';
import { playTournament } from './careerHelpers';

describe('career stats', () => {
  it('are derived exactly from stored tournament records', async () => {
    const { s } = await newCareer();
    // Win one (eagle every hole), then a bogey-every-hole event.
    await playTournament(s, 'amateur-1-w2');
    await playTournament(s, 'amateur-1-w5', { score: (p) => p + 1 });
    const records = await s.career.listTournaments();
    const st = careerStats(records, RYAN, (await s.career.getCareer()).rivalId);
    expect(st.events).toBe(2);
    expect(st.wins).toBe(1);
    expect(st.rounds).toBe(4);
    expect(st.mix).toMatchObject({ holes: 36, eagles: 18, bogeys: 18, birdies: 0, pars: 0, doubles: 0 });
    // The two events are on different courses: use each record's own pars.
    const pars1 = records.find((r) => r.tournamentId === 'amateur-1-w2')!.pars;
    const pars2 = records.find((r) => r.tournamentId === 'amateur-1-w5')!.pars;
    const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
    const threes = (p: number[]) => p.filter((x) => x === 3).length;
    expect(st.mix.aces).toBe(threes(pars1) * 2); // par 3s: eagle = ace
    expect(st.lowRound?.toPar).toBe(-18);
    expect(st.avgToPar).toBeCloseTo((-18 * 2 + 9 * 2) / 4, 10);
    expect(st.scoringAvg).toBeCloseTo((2 * (sum(pars1) - 18) + 2 * (sum(pars2) + 9)) / 4, 10);
    expect(st.subParRounds).toBe(2);
    // A 1 on each par 3 of the first event, a 4 on each par 3 of the second.
    expect(st.parAverages[3]).toBeCloseTo((threes(pars1) * 2 * 1 + threes(pars2) * 2 * 4) / ((threes(pars1) + threes(pars2)) * 2), 10);
    expect(st.bySeason).toHaveLength(1);
    expect(st.bySeason[0]).toMatchObject({ season: 1, events: 2, wins: 1, earnings: 0, tours: ['amateur'] });
    expect(st.history[0].tournamentId).toBe('amateur-1-w5'); // newest first
    // Kayla doesn't play the men's Amateur Circuit, so there are no shared events yet.
    expect(st.rival?.events ?? 0).toBe(0);
  });

  it('season end records the rank and tour for the stats table', () => {
    const c = E.newCareerState(1);
    c.status = 'pro';
    c.seasonEarnings = { [`mini:${c.playerId}`]: 5000, 'mini:a': 9000, 'mini:b': 100 };
    c.week = 30;
    const next = E.advanceWeek(c, { balance: 1000, livingCost: 0, homeEnergy: 0 }).career;
    expect(next.seasonLog).toMatchObject([{ season: 1, age: 18, status: 'pro', tour: 'mini', rank: 2, fame: c.fame }]);
  });
});

describe('all-time money list', () => {
  it('starts with established pros ahead of Ryan and grows with every cheque', async () => {
    const { rankMoney, ryanRank } = await import('../src/career/moneyList');
    const c = E.newCareerState(9);
    const list = rankMoney(c);
    expect(list.length).toBeGreaterThan(100);
    expect(list[0].amount).toBeGreaterThan(5_000_000);
    expect(list[0].tour).toBe('lpga');
    expect(ryanRank(c)).toBeNull(); // no prize money yet
    expect(list.some((r) => r.id === c.rivalId)).toBe(false);
  });

  it('adds prize money for everyone who cashes and ranks Ryan', async () => {
    const { ryanRank } = await import('../src/career/moneyList');
    const { s } = await newCareer();
    const out = await playTournament(s, 'mini-1-w3', { setup: (c) => { c.status = 'pro'; } });
    const c = await s.career.getCareer();
    const prize = out.result!.standings.find((x) => x.id === RYAN)!.prize;
    expect(c.careerMoney?.[RYAN].amount).toBe(prize);
    const second = out.result!.standings[1];
    expect(c.careerMoney?.[second.id].amount).toBeGreaterThanOrEqual(second.prize);
    expect(ryanRank(c)).toBeGreaterThan(1);
  });
});
