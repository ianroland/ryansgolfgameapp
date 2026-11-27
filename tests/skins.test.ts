/** Private-course skins: carries, the sudden-death playoff, a fully paid pool, and the ledger. */
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { buyIn, courseAt, holesPlayed, newMatch, payoutOf, playHole, PRIVATE_COURSES, SKINS_HOLES, strokesFor, type SkinsMatch } from '../src/expansion/skins';
import { isDomainError } from '../src/core/errors';
import type { GameServices } from '../src/services';
import { setCareer } from './careerHelpers';
import { newCareer, RYAN } from './helpers';

const playOut = (m: SkinsMatch, style: 'safe' | 'normal' | 'aggressive' = 'normal') => { while (!m.done) m = playHole(m, style); return m; };

describe('skins rules', () => {
  it('one course per casino, three rivals each, rising stakes', () => {
    expect(PRIVATE_COURSES.map((c) => [c.location, c.rivals.length, c.pars.length])).toEqual([['desert_palms', 3, 9], ['white_buffalo', 3, 9], ['morongo_sky', 3, 9]]);
    expect(PRIVATE_COURSES.map((c) => c.stake)).toEqual([100, 500, 2500]);
  });
  it('every match pays out all nine skins, ends on a hole won outright, never pays more than the pool', () => {
    let playoffs = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const m = playOut(newMatch('m', 'desert_palms', seed, 55), (['safe', 'normal', 'aggressive'] as const)[seed % 3]);
      expect(m.skins.reduce((a, b) => a + b, 0)).toBe(SKINS_HOLES);
      expect(holesPlayed(m)).toBeGreaterThanOrEqual(SKINS_HOLES);
      if (holesPlayed(m) > SKINS_HOLES) playoffs++;
      const last = holesPlayed(m) - 1;
      const best = Math.min(...m.scores.map((r) => r[last]));
      expect(m.scores.filter((r) => r[last] === best)).toHaveLength(1);
      expect(payoutOf(m)).toBeLessThanOrEqual(buyIn(m) * 4);
    }
    expect(playoffs).toBeGreaterThan(5);
  });
  it("Ryan's choice only changes Ryan's strokes", () => {
    const m = newMatch('m', 'white_buffalo', 77, 60);
    for (let i = 0; i < 9; i++) for (let w = 1; w < 4; w++) expect(strokesFor(m, w, i, 'normal')).toBe(strokesFor({ ...m, styles: ['aggressive'] }, w, i, 'normal'));
    const a = playHole(m, 'safe'); const b = playHole(m, 'aggressive');
    expect(a.scores.slice(1)).toEqual(b.scores.slice(1));
  });
  it('playing safe never makes worse than bogey', () => {
    const m = newMatch('m', 'morongo_sky', 5, 30);
    for (let i = 0; i < 40; i++) expect(strokesFor(m, 0, i, 'safe')).toBeLessThanOrEqual(courseAt('morongo_sky').pars[i % 9] + 1);
  });
});

async function member(): Promise<GameServices> {
  const { s } = await newCareer();
  await s.casino.visit();
  await setCareer(s, (c) => { c.flags['vip:desert_palms'] = 't'; c.energy = 80; });
  return s;
}

describe('skins service', () => {
  it('needs the membership; one buy-in debit, one payout credit, one tee time a week', async () => {
    const { s } = await newCareer();
    await s.casino.visit();
    expect(isDomainError(await s.poker.skinsStart().catch((e) => e), 'CAREER_RULE')).toBe(true);
    const t = await member();
    const before = await t.economy.getBalance(RYAN);
    const m0 = await t.poker.skinsStart();
    expect(await t.economy.getBalance(RYAN)).toBe(before - 900);
    expect((await t.career.getCareer()).energy).toBe(70);
    expect(isDomainError(await t.poker.skinsStart().catch((e) => e), 'CAREER_RULE')).toBe(true);
    let out = await t.poker.skinsPlay('normal');
    while (out.payout === null) out = await t.poker.skinsPlay('normal');
    expect(out.match.id).toBe(m0.id);
    expect(await t.economy.getBalance(RYAN)).toBe(before - 900 + out.payout);
    expect(isDomainError(await t.poker.skinsPlay('normal').catch((e) => e), 'CAREER_RULE')).toBe(true);
    expect(isDomainError(await t.poker.skinsStart().catch((e) => e), 'CAREER_RULE')).toBe(true); // same week
    const keys = (await t.db.ledger.toArray()).filter((e) => e.idempotencyKey.startsWith('skins:'));
    expect(keys.filter((e) => e.idempotencyKey.endsWith(':buy'))).toHaveLength(1);
    expect(keys.filter((e) => e.idempotencyKey.endsWith(':pay')).length).toBeLessThanOrEqual(1);
  });
});
