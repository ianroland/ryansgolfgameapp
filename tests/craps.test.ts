/** Craps step 1: rules for every bet, exact house edges computed through the engine, and the table through the casino. */
import { describe, expect, it } from 'vitest';
import {
  addBet, betBlocker, costOf, HORN, maxLay, newTable, PROPS, type HardNo, type PropKey, onTable, readTable, resolveRoll, takeDown, type BetOutcome, type CrapsAction, type CrapsTable, type PointNo,
} from '../src/casino/craps';
import { crapsLast, crapsTable } from '../src/services/casinoService';
import { isDomainError } from '../src/core/errors';
import { newCareer, reload, RYAN, START } from './helpers';

const T = (o: Partial<CrapsTable> = {}): CrapsTable => ({ ...newTable(), ...o });
const roll = (t: CrapsTable, a: number, b: number) => resolveRoll(t, [a, b]);
const pay = (os: BetOutcome[], bet: string) => os.filter((o) => o.bet === bet).reduce((s, o) => s + o.payout, 0);

/** A Place or hardway win leaves the bet up: that stake is still the player's, so it counts as returned. */
const standing = (t: CrapsTable, o: BetOutcome) => {
  if (o.result !== 'win' || o.stake !== 0) return 0;
  if (o.bet.startsWith('place ')) return t.place[Number(o.bet.slice(6)) as PointNo] ?? 0;
  if (o.bet.startsWith('hard ')) return t.hard[Number(o.bet.slice(5)) as HardNo] ?? 0;
  return 0;
};

/**
 * Exact expected return of a table: follows every dice sequence through the engine until `done`
 * says the bet under test is decided, adding up everything paid on the way. Returns E[paid].
 */
function expectedPaid(start: CrapsTable, done: (os: BetOutcome[]) => boolean): number {
  let dist = new Map<string, number>([[JSON.stringify(start), 1]]);
  let paid = 0;
  for (let step = 0; step < 2000 && dist.size; step++) {
    const next = new Map<string, number>();
    for (const [k, p] of dist) {
      if (p < 1e-16) continue;
      const t = JSON.parse(k) as CrapsTable;
      for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) {
        const r = resolveRoll(t, [a, b]);
        const q = p / 36;
        // A Place win leaves the bet up: that stake is still the player's, so it counts as returned.
        paid += q * r.outcomes.reduce((s, o) => s + o.payout + standing(t, o), 0);
        if (!done(r.outcomes)) {
          const key = JSON.stringify(r.table);
          next.set(key, (next.get(key) ?? 0) + q);
        }
      }
    }
    dist = next;
  }
  return paid;
}
const decided = (name: string) => (os: BetOutcome[]) => os.some((o) => o.bet.startsWith(name) && o.result !== 'move');
const edge = (start: CrapsTable, stake: number, name: string) => 1 - expectedPaid(start, decided(name)) / stake;

