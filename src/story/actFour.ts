/**
 * Act IV: The Major (phase 3, she/her). Outline: "Ryan's Road: Acts II–IV Story Outline", 2026-11-27.
 * Same rules as Act III: the jokes land on Biff, the tour, Doug and Kayla's detective work, never on
 * Ryan's transition. Approved under the owner's standing approval.
 *
 * Baba at the Major, Reading the Green and Championship Sunday: approved by the owner (2026-11-27,
 * "approve all"; then "change mom to Baba": the major scene is Baba's, and Mom doesn't appear).
 * Baba at the Major and Reading the Green play between rounds (`during`).
 */
import type { CareerState } from '../career/types';
import type { EncounterDef } from './encounters';
import type { StoryState } from './types';
import { findTournament } from '../career/tournament';

const tournamentName = (id: string) => findTournament(id)?.name ?? '';

const SEASON = 30;
const since = (c: CareerState, s: StoryState, id: string) => {
  const r = s.encounters[id];
  return r ? (c.season - r.season) * SEASON + (c.week - r.week) : -Infinity;
};
/** Act IV plays on the LPGA Tour itself. */
const onTour = (c: CareerState, s: StoryState) => s.act === 4 && c.tourCard === 'lpga';
const at = (c: CareerState, name: string) => !!c.active && c.active.tournamentId.startsWith('lpga-') && tournamentName(c.active.tournamentId) === name;
const done = (s: StoryState, id: string) => !!s.encounters[id];
/** Ryan just finished the Tour Championship this season (and won it, if `won`). */
const lastWasTourChampionship = (c: CareerState) => !c.active && c.recent[0]?.name === 'Tour Championship' && c.recent[0]?.season === c.season;
const wonIt = (c: CareerState) => c.recent[0]?.posLabel === '1';


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
  {
    id: 'act4_lake_ryan',
    title: 'Lake Ryan',
    teaser: 'A tour stop has news about its pond. It involves a plaque.',
    act: 4,
    location: 'course_sunset',
    cast: ['caddie_jordan', 'baba'],
    when: (c, s) => onTour(c, s) && done(s, 'act4_desert_rose') && since(c, s, 'act4_desert_rose') >= 2,
    start: 'start',
    nodes: {
      start: {
        lines: [
          { who: 'narrator', text: 'Practice round. The 14th. A golf cart, unattended, rolls gently, majestically, into the pond.' },
          { who: 'caddie_jordan', expr: 'neutral', pose: 'talk', text: 'For the record, that wasn’t us. That was a volunteer.' },
          { who: 'narrator', text: 'The course superintendent arrives with a clipboard, a sheet over something rectangular, and the face of a man who has seen the highlight reels.' },
          { who: 'narrator', text: 'Superintendent: “Your carts have now visited a pond at eleven tour stops. The board has voted. Effective today, this water hazard is named after you.”' },
          { who: 'narrator', text: 'He pulls off the sheet. The plaque reads: LAKE RYAN. Below that, smaller: PLEASE STAY OUT OF IT.' },
          { who: 'baba', expr: 'neutral', pose: 'think', text: 'It’s a pond. Lake is generous. Still. Nice plaque. Good brass.' },
        ],
        choice: {
          prompt: 'A pond with your name on it.',
          options: [
            { id: 'ribbon', label: 'Cut the ribbon', hint: 'Fans ♥, Fame +2', next: 'ribbon' },
            { id: 'cart', label: 'Ask if the cart can stay', hint: 'Jordan ♥', next: 'cart' },
          ],
        },
      },
      ribbon: {
        lines: [
          { who: 'narrator', text: 'Ryan cuts the ribbon with Baba’s pocketknife. Three photographers, one goose, and the cart, still bubbling, are in the photo.' },
        ],
        outcome: 'ribbon',
      },
      cart: {
        lines: [
          { who: 'ryan', expr: 'laughing', pose: 'talk', text: 'Can the cart stay? It looks happy.' },
          { who: 'narrator', text: 'Superintendent: “…The cart can stay.” It becomes a habitat. Two ducks move in by Friday.' },
          { who: 'caddie_jordan', expr: 'happy', pose: 'talk', text: 'Our first property.' },
        ],
        outcome: 'cart',
      },
    },
    outcomes: {
      ribbon: { summary: 'A tour stop named its pond Lake Ryan. Ryan cut the ribbon. A goose was in the photo.', tone: 'good', effects: { fame: 2, rel: { fans: 5 } }, bonds: { baba: 3 }, changes: 'Fans ♥ · Fame +2' },
      cart: { summary: 'A tour stop named its pond Lake Ryan. The cart stayed. Two ducks live in it.', tone: 'good', effects: { rel: { caddie: 6 } }, bonds: { caddie_jordan: 8 }, changes: 'Jordan ♥' },
    },
  },
  {
    id: 'act4_baba_at_the_major',
    title: 'Baba at the Major',
    teaser: 'Saturday at the National Open. Behind the ropes on nine: Baba, his good hat, and a pairings sheet he’s correcting in pencil.',
    act: 4,
    location: 'course_sunset',
    cast: ['baba', 'caddie_jordan'],
    during: true,
    when: (c, s) => onTour(c, s) && at(c, 'National Open Championship') && c.active!.round === 2 && done(s, 'act4_big_leagues'),
    start: 'start',
    nodes: {
      start: {
        lines: [
          { who: 'narrator', text: 'Saturday at the National Open, the season’s third major. Behind the ropes on the ninth: Baba, in his good hat, holding the pairings sheet. He is correcting it with a pencil.' },
          { who: 'baba', expr: 'neutral', pose: 'talk', text: '{Habibti}. They spelled the course wrong. Also your tee time. I fixed both.' },
          { who: 'ryan', expr: 'surprised', text: 'Baba, you have a clubhouse credential. There’s air conditioning in there.' },
          { who: 'baba', expr: 'neutral', pose: 'emphatic', text: 'The clubhouse has carpet. I don’t trust a golf course with carpet.' },
          { who: 'baba', expr: 'neutral', pose: 'think', text: 'Thirty years I mow grass for other people’s majors. This one I just watch. It’s strange. I keep wanting to fix the divots.' },
          { who: 'baba', expr: 'neutral', pose: 'talk', text: 'I’ll be on nine. I know what a bogey is. Don’t make one.' },
        ],
        choice: {
          prompt: 'What does Ryan say?',
          options: [
            { id: 'hug', label: 'Hug him', hint: 'Baba ♥♥, Form +2', next: 'hug' },
            { id: 'sunday', label: '“Stay for Sunday?”', hint: 'Baba ♥, Form +1', next: 'sunday' },
            { id: 'jordan', label: '“Go stand with Jordan.”', hint: 'Baba ♥, Jordan ♥', next: 'jordan' },
          ],
        },
      },
      hug: {
        lines: [
          { who: 'narrator', text: 'Ryan ducks under the rope. The marshal opens his mouth, looks at them, and closes it again.' },
          { who: 'baba', expr: 'neutral', pose: 'talk', text: 'Okay. Okay. People are looking. Go hit your ball.' },
          { who: 'narrator', text: 'On the ninth green Baba tells the gallery the fringe is cut a sixteenth too short. A marshal raises his QUIET PLEASE sign. Baba waves at the marshal.' },
        ],
        outcome: 'hug',
      },
      sunday: {
        lines: [
          { who: 'ryan', expr: 'happy', pose: 'talk', text: 'Stay for Sunday?' },
          { who: 'baba', expr: 'neutral', pose: 'talk', text: 'I’m already staying. I bought the cooler its own seat on the shuttle.' },
          { who: 'narrator', text: 'On the ninth green Baba tells the gallery the fringe is cut a sixteenth too short. A marshal raises his QUIET PLEASE sign. Baba waves at the marshal.' },
        ],
        outcome: 'sunday',
      },
      jordan: {
        lines: [
          { who: 'ryan', expr: 'laughing', pose: 'talk', text: 'Go stand with Jordan. Jordan has the yardage book.' },
          { who: 'caddie_jordan', expr: 'neutral', pose: 'talk', text: 'Every sprinkler head, measured twice.' },
          { who: 'baba', expr: 'neutral', pose: 'emphatic', text: 'Twice is good. I measure three times. Give me the pencil.' },
          { who: 'narrator', text: 'For nine holes Baba corrects the yardage book. Jordan lets him. Two of the corrections are right.' },
        ],
        outcome: 'jordan',
      },
    },
    outcomes: {
      hug: { summary: 'Baba watched his first major from behind the ninth. Ryan hugged him under the rope.', tone: 'good', effects: { form: 2, rel: { mom: 6 } }, bonds: { baba: 12 }, changes: 'Baba ♥♥ · Form +2' },
      sunday: { summary: 'Baba is staying for Sunday. So is his cooler.', tone: 'good', effects: { form: 1, rel: { mom: 4 } }, bonds: { baba: 8 }, changes: 'Baba ♥ · Form +1' },
      jordan: { summary: 'Baba spent nine holes correcting Jordan’s yardage book. Two corrections were right.', tone: 'good', effects: { rel: { mom: 4, caddie: 4 } }, bonds: { baba: 6, caddie_jordan: 6 }, changes: 'Baba ♥ · Jordan ♥' },
    },
  },
  {
    id: 'act4_reading_the_green',
    title: 'Reading the Green',
    teaser: '10:55 p.m., the night before the final round. One flashlight on the 18th green.',
    act: 4,
    location: 'course_sunset',
    cast: ['baba'],
    during: true,
    when: (c, s) => onTour(c, s) && at(c, 'Tour Championship') && c.active!.round === (findTournament(c.active!.tournamentId)?.rounds ?? 4) - 1,
    start: 'start',
    nodes: {
      start: {
        lines: [
          { who: 'narrator', text: '10:55 p.m. The night before the final round. The 18th green is dark except for one flashlight.' },
          { who: 'narrator', text: 'Baba is walking the green. Slowly. Reading every slope like the morning paper.' },
          { who: 'ryan', expr: 'surprised', pose: 'talk', text: 'Baba? It’s almost eleven. Security’s going to think you’re stealing the flag.' },
          { who: 'baba', expr: 'neutral', pose: 'talk', text: 'Security knows me. I told them I mow. They let me in out of respect.' },
          { who: 'baba', expr: 'confident', pose: 'emphatic', text: 'Left edge breaks two cups more than it looks. Back right is faster than the pro says. The pro is wrong. Don’t tell him.' },
          { who: 'ryan', expr: 'happy', text: 'You walked the whole green?' },
          { who: 'baba', expr: 'neutral', pose: 'think', text: 'Twice. The second time to check the first time.' },
          { who: 'baba', expr: 'neutral', pose: 'talk', text: 'Tomorrow you win, good. You lose, you come home, I make breakfast, and we go to the range at six. Same as always.' },
        ],
        choice: {
          prompt: 'It’s almost eleven.',
          options: [
            { id: 'walk', label: 'Walk it with him', hint: 'Baba ♥, Form +1', next: 'walk' },
            { id: 'bed', label: 'Go to bed', hint: 'Energy +8', next: 'bed' },
          ],
        },
      },
      walk: {
        lines: [
          { who: 'narrator', text: 'They walk the green together. Neither says anything. A sprinkler comes on three greens over. Neither of them moves.' },
          { who: 'baba', expr: 'neutral', pose: 'give', text: 'Here. BOBO MILKY. Then bed. You have a job tomorrow.' },
        ],
        outcome: 'walk',
      },
      bed: {
        lines: [
          { who: 'ryan', expr: 'neutral', pose: 'talk', text: 'Goodnight, Baba.' },
          { who: 'baba', expr: 'neutral', pose: 'talk', text: 'Goodnight, {habibti}. Back right is fast. I’ll tell you again at breakfast.' },
        ],
        outcome: 'bed',
      },
    },
    outcomes: {
      walk: { summary: 'Walked the 18th green with Baba at 10:55 p.m. He was right about the back right.', tone: 'good', effects: { form: 1 }, bonds: { baba: 8 }, changes: 'Baba ♥ · Form +1' },
      bed: { summary: 'Left Baba reading the 18th green and got some sleep.', tone: 'good', effects: { energy: 8 }, bonds: { baba: 3 }, changes: 'Energy +8' },
    },
  },
  {
    id: 'act4_championship_sunday',
    title: 'Championship Sunday',
    teaser: 'The Tour Championship. Three feet. A coffee can.',
    act: 4,
    location: 'course_sunset',
    cast: ['baba', 'caddie_jordan', 'kayla_brooks'],
    when: (c, s) => onTour(c, s) && lastWasTourChampionship(c) && wonIt(c),
    start: 'start',
    nodes: {
      start: {
        lines: [
          { who: 'narrator', text: 'That morning. First tee, the Tour Championship, final round.' },
          { who: 'caddie_jordan', expr: 'neutral', pose: 'talk', text: 'Sunday towel. It’s the good one. Don’t tell Tuesday.' },
          { who: 'kayla_brooks', expr: 'happy', pose: 'talk', text: 'Best friend rules: I want to beat you by one, and then I want to buy you a BOBO MILKY.', ifFlag: { key: 'kayla', is: 'friends' } },
          { who: 'kayla_brooks', expr: 'confident', pose: 'emphatic', text: 'Sunday. First tee. Just like I said. Try to keep up, muni kid.', ifFlag: { key: 'kayla', is: 'rivals' } },
          { who: 'kayla_brooks', expr: 'happy', pose: 'talk', text: 'Dinner’s at eight. Win or lose. I checked the sky for helicopters twice.', ifFlag: { key: 'kayla', is: 'dinner' } },
          { who: 'kayla_brooks', expr: 'confident', pose: 'talk', text: 'Whatever happens, I’m buying the first BOBO MILKY. You’re buying the rest.', ifFlag: { key: 'kayla', is: null } },
          { who: 'narrator', text: 'Up in the TV booth, they get Ryan’s name right on the first try. Nobody is more surprised than they are.' },
          { who: 'narrator', text: 'Eighteen holes later, the putt for the title is exactly three feet. Ryan can’t get the straw out of its wrapper. Jordan produces a spare from the bag and hands it over like a surgeon.' },
          { who: 'caddie_jordan', expr: 'neutral', pose: 'give', text: 'For emergencies.' },
          { who: 'baba', expr: 'neutral', pose: 'talk', text: 'Fifty from three feet. Every day.' },
          { who: 'narrator', text: 'It drops. The TV booth calls it for the wrong player, then corrects themselves on air. A mower crosses the 18th during the trophy speech.' },
          { who: 'narrator', text: 'Behind the podium. Biff’s assistant stands at the back holding a velvet case with a broken wooden tee in it. Nobody asks.' },
          { who: 'baba', expr: 'neutral', pose: 'give', text: 'Fairway boy. Your season total. Unrepaired ball marks.' },
          { who: 'narrator', text: 'He hands Biff a scorecard. The number on it has a comma.' },
          { who: 'narrator', text: 'Baba is holding a coffee can. On the side, in his handwriting: RYAN — PRO.' },
          { who: 'baba', expr: 'neutral', pose: 'give', text: 'Now you can open it.' },
          { who: 'narrator', text: 'Inside: broken wooden tees. Hundreds of them. Every one he ever fixed a ball mark with, since the day she first held a putter upside down.' },
          { who: 'ryan', expr: 'surprised', pose: 'talk', text: 'Baba. You kept all of these?' },
          { who: 'baba', expr: 'neutral', pose: 'talk', text: 'I don’t throw things away. Also, your follow-through was fine today. Don’t let it go to your head.' },
        ],
        next: 'photo',
      },
      photo: {
        lines: [
          { who: 'narrator', text: 'The podium photo. Biff tries to get in it. The mower goes around him.' },
          { who: 'narrator', text: 'Meanwhile, at Desert Palms: a watch party in the sportsbook. Emmett has made a banner. It reads FORE THE WIN. The dealers cheer, the regulars cheer, and the Stick Lady calls “Winner, winner!” at a TV.' },
        ],
        outcome: 'won',
      },
    },
    outcomes: {
      won: { summary: 'Won the Tour Championship. The putt was three feet. Baba handed over the can.', tone: 'good', effects: { fame: 5, form: 3, flags: { storyComplete: 'won', canOpened: true } }, bonds: { baba: 15, caddie_jordan: 6, kayla_brooks: 6 }, changes: 'Story complete · Fame +5 · Baba ♥♥♥' },
    },
  },
  {
    id: 'act4_championship_sunday_next_year',
    title: 'Championship Sunday',
    teaser: 'The Tour Championship is over. Baba has a promise to keep.',
    act: 4,
    location: 'course_sunset',
    cast: ['baba', 'caddie_jordan', 'kayla_brooks'],
    when: (c, s) => onTour(c, s) && lastWasTourChampionship(c) && !wonIt(c) && !done(s, 'act4_championship_sunday'),
    start: 'start',
    nodes: {
      start: {
        lines: [
          { who: 'narrator', text: 'That morning. First tee, the Tour Championship, final round.' },
          { who: 'caddie_jordan', expr: 'neutral', pose: 'talk', text: 'Sunday towel. It’s the good one. Don’t tell Tuesday.' },
          { who: 'kayla_brooks', expr: 'happy', pose: 'talk', text: 'Best friend rules: I want to beat you by one, and then I want to buy you a BOBO MILKY.', ifFlag: { key: 'kayla', is: 'friends' } },
          { who: 'kayla_brooks', expr: 'confident', pose: 'emphatic', text: 'Sunday. First tee. Just like I said. Try to keep up, muni kid.', ifFlag: { key: 'kayla', is: 'rivals' } },
          { who: 'kayla_brooks', expr: 'happy', pose: 'talk', text: 'Dinner’s at eight. Win or lose. I checked the sky for helicopters twice.', ifFlag: { key: 'kayla', is: 'dinner' } },
          { who: 'kayla_brooks', expr: 'confident', pose: 'talk', text: 'Whatever happens, I’m buying the first BOBO MILKY. You’re buying the rest.', ifFlag: { key: 'kayla', is: null } },
          { who: 'narrator', text: 'Up in the TV booth, they get Ryan’s name right on the first try. Nobody is more surprised than they are.' },
          { who: 'narrator', text: 'Eighteen holes later, it isn’t her day. Close. Not close enough.' },
          { who: 'baba', expr: 'neutral', pose: 'talk', text: 'You come home, I make breakfast, and we go to the range at six. Same as always.' },
          { who: 'narrator', text: 'Back home, the RYAN — PRO can goes back on the shelf. Baba dusts it. He has never dusted anything in his life.' },
          { who: 'narrator', text: 'At Desert Palms the watch party goes on anyway. Emmett turns his banner over. The back reads FORE NEXT YEAR. He made both.' },
          { who: 'baba', expr: 'neutral', pose: 'talk', text: 'Next year, {habibti}.' },
        ],
        outcome: 'next_year',
      },
    },
    outcomes: {
      next_year: { summary: 'The Tour Championship wasn’t hers this year. Breakfast, then the range at six. The can stays on the shelf for next year.', tone: 'neutral', effects: { form: 1, flags: { storyComplete: 'next_year' } }, bonds: { baba: 8 }, changes: 'Story complete · Baba ♥' },
    },
  },
];
