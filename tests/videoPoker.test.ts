/** Jacks or Better video poker: hand ranks, exact hand counts, the draw, and money through the casino. */
import { describe, expect, it } from 'vitest';
import type { Card } from '../src/casino/blackjack';
import { betBlocker, drawVP, evaluateVP, settleVP, VP_LIMITS, vpPays, type VPHand } from '../src/casino/videoPoker';
import { seededInt } from '../src/casino/random';
import { pendingVideoPoker } from '../src/services/casinoService';
import { isDomainError } from '../src/core/errors';
import { newCareer, reload, RYAN, START } from './helpers';

const k = (s: string): Card[] =>
  s.split(' ').map((t) => {
    const r = t.slice(0, -1);
    const rank = r === 'A' ? 1 : r === 'K' ? 13 : r === 'Q' ? 12 : r === 'J' ? 11 : r === 'T' ? 10 : Number(r);
    return { rank, suit: 'shdc'.indexOf(t.at(-1)!) as Card['suit'] };
  });
const ev = (s: string) => evaluateVP(k(s));
const key = (c: Card) => c.rank * 4 + c.suit;

describe('hand ranks', () => {
  it('ranks every kind of hand', () => {
    expect(ev('As Ks Qs Js Ts')).toBe('royal');
    expect(ev('9h Kh Qh Jh Th')).toBe('straight_flush');
    expect(ev('Ad 2d 3d 4d 5d')).toBe('straight_flush');
    expect(ev('7s 7h 7d 7c 2s')).toBe('quads');
    expect(ev('7s 7h 7d 2c 2s')).toBe('full_house');
    expect(ev('2c 9c Jc 4c Kc')).toBe('flush');
    expect(ev('As 2h 3d 4c 5s')).toBe('straight');
    expect(ev('Ts Jh Qd Kc As')).toBe('straight');
    expect(ev('Qs Kh Ad 2c 3s')).toBe('nothing'); // no wrap-around straights
    expect(ev('8s 8h 8d Kc 2s')).toBe('trips');
    expect(ev('8s 8h 3d 3c 2s')).toBe('two_pair');
    expect(ev('Js Jh 3d 7c 2s')).toBe('jacks');
    expect(ev('As Ah 3d 7c 2s')).toBe('jacks');
    expect(ev('Ts Th 3d 7c 2s')).toBe('nothing'); // tens are not enough
  });

  it('pays the 9/6 table, with the bonus Royal only at five coins', () => {
    const per: Record<VPHand, number> = { royal: 250, straight_flush: 50, quads: 25, full_house: 9, flush: 6, straight: 4, trips: 3, two_pair: 2, jacks: 1, nothing: 0 };
    for (const [h, p] of Object.entries(per)) for (let c = 1; c < 5; c++) expect(vpPays(h as VPHand, c)).toBe(p * c);
    expect(vpPays('royal', 5)).toBe(4000);
    expect(vpPays('straight_flush', 5)).toBe(250);
  });

  it('counts every possible five-card hand exactly (2,598,960)', () => {
    const deck: Card[] = [];
    for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) deck.push({ rank: r, suit: s as Card['suit'] });
    const n: Record<string, number> = {};
    const h: Card[] = [];
    for (let a = 0; a < 52; a++) for (let b = a + 1; b < 52; b++) for (let c = b + 1; c < 52; c++) for (let d = c + 1; d < 52; d++) for (let e = d + 1; e < 52; e++) {
      h[0] = deck[a]; h[1] = deck[b]; h[2] = deck[c]; h[3] = deck[d]; h[4] = deck[e];
      const x = evaluateVP(h);
      n[x] = (n[x] ?? 0) + 1;
    }
    expect(n).toEqual({ royal: 4, straight_flush: 36, quads: 624, full_house: 3744, flush: 5108, straight: 10200, trips: 54912, two_pair: 123552, jacks: 337920, nothing: 2062860 });
  }, 120_000);
});

