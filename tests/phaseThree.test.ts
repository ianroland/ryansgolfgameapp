import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { appearanceOf, storyOf } from '../src/story/appearance';
import { phaseOf } from '../src/story/phase';
import { ladderAt, ladderOf, ladderSay, tourName } from '../src/career/ladder';
import { FIRST_NAMES, isMensTour, reconcileFieldPools, RIVAL } from '../src/career/field';
import { trophyLook } from '../src/catalog/trophies';
import type { CareerState } from '../src/career/types';
import { setCareer } from './careerHelpers';
import { newCareer } from './helpers';

async function toActThree() {
  const { s } = await newCareer();
  await setCareer(s, (x) => {
    x.status = 'pro';
    x.tourCard = 'epson';
    x.week = 10;
    x.seasonEarnings = { ...x.seasonEarnings, [`epson:${x.playerId}`]: 12_000, 'mini:someone': 500 };
    x.story = { ...storyOf(x), act: 2, hairUnlocked: ['curly', 'bald'], available: 'act2_the_next_chapter' };
  });
  const before = await s.career.getCareer();
  await s.career.resolveEncounter('act2_the_next_chapter', []);
  return { s, before, c: await s.career.getCareer() };
}

const ladderIds = (c: CareerState) => (['qschool', 'epson', 'lpga'] as const).flatMap((t) => c.pools[t].map((g) => g.id));

describe('phase 3: The Next Chapter opens Act III and the LPGA ladder', () => {
  it('moves to Act III, she/her, the phase 3 look', async () => {
    const { c } = await toActThree();
    expect(storyOf(c).act).toBe(3);
    expect(phaseOf(c)).toBe(3);
    expect(storyOf(c).hairUnlocked).toContain('wig');
    expect(appearanceOf(c)).toEqual({ hair: 'wig', hat: true });
    expect(c.inbox.some((m) => m.title === 'The LPGA ladder')).toBe(true);
  });

  it('Ryan starts over at LPGA Q-School; the ladder names change, earlier results keep theirs', async () => {
    const { c } = await toActThree();
    expect(c.tourCard).toBe('none');
    expect(c.qschool).toMatchObject({ season: c.season, nextStage: 1, result: null });
    expect(ladderOf(c)).toBe('lpga');
    expect(['qschool', 'epson', 'lpga'].map((t) => tourName(t as 'lpga', ladderOf(c)))).toEqual(['LPGA Q-School', 'Epson Tour', 'LPGA Tour']);
    expect(ladderSay(ladderOf(c), 'Road to the {Top}')).toBe('Road to the LPGA Tour');
    expect(ladderAt(c, c.season, c.week - 1)).toBe('pga');
    expect(ladderAt(c, c.season, c.week)).toBe('lpga');
  });

  it("the ladder becomes women's fields with Kayla in them; amateur and mini stay as they were", async () => {
    const { before, c } = await toActThree();
    const women = new Set<string>(FIRST_NAMES.women);
    for (const t of ['qschool', 'epson', 'lpga'] as const) {
      expect(isMensTour(t, 3)).toBe(false);
      expect(c.pools[t].length).toBeGreaterThan(10);
      for (const g of c.pools[t]) if (g.id !== RIVAL.id) {
        expect(g.id.startsWith('w3_'), g.id).toBe(true);
        expect(women.has(g.name.split(' ')[0]), g.name).toBe(true);
      }
    }
    expect(ladderIds(c)).toContain(RIVAL.id);
    expect(new Set(ladderIds(c)).size).toBe(ladderIds(c).length);
    expect(c.pools.amateur).toEqual(before.pools.amateur);
    expect(c.pools.mini).toEqual(before.pools.mini);
    expect(isMensTour('mini', 3)).toBe(true);
  });

  it('season ladder money lists start fresh; the all-time list trades the PGA ladder for the new golfers', async () => {
    const { before, c } = await toActThree();
    expect(Object.keys(c.seasonEarnings).some((k) => /^(qschool|epson|lpga):/.test(k))).toBe(false);
    expect(c.seasonEarnings['mini:someone']).toBe(500);
    const old = ladderIds(before).filter((id) => id !== RIVAL.id);
    for (const id of old) expect(c.careerMoney?.[id]).toBeUndefined();
    expect(Object.keys(c.careerMoney ?? {}).some((id) => id.startsWith('w3_'))).toBe(true);
  });

  it("loading a phase 3 save keeps the women's names (the pool tidy-up knows the phase)", async () => {
    const { c } = await toActThree();
    expect(reconcileFieldPools(c.pools, Number(c.flags.seed ?? 0), 'current', 3)).toBeNull();
  });

  it('ladder trophies are named for the ladder they were won on', () => {
    const base = { trophyDefinitionId: 'lpga_win' as const, sourceTournamentId: 'lpga-2-w9', eventName: 'Lakeside Classic', courseName: 'Lakeside' };
    expect(trophyLook({ ...base, tourName: 'PGA Tour' }).name).toBe('PGA Tour Winner');
    expect(trophyLook({ ...base, tourName: 'LPGA Tour' }).name).toBe('LPGA Tour Winner');
    expect(trophyLook({ ...base, trophyDefinitionId: 'qschool_card', tourName: 'LPGA Q-School' }).name).toBe('LPGA Tour Card');
  });
});
