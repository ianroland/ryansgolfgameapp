/** Greyhound racing: the race model, odds, and money through the casino (dynamic cards: tests/greyhoundCards.test.ts). */
import { describe, expect, it } from 'vitest';
import {
  betBlocker, drawCard, GREYHOUND_LIMITS, LANES, priceCard, ROSTER, runRace, TRACK_YARDS, winReturn,
} from '../src/casino/greyhounds';
import { pendingRace } from '../src/services/casinoService';
import { isDomainError } from '../src/core/errors';
import { newCareer, reload, RYAN, START } from './helpers';

describe('race model', () => {
  it('a card is six different dogs from the roster, the same for the same seed', () => {
    const a = drawCard(123);
    expect(a.dogs).toHaveLength(LANES);
    expect(new Set(a.dogs.map((d) => d.name)).size).toBe(LANES);
    for (const d of a.dogs) expect(ROSTER.map((r) => r.id)).toContain(d.id);
    expect(drawCard(123)).toEqual(a);
  });

  it('the same seed runs the same race, frame for frame', () => {
    const { dogs } = drawCard(7);
    expect(JSON.stringify(runRace(dogs, 99))).toBe(JSON.stringify(runRace(dogs, 99)));
    expect(JSON.stringify(runRace(dogs, 99))).not.toBe(JSON.stringify(runRace(dogs, 100)));
  });

  it('every race has six finishers in a unique order, and the frames agree with that order', () => {
    for (let s = 1; s <= 200; s++) {
      const { dogs } = drawCard(s);
      const r = runRace(dogs, s * 31);
      expect([...r.order].sort()).toEqual([0, 1, 2, 3, 4, 5]);
      expect(r.times.every((t) => Number.isFinite(t) && t > 20 && t < 40)).toBe(true);
      // The order is by finish time.
      for (let i = 1; i < LANES; i++) expect(r.times[r.order[i]]).toBeGreaterThanOrEqual(r.times[r.order[i - 1]]);
      // Animation data: positions never go backwards, end on the line, and each dog reaches the line
      // on the frame its finish time says (so the screen shows this order).
      const last = r.frames[r.frames.length - 1];
      expect(last.every((p) => p === TRACK_YARDS)).toBe(true);
      const firstAtLine = (i: number) => r.frames.findIndex((f) => f[i] >= TRACK_YARDS);
      for (let i = 0; i < LANES; i++) {
        for (let k = 1; k < r.frames.length; k++) expect(r.frames[k][i]).toBeGreaterThanOrEqual(r.frames[k - 1][i]);
        expect(firstAtLine(i)).toBe(Math.ceil(r.times[i] / 0.05 - 1e-9));
      }
      for (let i = 1; i < LANES; i++) expect(firstAtLine(r.order[i])).toBeGreaterThanOrEqual(firstAtLine(r.order[i - 1]));
    }
  });

  it('races are competitive: different winners, lead changes and close finishes happen', () => {
    const { dogs } = drawCard(5);
    const winners = new Set<number>();
    let leadChanges = 0;
    let close = 0;
    for (let s = 1; s <= 300; s++) {
      const r = runRace(dogs, s);
      winners.add(r.order[0]);
      const leaderAt = (k: number) => r.frames[k].indexOf(Math.max(...r.frames[k]));
      if (leaderAt(Math.floor(r.frames.length * 0.4)) !== r.order[0]) leadChanges++;
      if (r.times[r.order[1]] - r.times[r.order[0]] < 0.15) close++;
    }
    expect(winners.size).toBeGreaterThanOrEqual(4);
    expect(leadChanges).toBeGreaterThan(30);
    expect(close).toBeGreaterThan(30);
  });

  it('odds: shown before the bet, from the same model, with the house margin', () => {
    const card = priceCard(drawCard(11));
    expect(card.odds).toHaveLength(LANES);
    expect(priceCard(drawCard(11))).toEqual(card);
    // Implied probabilities sum above 100% (the margin); prices run from odds-on to 30-1.
    const book = card.odds.reduce((a, [n, d]) => a + 1 / (1 + n / d), 0);
    expect(book).toBeGreaterThan(1.05);
    for (const [n, d] of card.odds) expect(n / d).toBeGreaterThan(0);
    for (const [n, d] of card.odds) expect(n / d).toBeLessThanOrEqual(30);
  });

  it('payouts: a winning bet returns the stake plus the odds; bet limits', () => {
    expect(winReturn(10, [7, 2])).toBe(45);
    expect(winReturn(25, [1, 1])).toBe(50);
    expect(winReturn(5, [6, 5])).toBe(11);
    expect(betBlocker(4, 1000)).toMatch(/Minimum/);
    expect(betBlocker(GREYHOUND_LIMITS.max + 1, 10_000)).toMatch(/Maximum/);
    expect(betBlocker(100, 50)).toMatch(/Not enough/);
    expect(betBlocker(100, 100)).toBeNull();
  });
});

