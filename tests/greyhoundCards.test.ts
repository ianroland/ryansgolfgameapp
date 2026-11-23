/**
 * Dynamic greyhound race cards (v0.13.2): the 36-dog roster, random six-dog cards,
 * odds from the same race model, locked cards, history, and save compatibility.
 * Runs well over 1,000 simulated races.
 */
import { describe, expect, it } from 'vitest';
import {
  cardForPending, drawCard, drawCardV1, HOUSE_MARGIN, LANES, newCardSeed, priceCard, raceForPending, ROSTER, runRace, runRaceV1,
  sameField, TRACK_YARDS, winChances, winReturn, type PendingRace,
} from '../src/casino/greyhounds';
import { currentGreyhoundCard, greyhoundHistory, pendingRace } from '../src/services/casinoService';
import { isDomainError } from '../src/core/errors';
import { seededInt } from '../src/casino/random';
import { newCareer, reload, RYAN, START } from './helpers';

const ORIGINALS = ['Dusty Trail', 'Velvet Rocket', 'Palm Springs Pete', 'Sandstorm Sally', 'Coyote Ugly', 'Snake Eyes'];

describe('roster', () => {
  it('36 unique dogs with persistent ids and full ratings, including the six Desert Palms originals', () => {
    expect(ROSTER).toHaveLength(36);
    expect(new Set(ROSTER.map((d) => d.id)).size).toBe(36);
    expect(new Set(ROSTER.map((d) => d.name)).size).toBe(36);
    for (const n of ORIGINALS) expect(ROSTER.map((d) => d.name)).toContain(n);
    for (const d of ROSTER) {
      expect(d.speed).toBeGreaterThan(17);
      expect(d.speed).toBeLessThan(19);
      for (const r of [d.early, d.stamina, d.consistency, d.form]) expect(r >= 0 && r <= 1).toBe(true);
      expect(['fast_starter', 'closer', 'front_runner', 'wildcard', 'mid_surge', 'stayer']).toContain(d.style);
    }
  });
});

describe('1,200 simulated races on 60 random cards', () => {
  const rand = seededInt(20261122);
  const cards: ReturnType<typeof priceCard>[] = [];
  let last: string[] = [];
  for (let i = 0; i < 60; i++) {
    const seed = newCardSeed(last, rand);
    const card = priceCard(drawCard(seed), 800);
    last = card.dogs.map((d) => d.id);
    cards.push(card);
  }

  it('every card: six unique dogs, one per lane, a new field each time, and the same card for the same seed', () => {
    const seen = new Set<string>();
    for (let i = 0; i < cards.length; i++) {
      const ids = cards[i].dogs.map((d) => d.id);
      expect(ids).toHaveLength(LANES);
      expect(new Set(ids).size).toBe(LANES);
      ids.forEach((id) => seen.add(id));
      if (i > 0) expect(sameField(ids, cards[i - 1].dogs.map((d) => d.id))).toBe(false);
      expect(drawCard(cards[i].seed)).toEqual(drawCard(cards[i].seed));
    }
    expect(seen.size).toBeGreaterThanOrEqual(30); // variety: most of the roster turns up
    // Dogs come back in different traps and form.
    const traps = new Map<string, Set<number>>();
    for (const c of cards) c.dogs.forEach((d, t) => traps.set(d.id, (traps.get(d.id) ?? new Set()).add(t)));
    expect([...traps.values()].some((s) => s.size >= 3)).toBe(true);
  });

  it('odds: different across cards, coherent (a book over 100% by about the margin), and shorter for stronger dogs', () => {
    expect(new Set(cards.map((c) => c.odds.map((o) => o.join('-')).join()))).toHaveProperty('size', cards.length);
    for (const c of cards.slice(0, 12)) {
      const book = c.odds.reduce((a, [n, d]) => a + 1 / (1 + n / d), 0);
      expect(book).toBeGreaterThan(1);
      expect(book).toBeLessThan(1 + HOUSE_MARGIN * 3);
      const p = winChances(c, 800);
      // A dog with a better chance never has longer odds.
      for (let a = 0; a < LANES; a++)
        for (let b = 0; b < LANES; b++)
          if (p[a] > p[b]) expect(c.odds[a][0] / c.odds[a][1]).toBeLessThanOrEqual(c.odds[b][0] / c.odds[b][1]);
      // No price pays more than fair less the margin.
      for (let t = 0; t < LANES; t++) expect((1 + c.odds[t][0] / c.odds[t][1]) * p[t]).toBeLessThanOrEqual(1 - HOUSE_MARGIN + 1e-9);
    }
  });

  it('races follow the odds over many runs: favourites win most, longshots least, and upsets happen', () => {
    let favWins = 0, longWins = 0, upsets = 0, races = 0;
    let impliedFav = 0;
    for (const [k, c] of cards.entries()) {
      const dec = c.odds.map(([n, d]) => n / d);
      const fav = dec.indexOf(Math.min(...dec));
      const long = dec.indexOf(Math.max(...dec));
      impliedFav += 1 / (1 + dec[fav]);
      for (let r = 0; r < 20; r++) {
        const res = runRace(c.dogs, 7_000_000 + k * 100 + r);
        races++;
        if (res.order[0] === fav) favWins++;
        if (res.order[0] === long) longWins++;
        if (dec[res.order[0]] >= 8) upsets++;
        // The animation data agrees with the finishing order: each dog reaches the line on its finish tick.
        const firstAt = (i: number) => res.frames.findIndex((f) => f[i] >= TRACK_YARDS);
        for (let i = 1; i < LANES; i++) expect(firstAt(res.order[i])).toBeGreaterThanOrEqual(firstAt(res.order[i - 1]));
      }
    }
    expect(races).toBe(1200);
    expect(favWins).toBeGreaterThan(longWins * 3);
    expect(longWins).toBeGreaterThan(0);
    expect(upsets).toBeGreaterThan(20);
    // Favourites win about as often as their price says once the margin is taken out
    // (a price p_implied means a true chance of about p_implied × (1 − margin)), give or take sampling noise.
    const shown = favWins / races;
    const priced = (impliedFav / cards.length) * (1 - HOUSE_MARGIN);
    expect(Math.abs(shown - priced)).toBeLessThan(0.12);
    expect(shown).toBeLessThan(0.5); // the favourite does not always win
  });
});

