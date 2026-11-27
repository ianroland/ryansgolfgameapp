/**
 * Vegas Stakes-style encounters: short animated scenes with portraits,
 * dialogue, choices, an optional skill challenge, and real consequences.
 *
 * An encounter is a small graph of nodes. Each node shows some lines, then
 * either offers a choice, runs a challenge (win/lose), moves on, or ends in an
 * outcome. Outcomes carry the consequences. The engine walks the same graph
 * to check the path a player took before applying anything, and records the
 * encounter as completed so a unique encounter never repeats.
 */
import { SEASON_WEEKS } from '../career/config';
import type { Effects } from '../career/stories';
import type { CareerState } from '../career/types';
import type { Act, Expression, Pose, StoryState } from './types';

export interface Line {
  /** 'ryan', a cast id, or 'narrator'. */
  who: string;
  expr?: Expression;
  pose?: Pose;
  text: string;
}

export interface Option {
  id: string;
  label: string;
  /** What it costs or risks, shown under the label. */
  hint: string;
  next: string;
  /** Money Ryan must have to pick this (it's at stake). */
  stake?: number;
}

export interface ChallengeDef {
  kind: 'drive' | 'putt';
  /** Who Ryan is up against (cast id). */
  opponent: string;
}

export type EncounterNode =
  | { lines: Line[]; choice: { prompt: string; options: Option[] } }
  | { lines: Line[]; challenge: ChallengeDef; win: string; lose: string }
  | { lines: Line[]; next: string }
  | { lines: Line[]; outcome: string };

export interface OutcomeDef {
  summary: string;
  tone: 'good' | 'bad' | 'neutral';
  effects: Effects;
  /** Changes to story bonds with cast members (by cast id). */
  bonds?: Record<string, number>;
  /** Shown as a line under the summary: what changed. */
  changes: string;
}

export interface EncounterDef {
  id: string;
  title: string;
  /** One line for the hub card. */
  teaser: string;
  act: Act;
  location: 'driving_range' | 'clubhouse_lounge';
  /** Cast in the scene besides Ryan. The first one stands opposite him. */
  cast: string[];
  /** Eligible to be offered (it's also never offered once completed). */
  when: (c: CareerState, story: StoryState) => boolean;
  start: string;
  nodes: Record<string, EncounterNode>;
  outcomes: Record<string, OutcomeDef>;
}

const weeksSince = (c: CareerState, r: { season: number; week: number }) => (c.season - r.season) * SEASON_WEEKS + (c.week - r.week);