describe('the draw', () => {
  it('keeps held cards in place and replaces the rest with unseen cards', () => {
    const rand = seededInt(7);
    for (let i = 0; i < 300; i++) {
      const dealt = k('As Ks 7d 7c 2h');
      const held = [true, false, true, false, i % 2 === 0];
      const out = drawVP(dealt, held, rand);
      expect(new Set(out.map(key)).size).toBe(5);
      held.forEach((hd, j) => {
        if (hd) expect(out[j]).toEqual(dealt[j]);
        else expect(dealt.map(key)).not.toContain(key(out[j]));
      });
    }
  });

  it('standing pat changes nothing', () => {
    const p = { roundId: 'r', denom: 5, coins: 3, cards: k('7s 7h 7d 2c 2s'), v: 1 as const };
    const r = settleVP(p, [true, true, true, true, true], seededInt(1));
    expect(r.cards).toEqual(p.cards);
    expect(r.hand).toBe('full_house');
    expect(r.payout).toBe(9 * 3 * 5);
  });

  it('refuses bad bets', () => {
    expect(betBlocker(5, 5, 1000)).toBeNull();
    expect(betBlocker(3, 1, 1000)).toMatch(/coin value/);
    expect(betBlocker(5, 6, 1000)).toMatch(/coins/);
    expect(betBlocker(25, 5, 100)).toMatch(/bank/);
    expect(VP_LIMITS.denominations).toEqual([1, 5, 25]);
  });
});

describe('video poker through the casino', () => {
  it('bet debited once, the hand survives a reload, drawn and paid once', async () => {
    const ctx = await newCareer();
    await ctx.s.casino.visit();
    const { s, dbName } = ctx;
    const p = await s.casino.startVideoPoker(5, 5);
    expect(new Set(p.cards.map(key)).size).toBe(5);
    expect(await s.economy.getBalance(RYAN)).toBe(START - 25);
    expect(isDomainError(await s.casino.startVideoPoker(5, 5).catch((e) => e), 'CAREER_RULE')).toBe(true);
    const s2 = await reload(s, dbName);
    expect(pendingVideoPoker(await s2.career.getCareer())).toEqual(p);
    const held = [true, true, false, false, true];
    const out = await s2.casino.finishVideoPoker(p.roundId, held);
    expect(out!.staked).toBe(25);
    held.forEach((h, i) => h && expect(out!.result.cards[i]).toEqual(p.cards[i]));
    expect(out!.result.hand).toBe(evaluateVP(out!.result.cards));
    expect(out!.result.payout).toBe(vpPays(out!.result.hand, 5) * 5);
    expect(await s2.economy.getBalance(RYAN)).toBe(START - 25 + out!.result.payout);
    expect(await s2.casino.finishVideoPoker(p.roundId, held)).toBeNull(); // replay changes nothing
    expect(await s2.economy.getBalance(RYAN)).toBe(START - 25 + out!.result.payout);
    expect(pendingVideoPoker(await s2.career.getCareer())).toBeNull();
    await expect(s2.economy.verifyIntegrity(RYAN)).resolves.toBeUndefined();
    s2.db.close();
  });

  it('a run of hands keeps the bank exact', async () => {
    const { s } = await newCareer();
    await s.casino.visit();
    let bank = START;
    for (let i = 0; i < 20; i++) {
      const p = await s.casino.startVideoPoker(1, 5);
      const out = await s.casino.finishVideoPoker(p.roundId, [false, false, false, false, false]);
      bank += out!.result.payout - 5;
      expect(await s.economy.getBalance(RYAN)).toBe(bank);
    }
    await expect(s.economy.verifyIntegrity(RYAN)).resolves.toBeUndefined();
    s.db.close();
  }, 30_000);

  it('refuses a bet the bank cannot cover, leaving the money alone', async () => {
    const { s } = await newCareer();
    await s.casino.visit();
    const e = await s.casino.startVideoPoker(7, 1).catch((x) => x);
    expect(isDomainError(e, 'CAREER_RULE')).toBe(true);
    expect(await s.economy.getBalance(RYAN)).toBe(START);
    s.db.close();
  });
});
