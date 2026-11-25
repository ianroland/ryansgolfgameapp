/**
 * Story events: New Star Soccer-style pop-ups between weeks. Each has a
 * condition and two or three choices with consequences.
 */
import type { CareerState, PersonId, StatKey } from './types';

export interface Effects {
  money?: number;
  energy?: number;
  form?: number;
  fame?: number;
  skillPoints?: number;
  stats?: Partial<Record<StatKey, number>>;
  rel?: Partial<Record<PersonId, number>>;
  flags?: Record<string, number | boolean | string>;
  /** Grants a lifestyle item (price already in `money`). */
  grant?: string;
  sponsor?: { id: string; name: string; weekly: number; winBonus: number; seasons: number };
}

export interface StoryChoice {
  label: string;
  hint: string;
  effects: Effects | ((c: CareerState, roll: number) => Effects);
  result: string | ((c: CareerState, roll: number) => string);
}

export interface Story {
  id: string;
  once?: boolean;
  weight?: number;
  when: (c: CareerState) => boolean;
  title: string;
  body: (c: CareerState) => string;
  choices: StoryChoice[];
}

const owns = (c: CareerState, id: string) => c.owned.includes(id);
const KAYLA = 'Kayla Brooks';

export const STORIES: Story[] = [
  {
    id: 'coach_rebuild', once: true, when: (c) => c.fame >= 6 && c.season >= 1 && c.week > 4,
    title: 'Coach Dana wants to rebuild your swing',
    body: () => "\"Your swing gets you round, but it won't get you on tour. Give me eight weeks and we'll find twenty yards.\"",
    choices: [
      { label: 'Commit to the rebuild', hint: '+3 Power, −2 Accuracy now, Coach ♥', effects: { stats: { power: 3, accuracy: -2 }, rel: { coach: 10 }, form: -2 }, result: 'It feels awkward, but the ball is going further already.' },
      { label: 'Keep what works', hint: 'Form +2, Coach ♥−', effects: { rel: { coach: -6 }, form: 2 }, result: "Dana shrugs. \"Your call. Don't come crying in Q-School.\"" },
    ],
  },
  {
    id: 'jess_party', weight: 2, when: () => true,
    title: "Jess's birthday party",
    body: () => 'Your best friend Jess is throwing a party Saturday night. "You never come out anymore!"',
    choices: [
      { label: 'Dance all night', hint: '−20 Energy, Form +3, Jess ♥♥', effects: { energy: -20, form: 3, rel: { friend: 12 } }, result: 'Best night in months. Your legs disagree.' },
      { label: 'Stop by for an hour', hint: '−5 Energy, Jess ♥', effects: { energy: -5, rel: { friend: 5 } }, result: 'You hug Jess, eat cake, and slip out early.' },
      { label: 'Stay in and rest', hint: '+10 Energy, Jess ♥−', effects: { energy: 10, rel: { friend: -8 } }, result: 'Jess sends a single thumbs-up emoji. Ouch.' },
    ],
  },
  {
    id: 'mom_car', weight: 1, when: (c) => c.season <= 3,
    title: "Baba's mower broke down",
    body: () => '"The reel mower is finished. Thirty years. I\'ll fix it myself. Don\'t worry about it."',
    choices: [
      { label: 'Send him $500', hint: '−$500, Baba ♥♥, Form +2', effects: { money: -500, rel: { mom: 12 }, form: 2 }, result: 'He says he didn\'t need it. Then he buys the mower. Worth every cent.' },
      { label: "I can't right now", hint: 'Baba ♥−, Form −2', effects: { rel: { mom: -6 }, form: -2 }, result: 'He says it\'s fine. You feel lousy all week.' },
    ],
  },
  {
    id: 'kayla_trash', weight: 1, when: (c) => c.fame >= 5,
    title: `${KAYLA} is talking`,
    body: () => `${KAYLA} posts that your last result was "a fluke from a girl who can't putt." It's getting shared.`,
    choices: [
      { label: 'Fire back', hint: 'Fame +3, Form +2, rivalry heats up', effects: { fame: 3, form: 2, rel: { rival: -10 } }, result: 'Your reply gets more likes than her post. Game on.' },
      { label: 'Let your clubs talk', hint: '+1 Nerve', effects: { stats: { nerve: 1 }, form: 1 }, result: 'You screenshot it and set it as your lock screen.' },
      { label: 'Challenge her to a match', hint: '−15 Energy, +1 Short Game, rival respect', effects: { energy: -15, stats: { shortGame: 1 }, rel: { rival: 12 } }, result: 'You lose by one on the 18th. She buys the drinks. Grudging respect.' },
    ],
  },
  {
    id: 'local_paper', weight: 1, when: (c) => c.fame >= 10 && c.fame < 50,
    title: 'The local paper calls',
    body: () => 'The Dry Creek Ledger wants a feature: "Hometown Girl Chasing the Tour."',
    choices: [
      { label: 'Do the interview', hint: 'Fame +4, −8 Energy', effects: { fame: 4, energy: -8, rel: { fans: 6 } }, result: 'You make the front of the sports section. Baba buys ten copies, then circles your three-putt.' },
      { label: 'Not right now', hint: 'Fame −1', effects: { fame: -1 }, result: 'The reporter sighs and writes about high-school volleyball instead.' },
    ],
  },
  {
    id: 'junior_clinic', weight: 1, when: (c) => c.fame >= 15,
    title: 'Junior clinic',
    body: () => 'Your old club asks if you\'d run a Saturday clinic for twenty juniors.',
    choices: [
      { label: 'Volunteer', hint: 'Fame +3, Fans ♥, Form +2, −10 Energy', effects: { fame: 3, form: 2, energy: -10, rel: { fans: 8 } }, result: 'A ten-year-old asks for your autograph. You nearly cry.' },
      { label: 'Charge for it', hint: '+$600, −10 Energy', effects: { money: 600, energy: -10, fame: 1 }, result: 'Parents pay up. The kids have fun anyway.' },
      { label: 'Pass', hint: '', effects: {}, result: 'Maybe next year.' },
    ],
  },
  {
    id: 'late_putting', weight: 2, when: () => true,
    title: 'Lights on at the putting green',
    body: () => 'The club leaves the floodlights on. Nobody else is out here.',
    choices: [
      { label: 'Grind putts till midnight', hint: '+1.2 Putting, −15 Energy', effects: { stats: { putting: 1.2 }, energy: -15 }, result: '100 four-footers in a row. You can see the line in your sleep.' },
      { label: 'Go home', hint: '+5 Energy', effects: { energy: 5 }, result: 'Bed wins.' },
    ],
  },
  {
    id: 'heat_wave', weight: 1, when: (c) => c.week > 10 && c.week < 22,
    title: 'Heat wave',
    body: () => "It's 108°F in the desert this week. The range is empty.",
    choices: [
      { label: 'Train at dawn', hint: '+1 Fitness, −5 Energy', effects: { stats: { fitness: 1 }, energy: -5 }, result: '5am alarms. Brutal. You feel tougher.' },
      { label: 'Stay in the AC', hint: '+10 Energy', effects: { energy: 10 }, result: 'You binge golf highlights and call it research.' },
    ],
  },
  {
    id: 'viral_trick_shot', weight: 1, when: (c) => c.fame >= 8,
    title: 'Your trick shot went viral',
    body: () => 'Jess filmed you skipping a ball across the pond onto the green. Two million views overnight.',
    choices: [
      { label: 'Lean in — post more', hint: 'Fame +6, Form −1, −5 Energy', effects: { fame: 6, form: -1, energy: -5, rel: { fans: 10 } }, result: 'Brands are sliding into your DMs.' },
      { label: 'Stay focused', hint: 'Form +2', effects: { form: 2 }, result: 'You turn off notifications and go hit balls.' },
    ],
  },
  {
    id: 'coach_sunday', weight: 2, when: () => true,
    title: 'Coach Dana has a free Sunday',
    body: () => '"Range at eight? Bring coffee."',
    choices: [
      { label: 'Take the session', hint: '+1.5 Accuracy, −10 Energy, Coach ♥', effects: { stats: { accuracy: 1.5 }, energy: -10, rel: { coach: 5 } }, result: 'Two hours of alignment-stick drills. Boring. It works.' },
      { label: 'Rest instead', hint: '+10 Energy, Coach ♥−', effects: { energy: 10, rel: { coach: -2 } }, result: 'Dana texts you a single photo of an empty range.' },
    ],
  },
  {
    id: 'sore_wrist', weight: 3, when: (c) => c.energy < 30,
    title: 'Your wrist is sore',
    body: () => 'Too many balls, not enough sleep. It aches every time you take the club back.',
    choices: [
      { label: 'See a physio ($300)', hint: '−$300, +15 Energy', effects: { money: -300, energy: 15 }, result: "Tape, ice and a stern lecture. It's better already." },
      { label: 'Play through it', hint: 'Form −3, −1 Fitness', effects: { form: -3, stats: { fitness: -1 } }, result: 'You grit your teeth. Your swing gets a little shorter.' },
    ],
  },
  {
    id: 'scholarship', once: true, when: (c) => c.status === 'amateur' && c.fame >= 12 && c.season <= 2,
    title: 'College scholarship offer',
    body: () => 'Coastal State University offers a full golf scholarship: coaching, travel, and a stipend.',
    choices: [
      { label: 'Accept (stay amateur)', hint: '+$3,000, +2 to every skill, Baba ♥♥', effects: { money: 3000, stats: { power: 2, accuracy: 2, shortGame: 2, putting: 2 }, rel: { mom: 15 }, flags: { college: true } }, result: 'Baba frames the letter and hangs it in the shed. Turning pro can wait — a little.' },
      { label: "Decline — I'm going pro", hint: 'Form +2, Baba ♥−', effects: { form: 2, rel: { mom: -5 }, flags: { declinedCollege: true } }, result: 'Bold. Your coach nods slowly.' },
    ],
  },
  {
    id: 'qschool_heads_up', when: (c) => c.status === 'pro' && c.tourCard !== 'lpga' && c.week >= 12 && c.week < 20 && c.flags[`qtip${c.season}`] !== true,
    title: 'Q-School is coming',
    body: () => '"First Stage is week 20 and the entry is $3,500. Second Stage is week 24, Final Stage week 28. Top 20 at Final Stage get a PGA Tour card." — Coach Dana',
    choices: [{ label: 'Start saving', hint: '', effects: (c) => ({ flags: { [`qtip${c.season}`]: true } }), result: 'You circle three dates on the calendar.' }],
  },
  {
    id: 'caddie_marco', once: true, when: (c) => c.status === 'pro' && c.fame >= 8 && !owns(c, 'caddie_local') && !owns(c, 'caddie_tour'),
    title: 'Marco wants your bag',
    body: () => 'Marco has looped at Dry Creek for 15 years. "I know every grain on these greens. Let me carry for you."',
    choices: [
      { label: 'Hire him ($2,500)', hint: '+2 Putting & Nerve in tournaments', effects: { money: -2500, grant: 'caddie_local', rel: { caddie: 60 } }, result: 'Marco shows up with towels, snacks and opinions.' },
      { label: 'Carry my own bag', hint: '', effects: {}, result: 'Marco shrugs. "Offer stands."' },
    ],
  },
  {
    id: 'agent_marty', once: true, when: (c) => c.status === 'pro' && c.fame >= 18,
    title: 'An agent calls',
    body: () => 'Marty Klein represents three tour players. "Kid, you\'ve got a story. Let me sell it."',
    choices: [
      { label: 'Sign with Marty', hint: 'Fame +4, sponsor offers come faster', effects: { fame: 4, rel: { agent: 60 }, flags: { agent: true } }, result: 'Marty talks fast and never sleeps. Your phone starts ringing.' },
      { label: 'Not yet', hint: '', effects: {}, result: '"Your loss, kid. Call me when you win something."' },
    ],
  },
  {
    id: 'sunline_offer', once: true, when: (c) => c.status === 'pro' && !c.sponsor && (c.fame >= 28 || (c.flags.agent === true && c.fame >= 20)),
    title: 'Sponsorship offer: Sunline Apparel',
    body: () => 'Sunline wants you in their logo polo: $400 a week and a $5,000 bonus for every win, for two seasons.',
    choices: [
      {
        label: 'Sign the deal', hint: '+$400/week, +$5,000 per win',
        effects: (c) => ({ sponsor: { id: 'sunline', name: 'Sunline Apparel', weekly: 400, winBonus: 5000, seasons: 2 }, rel: { sponsor: 60 }, fame: 2, flags: { sponsorSince: c.season } }),
        result: 'You get a box of shirts in every colour. Mostly yellow.',
      },
      {
        label: 'Hold out for more', hint: 'Risky: better deal if you\'re famous enough',
        effects: (c) => (c.fame >= 40 ? { sponsor: { id: 'sunline', name: 'Sunline Apparel', weekly: 750, winBonus: 10000, seasons: 2 }, rel: { sponsor: 50 }, fame: 2 } : { rel: { sponsor: -20 } }),
        result: (c) => (c.fame >= 40 ? 'They blink first: $750 a week and $10,000 a win.' : 'They pull the offer. Maybe next year.'),
      },
    ],
  },
  {
    id: 'charity_proam', weight: 1, when: (c) => c.fame >= 35,
    title: 'Charity pro-am invitation',
    body: () => 'A children\'s hospital pro-am asks you to headline. Your sponsor would love it.',
    choices: [
      { label: 'Play', hint: 'Fame +5, Sponsor ♥, −15 Energy', effects: { fame: 5, energy: -15, rel: { sponsor: 10, fans: 6 } }, result: 'You raise $80,000 and make a lot of small fans.' },
      { label: 'Skip it', hint: 'Sponsor ♥−', effects: { rel: { sponsor: -6 } }, result: 'Sunline sends a passive-aggressive email.' },
    ],
  },
  {
    id: 'mom_visits', weight: 1, when: () => true,
    title: 'Baba drives in',
    body: () => 'Surprise! Baba drove four hours to watch you practice.',
    choices: [
      { label: 'Show him around', hint: 'Baba ♥♥, Form +3, −5 Energy', effects: { rel: { mom: 10 }, form: 3, energy: -5 }, result: 'He tells everyone at the range that you\'re his kid. Then he critiques the practice green.' },
      { label: "I'm too busy", hint: 'Baba ♥−−', effects: { rel: { mom: -8 } }, result: 'He drives the four hours home without stopping.' },
    ],
  },
  {
    id: 'fan_mail', weight: 1, when: (c) => c.fame >= 45,
    title: 'The fan mail is piling up',
    body: () => 'Three bags of letters arrived at the clubhouse.',
    choices: [
      { label: 'Answer every letter', hint: 'Fans ♥♥, Fame +2, −10 Energy', effects: { rel: { fans: 10 }, fame: 2, energy: -10 }, result: 'Writer\'s cramp, but you mean every word.' },
      { label: 'Sign a stack of photos', hint: 'Fame +1', effects: { fame: 1 }, result: 'Efficient. Slightly soulless.' },
    ],
  },
  {
    id: 'investment', once: true, when: (c) => c.flags.richEnough === true,
    title: 'A "can\'t-miss" investment',
    body: () => 'A friend of Jess\'s is starting a golf-simulator bar and wants $5,000.',
    choices: [
      {
        label: 'Invest $5,000', hint: 'Could pay off… or not',
        effects: (_c, roll) => ({ money: roll < 0.45 ? 9000 : -5000 }),
        result: (_c, roll) => (roll < 0.45 ? 'The bar is packed every night. You net $9,000.' : 'It closes in four months. Lesson learned.'),
      },
      { label: 'Pass', hint: '', effects: {}, result: 'You keep your money in the bank.' },
    ],
  },
];

