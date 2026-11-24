/** Keno: the draw, the pay card's exact returns, and money through the casino. */
import { describe, expect, it } from 'vitest';
import {
  betBlocker, catchChance, drawBalls, KENO_BETS, KENO_MAX_RETURN, KENO_PAYS, kenoReturn, quickPick, settleKeno,
} from '../src/casino/keno';
import { seededInt } from '../src/casino/random';
import { kenoHistory } from '../src/services/casinoService';
import { isDomainError } from '../src/core/errors';
import { newCareer, RYAN, START } from './helpers';

describe('the draw', () => {
  it('draws twenty different balls from 1 to 80', () => {
    const rand = seededInt(11);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const d = drawBalls(rand);
      expect(d).toHaveLength(20);
      expect(new Set(d).size).toBe(20);
      d.forEach((n) => { expect(n).toBeGreaterThanOrEqual(1); expect(n).toBeLessThanOrEqual(80); seen.add(n); });
    }
    expect(seen.size).toBe(80);
  });

  it('quick pick gives different sorted numbers', () => {
    const q = quickPick(10, seededInt(3));
    expect(new Set(q).size).toBe(10);
    expect([...q].sort((a, b) => a - b)).toEqual(q);
  });

  it('settles on numbers caught', () => {
    const drawn = Array.from({ length: 20 }, (_, i) => i + 1);
    const r = settleKeno([1, 2, 3, 50], 5, drawn);
    expect(r.caught).toEqual([1, 2, 3]);
    expect(r.pays).toBe(5);
    expect(r.payout).toBe(25);
    expect(settleKeno([60], 5, drawn).payout).toBe(0);
    expect(settleKeno([61, 62, 63, 64, 65, 66, 67, 68, 69, 70], 2, drawn).payout).toBe(4); // 10-spot, catch 0 pays 2
  });
});

describe('the pay card', () => {
  it('odds for each spot count add up to 1', () => {
    for (let s = 1; s <= 10; s++) {
      let t = 0;
      for (let c = 0; c <= s; c++) t += catchChance(s, c);
      expect(t).toBeCloseTo(1, 12);
    }
  });

  it('returns between 74% and 83% for every spot count (exact)', () => {
    const rtp = Array.from({ length: 10 }, (_, i) => Math.round(kenoReturn(i + 1) * 1000) / 10);
    expect(rtp).toEqual([75, 78.2, 76.3, 79.6, 77.2, 78.6, 83, 74, 81.6, 82.7]);
  });

  it('never pays more than the cap', () => {
    const top = Math.max(...Object.values(KENO_PAYS).flatMap((t) => Object.values(t)));
    expect(top).toBe(KENO_MAX_RETURN);
  });

  it('refuses bad games', () => {
    expect(betBlocker([1, 2, 3], 5, 100)).toBeNull();
    expect(betBlocker([], 5, 100)).toMatch(/at least/);
    expect(betBlocker([1, 1], 5, 100)).toMatch(/1 to 80/);
    expect(betBlocker([81], 5, 100)).toMatch(/1 to 80/);
    expect(betBlocker(Array.from({ length: 11 }, (_, i) => i + 1), 5, 100)).toMatch(/up to 10/);
    expect(betBlocker([1], 3, 100)).toMatch(/bet/);
    expect(betBlocker([1], 25, 10)).toMatch(/bank/);
    expect(KENO_BETS).toEqual([1, 2, 5, 10, 25]);
  });
});

describe('keno through the casino', () => {
  it('each game is debited and paid once, and the board keeps the last ten draws', async () => {
    const { s } = await newCareer();
    await s.casino.visit();
    let bank = START;
    for (let i = 0; i < 12; i++) {
      const out = await s.casino.playKeno([3, 17, 22, 41, 58, 77], 5);
      expect(out.result.payout).toBe(KENO_PAYS[6][out.result.caught.length] ? KENO_PAYS[6][out.result.caught.length] * 5 : 0);
      bank += out.result.payout - 5;
      expect(await s.economy.getBalance(RYAN)).toBe(bank);
    }
    const h = kenoHistory(await s.career.getCareer());
    expect(h).toHaveLength(10);
    h.forEach((d) => expect(new Set(d).size).toBe(20));
    await expect(s.economy.verifyIntegrity(RYAN)).resolves.toBeUndefined();
    s.db.close();
  }, 30_000);

  it('refuses a bad game, leaving the money alone', async () => {
    const { s } = await newCareer();
    await s.casino.visit();
    expect(isDomainError(await s.casino.playKeno([], 5).catch((e) => e), 'CAREER_RULE')).toBe(true);
    expect(isDomainError(await s.casino.playKeno([1, 2], 7).catch((e) => e), 'CAREER_RULE')).toBe(true);
    expect(await s.economy.getBalance(RYAN)).toBe(START);
    s.db.close();
  });
});
