import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { storyOf, appearanceOf } from '../src/story/appearance';
import { ACT_TWO } from '../src/story/actTwo';
import { ENCOUNTERS, localizeEncounter, nextEncounter } from '../src/story/encounters';
import { HAIR_OF_PHASE, phaseOf, phaseOfAct, ryanSay } from '../src/story/phase';
import { BABA_LOAN_LINES } from '../src/story/babaLoan';
import { setCareer } from './careerHelpers';
import { newCareer } from './helpers';

const allText = (d: (typeof ENCOUNTERS)[number]) => [
  d.title, d.teaser,
  ...Object.values(d.nodes).flatMap((n) => [...n.lines.map((l) => l.text), ...('choice' in n ? [n.choice.prompt, ...n.choice.options.flatMap((o) => [o.label, o.hint])] : [])]),
  ...Object.values(d.outcomes).flatMap((o) => [o.summary, o.changes]),
];

describe('phases and the words for Ryan', () => {
  it('Acts map to phases; each phase has its approved look', () => {
    expect([1, 2, 3, 4].map((a) => phaseOfAct(a as 1 | 2 | 3 | 4))).toEqual([1, 2, 3, 3]);
    expect(HAIR_OF_PHASE).toEqual({ 1: 'curly', 2: 'bald', 3: 'wig' });
  });

  it('fills pronouns and Baba’s pet name for the phase, keeping capitals', () => {
    const t = '{He} grabbed {his} putter. {Habibi}, fifty from three feet, said Baba to {him}.';
    expect(ryanSay(1, t)).toBe('He grabbed his putter. Habibi, fifty from three feet, said Baba to him.');
    expect(ryanSay(2, t)).toBe(ryanSay(1, t));
    expect(ryanSay(3, t)).toBe('She grabbed her putter. Habibti, fifty from three feet, said Baba to her.');
  });

  it('no story text hard-codes Baba’s pet name, and every token is filled in every phase', () => {
    const texts = [...ENCOUNTERS.flatMap(allText), ...BABA_LOAN_LINES.call];
    for (const x of texts) expect(x, x).not.toMatch(/(?<!\{)habibt?i/i);
    for (const d of ENCOUNTERS) for (const p of [1, 2, 3] as const) for (const x of allText(localizeEncounter(d, p))) expect(x, x).not.toMatch(/\{\w+\}/);
  });
});

describe('Act II: The Grind', () => {
  it('opens once the first Q-School is over, and not before', async () => {
    const { s } = await newCareer();
    let c = await s.career.getCareer();
    expect(nextEncounter(c, storyOf(c))?.id).not.toBe('act2_motel_six_iron');
    await setCareer(s, (x) => { x.qschool = { ...x.qschool, result: 'failed', nextStage: null }; });
    c = await s.career.getCareer();
    // Biff's Act I scenes come first when they're due; with none due, Marty arrives.
    const due = ENCOUNTERS.filter((e) => !storyOf(c).encounters[e.id] && e.act <= 1 && e.when(c, storyOf(c))).map((e) => e.id);
    expect(due).toContain('act2_motel_six_iron');
  });

  it('every ending of the opener moves the story to Act II and unlocks the bald look, without changing it', async () => {
    for (const path of [['sign'], ['solo'], ['doug']]) {
      const { s } = await newCareer();
      await setCareer(s, (x) => {
        x.qschool = { ...x.qschool, result: 'epson', nextStage: null };
        x.story = { ...storyOf(x), available: 'act2_motel_six_iron' };
      });
      await s.career.resolveEncounter('act2_motel_six_iron', path);
      const c = await s.career.getCareer();
      expect(storyOf(c).act).toBe(2);
      expect(phaseOf(c)).toBe(2);
      expect(storyOf(c).hairUnlocked).toEqual(['curly', 'bald']);
      expect(appearanceOf(c).hair).toBe('curly');
      expect(c.inbox[0].body).toMatch(/Act II begins/);
    }
  });

  it('the Act II scenes follow in order, a few weeks apart', () => {
    const order = ACT_TWO.map((d) => d.id);
    expect(order).toEqual(['act2_motel_six_iron', 'act2_the_sponsor', 'act2_rain_delay', 'act2_monday_goose', 'act2_sunday_dinner', 'act2_helicopter_dinner']);
    for (const d of ACT_TWO.slice(1)) expect(d.act).toBe(2);
    // Two characters on stage take turns opposite Ryan; both have art (checked in story.test.ts).
    expect(ACT_TWO.find((d) => d.id === 'act2_helicopter_dinner')!.cast).toEqual(['kayla_brooks', 'biff_fairway']);
  });
});