STORIES.push(
  {
    id: 'casino_mom', weight: 4,
    when: (c) => Number(c.flags.casinoWagered ?? 0) - Number(c.flags.casinoReturned ?? 0) >= 3000 && Number(c.flags.casinoMomTalk ?? 0) < Number(c.flags.casinoVisits ?? 0) - 2,
    title: 'Baba heard about the casino',
    body: (c) => `"Jess says you've been at Desert Palms a lot. You're down $${(Number(c.flags.casinoWagered ?? 0) - Number(c.flags.casinoReturned ?? 0)).toLocaleString()}. I don't understand cards. I understand losing. Is everything okay?"`,
    choices: [
      {
        label: "You're right. I'll take a break.", hint: 'Baba ♥♥, Form +2, no casino for 6 weeks',
        effects: (c) => ({ rel: { mom: 10 }, form: 2, flags: { casinoBanUntil: c.season * 100 + c.week + 6, casinoMomTalk: Number(c.flags.casinoVisits ?? 0) } }),
        result: 'He says "Good." Then, quieter: "Good." You feel lighter too.',
      },
      {
        label: "It's fine, Baba. I've got it.", hint: 'Baba ♥−−, Form −2',
        effects: (c) => ({ rel: { mom: -10 }, form: -2, flags: { casinoMomTalk: Number(c.flags.casinoVisits ?? 0) } }),
        result: 'There\'s a long pause on the line.',
      },
    ],
  },
  {
    id: 'casino_comp', weight: 2,
    when: (c) => Number(c.flags.casinoVisits ?? 0) >= 3 && c.fame >= 20,
    title: 'Desert Palms wants you',
    body: () => 'The casino offers $1,500 to host their charity golf night and sign autographs in the lobby.',
    choices: [
      { label: 'Take the gig', hint: '+$1,500, Fame +2, −10 Energy', effects: { money: 1500, fame: 2, energy: -10 }, result: 'Free buffet, too.' },
      { label: 'Not my scene', hint: 'Sponsor ♥', effects: { rel: { sponsor: 4 } }, result: 'Your sponsor appreciates the low profile.' },
    ],
  },
);

export const storyById = (id: string) => STORIES.find((s) => s.id === id);
