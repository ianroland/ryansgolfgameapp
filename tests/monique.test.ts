/** Madame Monique (roulette croupier): when she speaks, what she remembers, and that it survives a reload. */
import { describe, expect, it } from 'vitest';
import { afterSpin, arrive, exprFor, farewellEvent, FRESH, LINES, pickLine, readMemory, ryanComeback, SIGNATURE, type MoniqueMemory } from '../src/casino/monique';
import { newCareer, reload } from './helpers';

const facts = { sessionKey: 's1w2', wins: 0, missedCuts: 0, act: 1, pinkJackets: 0 };
const fresh = (): MoniqueMemory => ({ ...FRESH, lineCursor: {} });
const spin = (m: MoniqueMemory, staked: number, paid: number, bankBefore = 2500) => afterSpin(m, { staked, paid, straightHit: false, bankBefore }, () => 4);

describe('Monique: greetings', () => {
  it('first visit, quick return, phase change, golf win, missed cut, repeat', () => {
    let { ev, mem } = arrive(fresh(), facts);
    expect(ev).toBe('greet_first');
    ({ ev, mem } = arrive(mem, facts));
    expect(ev).toBe('greet_quick_return'); // same casino visit
    expect(arrive(mem, { ...facts, sessionKey: 's1w3', act: 2 }).ev).toBe('greet_phase_change');
    expect(arrive(mem, { ...facts, sessionKey: 's1w3', wins: 1 }).ev).toBe('greet_golf_win');
    expect(arrive(mem, { ...facts, sessionKey: 's1w3', missedCuts: 1 }).ev).toBe('greet_missed_cut');
    expect(arrive(mem, { ...facts, sessionKey: 's1w3' }).ev).toBe('greet_repeat');
  });

  it('the Pink Jacket is acknowledged once, then she is back to normal', () => {
    const m = arrive(fresh(), facts).mem;
    const a = arrive(m, { ...facts, sessionKey: 's3w8', pinkJackets: 1, act: 3 });
    expect(a.ev).toBe('pink_jacket');
    expect(a.mem.pinkAck).toBe(true);
    expect(arrive(a.mem, { ...facts, sessionKey: 's3w9', pinkJackets: 2, act: 3 }).ev).not.toBe('pink_jacket');
    // No jacket (e.g. a Desert Rose won before phase 3): no acknowledgment.
    expect(arrive(m, { ...facts, sessionKey: 's3w8', act: 3 }).ev).not.toBe('pink_jacket');
  });
});

describe('Monique: at the wheel', () => {
  it('routine banter every 3–5 spins, not every spin', () => {
    let m = fresh();
    const said: (string | null)[] = [];
    for (let i = 0; i < 12; i++) {
      const r = afterSpin(m, { staked: 10, paid: i % 2 ? 20 : 0, straightHit: false, bankBefore: 2500 }, () => 3 + (i % 3));
      m = r.mem;
      said.push(r.ev);
    }
    const banter = said.map((e, i) => (e === 'banter' ? i : -1)).filter((i) => i >= 0);
    expect(banter.length).toBeGreaterThanOrEqual(2);
    for (let k = 1; k < banter.length; k++) expect(banter[k] - banter[k - 1]).toBeGreaterThanOrEqual(3);
    expect(said.filter((e) => e === null).length).toBeGreaterThan(6);
  });

  it('losing streaks sharpen her: neutral → raised eyebrow → faint smirk', () => {
    let m = fresh();
    const evs: string[] = [];
    for (let i = 0; i < 7; i++) {
      const r = spin(m, 10, 0);
      m = r.mem;
      if (r.ev === 'loss_streak') evs.push(`${m.lossStreak}:${exprFor('loss_streak', m.lossStreak)}`);
    }
    expect(evs).toEqual(['3:neutral', '5:raised', '7:smirk']);
    expect(pickLine(m, 'loss_streak', 3).line.text).toBe(LINES.loss_streak.monique[0].text);
    expect(pickLine(m, 'loss_streak', 7).line.text).toBe(LINES.loss_streak.monique[2].text);
  });

  it('winning streaks, extraordinary wins (surprised) and reckless wagers', () => {
    let m = fresh();
    let ev = null;
    for (let i = 0; i < 3; i++) ({ ev, mem: m } = spin(m, 10, 20));
    expect(ev).toBe('win_streak');
    expect(spin(fresh(), 10, 360).ev).toBe('extraordinary');
    expect(exprFor('extraordinary')).toBe('surprised');
    expect(spin(fresh(), 1500, 0, 5000).ev).toBe('reckless');
    expect(spin(fresh(), 600, 0, 1000).ev).toBe('reckless');
  });

  it('farewells reflect leaving ahead, behind or broke', () => {
    const up = spin(fresh(), 10, 30).mem;
    const down = spin(fresh(), 50, 0).mem;
    expect(farewellEvent(up, 2000)).toBe('farewell_ahead');
    expect(farewellEvent(down, 2000)).toBe('farewell_behind');
    expect(farewellEvent(down, 0)).toBe('farewell_broke');
  });

  it('lines rotate (no back-to-back repeats); only the signature line is approved', () => {
    let m = fresh();
    const a = pickLine(m, 'banter'); m = a.mem;
    const b = pickLine(m, 'banter');
    expect(b.line.text).not.toBe(a.line.text);
    const all = Object.values(LINES).flatMap((e) => [...e.monique, ...Object.values(e.ryan ?? {}).flat()]);
    expect(all.filter((l) => l.approved).every((l) => l.text === SIGNATURE)).toBe(true);
    expect(all.some((l) => l.text === SIGNATURE)).toBe(true);
  });

  it("Ryan's comebacks follow his phase", () => {
    expect(ryanComeback('extraordinary', 1, 1)!.text).toBe(LINES.extraordinary.ryan![1][0].text);
    expect(ryanComeback('extraordinary', 3, 1)!.text).toBe(LINES.extraordinary.ryan![3][0].text);
    expect(ryanComeback('greet_quick_return', 2, 0)).toBeNull();
  });
});

describe('Monique: memory is saved on the career and survives a reload', () => {
  it('streaks and visits persist; old saves (no memory) start fresh', async () => {
    const { s, dbName } = await newCareer();
    expect(readMemory((await s.career.getCareer()).flags)).toEqual(FRESH);
    let m = arrive(fresh(), facts).mem;
    for (let i = 0; i < 4; i++) m = spin(m, 10, 0).mem;
    await s.casino.saveMonique(m);
    const s2 = await reload(s, dbName);
    const back = readMemory((await s2.career.getCareer()).flags);
    expect(back).toMatchObject({ visits: 1, lossStreak: 4, worstLossStreak: 4, sessionNet: -40 });
    const c = await s2.career.getCareer();
    expect(c.season).toBe(1); // nothing else on the career changed
    s2.db.close();
  });
});