describe('the line', () => {
  it('come-out: 7 and 11 win Pass, 2 and 3 win Don’t Pass, 12 pushes it', () => {
    const t = T({ pass: 10, dontPass: 10 });
    expect(roll(t, 3, 4).outcomes).toEqual([{ bet: 'pass', result: 'win', stake: 10, payout: 20 }, { bet: "don't pass", result: 'lose', stake: 10, payout: 0 }]);
    expect(roll(t, 1, 2).outcomes).toEqual([{ bet: 'pass', result: 'lose', stake: 10, payout: 0 }, { bet: "don't pass", result: 'win', stake: 10, payout: 20 }]);
    expect(roll(t, 6, 6).outcomes).toEqual([{ bet: 'pass', result: 'lose', stake: 10, payout: 0 }, { bet: "don't pass", result: 'push', stake: 10, payout: 10 }]);
    expect(roll(t, 2, 2).table.point).toBe(4);
  });

  it('Pass odds pay true odds, lay odds pay the inverse', () => {
    expect(pay(roll(T({ point: 4, pass: 10, passOdds: 20 }), 1, 3).outcomes, 'pass')).toBe(20 + 20 + 40);
    expect(pay(roll(T({ point: 5, pass: 10, passOdds: 20 }), 2, 3).outcomes, 'pass')).toBe(20 + 20 + 30);
    expect(pay(roll(T({ point: 6, pass: 10, passOdds: 20 }), 3, 3).outcomes, 'pass')).toBe(20 + 20 + 24);
    expect(pay(roll(T({ point: 4, dontPass: 10, dontOdds: 40 }), 3, 4).outcomes, "don't pass")).toBe(20 + 40 + 20);
    expect(pay(roll(T({ point: 9, dontPass: 10, dontOdds: 30 }), 3, 4).outcomes, "don't pass")).toBe(20 + 30 + 20);
    expect(pay(roll(T({ point: 8, dontPass: 10, dontOdds: 24 }), 3, 4).outcomes, "don't pass")).toBe(20 + 24 + 20);
  });

  it('odds limits: 2x behind Pass; lay up to what wins 2x', () => {
    const t = T({ point: 6, pass: 10, dontPass: 10 });
    expect(betBlocker(t, { kind: 'passOdds' }, 20)).toBeNull();
    expect(betBlocker(t, { kind: 'passOdds' }, 25)).toMatch(/2×/);
    expect([4, 5, 6].map((n) => maxLay(10, n as PointNo))).toEqual([40, 30, 24]);
    expect(betBlocker(t, { kind: 'dontOdds' }, 24)).toBeNull();
    expect(betBlocker(t, { kind: 'dontOdds' }, 25)).toMatch(/Lay odds max/);
    expect(betBlocker(T(), { kind: 'passOdds' }, 10)).toMatch(/point/);
    expect(betBlocker(T({ point: 6 }), { kind: 'pass' }, 10)).toMatch(/come-out/);
  });
});

describe('Come and Don’t Come', () => {
  it('only once a point is on', () => {
    expect(betBlocker(T(), { kind: 'come' }, 10)).toMatch(/point is on/);
    expect(betBlocker(T({ point: 5 }), { kind: 'come' }, 10)).toBeNull();
  });

  it('a Come bet travels to its number, then wins on that number and loses on 7', () => {
    let t = T({ point: 5, come: 10 });
    const r = roll(t, 3, 3);
    expect(r.outcomes).toContainEqual({ bet: 'come to 6', result: 'move', stake: 0, payout: 0 });
    t = r.table;
    expect(t.comePoints[6]).toEqual({ bet: 10, odds: 0 });
    t = addBet(t, { kind: 'comeOdds', n: 6 }, 20);
    expect(pay(roll(t, 4, 2).outcomes, 'come 6')).toBe(20 + 20 + 24);
    expect(roll(t, 3, 4).outcomes).toContainEqual({ bet: 'come 6', result: 'lose', stake: 30, payout: 0 });
  });

  it('a new Come bet wins on 7 and 11 and loses on craps, even while an older one is decided', () => {
    const t = T({ point: 5, come: 10, comePoints: { 6: { bet: 10, odds: 0 } } });
    const seven = roll(t, 3, 4).outcomes;
    expect(seven).toContainEqual({ bet: 'come', result: 'win', stake: 10, payout: 20 });
    expect(seven).toContainEqual({ bet: 'come 6', result: 'lose', stake: 10, payout: 0 });
    expect(roll(t, 1, 1).outcomes).toContainEqual({ bet: 'come', result: 'lose', stake: 10, payout: 0 });
  });

  it('Come odds are off on the come-out: returned, not paid', () => {
    const t = T({ point: null, comePoints: { 8: { bet: 10, odds: 20 } } });
    expect(roll(t, 4, 4).outcomes).toEqual([{ bet: 'come 8', result: 'win', stake: 30, payout: 20 + 20 }]);
    expect(roll(t, 3, 4).outcomes).toEqual([{ bet: 'come 8', result: 'lose', stake: 30, payout: 20 }]);
  });

  it('Don’t Come: 2 and 3 win, 12 pushes, 7 and 11 lose; on its number, the 7 wins with lay odds', () => {
    const t = T({ point: 9, dontCome: 10 });
    expect(roll(t, 1, 2).outcomes).toContainEqual({ bet: "don't come", result: 'win', stake: 10, payout: 20 });
    expect(roll(t, 6, 6).outcomes).toContainEqual({ bet: "don't come", result: 'push', stake: 10, payout: 10 });
    expect(roll(t, 5, 6).outcomes).toContainEqual({ bet: "don't come", result: 'lose', stake: 10, payout: 0 });
    const on4 = roll(t, 2, 2).table;
    expect(on4.dontComePoints[4]).toEqual({ bet: 10, odds: 0 });
    const laid = addBet(on4, { kind: 'dontComeOdds', n: 4 }, 40);
    expect(pay(roll(laid, 3, 4).outcomes, "don't come 4")).toBe(20 + 40 + 20);
    expect(roll(laid, 1, 3).outcomes).toContainEqual({ bet: "don't come 4", result: 'lose', stake: 50, payout: 0 });
  });
});

