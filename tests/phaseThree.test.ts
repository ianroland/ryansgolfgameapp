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

describe('Act III: The Rookie', () => {
  it('the scenes follow in order and all play in Act III', async () => {
    const { ACT_THREE } = await import('../src/story/actThree');
    expect(ACT_THREE.map((d) => d.id)).toEqual(['act3_fresh_start', 'act3_biff_ally', 'act3_qschool_doug', 'act3_have_we_met', 'act3_not_for_the_public', 'act3_butter_classic', 'act3_the_card']);
    for (const d of ACT_THREE) expect(d.act).toBe(3);
  });

  it('Act III opens a week after The Next Chapter, with Baba retired and on tour', async () => {
    const { s } = await toActThree();
    const { nextEncounter } = await import('../src/story/encounters');
    let c = await s.career.getCareer();
    expect(nextEncounter(c, storyOf(c))?.id).not.toBe('act3_fresh_start');
    await setCareer(s, (x) => { x.week += 1; });
    c = await s.career.getCareer();
    expect(nextEncounter(c, storyOf(c))?.id).toBe('act3_fresh_start');
  });

  it('earning the LPGA Tour card on the new ladder brings The Card, which opens Act IV', async () => {
    const { s } = await toActThree();
    const { nextEncounter } = await import('../src/story/encounters');
    await setCareer(s, (x) => {
      x.week += 2;
      x.qschool = { ...x.qschool, result: 'lpga', nextStage: null };
      // every earlier Act III scene already played
      const st = storyOf(x);
      const done = { outcome: 'x', path: [], season: x.season, week: 1, at: { season: x.season, week: 1, day: 1, slot: 0 } } as never;
      x.story = { ...st, encounters: { ...st.encounters, act3_fresh_start: done, act3_biff_ally: done, act3_qschool_doug: done, act3_have_we_met: done, act3_not_for_the_public: done, act3_butter_classic: done } };
    });
    let c = await s.career.getCareer();
    expect(nextEncounter(c, storyOf(c))?.id).toBe('act3_the_card');
    await setCareer(s, (x) => { x.story = { ...storyOf(x), available: 'act3_the_card' }; });
    await s.career.resolveEncounter('act3_the_card', ['pro']);
    c = await s.career.getCareer();
    expect(storyOf(c).act).toBe(4);
    expect(phaseOf(c)).toBe(3);
    expect(ladderOf(c)).toBe('lpga');
  });
});

describe('Act IV: The Major', () => {
  it('the shippable scenes play in order on the LPGA Tour', async () => {
    const { ACT_FOUR } = await import('../src/story/actFour');
    expect(ACT_FOUR.map((d) => d.id)).toEqual(['act4_big_leagues', 'act4_corkboard', 'act4_desert_rose', 'act4_kayla_knows']);
    for (const d of ACT_FOUR) expect(d.act).toBe(4);
  });

  it('Kayla Knows records what they become', async () => {
    const { s } = await toActThree();
    await setCareer(s, (x) => {
      x.tourCard = 'lpga';
      x.story = { ...storyOf(x), act: 4, available: 'act4_kayla_knows' };
    });
    await s.career.resolveEncounter('act4_kayla_knows', ['dinner']);
    const c = await s.career.getCareer();
    expect(c.flags.kayla).toBe('dinner');
    expect(storyOf(c).bonds.kayla_brooks).toBeGreaterThan(60);
  });
});
