import { describe, expect, it } from 'vitest';
import { buildPools, FIRST_NAMES, isMensTour, RIVAL, reconcileFieldPools } from '../src/career/field';
import { newCareerState } from '../src/career/engine';
import { seasonSchedule, startTournament } from '../src/career/tournament';
import type { TourId } from '../src/career/config';

const men = new Set<string>(FIRST_NAMES.men);
const women = new Set<string>(FIRST_NAMES.women);
const first = (n: string) => n.split(' ')[0];

describe("men's fields (phases 1-2) and women's fields (Q-School on)", () => {
  it('Amateur Circuit and SoCal Pro Series pools are men; Q-School, Epson and LPGA pools are women', () => {
    const pools = buildPools(2027);
    for (const t of Object.keys(pools) as TourId[]) {
      for (const g of pools[t]) {
        if (g.id === RIVAL.id) continue;
        expect(isMensTour(t) ? men.has(first(g.name)) : women.has(first(g.name)), `${t}: ${g.name}`).toBe(true);
      }
    }
    expect(pools.qschool.length).toBeGreaterThan(0);
  });

  it('Kayla is never in a men\'s pool; she starts on the women\'s side', () => {
    const pools = buildPools(2027);
    expect(pools.amateur.some((g) => g.id === RIVAL.id)).toBe(false);
    expect(pools.mini.some((g) => g.id === RIVAL.id)).toBe(false);
    expect(Object.values(pools).flat().filter((g) => g.id === RIVAL.id)).toHaveLength(1);
  });

  it("men's events field only men; Q-School fields women and include Kayla", () => {
    const c = newCareerState(2027);
    const sched = seasonSchedule(c.season);
    for (const tour of ['amateur', 'mini', 'qschool'] as TourId[]) {
      const def = sched.find((t) => t.tour === tour)!;
      const active = startTournament(def, c, 'sim');
      const others = active.entrants.filter((e) => e.id !== c.playerId);
      const hasKayla = others.some((e) => e.id === RIVAL.id);
      if (isMensTour(tour)) {
        expect(hasKayla, tour).toBe(false);
        for (const e of others) expect(men.has(first(e.name)), `${tour}: ${e.name}`).toBe(true);
      } else {
        expect(hasKayla, tour).toBe(true);
        for (const e of others) expect(women.has(first(e.name)) || e.id === RIVAL.id, `${tour}: ${e.name}`).toBe(true);
      }
    }
  });

  it('older saves: women in the men\'s pools are renamed (ids and ratings kept), Kayla moves, Q-School pool added; then idempotent', () => {
    const pools = buildPools(2027);
    // An old save: women's names in the men's pools, Kayla on the amateur tour, no Q-School pool.
    const womenList = [...women];
    pools.amateur = pools.amateur.map((g, i) => ({ ...g, name: `${womenList[i % womenList.length]} Oldname${i}` }));
    pools.mini = pools.mini.map((g, i) => ({ ...g, name: `${womenList[i % womenList.length]} Older${i}` }));
    pools.qschool = [];
    pools.amateur.push({ id: RIVAL.id, name: RIVAL.name, rating: 44, tour: 'amateur' });
    const before = pools.amateur.filter((g) => g.id !== RIVAL.id).map((g) => [g.id, g.rating]);

    const fixed = reconcileFieldPools(pools, 7)!;
    expect(fixed).not.toBeNull();
    for (const t of ['amateur', 'mini'] as TourId[]) for (const g of fixed[t]) expect(men.has(first(g.name)), g.name).toBe(true);
    expect(fixed.amateur.map((g) => [g.id, g.rating])).toEqual(before);
    expect(fixed.amateur.some((g) => g.id === RIVAL.id)).toBe(false);
    expect(fixed.qschool.find((g) => g.id === RIVAL.id)?.rating).toBe(44);
    expect(fixed.qschool.length).toBeGreaterThan(10);
    expect(new Set(Object.values(fixed).flat().map((g) => g.name)).size).toBe(Object.values(fixed).flat().length);
    expect(reconcileFieldPools(fixed, 7)).toBeNull();
  });
});

describe('older saves are fixed on load', () => {
  it('reconcileFields renames the men\'s pools, moves Kayla and adds the Q-School pool; the save still validates', async () => {
    const { newCareer } = await import('./helpers');
    const { setCareer } = await import('./careerHelpers');
    const { s } = await newCareer();
    await setCareer(s, (c) => {
      c.pools.amateur = c.pools.amateur.map((g, i) => ({ ...g, name: `Ava Oldsave${i}` }));
      const k = Object.values(c.pools).flat().find((g) => g.id === RIVAL.id)!;
      for (const t of Object.keys(c.pools) as TourId[]) c.pools[t] = c.pools[t].filter((g) => g.id !== RIVAL.id);
      c.pools.amateur.push({ ...k, tour: 'amateur' });
      c.pools.qschool = [];
    });
    expect(await s.career.reconcileFields()).toBe(true);
    const c = await s.career.getCareer();
    for (const g of c.pools.amateur) expect(men.has(first(g.name)), g.name).toBe(true);
    expect(c.pools.amateur.some((g) => g.id === RIVAL.id)).toBe(false);
    expect(c.pools.qschool.length).toBeGreaterThan(10);
    expect(await s.career.reconcileFields()).toBe(false);
    await s.career.loadClubhouse(); // validates every row
  });
});

describe('Act I: the PGA ladder (owner, 2026-11-24)', () => {
  it("every tour Ryan can play is a men's field until phase 3; Kayla keeps her own name", async () => {
    const { TOURS } = await import('../src/career/config');
    const pools = buildPools(2027);
    const women = new Set<string>(FIRST_NAMES.women);
    for (const t of ['qschool', 'epson', 'lpga'] as const) {
      expect(isMensTour(t)).toBe(true);
      for (const g of pools[t]) if (g.id !== RIVAL.id) expect(women.has(g.name.split(' ')[0]), `${t}: ${g.name}`).toBe(false);
    }
    expect(Object.values(pools).flat().find((g) => g.id === RIVAL.id)?.name).toBe(RIVAL.name);
    expect([TOURS.qschool.name, TOURS.epson.name, TOURS.lpga.name]).toEqual(['PGA Tour Q-School', 'Korn Ferry Tour', 'PGA Tour']);
  });

  it('older saves are brought over once (idempotent)', () => {
    const once = reconcileFieldPools(buildPools(7, 'reference-v1'), 7)!;
    expect(once).not.toBeNull();
    expect(reconcileFieldPools(once, 7)).toBeNull();
  });
});
