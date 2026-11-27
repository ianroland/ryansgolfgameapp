/**
 * Act IV: The Major (phase 3, she/her). Outline: "Ryan's Road: Acts II–IV Story Outline", 2026-11-27.
 * Same rules as Act III: the jokes land on Biff, the tour, Doug and Kayla's detective work, never on
 * Ryan's transition. Approved under the owner's standing approval.
 *
 * Mom at the Major, Reading the Green and Championship Sunday are drafted for the owner first and
 * need a between-rounds trigger (and Mom's art), so they aren't here yet.
 */
import type { CareerState } from '../career/types';
import type { EncounterDef } from './encounters';
import type { StoryState } from './types';

const SEASON = 30;
const since = (c: CareerState, s: StoryState, id: string) => {
  const r = s.encounters[id];
  return r ? (c.season - r.season) * SEASON + (c.week - r.week) : -Infinity;
};
/** Act IV plays on the LPGA Tour itself. */
const onTour = (c: CareerState, s: StoryState) => s.act === 4 && c.tourCard === 'lpga';

export const ACT_FOUR: EncounterDef[] = [
  {
    id: 'act4_big_leagues',
    title: 'The Big Leagues',
    teaser: 'Week one on the LPGA Tour. A real caddie, a courtesy car, and a camera.',
    act: 4,
    location: 'clubhouse_lounge',
    cast: ['caddie_jordan', 'reporter_kim'],
    when: (c, s) => onTour(c, s) && since(c, s, 'act3_the_card') >= 1,
    start: 'start',
    nodes: {
      start: {
        lines: [
          { who: 'narrator', text: 'Week one on the LPGA Tour. Ryan’s courtesy car has a mattress-store wrap. Her face is on the hood, lying down.' },
          { who: 'caddie_jordan', expr: 'neutral', pose: 'talk', text: 'Jordan. Your caddie. Marty hired me. I’ve been told not to ask about Doug.' },
          { who: 'ryan', expr: 'worried', text: 'Don’t ask about Doug.' },
          { who: 'caddie_jordan', expr: 'confident', pose: 'confident', text: 'Wasn’t going to.' },
          { who: 'narrator', text: 'Jordan has already walked the course twice, measured every sprinkler head and labelled Ryan’s towels by day of the week.' },
          { who: 'caddie_jordan', expr: 'neutral', pose: 'talk', text: 'Monday’s towel is for Monday. Use Tuesday’s towel on Monday and we’ll have problems on Tuesday.' },
          { who: 'reporter_kim', expr: 'happy', pose: 'talk', text: 'Kim, Channel Six, now on the national broadcast. Ryan! A quick word for the folks at home?' },
        ],
        choice: {
          prompt: 'What does Ryan say on national TV?',
          options: [
            { id: 'baba', label: 'Say hi to Baba', hint: 'Baba ♥, Fans ♥', next: 'baba' },
            { id: 'towels', label: 'Explain the towel system', hint: 'Jordan ♥, Fame +', next: 'towels' },
            { id: 'short', label: 'Keep it short', hint: 'Form +2', next: 'short' },
          ],
        },
      },
      baba: {
        lines: [
          { who: 'ryan', expr: 'happy', pose: 'talk', text: 'Hi, Baba. Yes, I’m eating.' },
          { who: 'narrator', text: 'Behind the ropes, a man in a golf polo, holding a cooler, checks his watch and pretends he isn’t smiling.' },
          { who: 'reporter_kim', expr: 'happy', text: 'I think he heard you.' },
        ],
        outcome: 'baba',
      },
      towels: {
        lines: [
          { who: 'ryan', expr: 'confident', pose: 'talk', text: 'So there’s a towel for every day of the week. Jordan has a chart.' },
          { who: 'caddie_jordan', expr: 'confident', pose: 'confident', text: 'Laminated.' },
          { who: 'narrator', text: 'By dinner, #TowelTuesday is trending. Three sponsors call Marty about towels. Marty says yes to all of them.' },
        ],
        outcome: 'towels',
      },
      short: {
        lines: [
          { who: 'ryan', expr: 'neutral', pose: 'talk', text: 'Happy to be here. Looking forward to the week.' },
          { who: 'reporter_kim', expr: 'surprised', text: 'That’s the most professional answer I’ve had all year.' },
          { who: 'caddie_jordan', expr: 'neutral', text: 'Monday towel. Let’s go.' },
        ],
        outcome: 'short',
      },
    },
    outcomes: {
      baba: { summary: 'Said hi to Baba on national TV. He pretended not to smile.', tone: 'good', effects: { rel: { mom: 6, fans: 4 } }, bonds: { baba: 6 }, changes: 'Baba ♥ · Fans ♥' },
      towels: { summary: 'Explained the towel system on national TV. #TowelTuesday.', tone: 'good', effects: { fame: 3, rel: { caddie: 6 } }, bonds: { caddie_jordan: 8 }, changes: 'Fame +3 · Jordan ♥' },
      short: { summary: 'Kept it short and professional on debut week.', tone: 'neutral', effects: { form: 2, rel: { caddie: 3 } }, bonds: { caddie_jordan: 4 }, changes: 'Form +2 · Jordan ♥' },
    },
  },
  {
    id: 'act4_corkboard',
    title: 'The Corkboard',
    teaser: 'Kayla has bought red string. In bulk.',
    act: 4,
    location: 'clubhouse_lounge',
    cast: ['kayla_brooks'],
    when: (c, s) => onTour(c, s) && since(c, s, 'act4_big_leagues') >= 2,
    start: 'start',
    nodes: {
      start: {
        lines: [
          { who: 'narrator', text: 'The players’ lounge. Kayla has wheeled in a corkboard. It is covered in red string.' },
          { who: 'kayla_brooks', expr: 'confident', pose: 'talk', text: 'Ryan. Good. Sit. I need a second opinion.' },
          { who: 'narrator', text: 'Pinned to the board: old muni scorecards, a blurry photo of a putting stroke, and an empty bag of cheese puffs in a sealed evidence bag.' },
          { who: 'kayla_brooks', expr: 'neutral', pose: 'talk', text: 'I knew a Ryan on the muni circuit. You’re a Ryan. Same hip. Same stroke. Same snacks. So: theories.' },
          { who: 'kayla_brooks', expr: 'neutral', pose: 'talk', text: 'Theory one: twin. Ruled out. I checked. There are no twins. I called a hospital.' },
          { who: 'kayla_brooks', expr: 'worried', pose: 'talk', text: 'Theory two: cousin. Theory three: a hypnotist. Theory four is just the word “HOW” in very large letters.' },
          { who: 'ryan', expr: 'worried', text: 'You called a hospital?' },
          { who: 'kayla_brooks', expr: 'confident', pose: 'confident', text: 'I am very thorough, Ryan.' },
        ],
        choice: {
          prompt: 'What does Ryan do?',
          options: [
            { id: 'help', label: 'Help her investigate', hint: 'Kayla ♥, very awkward', next: 'help' },
            { id: 'hypno', label: 'Back the hypnotist theory', hint: 'Kayla laughs, Kayla ♥', next: 'hypno' },
            { id: 'almost', label: 'Almost tell her', hint: 'Kayla ♥... almost', next: 'almost' },
          ],
        },
      },
      help: {
        lines: [
          { who: 'narrator', text: 'Ryan picks up the red string. Ryan pins one end to the muni scorecard. Ryan realises where the other end has to go.' },
          { who: 'narrator', text: 'Ryan pins it to the cheese puffs instead.' },
          { who: 'kayla_brooks', expr: 'surprised', text: 'The snacks. Of course. It was always the snacks.' },
        ],
        outcome: 'help',
      },
      hypno: {
        lines: [
          { who: 'ryan', expr: 'confident', pose: 'talk', text: 'Honestly? Hypnotist. I’d go hypnotist.' },
          { who: 'kayla_brooks', expr: 'laughing', pose: 'celebrate', text: 'RIGHT? Nobody believes me about the hypnotist.' },
          { who: 'narrator', text: 'She circles HYPNOTIST three times. It is the wrong answer. She has never looked happier.' },
        ],
        outcome: 'hypno',
      },
      almost: {
        lines: [
          { who: 'ryan', expr: 'worried', pose: 'talk', text: 'Kayla. About the board. The muni Ryan is—' },
          { who: 'narrator', text: 'A gust from the air conditioning lifts something enormous past the window. It is Doug. He is on a tether. Marty is chasing him.' },
          { who: 'kayla_brooks', expr: 'surprised', pose: 'celebrate', text: 'Is that a balloon man? Hold that thought.' },
          { who: 'narrator', text: 'She’s gone. Again. The string has wrapped itself around Ryan’s ankle.' },
        ],
        outcome: 'almost',
      },
    },
    outcomes: {
      help: { summary: 'Helped with Kayla’s corkboard. Pinned the string to the snacks.', tone: 'neutral', effects: { rel: { rival: 4 } }, bonds: { kayla_brooks: 5 }, changes: 'Kayla ♥' },
      hypno: { summary: 'Backed the hypnotist theory. Kayla has never been happier to be wrong.', tone: 'good', effects: { rel: { rival: 5 } }, bonds: { kayla_brooks: 6 }, changes: 'Kayla ♥' },
      almost: { summary: 'Almost told Kayla. Doug floated past the window.', tone: 'neutral', effects: { rel: { rival: 4 } }, bonds: { kayla_brooks: 4, marty_mulligan: 2 }, changes: 'Kayla ♥ · almost (again)' },
    },
  },
  {
    id: 'act4_desert_rose',
    title: 'The Desert Rose',
    teaser: 'Biff has had a Pink Jacket made in his size. In case.',
    act: 4,
    location: 'course_sunset',
    cast: ['biff_fairway', 'commissioner_clipboard'],
    // The week before the Desert Rose Invitational (week 6), the season's first major.
    when: (c, s) => onTour(c, s) && c.week >= 4 && c.week <= 6 && since(c, s, 'act4_big_leagues') >= 1,
    start: 'start',
    nodes: {
      start: {
        lines: [
          { who: 'narrator', text: 'Desert Rose week. The first major of the season. The champion wears the Pink Jacket.' },
          { who: 'biff_fairway', expr: 'confident', pose: 'confident', text: 'Ryan. As the tournament’s new Official Hydration Partner, I’ve had a Pink Jacket made. In my size. In case.' },
          { who: 'narrator', text: 'It is the pink of a flamingo that has made a lot of money. The buttons are gold. One of them is a smaller, second Biff.' },
          { who: 'ryan', expr: 'surprised', text: 'Biff, you’re not in the field.' },
          { who: 'biff_fairway', expr: 'confident', pose: 'talk', text: 'Not with that attitude.' },
          { who: 'commissioner_clipboard', expr: 'neutral', pose: 'talk', text: 'Desert Rose bylaw one. The jacket is awarded. Not purchased. Not pre-ordered. Not “manifested”.' },
          { who: 'biff_fairway', expr: 'worried', text: 'I did manifest it, though.' },
        ],
        choice: {
          prompt: 'What does Ryan say?',
          options: [
            { id: 'earned', label: '“It’s for the champion.”', hint: 'Fame +2, Form +1', next: 'earned' },
            { id: 'color', label: '“Pink isn’t your colour.”', hint: 'Biff ♥−, Fans ♥', next: 'color' },
            { id: 'ruling', label: 'Ask the Commissioner for a ruling', hint: 'Commissioner ♥', next: 'ruling' },
          ],
        },
      },
      earned: {
        lines: [
          { who: 'ryan', expr: 'confident', pose: 'talk', text: 'It’s for the champion, Biff. Somebody has to earn it on Sunday.' },
          { who: 'biff_fairway', expr: 'disappointed', pose: 'disappointed', text: 'Fine. I’ll wear it to the parking garage. Nobody checks bylaws at the parking garage.' },
        ],
        outcome: 'earned',
      },
      color: {
        lines: [
          { who: 'ryan', expr: 'laughing', pose: 'talk', text: 'Honestly, Biff? Pink isn’t your colour.' },
          { who: 'biff_fairway', expr: 'angry', pose: 'disappointed', text: 'Every colour is my colour. I have a colour consultant. Her name is also Pink.' },
          { who: 'narrator', text: 'A gallery marshal laughs so hard she has to hold up her QUIET PLEASE sign to hide it.' },
        ],
        outcome: 'color',
      },
      ruling: {
        lines: [
          { who: 'ryan', expr: 'neutral', pose: 'talk', text: 'Commissioner, can I get a ruling on the jacket?' },
          { who: 'commissioner_clipboard', expr: 'confident', pose: 'confident', text: 'You may. The jacket is confiscated until Sunday, when it will be awarded to whoever wins.' },
          { who: 'biff_fairway', expr: 'surprised', text: 'But it’s in MY size.' },
          { who: 'commissioner_clipboard', expr: 'neutral', pose: 'talk', text: 'Then the champion will have room to grow.' },
        ],
        outcome: 'ruling',
      },
    },
    outcomes: {
      earned: { summary: 'Told Biff the Pink Jacket is for the champion.', tone: 'good', effects: { fame: 2, form: 1 }, changes: 'Fame +2 · Form +1' },
      color: { summary: 'Told Biff pink isn’t his colour. A marshal hid behind her sign.', tone: 'neutral', effects: { rel: { fans: 5 } }, bonds: { biff_fairway: -4 }, changes: 'Fans ♥ · Biff ♥−' },
      ruling: { summary: 'The Commissioner confiscated Biff’s Pink Jacket until Sunday.', tone: 'good', effects: { fame: 1 }, bonds: { commissioner_clipboard: 6, biff_fairway: -2 }, changes: 'Fame +1 · Commissioner ♥' },
    },
  },
  {
    id: 'act4_kayla_knows',
    title: 'Kayla Knows',
    teaser: 'Dusk on the practice green. No helicopters. No sprinklers. No Doug.',
    act: 4,
    location: 'driving_range',
    cast: ['kayla_brooks'],
    when: (c, s) => onTour(c, s) && since(c, s, 'act4_corkboard') >= 3,
    start: 'start',
    nodes: {
      start: {
        lines: [
          { who: 'narrator', text: 'Dusk on the practice green. Kayla is alone, staring at a yardage book full of question marks.' },
          { who: 'kayla_brooks', expr: 'worried', pose: 'talk', text: 'I figured it out.' },
          { who: 'ryan', expr: 'surprised', text: 'You did?' },
          { who: 'kayla_brooks', expr: 'confident', pose: 'confident', text: 'Hypnotist. Final answer.' },
          { who: 'ryan', expr: 'laughing', text: 'Kayla.' },
          { who: 'narrator', text: 'Ryan sits down next to her. No helicopters. No sprinklers. No Doug. Ryan checks twice.' },
          { who: 'ryan', expr: 'neutral', pose: 'talk', text: 'It’s me. The muni kid. The cart in the pond. The helicopter dinner. It’s me.' },
          { who: 'narrator', text: 'A long silence. A cricket starts, thinks better of it, and stops.' },
          { who: 'kayla_brooks', expr: 'surprised', text: '…I KNEW that putting stroke.' },
          { who: 'kayla_brooks', expr: 'laughing', pose: 'celebrate', text: 'I had a corkboard, Ryan. I bought red string. In BULK.' },
          { who: 'ryan', expr: 'laughing', pose: 'talk', text: 'It was a really good corkboard.' },
          { who: 'kayla_brooks', expr: 'neutral', pose: 'talk', text: 'Why didn’t you just tell me?' },
          { who: 'ryan', expr: 'worried', pose: 'talk', text: 'I kept trying. The universe kept landing helicopters on it.' },
          { who: 'kayla_brooks', expr: 'happy', text: '…Yeah. It does that to us.' },
          { who: 'kayla_brooks', expr: 'neutral', pose: 'talk', text: 'For the record, I’m mad I didn’t solve it. That’s it. You’re Ryan. You hang your left hip. That’s all I need on the board.' },
        ],
        choice: {
          prompt: 'So where does that leave them?',
          options: [
            { id: 'friends', label: 'Friends', hint: 'Kayla ♥♥', next: 'friends' },
            { id: 'rivals', label: 'Rivals', hint: 'Kayla ♥, Form +2', next: 'rivals' },
            { id: 'dinner', label: 'Dinner. No helicopters.', hint: 'Kayla ♥♥♥', next: 'dinner' },
          ],
        },
      },
      friends: {
        lines: [
          { who: 'kayla_brooks', expr: 'happy', pose: 'talk', text: 'Friends. Best friends who want to beat each other very, very badly.' },
          { who: 'ryan', expr: 'happy', text: 'Deal.' },
          { who: 'narrator', text: 'Kayla takes down the corkboard that night. She keeps the cheese-puff bag. “For the museum.”' },
        ],
        outcome: 'friends',
      },
      rivals: {
        lines: [
          { who: 'kayla_brooks', expr: 'confident', pose: 'confident', text: 'Oh, it’s ON. Sunday. Bring snacks I can respect.' },
          { who: 'ryan', expr: 'confident', pose: 'talk', text: 'Cheese puffs.' },
          { who: 'kayla_brooks', expr: 'laughing', text: 'Unbelievable. See you on the first tee.' },
        ],
        outcome: 'rivals',
      },
      dinner: {
        lines: [
          { who: 'ryan', expr: 'happy', pose: 'talk', text: 'So. Dinner? No helicopters.' },
          { who: 'kayla_brooks', expr: 'happy', pose: 'talk', text: '…Dinner. If a single rotor blade shows up, I’m leaving.' },
          { who: 'narrator', text: 'No rotor blades show up. Biff tries. Baba took his keys.' },
        ],
        outcome: 'dinner',
      },
    },
    outcomes: {
      friends: { summary: 'Told Kayla. Best friends who want to beat each other very badly.', tone: 'good', effects: { rel: { rival: 12 }, flags: { kayla: 'friends' } }, bonds: { kayla_brooks: 14 }, changes: 'Kayla ♥♥' },
      rivals: { summary: 'Told Kayla. It’s on: Sunday, first tee.', tone: 'good', effects: { form: 2, rel: { rival: 8 }, flags: { kayla: 'rivals' } }, bonds: { kayla_brooks: 10 }, changes: 'Kayla ♥ · Form +2' },
      dinner: { summary: 'Told Kayla. Dinner, no helicopters (Baba took Biff’s keys).', tone: 'good', effects: { rel: { rival: 15 }, flags: { kayla: 'dinner' } }, bonds: { kayla_brooks: 18 }, changes: 'Kayla ♥♥♥' },
    },
  },
];
