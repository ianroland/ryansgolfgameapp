import { describe, expect, it } from 'vitest';
import { canDouble, canSplit, deal, double, handValue, hit, newTable, split, stand, totalPayout, type BJState, type Card } from '../src/casino/blackjack';
import { betBlocker, newCraps, resolveRoll } from '../src/casino/craps';
import { returnToPlayer, spin } from '../src/casino/slots';
import { seededInt } from '../src/casino/random';
import * as E from '../src/career/engine';
import { isDomainError } from '../src/core/errors';
import { newCareer, RYAN, START } from './helpers';
import { setCareer } from './careerHelpers';

const C = (rank: number, suit: Card['suit'] = 0): Card => ({ rank, suit });
/** A table whose next draws (pop order) are `cards` in order. */
function stacked(order: Card[]): BJState {
  const t = newTable(seededInt(1));
  t.shoe = [...t.shoe.slice(0, 100), ...[...order].reverse()];
  return t;
}

describe('blackjack', () => {
  it('counts hands, soft aces included', () => {
    expect(handValue([C(1), C(6)])).toEqual({ total: 17, soft: true });
    expect(handValue([C(1), C(6), C(10)])).toEqual({ total: 17, soft: false });
    expect(handValue([C(1), C(1), C(9)])).toEqual({ total: 21, soft: true });
    expect(handValue([C(13), C(12), C(2)]).total).toBe(22);
  });

  it('natural blackjack pays 3:2 immediately', () => {
    // Deal order: player, dealer, player, dealer
    const s = deal(stacked([C(1), C(9), C(13), C(7)]), 100);
    expect(s.phase).toBe('done');
    expect(s.hands[0].result).toBe('blackjack');
    expect(totalPayout(s)).toBe(250);
  });

  it('dealer blackjack beats everything but a player blackjack (push)', () => {
    expect(deal(stacked([C(10), C(1), C(9), C(13)]), 50).hands[0]).toMatchObject({ result: 'lose', payout: 0 });
    expect(deal(stacked([C(1), C(1), C(13), C(13)]), 50).hands[0]).toMatchObject({ result: 'push', payout: 50 });
  });

  it('dealer draws to 17 and stands; bust loses; win pays even money', () => {
    // P: 10,8 (18). D: 6, 10 → draws 5 → 21
    let s = deal(stacked([C(10), C(6), C(8), C(10), C(5)]), 40);
    s = stand(s);
    expect(handValue(s.dealer).total).toBe(21);
    expect(s.hands[0]).toMatchObject({ result: 'lose', payout: 0 });
    // P: 10,6 hits 10 → bust
    s = hit(deal(stacked([C(10), C(9), C(6), C(9), C(10)]), 40));
    expect(s.hands[0]).toMatchObject({ result: 'bust', payout: 0 });
    // P: 10,9 (19) vs D 10,7 (17)
    s = stand(deal(stacked([C(10), C(10), C(9), C(7)]), 40));
    expect(s.hands[0]).toMatchObject({ result: 'win', payout: 80 });
  });

  it('double takes one card at twice the bet', () => {
    let s = deal(stacked([C(5), C(10), C(6), C(7), C(10)]), 25);
    expect(canDouble(s)).toBe(true);
    s = double(s);
    expect(s.hands[0]).toMatchObject({ bet: 50, doubled: true, result: 'win', payout: 100 });
    expect(s.hands[0].cards).toHaveLength(3);
  });

  it('splits a pair into two hands; split 21 is not a blackjack', () => {
    let s = deal(stacked([C(8), C(10), C(8, 1), C(7), C(3), C(10), C(13)]), 20);
    expect(canSplit(s)).toBe(true);
    s = split(s); // hand 1: 8,3
    expect(s.hands).toHaveLength(2);
    s = hit(s); // 8,3,10 = 21 → done, hand 2 gets K → 18
    s = stand(s);
    expect(s.phase).toBe('done');
    expect(s.hands.map((h) => h.result)).toEqual(['win', 'win']);
    expect(totalPayout(s)).toBe(80);
  });
});

describe('slots', () => {
  it('returns about 93% over every combination', () => {
    const rtp = returnToPlayer();
    expect(rtp).toBeGreaterThan(0.9);
    expect(rtp).toBeLessThan(0.97);
  });
  it('pays by the table', () => {
    const r = spin(10, seededInt(42));
    expect(r.reels).toHaveLength(3);
    expect(r.payout % 10).toBe(0);
  });
});