export const ENCOUNTERS: EncounterDef[] = [
  {
    id: 'gold_plated_driver',
    title: 'The Gold-Plated Driver',
    teaser: 'Biff Fairway III is at the range, waving something very shiny at you.',
    act: 1,
    location: 'driving_range',
    cast: ['biff_fairway'],
    when: (c, s) => s.act === 1 && c.totals.events >= 1 && c.week >= 3,
    start: 'start',
    nodes: {
      start: {
        lines: [
          { who: 'narrator', text: 'Saturday at the range. Ryan has a bucket of balls, a plan, and about four minutes of peace.' },
          { who: 'biff_fairway', expr: 'confident', pose: 'talk', text: "Well, well. If it isn't the muni kid. Behold." },
          { who: 'narrator', text: 'Biff Fairway III raises a driver so shiny the range attendant puts on sunglasses.' },
          { who: 'biff_fairway', expr: 'laughing', pose: 'talk', text: 'Twenty-four-karat gold. Forged by monks. Well, a guy named Monk. Same thing.' },
          { who: 'ryan', expr: 'surprised', text: 'Is that... legal?' },
          { who: 'biff_fairway', expr: 'confident', pose: 'confident', text: 'Commissioner Clipboard has a form for it. I filled out the form. In gold ink.' },
          { who: 'biff_fairway', expr: 'happy', pose: 'talk', text: 'Here\'s the deal. Longest drive, one ball each. Two hundred bucks says money beats talent.' },
        ],
        choice: {
          prompt: 'What does Ryan do?',
          options: [
            { id: 'bet', label: 'Take the bet', hint: 'Long-drive challenge for $200', next: 'bet', stake: 200 },
            { id: 'try', label: 'Ask to try the gold driver', hint: 'Biff ♥, maybe a lesson', next: 'try' },
            { id: 'walk', label: 'Walk away and practise', hint: 'Coach ♥, +Energy', next: 'walk' },
          ],
        },
      },
      bet: {
        lines: [
          { who: 'ryan', expr: 'confident', pose: 'talk', text: "You're on. One ball." },
          { who: 'biff_fairway', expr: 'laughing', pose: 'talk', text: "Ha! I'll even go first. That's called sportsmanship. I read about it." },
          { who: 'narrator', text: 'Biff tees up. The gold driver flashes. Somewhere a seagull files a complaint.' },
        ],
        challenge: { kind: 'drive', opponent: 'biff_fairway' },
        win: 'bet_win',
        lose: 'bet_lose',
      },
      bet_win: {
        lines: [
          { who: 'narrator', text: "Ryan's ball lands past Biff's and keeps rolling. A ball-picker cart swerves to avoid it." },
          { who: 'biff_fairway', expr: 'angry', pose: 'disappointed', text: "That's... the wind. There's a wind. I'm calling my club fitter." },
          { who: 'biff_fairway', expr: 'disappointed', text: 'Fine. Two hundred. Do you take gold coins? No? Cash, then.' },
          { who: 'ryan', expr: 'laughing', pose: 'celebrate', text: 'Pleasure doing business, Biff.' },
          { who: 'biff_fairway', expr: 'confident', pose: 'confident', text: "This isn't over, muni kid. Next time I bring the putter." },
        ],
        outcome: 'won_bet',
      },
      bet_lose: {
        lines: [
          { who: 'narrator', text: "Biff's ball disappears into the haze. Somewhere, a monk nods." },
          { who: 'biff_fairway', expr: 'laughing', pose: 'celebrate', text: 'Money! Beats! Talent!' },
          { who: 'ryan', expr: 'disappointed', pose: 'disappointed', text: "...It's the gold. It has to be the gold." },
          { who: 'biff_fairway', expr: 'happy', pose: 'talk', text: "Keep the change. Oh wait, there isn't any. Next week: the putter." },
        ],
        outcome: 'lost_bet',
      },
      try: {
        lines: [
          { who: 'ryan', expr: 'happy', pose: 'talk', text: 'Can I take one swing with it?' },
          { who: 'biff_fairway', expr: 'worried', text: 'Do you have insurance? ...Okay. One swing. Do not breathe on it.' },
          { who: 'narrator', text: 'The driver weighs about as much as a small sedan. Ryan\'s ball curves left, right, and briefly upward.' },
          { who: 'biff_fairway', expr: 'laughing', pose: 'talk', text: 'See? It only works for people with a trust fund.' },
          { who: 'ryan', expr: 'confident', pose: 'confident', text: "Or it's just a really heavy club, Biff." },
          { who: 'biff_fairway', expr: 'surprised', text: '...Huh. Is that why my shoulder hurts?' },
        ],
        outcome: 'tried_driver',
      },
      walk: {
        lines: [
          { who: 'ryan', expr: 'confident', pose: 'talk', text: "I'm here to practise, Biff. Not to fund your monk." },
          { who: 'biff_fairway', expr: 'surprised', text: 'You\'re turning down GOLD?' },
          { who: 'narrator', text: 'Two bays down, Coach Martinez gives one slow, approving nod without looking up.' },
        ],
        outcome: 'walked_away',
      },
    },
    outcomes: {
      won_bet: { summary: 'Outdrove Biff Fairway III and his gold-plated driver.', tone: 'good', effects: { money: 200, fame: 1, form: 1 }, bonds: { biff_fairway: -4 }, changes: '+$200 · Fame +1 · Form +1 · Biff wants a rematch' },
      lost_bet: { summary: 'Biff Fairway III and the gold driver won the long-drive bet.', tone: 'bad', effects: { money: -200, form: -1 }, bonds: { biff_fairway: 4 }, changes: '−$200 · Form −1 · Biff wants to rub it in' },
      tried_driver: { summary: 'Swung the gold-plated driver. Lesson learned: swing your own clubs.', tone: 'neutral', effects: { skillPoints: 1 }, bonds: { biff_fairway: 8 }, changes: '+1 skill point · Biff ♥' },
      walked_away: { summary: 'Turned down Biff\'s bet and got a full bucket of work in.', tone: 'neutral', effects: { energy: 5, rel: { coach: 6 } }, bonds: { biff_fairway: -2 }, changes: '+5 Energy · Coach ♥' },
    },
  },
  {
    id: 'gold_plated_putter',
    title: 'The Gold-Plated Putter',
    teaser: 'Biff is back, and this time the gold is shaped like a putter.',
    act: 1,
    location: 'clubhouse_lounge',
    cast: ['biff_fairway'],
    // Follow-up: only after the long-drive bet, and a few weeks later.
    when: (c, s) => {
      const prev = s.encounters.gold_plated_driver;
      return !!prev && (prev.outcome === 'won_bet' || prev.outcome === 'lost_bet') && weeksSince(c, prev) >= 4;
    },
    start: 'start',
    nodes: {
      start: {
        lines: [
          { who: 'biff_fairway', expr: 'confident', pose: 'confident', text: 'Muni kid. Remember me? Of course you do. I\'m unforgettable.' },
          { who: 'biff_fairway', expr: 'happy', pose: 'talk', text: 'Meet the Gold-Plated Putter. Matching set. The head is shaped like my own head.' },
          { who: 'ryan', expr: 'worried', text: 'Why would you—' },
          { who: 'biff_fairway', expr: 'laughing', pose: 'talk', text: 'One putt, across the lounge carpet, into that coffee mug. A hundred bucks.' },
        ],
        choice: {
          prompt: 'What does Ryan do?',
          options: [
            { id: 'putt', label: 'Putt for it', hint: 'Putting challenge for $100', next: 'putt', stake: 100 },
            { id: 'frame', label: 'Suggest he frame it instead', hint: 'Fans ♥, Biff ♥−', next: 'frame' },
          ],
        },
      },
      putt: {
        lines: [
          { who: 'narrator', text: 'Twelve feet of lounge carpet. One mug. The bartender stops polishing a glass.' },
        ],
        challenge: { kind: 'putt', opponent: 'biff_fairway' },
        win: 'putt_win',
        lose: 'putt_lose',
      },
      putt_win: {
        lines: [
          { who: 'narrator', text: 'Clink. Dead centre of the mug. The bartender quietly applauds.' },
          { who: 'biff_fairway', expr: 'disappointed', text: '...Fine. You\'re alright, muni kid. Don\'t tell anyone I said that.' },
          { who: 'ryan', expr: 'laughing', pose: 'celebrate', text: 'Your secret is safe with me and the bartender.' },
        ],
        outcome: 'won_putt',
      },
      putt_lose: {
        lines: [
          { who: 'narrator', text: 'The ball lips out of the mug and rolls under a leather armchair.' },
          { who: 'biff_fairway', expr: 'laughing', pose: 'celebrate', text: 'GOLD! IS! GOOD!' },
          { who: 'ryan', expr: 'disappointed', pose: 'disappointed', text: 'The carpet has a grain, Biff.' },
        ],
        outcome: 'lost_putt',
      },
      frame: {
        lines: [
          { who: 'ryan', expr: 'confident', pose: 'talk', text: 'Honestly? That belongs in a museum. Or above a fireplace. Far from a golf course.' },
          { who: 'biff_fairway', expr: 'surprised', text: 'A museum... THE BIFF FAIRWAY III MUSEUM OF GOLD.' },
          { who: 'narrator', text: 'Biff leaves to call an architect. Avery films the whole thing and the clip does numbers.' },
        ],
        outcome: 'framed',
      },
    },
    outcomes: {
      won_putt: { summary: 'Holed the putt across the lounge carpet. Biff admits you\'re alright.', tone: 'good', effects: { money: 100, form: 1 }, bonds: { biff_fairway: 6 }, changes: '+$100 · Form +1 · Biff ♥' },
      lost_putt: { summary: 'Lipped out of the coffee mug. Biff will be unbearable for weeks.', tone: 'bad', effects: { money: -100 }, bonds: { biff_fairway: 2 }, changes: '−$100' },
      framed: { summary: 'Talked Biff into a museum for his gold clubs. The video went around.', tone: 'neutral', effects: { fame: 1, rel: { fans: 4 } }, bonds: { biff_fairway: -3 }, changes: 'Fame +1 · Fans ♥' },
    },
  },
];