describe('locked race cards through the casino', () => {
  async function inCasino() {
    const ctx = await newCareer();
    await ctx.s.casino.visit();
    return ctx;
  }

  it('a dealt card stays put: dealing again, reloading or coming back returns the same card; bets only on it', async () => {
    const { s, dbName } = await inCasino();
    const a = await s.casino.dealGreyhoundCard();
    expect(await s.casino.dealGreyhoundCard()).toEqual(a);
    const s2 = await reload(s, dbName);
    expect(await s2.casino.dealGreyhoundCard()).toEqual(a);
    expect(currentGreyhoundCard(await s2.career.getCareer())).toEqual(a);
    const wrong = await s2.casino.startGreyhoundRace(a.seed + 1, 0, 10).catch((e) => e);
    expect(isDomainError(wrong, 'CAREER_RULE')).toBe(true);
    expect(await s2.economy.getBalance(RYAN)).toBe(START);
    // Bet placed: the card can't be swapped (a race is running), and odds stay those of the card.
    const card = priceCard(drawCard(a.seed));
    const p = await s2.casino.startGreyhoundRace(a.seed, 3, 10);
    expect(p.odds).toEqual(card.odds[3]);
    expect(p.v).toBe(2);
    expect(await s2.casino.dealGreyhoundCard()).toEqual(a);
    s2.db.close();
  });

  it('after the race: paid once, a new card with a different field, and the result on the recent-races board (10 kept)', async () => {
    const { s } = await inCasino();
    let bank = START;
    let prevIds: string[] = [];
    for (let i = 0; i < 12; i++) {
      const held = await s.casino.dealGreyhoundCard();
      const card = priceCard(drawCard(held.seed));
      const ids = card.dogs.map((d) => d.id);
      if (prevIds.length) expect(sameField(ids, prevIds)).toBe(false);
      prevIds = ids;
      const p = await s.casino.startGreyhoundRace(held.seed, i % 6, 10);
      bank -= 10;
      const out = await s.casino.finishGreyhoundRace(p.roundId);
      const due = out!.result.order[0] === i % 6 ? winReturn(10, card.odds[i % 6]) : 0;
      expect(out!.payout).toBe(due);
      bank += due;
      expect(await s.casino.finishGreyhoundRace(p.roundId)).toBeNull(); // replay pays nothing
      expect(await s.economy.getBalance(RYAN)).toBe(bank);
      const h = greyhoundHistory(await s.career.getCareer());
      expect(h[0].roundId).toBe(p.roundId);
      expect(h[0].pick).toEqual({ name: card.dogs[i % 6].name, trap: i % 6 });
      expect(h[0].odds).toEqual(card.odds[i % 6]);
      expect(h[0].payout).toBe(due);
      expect(h[0].order.map((o) => o.trap)).toEqual(out!.result.order);
      expect(currentGreyhoundCard(await s.career.getCareer())).toBeNull();
    }
    expect(greyhoundHistory(await s.career.getCareer())).toHaveLength(10);
    await expect(s.economy.verifyIntegrity(RYAN)).resolves.toBeUndefined();
  }, 30_000);

  it('a race bet before v0.13.2 (no model version) replays with the old model and pays as it was bet', async () => {
    const { s, dbName } = await inCasino();
    const old: PendingRace = { roundId: 'casino_greyhounds_legacy1', cardSeed: 77, raceSeed: 4242, trap: 2, stake: 20, odds: [5, 1] };
    const c = await s.career.getCareer();
    await s.db.careers.put({ ...c, flags: { ...c.flags, greyhoundPending: JSON.stringify(old) } });
    await s.economy.post({ ownerId: RYAN, amount: -20, type: 'casino', sourceId: old.roundId, idempotencyKey: `casino:${old.roundId}:bet:win` });
    const s2 = await reload(s, dbName);
    expect(pendingRace(await s2.career.getCareer())).toEqual(old);
    const expected = runRaceV1(drawCardV1(77).dogs, 4242);
    expect(raceForPending(old).order).toEqual(expected.order);
    expect(cardForPending(old).dogs.map((d) => d.name)).toEqual(drawCardV1(77).dogs.map((d) => d.name));
    const out = await s2.casino.finishGreyhoundRace(old.roundId);
    expect(out!.result.order).toEqual(expected.order);
    expect(out!.payout).toBe(expected.order[0] === 2 ? winReturn(20, [5, 1]) : 0);
    expect(await s2.economy.getBalance(RYAN)).toBe(START - 20 + out!.payout);
    s2.db.close();
  });
});
