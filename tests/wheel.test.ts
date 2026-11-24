/** Spin to Win (money wheel): the wheel, exact returns, settlement, and money through the casino. */
import { describe, expect, it } from 'vitest';
import {
  betBlocker, SLOT_COUNT, settleWheel, slotsOf, spinSlot, WHEEL_PAYS, WHEEL_SLOTS, WHEEL_SYMBOLS, wheelReturn, type WheelSymbol,
} from '../src/casino/wheel';
import { seededInt } from '../src/casino/random';
import { wheelHistory, wheelLast } from '../src/services/casinoService';
import { isDomainError } from '../src/core/errors';
import { newCareer, reload, RYAN, START } from './helpers';

describe('the wheel', () => {
  it('54 equal slots: 24 × $1, 15 × $2, 7 × $5, 4 × $10, 2 × $20, one emblem, one star', () => {
    expect(SLOT_COUNT).toBe(54);
    expect(WHEEL_SYMBOLS.map(slotsOf)).toEqual([24, 15, 7, 4, 2, 1, 1]);
  });

  it('no two of the rarer symbols sit side by side; the emblem and the star are opposite', () => {
    for (let i = 0; i < SLOT_COUNT; i++) {
      const a = WHEEL_SLOTS[i];
      const b = WHEEL_SLOTS[(i + 1) % SLOT_COUNT];
      if (a !== '1') expect(a === b, `slots ${i} and ${i + 1}`).toBe(false);
    }
    expect(WHEEL_SLOTS.indexOf('emblem') - WHEEL_SLOTS.indexOf('star')).toBe(27);
  });

  it('exact returns: $1 88.9%, $2 83.3%, $5 77.8%, $10 81.5%, $20 77.8%, emblem and star 75.9%', () => {
    const r = (s: WheelSymbol) => Math.round(wheelReturn(s) * 1000) / 10;
    expect(WHEEL_SYMBOLS.map(r)).toEqual([88.9, 83.3, 77.8, 81.5, 77.8, 75.9, 75.9]);
    expect(WHEEL_PAYS).toEqual({ '1': 1, '2': 2, '5': 5, '10': 10, '20': 20, emblem: 40, star: 40 });
  });

  it('every slot is drawn, evenly (no bias from the draw)', () => {
    const rand = seededInt(99);
    const n = new Array(SLOT_COUNT).fill(0);
    for (let i = 0; i < 54_000; i++) n[spinSlot(rand)]++;
    expect(Math.min(...n)).toBeGreaterThan(850);
    expect(Math.max(...n)).toBeLessThan(1150);
  });

  it('settles every outcome: the symbol at the pointer pays, everything else loses', () => {
    const bets = { '1': 10, '5': 5, star: 1 };
    for (let slot = 0; slot < SLOT_COUNT; slot++) {
      const r = settleWheel(bets, slot);
      expect(r.symbol).toBe(WHEEL_SLOTS[slot]);
      expect(r.staked).toBe(16);
      const on = (bets as Record<string, number>)[r.symbol] ?? 0;
      expect(r.payout).toBe(on * (WHEEL_PAYS[r.symbol] + 1));
    }
    expect(settleWheel({ star: 1 }, 0).payout).toBe(41);
  });

  it('refuses empty, odd and oversized bets', () => {
    expect(betBlocker({}, 100)).toMatch(/chip/);
    expect(betBlocker({ '1': 501 }, 10_000)).toMatch(/500/);
    expect(betBlocker({ '1': 50 }, 20)).toMatch(/bank/);
    expect(betBlocker({ ['7' as WheelSymbol]: 5 }, 100)).toMatch(/Invalid/);
    expect(betBlocker({ '1': 5, emblem: 1 }, 100)).toBeNull();
  });
});

describe('Spin to Win through the casino', () => {
  it('debits and pays once per spin, keeps the result and history across a reload, and balances', async () => {
    const { s, dbName } = await newCareer();
    await s.casino.visit();
    let bank = START;
    for (let i = 0; i < 25; i++) {
      const r = await s.casino.spinWheel({ '1': 5, '2': 2, star: 1 });
      bank += r.payout - 8;
      expect(await s.economy.getBalance(RYAN)).toBe(bank);
    }
    const before = wheelLast(await s.career.getCareer());
    const s2 = await reload(s, dbName);
    const c = await s2.career.getCareer();
    expect(wheelLast(c)).toEqual(before);
    expect(wheelHistory(c)).toHaveLength(20);
    expect(wheelHistory(c)[0]).toEqual({ slot: before!.slot, symbol: before!.symbol });
    await expect(s2.economy.verifyIntegrity(RYAN)).resolves.toBeUndefined();
    s2.db.close();
  }, 30_000);

  it('refuses a bad spin, leaving the money alone', async () => {
    const { s } = await newCareer();
    await s.casino.visit();
    expect(isDomainError(await s.casino.spinWheel({}).catch((e) => e), 'CAREER_RULE')).toBe(true);
    expect(isDomainError(await s.casino.spinWheel({ '1': 501 }).catch((e) => e), 'CAREER_RULE')).toBe(true);
    expect(await s.economy.getBalance(RYAN)).toBe(START);
    s.db.close();
  });
});

describe('pointer alignment', () => {
  it('the wheel always stops with the committed slot under the pointer', async () => {
    const { rotationFor, slotAtPointer } = await import('../src/ui/casino/wheelGeometry');
    let rot = 0;
    for (let slot = 0; slot < SLOT_COUNT; slot++) {
      for (const jitter of [-1, -0.5, 0, 0.5, 1]) {
        for (const turns of [0, 5]) {
          const next = rotationFor(slot, rot, turns, jitter);
          expect(slotAtPointer(next), `slot ${slot} jitter ${jitter}`).toBe(slot);
          expect(next).toBeGreaterThanOrEqual(rot + turns * 360);
          expect(next).toBeLessThan(rot + turns * 360 + 360);
        }
      }
      rot = rotationFor(slot, rot, 5, 0.3); // spins carry on from where the last one stopped
    }
  });
});