describe('Place bets and the Field', () => {
  it('Place pays 9:5, 7:5, 7:6, stays up after a win, loses on 7', () => {
    const t = T({ point: 5, place: { 4: 5, 5: 5, 6: 6 } });
    expect(pay(roll(t, 1, 3).outcomes, 'place 4')).toBe(9);
    expect(pay(roll(t, 2, 3).outcomes, 'place 5')).toBe(7);
    expect(pay(roll(t, 3, 3).outcomes, 'place 6')).toBe(7);
    expect(roll(t, 3, 3).table.place[6]).toBe(6);
    expect(roll(t, 3, 4).table.place).toEqual({});
  });

  it('Place bets are off on the come-out unless turned on', () => {
    const off = T({ place: { 6: 6 } });
    expect(roll(off, 3, 3).outcomes).toEqual([]);
    expect(roll(off, 3, 4).table.place[6]).toBe(6);
    const on = { ...off, placeOn: true };
    expect(pay(roll(on, 3, 3).outcomes, 'place 6')).toBe(7);
    expect(roll(on, 3, 4).table.place).toEqual({});
  });

  it('Field: 2 pays 2:1, 12 pays 3:1, 3-4-9-10-11 even, else loses', () => {
    const f = (a: number, b: number) => pay(roll(T({ field: 10 }), a, b).outcomes, 'field');
    expect([f(1, 1), f(6, 6), f(4, 5), f(3, 4), f(2, 3)]).toEqual([30, 40, 20, 0, 0]);
  });

  it('take-downs: Place bets and odds come down, flat bets stay', () => {
    const t = T({ point: 6, pass: 10, passOdds: 20, place: { 8: 12 } });
    expect(takeDown(t, { kind: 'place', n: 8 })).toEqual({ table: { ...t, place: {} }, returned: 12 });
    expect(takeDown(t, { kind: 'passOdds' }).returned).toBe(20);
    expect(takeDown(t, { kind: 'pass' }).returned).toBe(0);
  });
});

describe('exact house edges (computed through the engine)', () => {
  const close = (got: number, want: number) => expect(got).toBeCloseTo(want, 10);

  it('Pass 1.414%, Don’t Pass 1.364%, Come = Pass, Don’t Come = Don’t Pass', () => {
    close(edge(T({ pass: 10 }), 10, 'pass'), 7 / 495);
    close(edge(T({ dontPass: 10 }), 10, "don't pass"), 3 / 220);
    close(edge(T({ point: 6, come: 10 }), 10, 'come'), 7 / 495);
    close(edge(T({ point: 6, dontCome: 10 }), 10, "don't come"), 3 / 220);
  }, 60_000);

  it('Place 6/8 1.515%, 5/9 4%, 4/10 6.667% (per decision); Field 2.778%', () => {
    for (const [n, bet, want] of [[6, 6, 1 / 66], [8, 6, 1 / 66], [5, 5, 1 / 25], [9, 5, 1 / 25], [4, 5, 1 / 15], [10, 5, 1 / 15]] as const) {
      close(edge(T({ point: n === 6 ? 8 : 6, place: { [n]: bet } }), bet, `place ${n}`), want);
    }
    close(edge(T({ field: 10 }), 10, 'field'), 1 / 36);
  }, 60_000);

  it('odds and lay odds are a fair bet (0% edge)', () => {
    for (const [n, odds, lay] of [[4, 20, 40], [5, 20, 30], [6, 20, 24]] as const) {
      const p = n as PointNo;
      close(expectedPaid(T({ point: p, pass: 10, passOdds: odds }), decided('pass')) - expectedPaid(T({ point: p, pass: 10 }), decided('pass')), odds);
      close(expectedPaid(T({ point: p, dontPass: 10, dontOdds: lay }), decided("don't pass")) - expectedPaid(T({ point: p, dontPass: 10 }), decided("don't pass")), lay);
    }
  }, 60_000);
});

