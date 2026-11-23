import { describe, expect, it } from 'vitest';
import { checksum } from '../src/core/checksum';
import { activeCourse, completeRound, finalizeTournament, findTournament, parsOf, startTournament, type TournamentResult } from '../src/career/tournament';
import * as E from '../src/career/engine';
import type { CareerState } from '../src/career/types';
import { trophyInstanceId } from '../src/catalog/trophies';
import { isDomainError } from '../src/core/errors';
import { buildTournamentEvent } from '../src/services/tournamentPipeline';
import { evaluateTrophy } from '../src/services/trophyAwardService';
import { buyCabinet, newCareer, PAD, RYAN } from './helpers';
import { playTournament, setCareer } from './careerHelpers';

const T = (tid: string) => trophyInstanceId(RYAN, tid);

/** Pure result where Ryan makes `score(par)` on every hole. */
function result(id: string, patch: (c: CareerState) => void = () => {}, score = (p: number) => Math.max(1, p - 2)): TournamentResult {
  const c = E.newCareerState(3);
  patch(c);
  const def = findTournament(id)!;
  let a = startTournament(def, c, 'full');
  while (a.round < def.rounds) {
    a.playerHoles = parsOf(activeCourse(a)).map((p) => score(p));
    a = completeRound(a, def, c);
  }
  return finalizeTournament(a, def, c.playerId);
}

function reseal(r: TournamentResult, mutate: (x: TournamentResult) => void): TournamentResult {
  const x = structuredClone(r);
  mutate(x);
  const { authority, ...content } = x;
  x.authority = { ...authority, checksum: checksum(content) };
  return x;
}

const pro = (c: CareerState) => { c.status = 'pro'; };

describe('trophy rules', () => {
  it('each tour win earns its own trophy; majors and the State Amateur are special', () => {
    expect(evaluateTrophy(result('amateur-1-w2'), RYAN)).toBe('amateur_win');
    expect(evaluateTrophy(result('amateur-1-w22'), RYAN)).toBe('state_amateur');
    expect(evaluateTrophy(result('mini-1-w3', pro), RYAN)).toBe('pro_series_win');
    expect(evaluateTrophy(result('epson-1-w2', (c) => { pro(c); c.tourCard = 'epson'; }), RYAN)).toBe('epson_win');
    expect(evaluateTrophy(result('lpga-1-w2', (c) => { pro(c); c.tourCard = 'lpga'; }), RYAN)).toBe('lpga_win');
    expect(evaluateTrophy(result('lpga-1-w6', (c) => { pro(c); c.tourCard = 'lpga'; }), RYAN)).toBe('major_win');
  });

  it('Q-Series top 20 earns the Tour Card plaque; earlier stages earn nothing', () => {
    expect(evaluateTrophy(result('qschool-1-s3', pro), RYAN)).toBe('qschool_card');
    expect(evaluateTrophy(result('qschool-1-s1', pro), RYAN)).toBeNull();
  });

  it('no trophy for losing, missing the cut, or a tie for first', () => {
    expect(evaluateTrophy(result('amateur-1-w2', () => {}, (p) => p + 3), RYAN)).toBeNull();
    const lpga = result('lpga-1-w2', (c) => { pro(c); c.tourCard = 'lpga'; }, (p) => p + 4);
    expect(lpga.standings.find((s) => s.id === RYAN)?.madeCut).toBe(false);
    expect(evaluateTrophy(lpga, RYAN)).toBeNull();
    const won = result('amateur-1-w5');
    const tie = structuredClone(won);
    tie.standings[1] = { ...tie.standings[1], position: 1, posLabel: 'T1' };
    tie.standings[0] = { ...tie.standings[0], posLabel: 'T1' };
    expect(evaluateTrophy(tie, RYAN)).toBeNull();
  });
});