export const encounterById = (id: string) => ENCOUNTERS.find((e) => e.id === id);

export type WalkResult = { ok: true; outcome: string; stake: number; nodes: string[] } | { ok: false; reason: string };

/**
 * Follows a path of decisions through an encounter: option ids at choice
 * nodes, 'win' / 'lose' at challenges. Returns the outcome it ends in.
 */
export function walkEncounter(def: EncounterDef, path: string[]): WalkResult {
  let id = def.start;
  let i = 0;
  let stake = 0;
  const nodes: string[] = [];
  for (let guard = 0; guard < 50; guard++) {
    const node = def.nodes[id];
    if (!node) return { ok: false, reason: `Missing node ${id}` };
    nodes.push(id);
    if ('outcome' in node) {
      if (i !== path.length) return { ok: false, reason: 'Path continues past the end' };
      if (!def.outcomes[node.outcome]) return { ok: false, reason: `Missing outcome ${node.outcome}` };
      return { ok: true, outcome: node.outcome, stake, nodes };
    }
    if ('next' in node) {
      id = node.next;
      continue;
    }
    const step = path[i++];
    if (step === undefined) return { ok: false, reason: 'Path ends before an outcome' };
    if ('choice' in node) {
      const opt = node.choice.options.find((o) => o.id === step);
      if (!opt) return { ok: false, reason: `Not a choice here: ${step}` };
      stake = Math.max(stake, opt.stake ?? 0);
      id = opt.next;
    } else {
      if (step !== 'win' && step !== 'lose') return { ok: false, reason: 'Challenge result must be win or lose' };
      id = step === 'win' ? node.win : node.lose;
    }
  }
  return { ok: false, reason: 'Encounter loops' };
}

/** The next encounter to offer, if one is eligible and none is waiting. */
export function nextEncounter(c: CareerState, story: StoryState): EncounterDef | null {
  if (story.available) return null;
  return ENCOUNTERS.find((e) => !story.encounters[e.id] && e.act <= story.act && e.when(c, story)) ?? null;
}
