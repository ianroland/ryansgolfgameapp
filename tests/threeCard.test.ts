/**
 * Three Card Poker: hand ranks (straight over flush, A-2-3 and Q-K-A), dealer
 * qualification, Ante/Play, Ante Bonus, Pair Plus (independent of folding), the
 * exact long-run return, and money through the casino including a reload mid-hand.
 */
import { describe, expect, it } from 'vitest';
import type { Card } from '../src/casino/blackjack';
import {
  ANTE_BONUS, betBlocker, compare3, dealerQualifies, evaluate3, newDeck, PAIR_PLUS, Rank3, settle3,
} from '../src/casino/threeCard';
import { seededInt } from '../src/casino/random';
import { pendingThreeCard } from '../src/services/casinoService';
import { isDomainError } from '../src/core/errors';
import { newCareer, reload, RYAN, START } from './helpers';

const k = (s: string): Card[] =>
  s.split(' ').map((t) => {
    const r = t.slice(0, -1);
    const rank = r === 'A' ? 1 : r === 'K' ? 13 : r === 'Q' ? 12 : r === 'J' ? 11 : r === 'T' ? 10 : Number(r);
    return { rank, suit: 'shdc'.indexOf(t.slice(-1)) as Card['suit'] };
  });
const ev = (s: string) => evaluate3(k(s));

describe('hand ranks', () => {
  it('categories', () => {
    expect(ev('5h 6h 7h').rank).toBe(Rank3.StraightFlush);
    expect(ev('9s 9h 9d').rank).toBe(Rank3.Trips);
    expect(ev('5h 6s 7h').rank).toBe(Rank3.Straight);
    expect(ev('2h 9h Kh').rank).toBe(Rank3.Flush);
    expect(ev('Js Jh 4d').rank).toBe(Rank3.Pair);
    expect(ev('As 9h 4d').rank).toBe(Rank3.High);
  });
  it('a straight beats a flush, trips beat a straight', () => {
    expect(compare3(ev('5h 6s 7h'), ev('2h 9h Kh'))).toBeGreaterThan(0);
    expect(compare3(ev('2s 2h 2d'), ev('Qs Kh Ad'))).toBeGreaterThan(0);
  });
  it('A-2-3 is the lowest straight, Q-K-A the highest; K-A-2 is not a straight', () => {
    expect(ev('As 2h 3d').rank).toBe(Rank3.Straight);
    expect(ev('Qs Kh Ad').rank).toBe(Rank3.Straight);
    expect(compare3(ev('As 2h 3d'), ev('2s 3h 4d'))).toBeLessThan(0);
    expect(compare3(ev('Qs Kh Ad'), ev('Js Qh Kd'))).toBeGreaterThan(0);
    expect(ev('Ks Ah 2d').rank).toBe(Rank3.High);
    expect(ev('Ah 2h 3h').rank).toBe(Rank3.StraightFlush);
  });
  it('ties break on the pair, then kicker; on high cards in order; same ranks are equal', () => {
    expect(compare3(ev('Js Jh 4d'), ev('Jc Jd 3h'))).toBeGreaterThan(0);
    expect(compare3(ev('Ts Th Ad'), ev('Jc Jd 2h'))).toBeLessThan(0);
    expect(compare3(ev('Ks 9h 4d'), ev('Kc 9d 3h'))).toBeGreaterThan(0);
    expect(compare3(ev('Ks 9h 4d'), ev('Kc 9d 4h'))).toBe(0);
    expect(compare3(ev('2h 9h Kh'), ev('3s 9s Ks'))).toBeLessThan(0);
  });
  it('the dealer qualifies with queen-high or better', () => {
    expect(dealerQualifies(ev('Qs 5h 3d'))).toBe(true);
    expect(dealerQualifies(ev('Js Th 8d'))).toBe(false);
    expect(dealerQualifies(ev('2s 2h 3d'))).toBe(true);
    expect(dealerQualifies(ev('As 2h 5d'))).toBe(true);
  });
  it('all 22,100 hands land in the textbook counts', () => {
    const deck = newDeck(seededInt(1));
    const n: Record<number, number> = {};
    for (let a = 0; a < 52; a++) for (let b = a + 1; b < 52; b++) for (let c = b + 1; c < 52; c++) {
      const r = evaluate3([deck[a], deck[b], deck[c]]).rank;
      n[r] = (n[r] ?? 0) + 1;
    }
    expect(n[Rank3.StraightFlush]).toBe(48);
    expect(n[Rank3.Trips]).toBe(52);
    expect(n[Rank3.Straight]).toBe(720);
    expect(n[Rank3.Flush]).toBe(1096);
    expect(n[Rank3.Pair]).toBe(3744);
    expect(n[Rank3.High]).toBe(16440);
  });
});