describe('craps through the casino', () => {
  it('bets ride across rolls and a reload; each roll pays once; the ledger balances', async () => {
    const { s, dbName } = await newCareer();
    await s.casino.visit();
    await s.casino.crapsBet({ kind: 'pass' }, 10);
    await s.casino.crapsBet({ kind: 'field' }, 5);
    expect(await s.economy.getBalance(RYAN)).toBe(START - 15);
    let bank = START - 15;
    let s2 = await reload(s, dbName);
    expect(crapsTable(await s2.career.getCareer())).toMatchObject({ pass: 10, field: 5 });
    for (let i = 0; i < 40; i++) {
      const before = crapsTable(await s2.career.getCareer());
      if (onTable(before) === 0) {
        // An empty table can still have a point on (the last bets were decided by come points): then it's a Come bet.
        await s2.casino.crapsBet({ kind: before.point === null ? 'pass' : 'come' }, 10);
        bank -= 10;
      } else if (before.point !== null && before.come === 0 && Object.keys(before.comePoints).length < 2) {
        await s2.casino.crapsBet({ kind: 'come' }, 5);
        bank -= 5;
      }
      const r = await s2.casino.crapsRoll();
      bank += r.paid;
      expect(await s2.economy.getBalance(RYAN)).toBe(bank);
      expect(crapsLast(await s2.career.getCareer())?.dice).toEqual(r.dice);
      if (i === 20) s2 = await reload(s2, dbName);
    }
    expect(bank + onTable(crapsTable(await s2.career.getCareer()))).toBeLessThanOrEqual(START + 10_000);
    await expect(s2.economy.verifyIntegrity(RYAN)).resolves.toBeUndefined();
    s2.db.close();
  }, 60_000);

  it('refuses bets the rules or the bank don’t allow, and rolling an empty table', async () => {
    const { s } = await newCareer();
    await s.casino.visit();
    const bad: [CrapsAction, number][] = [[{ kind: 'come' }, 10], [{ kind: 'passOdds' }, 10], [{ kind: 'pass' }, 3], [{ kind: 'pass' }, 1001]];
    for (const [a, amt] of bad) expect(isDomainError(await s.casino.crapsBet(a, amt).catch((e) => e), 'CAREER_RULE'), a.kind).toBe(true);
    expect(isDomainError(await s.casino.crapsRoll().catch((e) => e), 'CAREER_RULE')).toBe(true);
    expect(await s.economy.getBalance(RYAN)).toBe(START);
    s.db.close();
  });

  it('take-downs return chips; placing on the come-out stays off until turned on', async () => {
    const { s } = await newCareer();
    await s.casino.visit();
    await s.casino.crapsBet({ kind: 'place', n: 6 }, 12);
    expect(await s.economy.getBalance(RYAN)).toBe(START - 12);
    expect((await s.casino.crapsPlaceOn(true)).placeOn).toBe(true);
    await s.casino.crapsTakeDown({ kind: 'place', n: 6 });
    expect(await s.economy.getBalance(RYAN)).toBe(START);
    expect(onTable(crapsTable(await s.career.getCareer()))).toBe(0);
    s.db.close();
  });

  it('an old save (no table, or the old format) opens on an empty table', () => {
    expect(readTable(undefined)).toEqual(newTable());
    expect(readTable('{"point":null,"bets":{"pass":10}}')).toEqual(newTable());
  });
});