describe('greyhounds through the casino', () => {
  async function inCasino() {
    const ctx = await newCareer();
    await ctx.s.casino.visit();
    return ctx;
  }
  /** Today's locked card, priced (what the screen shows). */
  const todays = async (s: Awaited<ReturnType<typeof newCareer>>['s']) => priceCard(drawCard((await s.casino.dealGreyhoundCard()).seed));

  it('bet, race, paid once: the stake is taken once and a winner is paid exactly the quoted odds', async () => {
    const { s } = await inCasino();
    // Back every trap in turn (a new card each race) until one wins, checking the money each time.
    let paidOnce = false;
    let bank = START;
    for (let trap = 0; trap < 6 && !paidOnce; trap++) {
      const card = await todays(s);
      const p = await s.casino.startGreyhoundRace(card.seed, trap, 20);
      expect(p.odds).toEqual(card.odds[trap]);
      bank -= 20;
      expect(await s.economy.getBalance(RYAN)).toBe(bank);
      const out = await s.casino.finishGreyhoundRace(p.roundId);
      expect(out!.result.order).toHaveLength(6);
      const expected = out!.result.order[0] === trap ? winReturn(20, card.odds[trap]) : 0;
      expect(out!.payout).toBe(expected);
      bank += expected;
      expect(await s.economy.getBalance(RYAN)).toBe(bank);
      // Replaying or revisiting the result pays nothing more.
      expect(await s.casino.finishGreyhoundRace(p.roundId)).toBeNull();
      expect(await s.economy.getBalance(RYAN)).toBe(bank);
      paidOnce = expected > 0;
    }
    await expect(s.economy.verifyIntegrity(RYAN)).resolves.toBeUndefined();
  });

  it('one race at a time; not enough money, too small or too large a bet is refused before any debit', async () => {
    const { s } = await inCasino();
    const first = await todays(s);
    const p = await s.casino.startGreyhoundRace(first.seed, 0, 10);
    const twice = await s.casino.startGreyhoundRace(first.seed, 1, 10).catch((e) => e);
    expect(isDomainError(twice, 'CAREER_RULE')).toBe(true);
    await s.casino.finishGreyhoundRace(p.roundId);
    const before = await s.economy.getBalance(RYAN);
    const card = await todays(s);
    for (const stake of [4, 501, 10.5]) {
      const err = await s.casino.startGreyhoundRace(card.seed, 0, stake).catch((e) => e);
      expect(isDomainError(err, 'CAREER_RULE')).toBe(true);
    }
    const bal = await s.economy.getBalance(RYAN);
    await s.economy.post({ ownerId: RYAN, amount: -(bal - 30), type: 'living_costs', sourceId: 'test', idempotencyKey: 'drain' });
    const poor = await s.casino.startGreyhoundRace(card.seed, 0, 50).catch((e) => e);
    expect(isDomainError(poor, 'CAREER_RULE')).toBe(true);
    expect(String(poor.message)).toMatch(/Not enough/);
    expect(await s.economy.getBalance(RYAN)).toBe(30);
    expect(before).toBeGreaterThan(30);
  });

  it('a reload mid-race keeps the bet and the decided result; it settles once, after the reload', async () => {
    const { s, dbName } = await inCasino();
    const p = await s.casino.startGreyhoundRace((await todays(s)).seed, 2, 25);
    const expected = runRaceFor(p);
    const s2 = await reload(s, dbName);
    const c = await s2.career.getCareer();
    expect(pendingRace(c)).toEqual(p);
    const out = await s2.casino.finishGreyhoundRace(p.roundId);
    expect(out!.result.order).toEqual(expected);
    expect(await s2.casino.finishGreyhoundRace(p.roundId)).toBeNull();
    expect(pendingRace(await s2.career.getCareer())).toBeNull();
    await expect(s2.economy.verifyIntegrity(RYAN)).resolves.toBeUndefined();
    s2.db.close();
  });

  it('roulette and the other tables are untouched', async () => {
    const { s } = await inCasino();
    await s.casino.wager('roulette', 'rl1', 'red-1', 10);
    await s.casino.settle('roulette', 'rl1', 'spin', 20);
    expect(await s.economy.getBalance(RYAN)).toBe(START + 10);
  });
});

function runRaceFor(p: { cardSeed: number; raceSeed: number }) {
  return runRace(drawCard(p.cardSeed).dogs, p.raceSeed).order;
}