describe('settling a hand ($10 Ante, $5 Pair Plus)', () => {
  it('fold: the Ante is lost, Pair Plus still pays on the player hand', () => {
    const r = settle3(k('Js Jh 4d'), k('As Kh 3d'), 10, 5, false);
    expect(r.outcome).toBe('fold');
    expect(r.anteReturn + r.playReturn + r.bonusReturn).toBe(0);
    expect(r.pairPlusReturn).toBe(10); // pair 1:1
  });
  it('dealer does not qualify: Ante pays 1:1, Play pushes', () => {
    const r = settle3(k('2s 5h 9d'), k('Js 8h 4d'), 10, 0, true);
    expect(r.outcome).toBe('noqualify');
    expect(r.anteReturn).toBe(20);
    expect(r.playReturn).toBe(10);
    expect(r.total).toBe(30);
  });
  it('dealer qualifies: win pays Ante and Play 1:1, loss takes both, equal hands push', () => {
    const w = settle3(k('Ks Kh 4d'), k('Qs 8h 4c'), 10, 0, true);
    expect([w.outcome, w.anteReturn, w.playReturn]).toEqual(['win', 20, 20]);
    const l = settle3(k('Ks 8h 4d'), k('Qs Qh 4c'), 10, 0, true);
    expect([l.outcome, l.total]).toEqual(['lose', 0]);
    const p = settle3(k('Ks 9h 4d'), k('Kc 9d 4h'), 10, 0, true);
    expect([p.outcome, p.anteReturn, p.playReturn]).toEqual(['push', 10, 10]);
  });
  it('Ante Bonus pays when the player plays, even if the hand loses; never on a fold', () => {
    const sf = settle3(k('5h 6h 7h'), k('8s 9s Ts'), 10, 0, true); // loses to a higher straight flush
    expect(sf.outcome).toBe('lose');
    expect(sf.bonusReturn).toBe(50);
    expect(settle3(k('9s 9h 9d'), k('2s 3h 7d'), 10, 0, true).bonusReturn).toBe(40);
    expect(settle3(k('5h 6s 7h'), k('2s 3h 7d'), 10, 0, true).bonusReturn).toBe(10);
    expect(settle3(k('2h 9h Kh'), k('2s 3h 7d'), 10, 0, true).bonusReturn).toBe(0);
    expect(settle3(k('5h 6h 7h'), k('2s 3h 7d'), 10, 0, false).bonusReturn).toBe(0);
  });
  it('Pair Plus pays 40 / 30 / 6 / 4 / 1 to 1 and nothing on high card', () => {
    const pp = (h: string) => settle3(k(h), k('2s 3h 7d'), 10, 5, false).pairPlusReturn;
    expect(pp('5h 6h 7h')).toBe(5 * 41);
    expect(pp('9s 9h 9d')).toBe(5 * 31);
    expect(pp('5h 6s 7h')).toBe(5 * 7);
    expect(pp('2h 9h Kh')).toBe(5 * 5);
    expect(pp('Js Jh 4d')).toBe(5 * 2);
    expect(pp('As 9h 4d')).toBe(0);
    expect(PAIR_PLUS[Rank3.StraightFlush]).toBe(40);
    expect(ANTE_BONUS[Rank3.StraightFlush]).toBe(5);
  });
  it('limits keep room for the Play bet', () => {
    expect(betBlocker(5, 0, 1000)).toMatch(/Minimum Ante/);
    expect(betBlocker(10, 3, 1000)).toMatch(/Pair Plus/);
    expect(betBlocker(501, 0, 5000)).toMatch(/limit/);
    expect(betBlocker(100, 0, 150)).toMatch(/Play/);
    expect(betBlocker(100, 50, 250)).toBeNull();
  });
});

