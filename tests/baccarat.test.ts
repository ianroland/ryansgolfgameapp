/**
 * Baccarat (Punto Banco, 8 decks): the third-card tableau, payouts and commission
 * rounding, the persisted shoe and cut card, history, and money through the casino.
 */
import { describe, expect, it } from 'vitest';
import type { Card } from '../src/casino/blackjack';
import {
  bankerDraws, beadRoad, betBlocker, CUT_FROM_END, dealFromShoe, decodeCards, encodeCards, freshShoe, handTotal, needsShuffle,
  newBaccaratShoe, playCoup, SHOE_SIZE, spotReturn, totalReturn, type ShoeState,
} from '../src/casino/baccarat';
import { seededInt } from '../src/casino/random';
import { baccaratHistory, baccaratShoe } from '../src/services/casinoService';
import { isDomainError } from '../src/core/errors';
import { newCareer, reload, RYAN, START } from './helpers';

const c = (rank: number, suit: Card['suit'] = 0): Card => ({ rank, suit });

describe('card values and totals', () => {
  it('ace is 1, tens and pictures are 0, totals are mod 10', () => {
    expect(handTotal([c(1), c(13)])).toBe(1);
    expect(handTotal([c(10), c(11), c(12)])).toBe(0);
    expect(handTotal([c(7), c(8)])).toBe(5);
    expect(handTotal([c(9), c(9), c(9)])).toBe(7);
  });
});

describe('Banker third-card tableau', () => {
  // Expected draw (D) / stand (S) per Banker total (rows 0–7) and Player third card value (cols 0–9), plus "player stood".
  const TABLE: Record<number, string> = {
    0: 'DDDDDDDDDD', 1: 'DDDDDDDDDD', 2: 'DDDDDDDDDD',
    3: 'DDDDDDDDSD', 4: 'SSDDDDDDSS', 5: 'SSSSDDDDSS',
    6: 'SSSSSSDDSS', 7: 'SSSSSSSSSS',
  };
  it('matches the full Punto Banco table for every Banker total and Player third card', () => {
    for (let bt = 0; bt <= 7; bt++)
      for (let t = 0; t <= 9; t++) {
        const card = t === 0 ? c(10) : c(t);
        expect(bankerDraws(bt, card), `banker ${bt}, player third ${t}`).toBe(TABLE[bt][t] === 'D');
      }
  });
  it('when the Player stands, the Banker draws on 0–5 and stands on 6–7', () => {
    for (let bt = 0; bt <= 7; bt++) expect(bankerDraws(bt, null)).toBe(bt <= 5);
  });
});

describe('a coup', () => {
  it('naturals stop the draw (either side 8 or 9)', () => {
    // P: 4+4=8 natural, B: 2+3=5 → no draws
    const { hand, used } = playCoup([c(4), c(2), c(4), c(3), c(9), c(9)]);
    expect(used).toBe(4);
    expect(hand.natural).toBe(true);
    expect(hand.outcome).toBe('P');
    // B natural 9 beats P 7, no draws
    const b = playCoup([c(3), c(4), c(4), c(5), c(1), c(1)]);
    expect(b.used).toBe(4);
    expect(b.hand.outcome).toBe('B');
  });
  it('Player 6–7 stands; Banker then draws on 0–5', () => {
    // P 3+3=6 stands; B 2+2=4 draws (no player third) → draws a 5 → 9
    const { hand, used } = playCoup([c(3), c(2), c(3), c(2), c(5), c(1)]);
    expect(hand.player).toHaveLength(2);
    expect(hand.banker).toHaveLength(3);
    expect(used).toBe(5);
    expect(hand.bankerTotal).toBe(9);
  });
  it('Player 0–5 draws; Banker follows the tableau on the Player third card', () => {
    // P 1+2=3 draws an 8; B 1+2=3 stands on a third 8.
    const { hand } = playCoup([c(1), c(1), c(2), c(2), c(8), c(5)]);
    expect(hand.player).toHaveLength(3);
    expect(hand.banker).toHaveLength(2);
    expect(hand.playerTotal).toBe(1);
    expect(hand.bankerTotal).toBe(3);
    expect(hand.outcome).toBe('B');
  });
  it('equal totals are a tie', () => {
    const { hand } = playCoup([c(10), c(11), c(7), c(7), c(1), c(1)]);
    expect(hand.outcome).toBe('T');
  });
});