describe('hardways and one-roll bets', () => {
  it('a hardway wins only as a pair, stays up, and loses on the easy way or a 7', () => {
    const t = T({ point: 5, hard: { 6: 10, 8: 10 } });
    const hard6 = roll(t, 3, 3);
    expect(hard6.outcomes).toContainEqual({ bet: 'hard 6', result: 'win', stake: 0, payout: 90 });
    expect(hard6.table.hard[6]).toBe(10);
    expect(roll(t, 2, 4).outcomes).toContainEqual({ bet: 'hard 6', result: 'lose', stake: 10, payout: 0 });
    const seven = roll(t, 3, 4);
    expect(seven.outcomes.filter((o) => o.bet.startsWith('hard')).map((o) => o.result)).toEqual(['lose', 'lose']);
    expect(roll(T({ point: 5, hard: { 4: 10 } }), 2, 2).outcomes).toContainEqual({ bet: 'hard 4', result: 'win', stake: 0, payout: 70 });
  });

  it('hardways are off on the come-out unless turned on', () => {
    expect(roll(T({ hard: { 8: 10 } }), 4, 4).outcomes).toEqual([]);
    expect(roll(T({ hard: { 8: 10 }, placeOn: true }), 4, 4).outcomes).toContainEqual({ bet: 'hard 8', result: 'win', stake: 0, payout: 90 });
  });

  it('one-roll bets pay on the next roll only, then come down', () => {
    const t = T({ props: { any7: 5, anyCraps: 5, two: 1, three: 1, yo: 1, twelve: 1 } });
    const p = (a: number, b: number) => Object.fromEntries(roll(t, a, b).outcomes.filter((o) => o.bet.startsWith('prop')).map((o) => [o.bet.slice(5), o.payout]));
    expect(p(3, 4)).toEqual({ any7: 25, anyCraps: 0, two: 0, three: 0, yo: 0, twelve: 0 });
    expect(p(1, 1)).toEqual({ any7: 0, anyCraps: 40, two: 31, three: 0, yo: 0, twelve: 0 });
    expect(p(1, 2)).toEqual({ any7: 0, anyCraps: 40, two: 0, three: 16, yo: 0, twelve: 0 });
    expect(p(5, 6)).toEqual({ any7: 0, anyCraps: 0, two: 0, three: 0, yo: 16, twelve: 0 });
    expect(p(6, 6)).toEqual({ any7: 0, anyCraps: 40, two: 0, three: 0, yo: 0, twelve: 31 });
    expect(roll(t, 2, 4).table.props).toEqual({});
  });

  it('Horn puts the chip on each of 2, 3, 11 and 12 (four chips)', () => {
    const t = addBet(T(), { kind: 'horn' }, 5);
    expect(t.props).toEqual({ two: 5, three: 5, yo: 5, twelve: 5 });
    expect(costOf({ kind: 'horn' }, 5)).toBe(20);
    expect(HORN).toHaveLength(4);
    expect(takeDown(t, { kind: 'horn' }).returned).toBe(20);
  });

  it('limits: $100 most on each', () => {
    expect(betBlocker(T({ hard: { 6: 100 } }), { kind: 'hard', n: 6 }, 5)).toMatch(/100/);
    expect(betBlocker(T(), { kind: 'prop', p: 'yo' }, 100)).toBeNull();
    expect(betBlocker(T({ props: { twelve: 100 } }), { kind: 'horn' }, 5)).toMatch(/100/);
  });

  it('exact house edges: hard 6/8 9.09%, hard 4/10 11.11%; Any 7 16.67%, Any Craps 11.11%, 2 and 12 13.89%, 3 and 11 11.11%', () => {
    const close = (got: number, want: number) => expect(got).toBeCloseTo(want, 10);
    for (const [n, want] of [[6, 1 / 11], [8, 1 / 11], [4, 1 / 9], [10, 1 / 9]] as const) close(edge(T({ point: n === 6 ? 8 : 6, hard: { [n]: 10 } }), 10, `hard ${n}`), want);
    const want: Record<PropKey, number> = { any7: 1 / 6, anyCraps: 1 / 9, two: 5 / 36, three: 1 / 9, yo: 1 / 9, twelve: 5 / 36 };
    for (const pr of PROPS) close(edge(T({ props: { [pr.key]: 10 } }), 10, `prop ${pr.key}`), want[pr.key]);
  }, 60_000);

  it('through the casino: Horn charges four chips once, and the roll pays once', async () => {
    const { s } = await newCareer();
    await s.casino.visit();
    await s.casino.crapsBet({ kind: 'horn' }, 5);
    await s.casino.crapsBet({ kind: 'hard', n: 8 }, 10);
    expect(await s.economy.getBalance(RYAN)).toBe(START - 30);
    const r = await s.casino.crapsRoll();
    expect(await s.economy.getBalance(RYAN)).toBe(START - 30 + r.paid);
    expect(crapsTable(await s.career.getCareer()).props).toEqual({});
    await expect(s.economy.verifyIntegrity(RYAN)).resolves.toBeUndefined();
    s.db.close();
  });
});