describe('exact return over every possible deal', () => {
  it('Pair Plus (40/30/6/4/1) edge is 2.32%; Ante/Play with Q-6-4 strategy is about 3.37% of the Ante', () => {
    // Pair Plus: exact over all 22,100 player hands.
    const deck = newDeck(seededInt(2));
    let ppRet = 0;
    let hands = 0;
    for (let a = 0; a < 52; a++) for (let b = a + 1; b < 52; b++) for (let c = b + 1; c < 52; c++) {
      ppRet += settle3([deck[a], deck[b], deck[c]], k('2s 3h 7d'), 1, 1, false).pairPlusReturn;
      hands++;
    }
    expect(1 - ppRet / hands).toBeCloseTo(0.0232, 4);
    // Ante/Play: sampled (Q-6-4 or better plays).
    const rand = seededInt(99);
    let net = 0;
    const n = 300_000;
    const q64 = (h: Card[]) => {
      const e = evaluate3(h);
      if (e.rank > Rank3.High) return true;
      const [x, y, z] = e.kick;
      return x > 12 || (x === 12 && (y > 6 || (y === 6 && z >= 4)));
    };
    for (let i = 0; i < n; i++) {
      const d = newDeck(rand);
      const p = d.slice(0, 3);
      const play = q64(p);
      const r = settle3(p, d.slice(3, 6), 1, 0, play);
      net += r.anteReturn + r.playReturn + r.bonusReturn - 1 - (play ? 1 : 0);
    }
    expect(Math.abs(-net / n - 0.0337)).toBeLessThan(0.008);
  }, 60_000);
});

describe('Three Card Poker through the casino', () => {
  async function inCasino() {
    const ctx = await newCareer();
    await ctx.s.casino.visit();
    return ctx;
  }

  it('ante + pair plus debited once, six unique cards, the hand survives a reload, settled once', async () => {
    const { s, dbName } = await inCasino();
    const p = await s.casino.startThreeCard(20, 10);
    const all = [...p.player, ...p.dealer].map((c) => c.rank * 4 + c.suit);
    expect(new Set(all).size).toBe(6);
    expect(await s.economy.getBalance(RYAN)).toBe(START - 30);
    const again = await s.casino.startThreeCard(20, 10).catch((e) => e);
    expect(isDomainError(again, 'CAREER_RULE')).toBe(true);
    const s2 = await reload(s, dbName);
    expect(pendingThreeCard(await s2.career.getCareer())).toEqual(p);
    const out = await s2.casino.finishThreeCard(p.roundId, true);
    expect(out!.staked).toBe(50);
    expect(out!.result).toEqual(settle3(p.player, p.dealer, 20, 10, true));
    expect(await s2.economy.getBalance(RYAN)).toBe(START - 50 + out!.result.total);
    expect(await s2.casino.finishThreeCard(p.roundId, true)).toBeNull(); // replay changes nothing
    expect(await s2.economy.getBalance(RYAN)).toBe(START - 50 + out!.result.total);
    expect(pendingThreeCard(await s2.career.getCareer())).toBeNull();
    await expect(s2.economy.verifyIntegrity(RYAN)).resolves.toBeUndefined();
    s2.db.close();
  });

  it('folding loses only the Ante and still settles Pair Plus', async () => {
    const { s } = await inCasino();
    let bank = START;
    for (let i = 0; i < 15; i++) {
      const p = await s.casino.startThreeCard(10, 5);
      const out = await s.casino.finishThreeCard(p.roundId, false);
      expect(out!.result.outcome).toBe('fold');
      expect(out!.result.total).toBe(out!.result.pairPlusReturn);
      bank += out!.result.total - 15;
      expect(await s.economy.getBalance(RYAN)).toBe(bank);
    }
    s.db.close();
  }, 30_000);

  it('refuses a deal the bank could not Play, leaving the money alone', async () => {
    const { s } = await inCasino();
    const e = await s.casino.startThreeCard(500, 250).catch((x) => x);
    if (START < 1250) expect(isDomainError(e, 'CAREER_RULE')).toBe(true);
    const e2 = await s.casino.startThreeCard(5, 0).catch((x) => x);
    expect(isDomainError(e2, 'CAREER_RULE')).toBe(true);
    s.db.close();
  });
});