describe('craps', () => {
  it('come-out: 7 and 11 win the pass line, 2/3/12 lose; 12 pushes don\'t pass', () => {
    const s = { point: null, bets: { pass: 10, dontPass: 10, odds: 0, field: 0 } };
    expect(resolveRoll(s, [3, 4]).outcomes).toEqual([{ bet: 'pass', result: 'win', payout: 20 }, { bet: 'dontPass', result: 'lose', payout: 0 }]);
    expect(resolveRoll(s, [6, 6]).outcomes).toEqual([{ bet: 'pass', result: 'lose', payout: 0 }, { bet: 'dontPass', result: 'push', payout: 10 }]);
  });
  it('a point, then odds at true odds; 7 out loses', () => {
    let s = resolveRoll({ point: null, bets: { pass: 10, dontPass: 0, odds: 0, field: 0 } }, [2, 2]).state;
    expect(s.point).toBe(4);
    expect(betBlocker(s, 'odds', 25)).toMatch(/2×/);
    s = { ...s, bets: { ...s.bets, odds: 20 } };
    const hitPoint = resolveRoll(s, [1, 3]);
    expect(hitPoint.outcomes).toEqual([{ bet: 'odds', result: 'win', payout: 60 }, { bet: 'pass', result: 'win', payout: 20 }]);
    expect(hitPoint.state.point).toBeNull();
    expect(resolveRoll(s, [3, 4]).outcomes.every((o) => o.result === 'lose')).toBe(true);
  });
  it('field pays 2:1 on 2, 3:1 on 12, loses on 7', () => {
    const f = (d: [number, number]) => resolveRoll({ point: null, bets: { pass: 0, dontPass: 0, odds: 0, field: 10 } }, d).outcomes[0];
    expect(f([1, 1]).payout).toBe(30);
    expect(f([6, 6]).payout).toBe(40);
    expect(f([4, 5]).payout).toBe(20);
    expect(f([3, 4]).payout).toBe(0);
  });
  it('line bets only on the come-out', () => {
    expect(betBlocker({ ...newCraps(), point: 6 }, 'pass', 10)).toMatch(/come-out/);
  });
});

describe('casino money', () => {
  it('a visit uses one activity and energy, once per week', async () => {
    const { s } = await newCareer();
    const err = await s.casino.wager('slots', 'r1', 'spin', 25).catch((e) => e);
    expect(isDomainError(err, 'CAREER_RULE')).toBe(true);
    await s.casino.visit();
    await s.casino.visit();
    const c = await s.career.getCareer();
    expect(c.actionsUsed).toBe(1);
    expect(c.energy).toBe(90 - E.CASINO_ENERGY);
  });

  it('bets debit at once, payouts credit, and nothing pays twice or beyond the round', async () => {
    const { s } = await newCareer();
    await s.casino.visit();
    await s.casino.wager('blackjack', 'bj1', 'main', 100);
    expect(await s.economy.getBalance(RYAN)).toBe(START - 100);
    await s.casino.wager('blackjack', 'bj1', 'main', 100); // same key: no double charge
    expect(await s.economy.getBalance(RYAN)).toBe(START - 100);
    const tooMuch = await s.casino.settle('blackjack', 'bj1', 'result', 1000).catch((e) => e);
    expect(isDomainError(tooMuch, 'CAREER_RULE')).toBe(true);
    await s.casino.settle('blackjack', 'bj1', 'result', 250);
    await s.casino.settle('blackjack', 'bj1', 'result', 250);
    expect(await s.economy.getBalance(RYAN)).toBe(START + 150);
    const noBet = await s.casino.settle('slots', 'ghost', 'spin', 50).catch((e) => e);
    expect(isDomainError(noBet, 'CAREER_RULE')).toBe(true);
    const c = await s.career.getCareer();
    expect(E.casinoNet(c)).toBe(150);
    await expect(s.economy.verifyIntegrity(RYAN)).resolves.toBeUndefined();
  });

  it('can never bet more than the bank', async () => {
    const { s } = await newCareer();
    await s.casino.visit();
    for (const n of [1, 2, 3, 4]) await s.casino.wager('slots', `big${n}`, 'spin', 500);
    const err = await s.casino.wager('craps', 'c', 'a', 1000).catch((e) => e);
    expect(isDomainError(err, 'INSUFFICIENT_FUNDS')).toBe(true);
    expect(await s.economy.getBalance(RYAN)).toBe(START - 2000);
  });

  it('a slots jackpot unlocks the achievement; promising Mom closes the casino for a while', async () => {
    const { s } = await newCareer();
    await s.casino.visit();
    await s.casino.wager('slots', 'jp', 'spin', 5);
    await s.casino.settle('slots', 'jp', 'spin', 2000, { jackpot: true });
    expect((await s.career.getCareer()).achievements.jackpot).toBeDefined();
    await setCareer(s, (c) => { c.flags.casinoBanUntil = c.season * 100 + c.week + 6; c.week += 1; });
    expect(E.casinoBlocker(await s.career.getCareer())).toMatch(/Mom/);
  });
});

