/** Pro Shop: snacks (energy now, a few per week, never alcohol) and the new clubs and accessories. */
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { buySnack } from '../src/career/engine';
import { GEAR, LIFESTYLE, SNACKS, SNACKS_PER_WEEK } from '../src/career/shop';
import { energyRegen, trainingBoost } from '../src/career/stats';
import { newCareer, RYAN } from './helpers';

describe('Pro Shop catalog', () => {
  it('ids are unique, every slot has an upgrade path, accessories stack', () => {
    const ids = [...GEAR, ...LIFESTYLE, ...SNACKS].map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const slot of ['driver', 'irons', 'wedges', 'putter']) expect(GEAR.filter((g) => g.slot === slot).length).toBeGreaterThanOrEqual(4);
    expect(SNACKS.map((x) => x.id)).toContain('bobo_milky');
    for (const x of SNACKS) expect(x.name + x.description).not.toMatch(/beer|wine|vodka|tito|whiskey|cocktail/i);
  });
});

describe('snacks', () => {
  it('add energy (capped), cost money once each, and stop at the weekly limit', async () => {
    const { s } = await newCareer();
    const c0 = await s.career.getCareer();
    await s.db.careers.put({ ...c0, energy: 50 });
    const before = await s.economy.getBalance(RYAN);
    await s.career.buySnack('bobo_milky');
    expect((await s.career.getCareer()).energy).toBe(60);
    expect(await s.economy.getBalance(RYAN)).toBe(before - 15);
    for (let k = 1; k < SNACKS_PER_WEEK; k++) await s.career.buySnack('banana');
    await expect(s.career.buySnack('banana')).rejects.toThrow();
    const c = await s.career.getCareer();
    expect(() => buySnack({ ...c, energy: 100, flags: {} }, 'banana', 1000)).toThrow();
    expect(buySnack({ ...c, energy: 95, flags: {} }, 'bobo_six', 1000).career.energy).toBe(100);
  });
  it('accessories feed the existing bonuses', async () => {
    const { s } = await newCareer();
    const c = await s.career.getCareer();
    const with_ = { ...c, owned: [...c.owned, 'acc_sticks', 'acc_launch', 'acc_massage'] };
    expect(trainingBoost(with_) - trainingBoost(c)).toBeCloseTo(0.2);
    expect(energyRegen(with_, 0) - energyRegen(c, 0)).toBe(3);
  });
});