describe('tournament pipeline', () => {
  it('a win records the tournament, pays prize money, awards one trophy, then notifies', async () => {
    const { s } = await newCareer();
    const seen: string[] = [];
    s.notifier.subscribe((n) => seen.push(n.kind));
    const out = await playTournament(s, 'mini-1-w3', { setup: pro });
    expect(out.outcome).toMatchObject({ status: 'applied', awardedTrophyIds: [T('mini-1-w3')] });
    const t = await s.db.trophies.get(T('mini-1-w3'));
    expect(t).toMatchObject({ trophyDefinitionId: 'pro_series_win', eventName: 'Pro Series · Riverside', courseName: 'Lakeside Pines CC', finish: { position: 1 } });
    expect(t!.prize).toBeGreaterThan(0);
    expect(seen).toEqual(expect.arrayContaining(['payout', 'trophy']));
    expect((await s.db.profiles.get(RYAN))?.careerClock).toBe(out.result!.finalizedAt);
  });

  it('reprocessing the same event is a no-op; a second event for the same tournament is refused', async () => {
    const { s } = await newCareer();
    const out = await playTournament(s, 'mini-1-w3', { setup: pro });
    const balance = await s.economy.getBalance(RYAN);
    const event = buildTournamentEvent(out.result!);
    expect((await s.pipeline.process(event)).status).toBe('duplicate');
    const other = await s.pipeline.process({ ...event, id: 'evt:sneaky' });
    expect(other).toMatchObject({ status: 'rejected', reason: /already recorded/ });
    expect(await s.economy.getBalance(RYAN)).toBe(balance);
    expect(await s.db.trophies.count()).toBe(1);
    expect((await s.career.getCareer()).totals.events).toBe(1);
  });

  describe('no money, record or trophy without an authoritative result', () => {
    const cases: [string, (r: TournamentResult) => unknown][] = [
      ['unsealed edit (checksum mismatch)', (r) => { const x = structuredClone(r); x.standings[0].prize += 1; return buildTournamentEvent(x); }],
      ['resealed bigger prize', (r) => buildTournamentEvent(reseal(r, (x) => { x.standings[0].prize *= 10; }))],
      ['resealed fake purse', (r) => buildTournamentEvent(reseal(r, (x) => { x.def.purse = 99_000_000; }))],
      ['resealed better scores', (r) => buildTournamentEvent(reseal(r, (x) => { x.scores[RYAN][0][0] = 1; }))],
      ['not from the engine', (r) => buildTournamentEvent(reseal(r, (x) => { (x.authority as { source: string }).source = 'player'; }))],
      ['event/result golfer mismatch', (r) => ({ ...buildTournamentEvent(r), golferId: 'golfer_someone' })],
      ['malformed payload', (r) => ({ ...buildTournamentEvent(r), payload: { nope: true } })],
    ];
    for (const [name, make] of cases) {
      it(`rejects: ${name}`, async () => {
        const { s } = await newCareer();
        await setCareer(s, (c) => { pro(c); c.entered = ['mini-1-w3']; });
        const r = result('mini-1-w3', pro);
        const out = await s.pipeline.process(make(r));
        expect(out.status).toBe('rejected');
        expect(await s.db.trophies.count()).toBe(0);
        expect(await s.db.tournaments.count()).toBe(0);
        expect(await s.economy.getBalance(RYAN)).toBe(2500);
      });
    }

    it('rejects a valid result for a tournament Ryan never entered', async () => {
      const { s } = await newCareer();
      const out = await s.pipeline.process(buildTournamentEvent(result('mini-1-w3', pro)));
      expect(out).toMatchObject({ status: 'rejected', reason: /never entered/ });
    });
  });
});

async function careerWithTrophiesAndCabinet() {
  const ctx = await newCareer();
  const { s } = ctx;
  for (const w of [2, 5, 8, 11]) await playTournament(s, `amateur-1-w${w}`);
  const cab = (await buyCabinet(s)).instance;
  await s.room.place(RYAN, PAD, cab.id, 'back_wall');
  return { ...ctx, cab };
}
const [A, B, C, D] = [2, 5, 8, 11].map((w) => T(`amateur-1-w${w}`));

