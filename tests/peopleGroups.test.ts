import { describe, expect, it } from 'vitest';
import { casinoRegulars, casinoStaff, courseChallengers, familiarity } from '../src/ui/career/peopleGroups';
import { freshNpcState } from '../src/npc/relationship';
import { newCareerState } from '../src/career/engine';
import { buildPools, FIRST_NAMES, RIVAL } from '../src/career/field';
import { crapsRollsKey } from '../src/services/casinoService';
import type { StoryState } from '../src/story/types';

const story = (encounters: StoryState['encounters'], bonds: Record<string, number> = {}): StoryState => ({ act: 1, hairUnlocked: [], encounters, available: null, bonds });
const at = { season: 1, week: 4, day: 1, slot: 0 } as never;

describe('People: on the course', () => {
  it('lists only cast members Ryan has met, with challenge wins and losses', () => {
    expect(courseChallengers(story({}))).toEqual([]);
    const s = story(
      {
        gold_plated_driver: { outcome: 'won_bet', path: ['bet', 'win'], season: 1, week: 4, at },
        gold_plated_putter: { outcome: 'lost_putt', path: ['putt', 'lose'], season: 1, week: 9, at },
      },
      { biff_fairway: 62 },
    );
    const [biff, ...rest] = courseChallengers(s);
    expect(rest).toEqual([]);
    expect(biff).toMatchObject({ id: 'biff_fairway', bond: 62, meetings: 2, wins: 1, losses: 1 });
    expect(biff.last).toMatch(/coffee mug/);
  });

  it('a run-in without a challenge counts as a meeting, not a result', () => {
    const [biff] = courseChallengers(story({ gold_plated_driver: { outcome: 'walked_away', path: ['walk'], season: 1, week: 4, at } }));
    expect(biff).toMatchObject({ meetings: 1, wins: 0, losses: 0 });
  });
});

describe('People: casino staff and regulars', () => {
  it('shows staff only once Ryan has met them', () => {
    const met = { ...freshNpcState('velvet_vega'), visits: 2 };
    const rows = casinoStaff([freshNpcState('stick_lady'), met]);
    expect(rows.map((r) => r.id)).toEqual(['velvet_vega']);
    expect(rows[0]).toMatchObject({ job: 'Blackjack dealer', where: 'Desert Palms', visits: 2, tier: 'Acquaintance' });
  });

  it("regulars appear once Ryan rolls at their casino's table", () => {
    const c = newCareerState(5);
    expect(casinoRegulars(c)).toEqual([]);
    c.flags[crapsRollsKey('white_buffalo')] = 31;
    const rows = casinoRegulars(c);
    expect(rows.map((r) => r.where)).toEqual(['The White Buffalo', 'The White Buffalo', 'The White Buffalo']);
    expect(rows[0]).toMatchObject({ rolls: 31, label: 'Nodding terms' });
  });

  it('familiarity labels by rolls', () => {
    expect([0, 1, 29, 30, 150, 500].map(familiarity)).toEqual([null, 'New face', 'New face', 'Nodding terms', 'Table regular', 'Rail family']);
  });
});

describe("Act I men's fields: surnames", () => {
  it('no man on any tour has the feminine surname form', () => {
    const women = new Set<string>(FIRST_NAMES.women);
    for (const seed of [1, 7, 2027, 99]) {
      for (const g of Object.values(buildPools(seed)).flat()) {
        if (g.id === RIVAL.id || women.has(g.name.split(' ')[0])) continue;
        expect(g.name, g.name).not.toMatch(/ Petrova$/);
      }
    }
  });
});