describe('roulette', () => {
  it('a single-zero wheel: 37 pockets once each, 18 red and 18 black', async () => {
    const { WHEEL, RED, colorOf } = await import('../src/casino/roulette');
    expect([...WHEEL].sort((a, b) => a - b)).toEqual(Array.from({ length: 37 }, (_, i) => i));
    expect(RED.size).toBe(18);
    expect(WHEEL.filter((n) => colorOf(n) === 'black')).toHaveLength(18);
    expect(colorOf(0)).toBe('green');
  });

  it('pays 35 to 1 on a number, 2 to 1 on dozens and columns, even money outside; zero loses outside bets', async () => {
    const { resolveSpin } = await import('../src/casino/roulette');
    const bets = { n17: 10, black: 10, odd: 10, low: 10, dozen2: 10, col2: 10, red: 10, even: 10, high: 10, dozen1: 10, col1: 10 } as const;
    // 17: black, odd, low, 2nd dozen, middle column (17 % 3 = 2).
    const r = resolveSpin(bets, 17);
    const paid = Object.fromEntries(r.outcomes.map((o) => [o.spot, o.payout]));
    expect(paid).toMatchObject({ n17: 360, black: 20, odd: 20, low: 20, dozen2: 30, col2: 30, red: 0, even: 0, high: 0, dozen1: 0, col1: 0 });
    expect(r.payout).toBe(360 + 20 * 3 + 30 * 2);
    const z = resolveSpin({ n0: 5, red: 50, black: 50, odd: 50, even: 50, low: 50, high: 50, dozen1: 50, col3: 50 }, 0);
    expect(z.payout).toBe(180);
    expect(z.outcomes.filter((o) => o.payout > 0).map((o) => o.spot)).toEqual(['n0']);
  });

  it('columns and dozens cover the right numbers', async () => {
    const { wins } = await import('../src/casino/roulette');
    for (let n = 1; n <= 36; n++) {
      expect(['col1', 'col2', 'col3'].filter((c) => wins(c as 'col1', n))).toHaveLength(1);
      expect(['dozen1', 'dozen2', 'dozen3'].filter((d) => wins(d as 'dozen1', n))).toHaveLength(1);
    }
    expect([wins('col3', 36), wins('col1', 34), wins('col2', 35), wins('dozen3', 25), wins('dozen2', 24)]).toEqual([true, true, true, true, true]);
  });

  it('house edge is the single zero: every bet returns 36/37 on average', async () => {
    const { returnPer, wins, OUTSIDE } = await import('../src/casino/roulette');
    for (const spot of ['n0', 'n7', 'n36', ...OUTSIDE] as const) {
      let ret = 0;
      for (let n = 0; n <= 36; n++) ret += wins(spot, n) ? returnPer(spot) : 0;
      expect(ret / 37, spot).toBeCloseTo(36 / 37, 10);
    }
  });

  it('table limits, and only real spots', async () => {
    const { betBlocker, ROULETTE_LIMITS } = await import('../src/casino/roulette');
    expect(betBlocker({}, 'n7', 25)).toBeNull();
    expect(betBlocker({ n7: 500 }, 'n7', 5)).toMatch(/spot/);
    expect(betBlocker({ red: 500, black: 500, odd: 500, even: 500 }, 'low', 5)).toMatch(/Table max/);
    expect(betBlocker({}, 'n37' as 'n7', 5)).toMatch(/Not a bet/);
    expect(betBlocker({}, 'red', 0)).toMatch(/chip/);
    expect(ROULETTE_LIMITS.maxSpot * 36).toBeGreaterThan(ROULETTE_LIMITS.maxSpot);
  });

  it('the wheel is fair: each pocket comes up about 1 in 37', async () => {
    const { spinWheel } = await import('../src/casino/roulette');
    const rand = seededInt(42);
    const counts = new Array(37).fill(0);
    const N = 37 * 4000;
    for (let i = 0; i < N; i++) counts[spinWheel(rand)]++;
    for (const c of counts) expect(Math.abs(c - 4000)).toBeLessThan(400);
  });

  it('through the casino: chips debit, a straight-up win pays once, and no round can pay beyond 36x', async () => {
    const { s } = await newCareer();
    await s.casino.visit();
    await s.casino.wager('roulette', 'rl1', 'n17-1', 10);
    await s.casino.wager('roulette', 'rl1', 'black-2', 20);
    expect(await s.economy.getBalance(RYAN)).toBe(START - 30);
    const tooMuch = await s.casino.settle('roulette', 'rl1', 'spin', 30 * 36 + 1).catch((e) => e);
    expect(isDomainError(tooMuch, 'CAREER_RULE')).toBe(true);
    await s.casino.settle('roulette', 'rl1', 'spin', 400); // 17 black: 360 + 40
    await s.casino.settle('roulette', 'rl1', 'spin', 400);
    expect(await s.economy.getBalance(RYAN)).toBe(START - 30 + 400);
    const over = await s.casino.wager('roulette', 'rl2', 'n1-1', 501).catch((e) => e);
    expect(isDomainError(over, 'CAREER_RULE')).toBe(true);
    await expect(s.economy.verifyIntegrity(RYAN)).resolves.toBeUndefined();
  });
});