describe('trophy display', () => {
  it('places, rearranges and removes trophies', async () => {
    const { s, cab } = await careerWithTrophiesAndCabinet();
    expect(await s.db.trophies.count()).toBe(4);
    await s.trophyDisplay.display(RYAN, A, cab.id, 0);
    await s.trophyDisplay.display(RYAN, B, cab.id, 1);
    await s.trophyDisplay.display(RYAN, A, cab.id, 2); // move within cabinet
    expect((await s.db.trophyPlacements.get(A))?.slotIndex).toBe(2);
    await s.trophyDisplay.display(RYAN, A, cab.id, 1); // swap with B
    expect((await s.db.trophyPlacements.get(A))?.slotIndex).toBe(1);
    expect((await s.db.trophyPlacements.get(B))?.slotIndex).toBe(2);
    await s.trophyDisplay.remove(RYAN, A);
    expect(await s.db.trophyPlacements.get(A)).toBeUndefined();
    expect(await s.db.trophies.get(A)).toBeDefined();
  });

  it('enforces the oak cabinet capacity of three', async () => {
    const { s, cab } = await careerWithTrophiesAndCabinet();
    await s.trophyDisplay.display(RYAN, A, cab.id, 0);
    await s.trophyDisplay.display(RYAN, B, cab.id, 1);
    await s.trophyDisplay.display(RYAN, C, cab.id, 2);
    const err = await s.trophyDisplay.display(RYAN, D, cab.id, 3).catch((e) => e);
    expect(isDomainError(err, 'SLOT_OUT_OF_RANGE')).toBe(true);
    expect(await s.db.trophyPlacements.where('furnitureInstanceId').equals(cab.id).count()).toBe(3);
  });

  it('a trophy can never occupy two slots, and an occupied slot is refused', async () => {
    const { s, cab } = await careerWithTrophiesAndCabinet();
    await s.trophyDisplay.display(RYAN, A, cab.id, 0);
    await s.trophyDisplay.display(RYAN, A, cab.id, 1);
    expect(await s.db.trophyPlacements.where('trophyInstanceId').equals(A).count()).toBe(1);
    const err = await s.trophyDisplay.display(RYAN, B, cab.id, 1).catch((e) => e);
    expect(isDomainError(err, 'SLOT_OCCUPIED')).toBe(true);
    await Promise.allSettled([s.trophyDisplay.display(RYAN, C, cab.id, 0), s.trophyDisplay.display(RYAN, C, cab.id, 2)]);
    expect(await s.db.trophyPlacements.where('trophyInstanceId').equals(C).count()).toBe(1);
  });

  it('cannot display in an unplaced cabinet or display unearned trophies', async () => {
    const { s, cab } = await careerWithTrophiesAndCabinet();
    let err = await s.trophyDisplay.display(RYAN, `trophy:${RYAN}:fake`, cab.id, 0).catch((e) => e);
    expect(isDomainError(err, 'NOT_OWNED')).toBe(true);
    await s.room.returnToInventory(RYAN, PAD, cab.id);
    err = await s.trophyDisplay.display(RYAN, A, cab.id, 0).catch((e) => e);
    expect(isDomainError(err, 'NOT_PLACED')).toBe(true);
  });

  it('removing or moving the cabinet never loses trophies', async () => {
    const { s, cab } = await careerWithTrophiesAndCabinet();
    await s.trophyDisplay.display(RYAN, A, cab.id, 0);
    await s.trophyDisplay.display(RYAN, C, cab.id, 2);
    await s.room.move(RYAN, PAD, cab.id, 'right_corner');
    expect(await s.db.trophyPlacements.where('furnitureInstanceId').equals(cab.id).count()).toBe(2);
    const res = await s.room.returnToInventory(RYAN, PAD, cab.id);
    expect(res.returnedTrophyIds.sort()).toEqual([A, C].sort());
    expect(await s.db.trophyPlacements.count()).toBe(0);
    expect(await s.db.trophies.count()).toBe(4);
  });
});

describe('trophy history', () => {
  it('comes from the stored tournament record', async () => {
    const { s } = await careerWithTrophiesAndCabinet();
    const h = await s.career.getTrophyHistory(C);
    expect(h.tournament?.id).toBe('amateur-1-w8');
    expect(h.tournament?.scores[RYAN]).toHaveLength(2);
    expect(h.careerEvent?.id).toBe(h.trophy.sourceCareerEventId);
    expect(h.trophy.finish.rounds).toEqual(h.tournament!.standings.find((x) => x.id === RYAN)!.rounds);
  });

  it('missing history is reported as unavailable, not invented', async () => {
    const { s } = await careerWithTrophiesAndCabinet();
    await s.db.tournaments.delete('amateur-1-w8');
    const h = await s.career.getTrophyHistory(C);
    expect(h.tournament).toBeNull();
    expect(h.trophy.eventName).toBe('Desert Springs Amateur');
  });
});
