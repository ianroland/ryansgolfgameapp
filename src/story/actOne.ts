/**
 * Act I (phase 1, he/him) scenes beyond Biff's two, added in 1.0.3 so the amateur and mini-tour
 * seasons aren't silent (the playthrough bot found 2–3 seasons with only Biff's scenes).
 * They seed two running gags early: carts in ponds, and Kayla out-practising Ryan.
 * Pronouns about Ryan go through the helper tokens even though Act I is always phase 1.
 */
import type { CareerState } from '../career/types';
import type { EncounterDef } from './encounters';
import type { StoryState } from './types';

const SEASON = 30;
const since = (c: CareerState, s: StoryState, id: string) => {
  const r = s.encounters[id];
  return r ? (c.season - r.season) * SEASON + (c.week - r.week) : Infinity;
};
/** Weeks since the most recent Act I scene. */
const quietFor = (c: CareerState, s: StoryState) =>
  Math.min(...['gold_plated_driver', 'gold_plated_putter', 'act1_cart_barn', 'act1_six_am_range'].map((id) => since(c, s, id)));

export const ACT_ONE: EncounterDef[] = [
  {
    id: 'act1_cart_barn',
    title: 'The Cart Barn',
    teaser: 'Ryan’s shift at the muni cart barn. Biff wants the cart with the most horsepower.',
    act: 1,
    location: 'driving_range',
    cast: ['biff_fairway', 'baba'],
    when: (c, s) => s.act === 1 && (c.season > 1 || c.week >= 16) && quietFor(c, s) >= 5,
    start: 'start',
    nodes: {
      start: {
        lines: [
          { who: 'narrator', text: 'Saturday. The Dry Creek Muni cart barn. Ryan is on shift: keys, scorecards, the little pencils.' },
          { who: 'biff_fairway', expr: 'confident', pose: 'talk', text: 'Muni kid. I’ll take your fastest cart. The one with the most horsepower.' },
          { who: 'ryan', expr: 'neutral', pose: 'talk', text: 'They’re golf carts, Biff. They all go eleven miles an hour.' },
          { who: 'biff_fairway', expr: 'confident', pose: 'emphatic', text: 'Then give me the one that goes eleven the hardest.' },
          { who: 'baba', expr: 'neutral', pose: 'talk', text: 'Give him number nine. Number nine pulls left.' },
        ],
        choice: {
          prompt: 'Which cart does Biff get?',
          options: [
            { id: 'nine', label: 'Cart number nine', hint: 'Baba ♥', next: 'nine' },
            { id: 'best', label: 'The good cart', hint: '+$40 tip', next: 'best' },
          ],
        },
      },
      nine: {
        lines: [
          { who: 'narrator', text: 'Biff floors cart number nine. It pulls left. Gently, majestically, it rolls into the pond on two.' },
          { who: 'biff_fairway', expr: 'surprised', pose: 'talk', text: 'I meant to do that. I’m testing the waterproofing. For my sponsor.' },
          { who: 'baba', expr: 'neutral', pose: 'think', text: 'First one this year. Usually it takes until June.' },
        ],
        outcome: 'nine',
      },
      best: {
        lines: [
          { who: 'narrator', text: 'Biff gets the good cart and tips forty dollars in a gold money clip he asks for back.' },
          { who: 'biff_fairway', expr: 'happy', pose: 'talk', text: 'The clip is a family heirloom. The money is a lesson. Learn from it.' },
          { who: 'narrator', text: 'On the 2nd hole Biff parks the good cart in the pond anyway.' },
        ],
        outcome: 'best',
      },
    },
    outcomes: {
      nine: { summary: 'Gave Biff cart number nine. It pulls left. Into the pond.', tone: 'good', effects: { rel: { mom: 3 }, form: 1 }, bonds: { baba: 5 }, changes: 'Baba ♥ · Form +1' },
      best: { summary: 'Gave Biff the good cart. He tipped $40, kept the clip, and found the pond anyway.', tone: 'good', effects: { money: 40 }, changes: '+$40' },
    },
  },
  {
    id: 'act1_six_am_range',
    title: 'Six A.M. at the Range',
    teaser: 'Ryan gets to the range at six. Somebody is already there.',
    act: 1,
    location: 'driving_range',
    cast: ['kayla_brooks'],
    when: (c, s) => s.act === 1 && c.season > 1 && c.week >= 8 && !!s.encounters.act1_cart_barn && quietFor(c, s) >= 5,
    start: 'start',
    nodes: {
      start: {
        lines: [
          { who: 'narrator', text: '6:00 a.m. The muni range. Ryan is always first. Ryan is not first.' },
          { who: 'kayla_brooks', expr: 'confident', pose: 'talk', text: 'You’re late. I’ve hit two buckets and judged your car.' },
          { who: 'ryan', expr: 'surprised', pose: 'talk', text: 'It’s six o’clock.' },
          { who: 'kayla_brooks', expr: 'confident', pose: 'emphatic', text: 'Exactly. Late. Ten-footers, loser buys breakfast burritos?' },
        ],
        choice: {
          prompt: 'Kayla is already lining up a putt.',
          options: [
            { id: 'putt', label: '“You’re on.”', hint: 'Putting challenge', next: 'putt' },
            { id: 'watch', label: 'Watch her stroke for a while', hint: 'Putting practice, Kayla ♥', next: 'watch' },
          ],
        },
      },
      putt: {
        lines: [{ who: 'narrator', text: 'One ten-footer each. A sprinkler head ticks somewhere. A crow lands to watch.' }],
        challenge: { kind: 'putt', opponent: 'kayla_brooks' },
        win: 'won',
        lose: 'lost',
      },
      won: {
        lines: [
          { who: 'kayla_brooks', expr: 'surprised', pose: 'talk', text: 'Fine. FINE. Burritos are on me. I’m getting you the small one.' },
          { who: 'narrator', text: 'She gets {him} the large one. Neither of them mentions it.' },
        ],
        outcome: 'won',
      },
      lost: {
        lines: [
          { who: 'kayla_brooks', expr: 'laughing', pose: 'celebrate', text: 'Extra guac. And I want it in writing that I out-practised you.' },
          { who: 'ryan', expr: 'laughing', pose: 'talk', text: 'You out-practised me. Happy?' },
          { who: 'kayla_brooks', expr: 'happy', pose: 'talk', text: 'Ask me again tomorrow. Six. Don’t be late.' },
        ],
        outcome: 'lost',
      },
      watch: {
        lines: [
          { who: 'narrator', text: 'Ryan watches. Her stroke is a metronome. She waggles twice, never three times.' },
          { who: 'kayla_brooks', expr: 'neutral', pose: 'talk', text: 'Take a picture, it lasts longer. Actually don’t. Steal it with your eyes like a normal person.' },
        ],
        outcome: 'watch',
      },
    },
    outcomes: {
      won: { summary: 'Beat Kayla at ten-footers at 6 a.m. She bought the large burrito.', tone: 'good', effects: { form: 2, rel: { rival: 3 } }, bonds: { kayla_brooks: 6 }, changes: 'Form +2 · Kayla ♥' },
      lost: { summary: 'Kayla won the ten-footers and the argument about who out-practises whom.', tone: 'neutral', effects: { stats: { putting: 0.3 }, rel: { rival: 4 } }, bonds: { kayla_brooks: 8 }, changes: 'Putting +0.3 · Kayla ♥' },
      watch: { summary: 'Studied Kayla’s putting stroke at 6 a.m. Two waggles, never three.', tone: 'good', effects: { stats: { putting: 0.5 }, rel: { rival: 2 } }, bonds: { kayla_brooks: 5 }, changes: 'Putting +0.5 · Kayla ♥' },
    },
  },
];
