/** Act IV finale: between-rounds scenes (Baba at the Major, Reading the Green) and Championship Sunday. */
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { encounterBlocker, offerStoryNow } from '../src/career/engine';
import { findTournament, seasonSchedule } from '../src/career/tournament';
import type { ActiveTournament, CareerState } from '../src/career/types';
import { localizeEncounter, encounterById } from '../src/story/encounters';
import { newCareer } from './helpers';

async function act4(): Promise<CareerState> {
  const { s } = await newCareer();
  const c = await s.career.getCareer();
  return {
    ...c, tourCard: 'lpga',
    story: { act: 4, hairUnlocked: ['curly', 'bald', 'wig'], available: null, bonds: {}, encounters: { act4_big_leagues: { outcome: 'short', path: ['short'], season: c.season, week: 1, at: '' } } },
  } as CareerState;
}
const lpga = (c: CareerState, name: string) => seasonSchedule(c.season).find((t) => t.tour === 'lpga' && t.name === name)!;
const playing = (c: CareerState, name: string, round: number): CareerState => ({ ...c, active: { tournamentId: lpga(c, name).id, round, alive: [c.playerId] } as unknown as ActiveTournament });

describe('between-rounds scenes', () => {
  it('Baba at the Major: Saturday at the National Open, playable only while the tournament is on', async () => {
    const c = await act4();
    expect(offerStoryNow(playing(c, 'National Open Championship', 1)).story!.available).toBeNull();
    const sat = offerStoryNow(playing(c, 'National Open Championship', 2));
    expect(sat.story!.available).toBe('act4_baba_at_the_major');
    expect(encounterBlocker(sat, 'act4_baba_at_the_major', ['hug'], 0)).toBeNull();
    // Missed it: the tournament ended, the moment has passed and the offer goes away.
    const after = { ...sat, active: null };
    expect(encounterBlocker(after, 'act4_baba_at_the_major', ['hug'], 0)).toBe('That moment has passed');
    expect(offerStoryNow(after).story!.available).not.toBe('act4_baba_at_the_major');
  });
  it('Reading the Green: the night before the final round of the Tour Championship', async () => {
    const c = await act4();
    const rounds = findTournament(lpga(c, 'Tour Championship').id)!.rounds;
    expect(offerStoryNow(playing(c, 'Tour Championship', rounds - 1)).story!.available).toBe('act4_reading_the_green');
    expect(offerStoryNow(playing(c, 'Tour Championship', rounds - 2)).story!.available).toBeNull();
  });
  it('a waiting week scene never blocks the tournament flow', async () => {
    const c = await act4();
    const waiting = { ...c, story: { ...c.story!, available: 'act4_corkboard' } };
    expect(encounterBlocker(playing(waiting, 'Tour Championship', 1), 'act4_corkboard', [], 0)).toBe('Finish the tournament first');
  });
});

describe('Championship Sunday', () => {
  const finished = (c: CareerState, pos: string): CareerState => ({ ...c, active: null, recent: [{ tournamentId: lpga(c, 'Tour Championship').id, name: 'Tour Championship', tour: 'lpga', posLabel: pos, toPar: -8, prize: 1, season: c.season, week: 28 }, ...c.recent] });
  it('a win opens the can; a loss keeps it on the shelf for next year', async () => {
    const c = await act4();
    expect(offerStoryNow(finished(c, '1')).story!.available).toBe('act4_championship_sunday');
    expect(offerStoryNow(finished(c, 'T4')).story!.available).toBe('act4_championship_sunday_next_year');
    // Lost one year: next year's win still gets the can.
    const later = finished({ ...c, story: { ...c.story!, encounters: { ...c.story!.encounters, act4_championship_sunday_next_year: { outcome: 'next_year', path: [], season: c.season, week: 28, at: '' } } } }, '1');
    expect(offerStoryNow(later).story!.available).toBe('act4_championship_sunday');
  });
  it('Ryan is she/her and Baba says habibti in every finale line', () => {
    for (const id of ['act4_baba_at_the_major', 'act4_reading_the_green', 'act4_championship_sunday', 'act4_championship_sunday_next_year']) {
      const def = localizeEncounter(encounterById(id)!, 3);
      const text = Object.values(def.nodes).flatMap((n) => n.lines.map((l) => l.text)).join(' ');
      expect(text).not.toMatch(/[{}]/);
      expect(text).not.toMatch(/habibi\b/i);
    }
  });
});

describe('Rytirement', () => {
  it('only after the story; locks the record and the casino all-time; the muni opens', async () => {
    const { s } = await newCareer();
    await expect(s.career.rytire()).rejects.toThrow();
    const c0 = await s.career.getCareer();
    await s.db.careers.put({ ...c0, flags: { ...c0.flags, storyComplete: 'won', casinoWagered: 1000, casinoReturned: 1500 } });
    await expect(s.career.recordMuniRound([4, 3, 5])).rejects.toThrow();
    await s.career.rytire();
    const c = await s.career.getCareer();
    const { isRytired, rytiredRecord, recordCasino, casinoNet, entryBlocker } = await import('../src/career/engine');
    expect(isRytired(c)).toBe(true);
    expect(rytiredRecord(c)!.casinoNet).toBe(500);
    await expect(s.career.rytire()).rejects.toThrow();
    // Casino play still works but the all-time doesn't move.
    const after = recordCasino(c, 200, 0);
    expect(casinoNet(after)).toBe(500);
    expect(after.flags.rytiredWagered).toBe(200);
    // The tour is closed.
    const def = seasonSchedule(c.season)[0];
    expect(entryBlocker(c, def, 1e9)).toMatch(/Rytired/);
    // Muni rounds are kept for fun only.
    await s.career.recordMuniRound([4, 3, 5, 4, 4, 3, 4, 5, 4]);
    await s.career.recordMuniRound([5, 3, 5, 4, 4, 3, 4, 5, 4]);
    const m = await s.career.getCareer();
    expect(m.flags.muniRounds).toBe(2);
    expect(m.flags.muniBest9).toBe(36);
    expect(m.totals).toEqual(c.totals);
  });
});

describe('running gags and remembered choices', () => {
  it("Kayla's Sunday line follows what she and Ryan became", async () => {
    const def = encounterById('act4_championship_sunday')!;
    const kayla = (flags: Record<string, unknown>) => localizeEncounter(def, 3, flags).nodes.start.lines.filter((l) => l.who === 'kayla_brooks').map((l) => l.text);
    expect(kayla({ kayla: 'dinner' })).toEqual([expect.stringMatching(/Dinner’s at eight/)]);
    expect(kayla({ kayla: 'rivals' })).toEqual([expect.stringMatching(/First tee/)]);
    expect(kayla({ kayla: 'friends' })).toEqual([expect.stringMatching(/Best friend rules/)]);
    expect(kayla({})).toHaveLength(1);
  });
  it('the watch party, the spare straw, the ball-mark tally and Lake Ryan are in', () => {
    const text = (id: string) => Object.values(encounterById(id)!.nodes).flatMap((n) => n.lines.map((l) => l.text)).join(' ');
    expect(text('act4_championship_sunday')).toMatch(/watch party/);
    expect(text('act4_championship_sunday')).toMatch(/For emergencies/);
    expect(text('act4_championship_sunday')).toMatch(/ball marks/);
    expect(text('act4_championship_sunday_next_year')).toMatch(/FORE NEXT YEAR/);
    expect(text('act4_lake_ryan')).toMatch(/LAKE RYAN/);
  });
});