describe('payouts', () => {
  it('Player 1:1, Banker 0.95:1 floored to whole dollars, Tie 8:1; Player and Banker push on a tie', () => {
    expect(spotReturn('player', 100, 'P')).toBe(200);
    expect(spotReturn('player', 100, 'B')).toBe(0);
    expect(spotReturn('banker', 100, 'B')).toBe(195);
    expect(spotReturn('banker', 10, 'B')).toBe(19); // $9.50 → $9
    expect(spotReturn('banker', 25, 'B')).toBe(48); // $23.75 → $23
    expect(spotReturn('banker', 1000, 'B')).toBe(1950);
    expect(spotReturn('tie', 10, 'T')).toBe(90);
    expect(spotReturn('tie', 10, 'P')).toBe(0);
    expect(spotReturn('player', 50, 'T')).toBe(50);
    expect(spotReturn('banker', 50, 'T')).toBe(50);
    expect(totalReturn({ player: 20, tie: 10 }, 'T')).toBe(20 + 90);
  });
  it('the commission is never rounded in the player’s favour', () => {
    for (let s = 10; s <= 1000; s++) {
      const win = spotReturn('banker', s, 'B') - s;
      expect(win).toBeLessThanOrEqual(s * 0.95);
      expect(win).toBeGreaterThan(s * 0.95 - 1);
    }
  });
  it('bet limits and balance', () => {
    expect(betBlocker({}, 1000)).toMatch(/Place a bet/);
    expect(betBlocker({ player: 5 }, 1000)).toMatch(/Minimum/);
    expect(betBlocker({ player: 1001 }, 5000)).toMatch(/limit/);
    expect(betBlocker({ player: 600, tie: 500 }, 1000)).toMatch(/balance/);
    expect(betBlocker({ banker: 100, tie: 10 }, 1000)).toBeNull();
  });
});

describe('the shoe', () => {
  it('8 full decks, every card 8 times, Fisher–Yates shuffled', () => {
    const shoe = newBaccaratShoe(seededInt(7));
    expect(shoe).toHaveLength(SHOE_SIZE);
    const counts = new Map<string, number>();
    for (const k of shoe) counts.set(`${k.rank}-${k.suit}`, (counts.get(`${k.rank}-${k.suit}`) ?? 0) + 1);
    expect(counts.size).toBe(52);
    for (const n of counts.values()) expect(n).toBe(8);
    expect(newBaccaratShoe(seededInt(8))).not.toEqual(shoe);
  });
  it('encodes losslessly, burns 2–11 cards, and deals to the cut card with no card dealt twice', () => {
    const cards = newBaccaratShoe(seededInt(3));
    expect(decodeCards(encodeCards(cards))).toEqual(cards);
    const { shoe: s0, burned } = freshShoe(1, seededInt(11));
    expect(burned).toBeGreaterThanOrEqual(2);
    expect(burned).toBeLessThanOrEqual(11);
    expect(s0.cards.length + burned).toBe(SHOE_SIZE);
    let shoe: ShoeState = s0;
    let hands = 0;
    let dealt = 0;
    while (!needsShuffle(shoe)) {
      const out = dealFromShoe(shoe);
      dealt += out.hand.player.length + out.hand.banker.length;
      shoe = out.shoe;
      hands++;
    }
    expect(shoe.cards.length).toBeLessThanOrEqual(CUT_FROM_END);
    expect(shoe.cards.length).toBeGreaterThan(CUT_FROM_END - 6);
    expect(dealt + burned + shoe.cards.length).toBe(SHOE_SIZE);
    expect(hands).toBeGreaterThan(70);
  });
});

describe('long-run expectations (200,000 coups)', () => {
  it('Banker wins ~45.9%, Player ~44.6%, Tie ~9.5%; house edges about 1.06% / 1.24% / 14.4%', () => {
    const rand = seededInt(20261123);
    let shoe = freshShoe(1, rand).shoe;
    const n = 200_000;
    const w = { P: 0, B: 0, T: 0 };
    let bankerRet = 0;
    let playerRet = 0;
    let tieRet = 0;
    for (let i = 0; i < n; i++) {
      if (needsShuffle(shoe)) shoe = freshShoe(2, rand).shoe;
      const out = dealFromShoe(shoe);
      shoe = out.shoe;
      w[out.hand.outcome]++;
      // $100 units (so 0.95 is exact) to measure the edge itself.
      bankerRet += spotReturn('banker', 100, out.hand.outcome);
      playerRet += spotReturn('player', 100, out.hand.outcome);
      tieRet += spotReturn('tie', 100, out.hand.outcome);
    }
    expect(w.B / n).toBeCloseTo(0.4586, 2);
    expect(w.P / n).toBeCloseTo(0.4462, 2);
    expect(w.T / n).toBeCloseTo(0.0952, 2);
    expect(1 - bankerRet / (100 * n)).toBeCloseTo(0.0106, 2);
    expect(1 - playerRet / (100 * n)).toBeCloseTo(0.0124, 2);
    expect(Math.abs(1 - tieRet / (100 * n) - 0.1436)).toBeLessThan(0.03);
  }, 30_000);
});

describe('bead road', () => {
  it('fills columns of six, oldest first', () => {
    const h = Array.from({ length: 8 }, (_, i) => ({ o: (i % 2 ? 'P' : 'B') as 'P' | 'B', p: 0, b: 0 }));
    const road = beadRoad(h);
    expect(road).toHaveLength(2);
    expect(road[0][0]).toEqual(h[7]);
    expect(road[1][1]).toEqual(h[0]);
    expect(road[1][2]).toBeNull();
  });
});

describe('baccarat through the casino', () => {
  async function inCasino() {
    const ctx = await newCareer();
    await ctx.s.casino.visit();
    return ctx;
  }

  it('needs a casino visit; stake debited once and paid once in one step; history and shoe saved', async () => {
    const ctx = await newCareer();
    const e = await ctx.s.casino.playBaccarat({ player: 10 }).catch((x) => x);
    expect(isDomainError(e, 'CAREER_RULE')).toBe(true);
    await ctx.s.casino.visit();
    let bank = START;
    for (let i = 0; i < 25; i++) {
      const bets = i % 3 === 0 ? { player: 20 } : i % 3 === 1 ? { banker: 25 } : { tie: 10, player: 10 };
      const r = await ctx.s.casino.playBaccarat(bets);
      expect(r.payout).toBe(totalReturn(bets, r.hand.outcome));
      bank += r.payout - r.staked;
      expect(await ctx.s.economy.getBalance(RYAN)).toBe(bank);
    }
    const car = await ctx.s.career.getCareer();
    expect(baccaratHistory(car)).toHaveLength(20);
    expect(baccaratShoe(car)!.n).toBe(1);
    await expect(ctx.s.economy.verifyIntegrity(RYAN)).resolves.toBeUndefined();
    ctx.s.db.close();
  }, 30_000);

  it('the shoe survives a reload and keeps dealing where it left off', async () => {
    const { s, dbName } = await inCasino();
    await s.casino.playBaccarat({ banker: 10 });
    const before = baccaratShoe(await s.career.getCareer())!;
    const s2 = await reload(s, dbName);
    const after = baccaratShoe(await s2.career.getCareer())!;
    expect(after).toEqual(before);
    const r = await s2.casino.playBaccarat({ banker: 10 });
    expect(r.shuffled).toBe(false);
    const used = r.hand.player.length + r.hand.banker.length;
    const key = (k: Card) => k.rank * 4 + k.suit;
    expect(r.hand.player.concat(r.hand.banker).map(key).sort()).toEqual(decodeCards(before.cards).slice(0, used).map(key).sort());
    const next = baccaratShoe(await s2.career.getCareer())!;
    expect(next.cards).toBe(before.cards.slice(r.hand.player.length + r.hand.banker.length));
    s2.db.close();
  });

  it('when the cut card is out, the next hand shuffles a new shoe and says so', async () => {
    const { s } = await inCasino();
    const c = await s.career.getCareer();
    const nearEnd: ShoeState = { cards: encodeCards(newBaccaratShoe(seededInt(5)).slice(0, CUT_FROM_END)), dealt: SHOE_SIZE - CUT_FROM_END, n: 3 };
    await s.db.careers.put({ ...c, flags: { ...c.flags, baccaratShoe: JSON.stringify(nearEnd) } });
    const r = await s.casino.playBaccarat({ player: 10 });
    expect(r.shuffled).toBe(true);
    expect(r.shoeNo).toBe(4);
    s.db.close();
  });

  it('a broken saved shoe is replaced rather than crashing the table', async () => {
    const { s } = await inCasino();
    const c = await s.career.getCareer();
    await s.db.careers.put({ ...c, flags: { ...c.flags, baccaratShoe: '{oops' } });
    const r = await s.casino.playBaccarat({ player: 10 });
    expect(r.shuffled).toBe(true);
    s.db.close();
  });

  it('refuses bets over the bank or the table limit without touching the money', async () => {
    const { s } = await inCasino();
    for (const bets of [{ player: START + 10 }, { tie: 1001 }, { banker: 3 }, {}]) {
      const e = await s.casino.playBaccarat(bets).catch((x) => x);
      expect(isDomainError(e, 'CAREER_RULE')).toBe(true);
    }
    expect(await s.economy.getBalance(RYAN)).toBe(START);
    s.db.close();
  });
});
