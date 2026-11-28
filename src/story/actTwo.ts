/**
 * Act II: The Grind (phase 2, he/him). Outline: "Ryan's Road: Acts II–IV Story Outline", 2026-11-27.
 * Tone: The Naked Gun with a dash of Leisure Suit Larry. Everyone plays it straight; the golf world
 * is absurd; innuendo never gets explicit. Approved under the owner's standing approval (docs/APPROVALS.md).
 *
 * Third-person lines about Ryan use `{he}`/`{his}` tokens (src/story/phase.ts). Baba's Act II beats
 * Baba's art: src/assets/characters/baba.png (cut by tools/cut_baba.py from the author's sheet).
 */
import type { CareerState } from '../career/types';
import { playerRating } from '../career/stats';
import type { EncounterDef } from './encounters';
import type { StoryState } from './types';

const SEASON = 30;
/** Weeks since an encounter was played (Infinity if it hasn't been). */
const since = (c: CareerState, s: StoryState, id: string) => {
  const r = s.encounters[id];
  return r ? (c.season - r.season) * SEASON + (c.week - r.week) : -Infinity;
};

export const ACT_TWO: EncounterDef[] = [
  {
    id: 'act2_motel_six_iron',
    title: 'Motel Six Iron',
    teaser: 'Marty Mulligan has a business card, a plan, and something inflatable.',
    act: 1,
    location: 'clubhouse_lounge',
    cast: ['marty_mulligan'],
    // Act II begins once the first Q-School is over, whatever happened there.
    when: (c, s) => s.act === 1 && c.qschool.result !== null,
    start: 'start',
    nodes: {
      start: {
        lines: [
          { who: 'narrator', text: 'Q-School is over. Ryan sits in the clubhouse lounge doing next year’s math on a napkin. The napkin is losing.' },
          { who: 'marty_mulligan', expr: 'happy', pose: 'talk', text: 'Ryan! Marty Mulligan, Mulligan Management. Don’t get up. Actually, get up, I need the chair.' },
          { who: 'narrator', text: 'Marty hands over a business card. It is laminated. It is also a coupon for a car wash.' },
          { who: 'marty_mulligan', expr: 'confident', pose: 'confident', text: 'Kid, I’ve watched every shot you’ve hit this year. Twice. Once on purpose.' },
          { who: 'ryan', expr: 'surprised', text: 'Are you... an agent?' },
          { who: 'marty_mulligan', expr: 'laughing', pose: 'talk', text: 'Agent, manager, travel department, nutritionist. The nutrition plan is gas-station sushi, but it’s a plan.' },
          { who: 'marty_mulligan', expr: 'confident', pose: 'talk', text: 'Twelve months. Every Monday qualifier, every Korn Ferry stop that’ll have us. Motels with a pool. Some of the pools have water.' },
          { who: 'marty_mulligan', expr: 'happy', pose: 'celebrate', text: 'And my game changer.' },
          { who: 'narrator', text: 'Marty unfolds something rubber. It inflates. It is a life-size inflatable caddie with a mustache.' },
          { who: 'marty_mulligan', expr: 'confident', pose: 'confident', text: 'This is Doug.' },
        ],
        choice: {
          prompt: 'What does Ryan do?',
          options: [
            { id: 'sign', label: 'Sign with Marty', hint: 'A $450 signing bonus (Marty found $500 somewhere), Marty ♥', next: 'sign' },
            { id: 'solo', label: 'Do it yourself', hint: '+Form, −Energy, book your own motels', next: 'solo' },
            { id: 'doug', label: 'Ask about Doug', hint: 'Marty ♥, Fame +1, nobody is ready', next: 'doug' },
          ],
        },
      },
      sign: {
        lines: [
          { who: 'ryan', expr: 'confident', pose: 'talk', text: 'Okay, Marty. Let’s go.' },
          { who: 'marty_mulligan', expr: 'laughing', pose: 'celebrate', text: 'GAME CHANGER! Pack light. Pack Doug.' },
          { who: 'narrator', text: 'Ryan signs on the napkin. Marty frames the napkin before the ink is dry. Act II begins.' },
        ],
        outcome: 'signed',
      },
      solo: {
        lines: [
          { who: 'ryan', expr: 'confident', pose: 'talk', text: 'Thanks, Marty. I’ll book my own motels.' },
          { who: 'marty_mulligan', expr: 'disappointed', pose: 'disappointed', text: 'You’ll be back. Everybody comes back to Marty. Doug came back.' },
          { who: 'narrator', text: 'Ryan drives off with a road atlas, a car with no reverse gear, and a cooler of Baba’s sandwiches. Act II begins.' },
        ],
        outcome: 'solo',
      },
      doug: {
        lines: [
          { who: 'ryan', expr: 'worried', text: 'Okay. I have to know about Doug.' },
          { who: 'marty_mulligan', expr: 'confident', pose: 'talk', text: 'Doug caddied the ’98 Monday qualifier in Tulsa. Held the flag for six hours. Never once complained.' },
          { who: 'narrator', text: 'A gust from the air conditioning tips Doug face-first into the trophy case. Nobody moves.' },
          { who: 'marty_mulligan', expr: 'worried', text: '...He does this.' },
          { who: 'narrator', text: 'Ryan leaves without signing anything, but somehow with Marty’s number on speed dial. Act II begins.' },
        ],
        outcome: 'doug',
      },
    },
    outcomes: {
      signed: { summary: 'Signed with Marty Mulligan. The road starts Monday.', tone: 'good', effects: { money: 450, flags: { agent: 'marty' } }, bonds: { marty_mulligan: 10 }, changes: '+$450 · Marty ♥ · Act II begins · new look unlocked', act: 2 },
      solo: { summary: 'Turned Marty down and hit the road alone.', tone: 'neutral', effects: { form: 2, energy: -5 }, bonds: { marty_mulligan: -2 }, changes: 'Form +2 · −5 Energy · Act II begins · new look unlocked', act: 2 },
      doug: { summary: 'Learned far too much about Doug.', tone: 'neutral', effects: { fame: 1 }, bonds: { marty_mulligan: 6 }, changes: 'Fame +1 · Marty ♥ · Act II begins · new look unlocked', act: 2 },
    },
  },
  {
    id: 'act2_the_sponsor',
    title: 'The Sponsor',
    teaser: 'Fairway Family Holdings would like a word. Biff would like several.',
    act: 2,
    location: 'clubhouse_lounge',
    cast: ['sponsor_dawson', 'biff_fairway'],
    when: (c, s) => s.act === 2 && since(c, s, 'act2_motel_six_iron') >= 4,
    start: 'start',
    nodes: {
      start: {
        lines: [
          { who: 'narrator', text: 'A press tent. Ryan was told it was a sandwich tent. There are no sandwiches.' },
          { who: 'sponsor_dawson', expr: 'confident', pose: 'talk', text: 'Ryan. Dawson, Fairway Family Holdings. Premium golf lifestyle products, and a very successful parking garage.' },
          { who: 'sponsor_dawson', expr: 'happy', pose: 'talk', text: 'We’d like to sponsor you. Three thousand dollars. A few small conditions.' },
          { who: 'biff_fairway', expr: 'confident', pose: 'confident', text: 'Tiny conditions. Itty-bitty. Read them out, Dawson.' },
          { who: 'sponsor_dawson', expr: 'neutral', pose: 'talk', text: 'One: a gold-flake visor at all times. Two: an Aurum-X decal on your bag. Three: on television, you call Biff “Mr. Fairway.”' },
          { who: 'ryan', expr: 'surprised', text: 'Is that microphone on?' },
          { who: 'narrator', text: 'The microphone is on. It has been on the whole time. Reporter Kim waves politely from the back row.' },
          { who: 'biff_fairway', expr: 'laughing', pose: 'talk', text: 'Say it, muni kid. “Thank you, Mr. Fairway.” Feel how good that feels.' },
        ],
        choice: {
          prompt: 'What does Ryan do?',
          options: [
            { id: 'take', label: 'Take the money', hint: '+$3,000, Fame −2, Biff ♥', next: 'take' },
            { id: 'decline', label: 'Decline, live on air', hint: 'Fame +3, Biff ♥−', next: 'decline' },
            { id: 'haggle', label: 'One putt for the visor', hint: 'Putting challenge: make it and the conditions go away', next: 'haggle' },
          ],
        },
      },
      take: {
        lines: [
          { who: 'ryan', expr: 'disappointed', pose: 'disappointed', text: '...Thank you, Mr. Fairway.' },
          { who: 'biff_fairway', expr: 'laughing', pose: 'celebrate', text: 'Did everyone hear that? Somebody clip that. Somebody clip it in gold.' },
          { who: 'narrator', text: 'The visor sheds gold flakes into everything Ryan eats for a month. {His} sandwiches are worth more than {his} car.' },
        ],
        outcome: 'sponsored',
      },
      decline: {
        lines: [
          { who: 'ryan', expr: 'confident', pose: 'confident', text: 'I appreciate it, Mr. Dawson. Pass.' },
          { who: 'biff_fairway', expr: 'surprised', text: 'On TV? You can’t pass on TV.' },
          { who: 'narrator', text: 'Ryan can. Ryan did. The clip gets two million views, mostly for Biff’s face.' },
          { who: 'sponsor_dawson', expr: 'worried', text: 'I’ll... put you down as a maybe.' },
        ],
        outcome: 'declined',
      },
      haggle: {
        lines: [
          { who: 'ryan', expr: 'confident', pose: 'talk', text: 'Tell you what, Biff. One putt. I make it: no visor, no “Mister.”' },
          { who: 'biff_fairway', expr: 'laughing', pose: 'talk', text: 'Ha! Fine. Dawson, write that down.' },
          { who: 'sponsor_dawson', expr: 'confident', pose: 'confident', text: 'I’m writing it in gold ink, sir.' },
        ],
        challenge: { kind: 'putt', opponent: 'biff_fairway' },
        win: 'haggle_win',
        lose: 'haggle_lose',
      },
      haggle_win: {
        lines: [
          { who: 'narrator', text: 'Ryan’s putt drops. Biff demands a re-putt, misses it, and the ball comes to rest on Dawson’s shoe.' },
          { who: 'sponsor_dawson', expr: 'happy', pose: 'talk', text: 'Contract amended. Three thousand dollars. No visor, no mister.' },
          { who: 'biff_fairway', expr: 'angry', pose: 'disappointed', text: 'I want it noted that the green was bumpy. It’s carpet, but it was bumpy.' },
        ],
        outcome: 'sponsored_clean',
      },
      haggle_lose: {
        lines: [
          { who: 'biff_fairway', expr: 'laughing', pose: 'celebrate', text: 'MISTER! FAIRWAY!' },
          { who: 'narrator', text: 'The visor goes on. It is very, very shiny. A passing pilot reports it to the tower.' },
        ],
        outcome: 'sponsored_visor',
      },
    },
    outcomes: {
      sponsored: { summary: 'Took the Fairway Family Holdings deal, conditions and all.', tone: 'neutral', effects: { money: 3000, fame: -2 }, bonds: { biff_fairway: 6, sponsor_dawson: 6 }, changes: '+$3,000 · Fame −2 · Biff ♥' },
      declined: { summary: 'Turned down Biff’s sponsor on live TV.', tone: 'good', effects: { fame: 3 }, bonds: { biff_fairway: -6 }, changes: 'Fame +3 · Biff ♥−' },
      sponsored_clean: { summary: 'Won the sponsorship putt: the money, without the visor.', tone: 'good', effects: { money: 3000, fame: 2 }, bonds: { biff_fairway: -4, sponsor_dawson: 4 }, changes: '+$3,000 · Fame +2' },
      sponsored_visor: { summary: 'Lost the putt. Got the money. Got the visor.', tone: 'neutral', effects: { money: 3000, fame: -1 }, bonds: { biff_fairway: 4 }, changes: '+$3,000 · Fame −1 · one very shiny visor' },
    },
  },
  {
    id: 'act2_rain_delay',
    title: 'Rain Delay',
    teaser: 'A storm, one golf cart, and Kayla Brooks.',
    act: 2,
    location: 'course_sunset',
    cast: ['kayla_brooks'],
    when: (c, s) => s.act === 2 && since(c, s, 'act2_the_sponsor') >= 5,
    start: 'start',
    nodes: {
      start: {
        lines: [
          { who: 'narrator', text: 'The horn sounds. Lightning. Every player on the course sprints for a cart. Ryan finds one. So does Kayla Brooks. It is the same one.' },
          { who: 'kayla_brooks', expr: 'confident', pose: 'confident', text: 'Scoot. I’m not getting struck by lightning for you, muni.' },
          { who: 'narrator', text: 'They sit. The rain is loud. The cart is small. Nobody mentions how small the cart is.' },
          { who: 'kayla_brooks', expr: 'neutral', pose: 'talk', text: 'Saw your Monday round. You still hang your left hip on the short putts.' },
          { who: 'ryan', expr: 'surprised', text: 'You watched my Monday round?' },
          { who: 'kayla_brooks', expr: 'worried', text: '...I watch everybody’s rounds. I keep score of everything. It’s a whole thing.' },
          { who: 'narrator', text: 'Kayla Brooks, it turns out, is a terrible liar.' },
        ],
        choice: {
          prompt: 'Ryan gets one shot at this. What does {he} say?',
          options: [
            { id: 'honest', label: 'Tell her the truth', hint: 'Kayla ♥♥, Form +1', next: 'honest' },
            { id: 'line', label: 'Try a golf pickup line', hint: 'Bold. Almost certainly bad.', next: 'line' },
            { id: 'shop', label: 'Talk shop', hint: 'Form +2, Kayla ♥, safe', next: 'shop' },
          ],
        },
      },
      honest: {
        lines: [
          { who: 'ryan', expr: 'happy', pose: 'talk', text: 'Honestly? You’re the best putter I’ve ever seen. It’s really annoying.' },
          { who: 'kayla_brooks', expr: 'happy', text: '...That’s the nicest thing anyone’s ever said to me on a golf course.' },
          { who: 'narrator', text: 'She leans in. He leans in. Somewhere beneath them, a parking brake quietly gives up.' },
          { who: 'narrator', text: 'The cart rolls, gently, majestically, into the pond beside the 14th.' },
          { who: 'kayla_brooks', expr: 'surprised', text: 'Are we—' },
          { who: 'ryan', expr: 'surprised', text: 'We’re in the pond.' },
          { who: 'kayla_brooks', expr: 'laughing', pose: 'celebrate', text: 'We’re in the pond!' },
          { who: 'narrator', text: 'A marshal strolls past with an umbrella, looks at them, and keeps strolling.' },
        ],
        outcome: 'honest',
      },
      line: {
        lines: [
          { who: 'ryan', expr: 'confident', pose: 'confident', text: 'So. Do you come here often, or is it just par for the course?' },
          { who: 'kayla_brooks', expr: 'laughing', text: 'Oh no.' },
          { who: 'ryan', expr: 'confident', pose: 'talk', text: 'I’ve got more. Are you a sand wedge? Because you really get me out of—' },
          { who: 'kayla_brooks', expr: 'laughing', pose: 'celebrate', text: 'Please. Please don’t finish that.' },
          { who: 'narrator', text: 'She’s laughing, though. That counts. Somewhere beneath them, a parking brake gives up.' },
          { who: 'narrator', text: 'The cart rolls, gently, majestically, into the pond beside the 14th.' },
          { who: 'kayla_brooks', expr: 'surprised', text: 'Was that part of the line?' },
          { who: 'ryan', expr: 'disappointed', text: 'It was not part of the line.' },
        ],
        outcome: 'line',
      },
      shop: {
        lines: [
          { who: 'ryan', expr: 'neutral', pose: 'talk', text: 'What are you hitting into the par fives?' },
          { who: 'kayla_brooks', expr: 'confident', pose: 'talk', text: 'Five-wood. Like a professional. You?' },
          { who: 'ryan', expr: 'happy', text: 'Whatever’s left in the bag.' },
          { who: 'narrator', text: 'They talk lofts and lies for an hour. It is, somehow, the best hour of Ryan’s season. Then the parking brake gives up.' },
          { who: 'narrator', text: 'The cart rolls, gently, majestically, into the pond beside the 14th.' },
          { who: 'kayla_brooks', expr: 'laughing', text: 'Same time next storm?' },
        ],
        outcome: 'shop',
      },
    },
    outcomes: {
      honest: { summary: 'Told Kayla the truth in a golf cart. Then the cart went in the pond.', tone: 'good', effects: { form: 1, rel: { rival: 8 } }, bonds: { kayla_brooks: 12 }, changes: 'Kayla ♥♥ · Form +1 · one golf cart, lost' },
      line: { summary: 'Tried a pickup line on Kayla. She laughed. The cart went in the pond.', tone: 'neutral', effects: { rel: { rival: 4 } }, bonds: { kayla_brooks: 6 }, changes: 'Kayla ♥ (she laughed) · one golf cart, lost' },
      shop: { summary: 'Talked lofts with Kayla through a rain delay, right up until the pond.', tone: 'good', effects: { form: 2, rel: { rival: 4 } }, bonds: { kayla_brooks: 4 }, changes: 'Form +2 · Kayla ♥ · one golf cart, lost' },
    },
  },
  {
    id: 'act2_monday_goose',
    title: 'Monday Qualifier',
    teaser: 'Eighty-two players. Nine spots. One goose.',
    act: 2,
    location: 'course_sunset',
    cast: ['commissioner_clipboard'],
    when: (c, s) => s.act === 2 && since(c, s, 'act2_rain_delay') >= 4,
    start: 'start',
    nodes: {
      start: {
        lines: [
          { who: 'narrator', text: 'Monday qualifier. Eighty-two players, nine spots. Ryan needs a twelve-footer on the 18th to get in.' },
          { who: 'narrator', text: 'There is a goose on the 18th green. It is standing exactly on Ryan’s line.' },
          { who: 'ryan', expr: 'worried', text: 'Commissioner? Can I get a ruling?' },
          { who: 'commissioner_clipboard', expr: 'confident', pose: 'talk', text: 'Under Rule 15.2, a goose is a movable obstruction.' },
          { who: 'commissioner_clipboard', expr: 'neutral', pose: 'talk', text: 'However. Under the Monday Qualifier Supplement, Section 9, Paragraph C, this goose has seniority.' },
          { who: 'ryan', expr: 'surprised', text: 'The goose has SENIORITY?' },
          { who: 'commissioner_clipboard', expr: 'confident', pose: 'confident', text: 'It has been here since 2009. You have been here since seven a.m.' },
          { who: 'narrator', text: 'The goose honks once. It sounds like a ruling.' },
        ],
        choice: {
          prompt: 'What does Ryan do?',
          options: [
            { id: 'around', label: 'Putt around the goose', hint: 'Putting challenge: make it and you’re in', next: 'around' },
            { id: 'talk', label: 'Negotiate with the goose', hint: 'Diplomacy, then the same putt', next: 'talk' },
            { id: 'wait', label: 'Wait it out', hint: '+Energy, but you’ll lose your tee time', next: 'wait' },
          ],
        },
      },
      around: {
        lines: [
          { who: 'narrator', text: 'Ryan reads the break. The goose reads Ryan. Twelve feet, a goose-shaped dogleg.' },
        ],
        challenge: { kind: 'putt', opponent: 'commissioner_clipboard' },
        win: 'made',
        lose: 'missed',
      },
      talk: {
        lines: [
          { who: 'narrator', text: 'Ryan crouches and explains {his} situation to the goose: the car, the motel, the cooler of sandwiches.' },
          { who: 'narrator', text: 'The goose listens. Honks. Moves exactly six inches to the left.' },
          { who: 'commissioner_clipboard', expr: 'surprised', text: 'In twenty years of officiating, I have never seen the goose compromise.' },
        ],
        challenge: { kind: 'putt', opponent: 'commissioner_clipboard' },
        win: 'made',
        lose: 'missed',
      },
      made: {
        lines: [
          { who: 'narrator', text: 'The ball curls around the goose and drops. The goose looks at the hole, then at Ryan, then honks with what may be respect.' },
          { who: 'commissioner_clipboard', expr: 'happy', pose: 'talk', text: 'Ryan, you’re in. Please initial here, here, and here. And here. The goose initials here.' },
        ],
        outcome: 'qualified',
      },
      missed: {
        lines: [
          { who: 'narrator', text: 'The putt hits the goose. The goose does not move. The ball stops. Everyone stares at the goose.' },
          { who: 'commissioner_clipboard', expr: 'neutral', pose: 'talk', text: 'Rub of the green. And of the goose. Better luck next Monday.' },
        ],
        outcome: 'missed',
      },
      wait: {
        lines: [
          { who: 'ryan', expr: 'neutral', pose: 'talk', text: 'I’ll wait.' },
          { who: 'narrator', text: 'Forty minutes later the goose leaves. So does the qualifier.' },
          { who: 'commissioner_clipboard', expr: 'neutral', text: 'For what it’s worth, the goose thought you showed patience.' },
        ],
        outcome: 'waited',
      },
    },
    outcomes: {
      qualified: { summary: 'Putted around a goose with seniority and got through the Monday qualifier.', tone: 'good', effects: { fame: 2, form: 2 }, bonds: { commissioner_clipboard: 4 }, changes: 'Fame +2 · Form +2 · the goose respects you' },
      missed: { summary: 'The goose stayed undefeated.', tone: 'bad', effects: { form: -1, energy: -4 }, changes: 'Form −1 · −4 Energy · the goose remains undefeated' },
      waited: { summary: 'Waited out the goose. Missed the qualifier.', tone: 'neutral', effects: { energy: 8, form: -1 }, changes: '+8 Energy · Form −1' },
    },
  },
  {
    id: 'act2_sunday_dinner',
    title: 'Sunday Dinner',
    teaser: 'Baba has four foil trays, a cooler, and opinions about your putting.',
    act: 2,
    location: 'driving_range',
    cast: ['baba'],
    when: (c, s) => s.act === 2 && since(c, s, 'act2_monday_goose') >= 4,
    start: 'start',
    nodes: {
      start: {
        lines: [
          { who: 'narrator', text: 'Sunday at the muni. A picnic table behind the maintenance shed. Baba has brought dinner in four foil trays and a cooler.' },
          { who: 'baba', expr: 'neutral', pose: 'talk', text: '{Habibi}. Sit. Eat. You look like a one-iron.' },
          { who: 'ryan', expr: 'happy', text: 'Hi, Baba.' },
          { who: 'narrator', text: 'Baba hands over a carton of BOBO MILKY without asking. He has never once asked.' },
          { who: 'baba', expr: 'confident', pose: 'give', text: 'Drink. Calcium. Your bones are the only thing on tour that isn’t rented.' },
          { who: 'baba', expr: 'neutral', pose: 'emphatic', text: 'I watched your Monday round on the phone. The little phone. Your putting is a crime.' },
          { who: 'ryan', expr: 'confident', pose: 'talk', text: 'I got through the qualifier, Baba.' },
          { who: 'baba', expr: 'confident', pose: 'talk', text: 'Through. Not over. Through is a door. You walked through a door. Congratulations.' },
          { who: 'narrator', text: 'He checks his gold watch. Dinner has been going for four minutes.' },
          { who: 'baba', expr: 'neutral', pose: 'idle', text: 'Eat. Then fifty from three feet. The practice green is right there. I mowed it for you. Diagonal.' },
        ],
        choice: {
          prompt: 'What does Ryan do?',
          options: [
            { id: 'putt', label: 'Fifty from three feet, right now', hint: 'Putting challenge with Baba watching, Form +', next: 'putt' },
            { id: 'eat', label: 'Eat first. Talk.', hint: 'Baba ♥♥, +Energy', next: 'eat' },
            { id: 'biff', label: 'Tell him about Biff', hint: 'Baba ♥, ball marks', next: 'biff' },
          ],
        },
      },
      putt: {
        lines: [
          { who: 'ryan', expr: 'confident', pose: 'talk', text: 'Okay. Fifty. Count them.' },
          { who: 'baba', expr: 'neutral', pose: 'idle', text: 'I always count.' },
        ],
        challenge: { kind: 'putt', opponent: 'baba' },
        win: 'putt_made',
        lose: 'putt_missed',
      },
      putt_made: {
        lines: [
          { who: 'narrator', text: 'Forty-nine in a row. The fiftieth hangs on the lip, thinks about it, and drops.' },
          { who: 'baba', expr: 'neutral', pose: 'idle', text: 'Fifty.' },
          { who: 'narrator', text: 'A pause. The corner of Baba’s mustache moves about one millimetre.' },
          { who: 'baba', expr: 'happy', pose: 'confident', text: 'Okay. Now eat. The kofta is getting cold, and so am I.' },
        ],
        outcome: 'putt_made',
      },
      putt_missed: {
        lines: [
          { who: 'narrator', text: 'Number thirty-one lips out.' },
          { who: 'baba', expr: 'neutral', pose: 'emphatic', text: 'Again.' },
          { who: 'ryan', expr: 'worried', text: 'From the start?' },
          { who: 'baba', expr: 'confident', pose: 'talk', text: 'Where else would you start? The middle? Life doesn’t have a middle, {habibi}.' },
          { who: 'narrator', text: 'It is dark by the time Ryan makes fifty. Baba holds the flashlight the whole time, complaining, and doesn’t leave once.' },
        ],
        outcome: 'putt_missed',
      },
      eat: {
        lines: [
          { who: 'ryan', expr: 'happy', pose: 'talk', text: 'Can we just eat first?' },
          { who: 'baba', expr: 'worried', pose: 'think', text: '...Fine. Ten minutes. Then putting.' },
          { who: 'narrator', text: 'It is not ten minutes. It is an hour. Baba explains the correct way to mow a fairway, twice, with diagrams drawn on a napkin.' },
          { who: 'baba', expr: 'angry', pose: 'emphatic', text: 'Eleven unrepaired ball marks on fourteen today. ELEVEN. People are animals.' },
          { who: 'ryan', expr: 'laughing', text: 'You counted?' },
          { who: 'baba', expr: 'neutral', pose: 'idle', text: 'I always count. Fix your ball marks. It’s the only rule.' },
          { who: 'baba', expr: 'neutral', pose: 'talk', text: '...And call more. Not for me. For the practice green. It worries.' },
          { who: 'narrator', text: 'The practice green does not worry. Baba checks his watch so nobody sees his face.' },
        ],
        outcome: 'ate',
      },
      biff: {
        lines: [
          { who: 'ryan', expr: 'laughing', pose: 'talk', text: 'Biff Fairway keeps turning up at my events. He has a gold everything now.' },
          { who: 'baba', expr: 'angry', pose: 'angry', text: 'The Fairway boy.' },
          { who: 'baba', expr: 'neutral', pose: 'emphatic', text: 'Fourteen ball marks the last time he played here. Fourteen. I counted. I always count.' },
          { who: 'baba', expr: 'confident', pose: 'confident', text: 'You know what money can’t buy, {habibi}? A ball-mark repair. You have to bend down. Rich people don’t bend.' },
          { who: 'narrator', text: 'He says this with the satisfaction of a man who has bent down several thousand times.' },
        ],
        outcome: 'biff',
      },
    },
    outcomes: {
      putt_made: { summary: 'Made fifty from three feet with Baba counting.', tone: 'good', effects: { form: 2, energy: -3, rel: { mom: 6 } }, bonds: { baba: 6 }, changes: 'Form +2 · −3 Energy · Baba ♥' },
      putt_missed: { summary: 'Fifty from three feet, by flashlight. Baba stayed the whole time.', tone: 'good', effects: { form: 1, energy: -6, rel: { mom: 8 } }, bonds: { baba: 8 }, changes: 'Form +1 · −6 Energy · Baba ♥' },
      ate: { summary: 'Ate first. Heard about ball marks. Promised to call more.', tone: 'good', effects: { energy: 8, rel: { mom: 10 } }, bonds: { baba: 10 }, changes: '+8 Energy · Baba ♥♥' },
      biff: { summary: 'Told Baba about Biff. Learned Biff’s exact ball-mark total.', tone: 'neutral', effects: { rel: { mom: 6 }, form: 1 }, bonds: { baba: 6 }, changes: 'Baba ♥ · Form +1' },
    },
  },
  {
    // "What fits" (1 of 2). Played straight, never for a laugh, in Ryan's own words.
    id: 'act2_the_signature',
    title: 'The Signature',
    teaser: 'A good round, a scorecard, and a name at the bottom of it.',
    act: 2,
    location: 'clubhouse_lounge',
    cast: [],
    when: (c, s) => s.act === 2 && since(c, s, 'act2_sunday_dinner') >= 4,
    start: 'start',
    nodes: {
      start: {
        lines: [
          { who: 'narrator', text: 'The scorer’s tent, after the round. A 68, the best of the year. The official slides the card across the table for a signature.' },
          { who: 'narrator', text: 'Ryan signs it. Then just looks at it for a while.' },
          { who: 'narrator', text: 'That night, in the motel, Ryan writes in the journal Baba gave {him} for Q-School. {He}’s never written in it before.' },
          { who: 'ryan', expr: 'neutral', text: 'Shot 68 today. Best round all year. Everyone kept saying “big guy” and “my man” and slapping my back, and every time it felt like they were talking to somebody standing next to me.' },
          { who: 'ryan', expr: 'neutral', text: 'I love this game. That part is real. It’s everything around it that feels like a shirt somebody else picked out.' },
          { who: 'ryan', expr: 'neutral', text: 'I don’t know what that means yet. I think I’m allowed to not know yet.' },
        ],
        choice: {
          prompt: 'The pen is still in Ryan’s hand.',
          options: [
            { id: 'more', label: 'Keep writing', hint: 'Form +1', next: 'more' },
            { id: 'close', label: 'Close the journal for tonight', hint: 'Energy +5', next: 'close' },
          ],
        },
      },
      more: {
        lines: [
          { who: 'ryan', expr: 'neutral', text: 'Things that feel right: the range at six. Baba’s terrible advice. The sound a putt makes when it’s good from the moment it leaves the face.' },
          { who: 'ryan', expr: 'happy', text: 'Things that feel like me. I should keep a list.' },
        ],
        outcome: 'more',
      },
      close: {
        lines: [
          { who: 'narrator', text: 'Ryan closes the journal and puts it in the bag, in the pocket with the spare gloves, where it will stay all season. Written in, a little at a time.' },
        ],
        outcome: 'close',
      },
    },
    outcomes: {
      more: { summary: 'Wrote in the journal for the first time: the things that feel like me.', tone: 'neutral', effects: { form: 1, flags: { whatFits: 1 } }, changes: 'Form +1' },
      close: { summary: 'Wrote in the journal for the first time, then closed it for the night.', tone: 'neutral', effects: { energy: 5, flags: { whatFits: 1 } }, changes: 'Energy +5' },
    },
  },
  {
    id: 'act2_helicopter_dinner',
    title: 'Dinner, Interrupted',
    teaser: 'Kayla said yes to dinner. Biff said yes to a helicopter.',
    act: 2,
    location: 'clubhouse_lounge',
    cast: ['kayla_brooks', 'biff_fairway'],
    when: (c, s) => s.act === 2 && since(c, s, 'act2_rain_delay') >= 10 && since(c, s, 'act2_the_signature') >= 4,
    start: 'start',
    nodes: {
      start: {
        lines: [
          { who: 'narrator', text: 'The clubhouse patio. Candles. Ryan is wearing the lucky suit: powder-blue polyester, a thrift-store gift from Jess. It has never been lucky.' },
          { who: 'kayla_brooks', expr: 'surprised', text: 'Is that... polyester?' },
          { who: 'ryan', expr: 'confident', pose: 'confident', text: 'It’s lucky.' },
          { who: 'kayla_brooks', expr: 'laughing', text: 'Has it ever been lucky?' },
          { who: 'ryan', expr: 'confident', pose: 'talk', text: 'Not yet. That’s what makes it due.' },
          { who: 'narrator', text: 'The food arrives. The candles flicker. Kayla stops laughing at the suit and starts looking at Ryan instead.' },
          { who: 'kayla_brooks', expr: 'neutral', pose: 'talk', text: 'Okay, muni. Real question. Next season I’m on the road full time. Epson Tour, a different state every week.' },
          { who: 'kayla_brooks', expr: 'worried', text: 'So if this is a thing, it’s a long-distance thing. Is this a thing?' },
          { who: 'narrator', text: 'Ryan opens {his} mouth.' },
          { who: 'narrator', text: 'A sound like the sky going through a blender. Wind. Napkins everywhere. A gold helicopter lands on the 18th green, twenty feet from their table.' },
          { who: 'biff_fairway', expr: 'laughing', pose: 'celebrate', text: 'SURPRISE! Fairway Air! I heard there was a dinner. Is it a business dinner? I brought a business.' },
          { who: 'kayla_brooks', expr: 'angry', pose: 'disappointed', text: 'Biff. You landed on the green.' },
          { who: 'biff_fairway', expr: 'confident', pose: 'confident', text: 'The green is the softest part of the course, Kayla. Basic aviation.' },
        ],
        choice: {
          prompt: 'The moment is gone. Or is it?',
          options: [
            { id: 'shout', label: 'Answer her over the rotor', hint: 'Kayla ♥♥, very loud', next: 'shout' },
            { id: 'park', label: 'Help Biff move the helicopter', hint: 'Biff ♥, Kayla ♥−', next: 'park' },
            { id: 'walk', label: 'Walk Kayla to her car', hint: 'Kayla ♥, a quiet goodbye', next: 'walk' },
          ],
        },
      },
      shout: {
        lines: [
          { who: 'ryan', expr: 'happy', pose: 'talk', text: 'YES! IT’S A THING! I THINK IT’S A THING!' },
          { who: 'kayla_brooks', expr: 'laughing', text: 'WHAT?' },
          { who: 'ryan', expr: 'happy', pose: 'celebrate', text: 'I SAID IT’S A THING!' },
          { who: 'narrator', text: 'She can’t hear a word of it. She’s smiling anyway.' },
          { who: 'kayla_brooks', expr: 'happy', pose: 'talk', text: 'TELL ME WHEN IT’S QUIETER!' },
          { who: 'narrator', text: 'It is never quieter. Biff leaves the rotor running all night, “for the ambience.”' },
        ],
        outcome: 'loud',
      },
      park: {
        lines: [
          { who: 'ryan', expr: 'worried', pose: 'talk', text: 'Biff, you can’t leave that there.' },
          { who: 'biff_fairway', expr: 'happy', pose: 'talk', text: 'Thank you! Finally, someone who understands parking. Grab the tail.' },
          { who: 'narrator', text: 'By the time the helicopter is moved, Kayla’s car is gone. There is a note under Ryan’s windshield wiper.' },
          { who: 'narrator', text: '“Nice suit. Maybe next season. —K”' },
        ],
        outcome: 'note',
      },
      walk: {
        lines: [
          { who: 'narrator', text: 'They walk to the parking lot. The rotor fades. Neither of them says the thing.' },
          { who: 'kayla_brooks', expr: 'happy', pose: 'talk', text: 'Good luck out there, muni.' },
          { who: 'ryan', expr: 'happy', text: 'You too, Kayla.' },
          { who: 'narrator', text: 'She drives off. Ryan stands in the polyester suit for a long time. Behind {him}, Biff asks if anyone has seen his helicopter keys.' },
        ],
        outcome: 'quiet',
      },
    },
    outcomes: {
      loud: { summary: 'Told Kayla it was a thing. She didn’t hear it. She smiled anyway.', tone: 'good', effects: { rel: { rival: 8 } }, bonds: { kayla_brooks: 10, biff_fairway: -3 }, changes: 'Kayla ♥♥ · parked on “what if”' },
      note: { summary: 'Helped Biff park a helicopter. Kayla left a note: maybe next season.', tone: 'neutral', effects: { rel: { rival: -2 } }, bonds: { kayla_brooks: -2, biff_fairway: 8 }, changes: 'Biff ♥ · Kayla ♥− · parked on “what if”' },
      quiet: { summary: 'Walked Kayla to her car. Neither of them said the thing.', tone: 'neutral', effects: { rel: { rival: 4 } }, bonds: { kayla_brooks: 6 }, changes: 'Kayla ♥ · parked on “what if”' },
    },
  },
  {
    // "What fits" (2 of 2). Baba hears it in a voice before anyone says a word. Played straight.
    id: 'act2_six_am_call',
    title: 'The Six A.M. Call',
    teaser: 'Baba calls at six, like always. This time Ryan picks up before the first ring ends.',
    act: 2,
    location: 'driving_range',
    cast: ['baba'],
    // Halfway through the wait for The Next Chapter, not right after the helicopter.
    when: (c, s) => s.act === 2 && since(c, s, 'act2_helicopter_dinner') >= 4
      && (c.tourCard === 'epson' || c.tourCard === 'lpga' || playerRating(c) >= 57 || since(c, s, 'act2_motel_six_iron') >= 50),
    start: 'start',
    nodes: {
      start: {
        lines: [
          { who: 'narrator', text: 'Six a.m. A motel parking lot, a different town. Ryan has been awake for an hour. The phone rings.' },
          { who: 'baba', expr: 'neutral', pose: 'talk', text: '{Habibi}. You’re up. You’re never up.' },
          { who: 'ryan', expr: 'neutral', text: 'Couldn’t sleep.' },
          { who: 'baba', expr: 'neutral', pose: 'think', text: 'You sound tired. Not golf tired. The other kind.' },
          { who: 'ryan', expr: 'neutral', text: 'I’m okay, Baba. I’m working something out. I don’t have the words for it yet.' },
          { who: 'baba', expr: 'neutral', pose: 'talk', text: 'Then don’t use words yet. Use the range. Words come later. They always come later. Look at me, I’m sixty-one and they’re still coming.' },
          { who: 'baba', expr: 'neutral', pose: 'talk', text: 'When you have them, you come home and you tell me. Whatever it is. I’ll be at the muni. I’m always at the muni.' },
        ],
        choice: {
          prompt: 'Ryan holds the phone a little tighter.',
          options: [
            { id: 'soon', label: '“Soon. I promise.”', hint: 'Baba ♥', next: 'soon' },
            { id: 'putting', label: '“How’s the practice green?”', hint: 'Energy +5', next: 'putting' },
          ],
        },
      },
      soon: {
        lines: [
          { who: 'ryan', expr: 'neutral', text: 'Soon. I promise.' },
          { who: 'baba', expr: 'neutral', pose: 'talk', text: 'Good. Now go hit balls. And your follow-through, the crime. Don’t commit the crime.' },
        ],
        outcome: 'soon',
      },
      putting: {
        lines: [
          { who: 'ryan', expr: 'happy', text: 'How’s the practice green?' },
          { who: 'baba', expr: 'neutral', pose: 'emphatic', text: 'Stimping at eleven. The Fairway boy left four ball marks yesterday. Four. I counted twice.' },
          { who: 'narrator', text: 'They talk about grass for twenty minutes. It helps more than either of them says.' },
        ],
        outcome: 'putting',
      },
    },
    outcomes: {
      soon: { summary: 'Baba heard it in Ryan’s voice. “When you have the words, come home and tell me.”', tone: 'good', effects: { rel: { mom: 6 }, flags: { whatFits: 2 } }, bonds: { baba: 8 }, changes: 'Baba ♥' },
      putting: { summary: 'Six a.m. call with Baba. Twenty minutes about grass. It helped.', tone: 'good', effects: { energy: 5, flags: { whatFits: 2 } }, bonds: { baba: 5 }, changes: 'Energy +5' },
    },
  },
  {
    id: 'act2_the_next_chapter',
    title: 'The Next Chapter',
    teaser: 'Baba is still at the muni after dark. Ryan has something to tell him.',
    act: 2,
    location: 'course_sunset',
    cast: ['baba'],
    // The Act II finale (owner-approved draft, 2026-11-27). It opens Act III and the LPGA ladder.
    // It comes late in a season on the road, once Ryan has Korn Ferry status or the game to chase the
    // LPGA (rating 60), or two years after Act II began (1.0.3 pacing, from the playthrough bot).
    when: (c, s) => s.act === 2 && since(c, s, 'act2_six_am_call') >= 4 && c.week >= 22
      && (c.tourCard === 'epson' || c.tourCard === 'lpga' || playerRating(c) >= 60 || since(c, s, 'act2_motel_six_iron') >= 2 * SEASON),
    start: 'start',
    nodes: {
      start: {
        lines: [
          { who: 'narrator', text: 'Sundown at the muni. Baba is repairing ball marks on the practice green with a broken wooden tee. He has been at it for an hour. There are no ball marks left.' },
          { who: 'baba', expr: 'neutral', pose: 'idle', text: '{Habibi}. You drove two hours. Either the car is broken or something else is.' },
          { who: 'ryan', expr: 'worried', text: 'Nothing’s broken, Baba.' },
          { who: 'ryan', expr: 'worried', pose: 'talk', text: 'I’ve been looking for the right way to say this for a long time. There isn’t one. So I’m just going to say it.' },
          { who: 'narrator', text: 'Baba puts the tee in his pocket. He doesn’t look at his watch.' },
          { who: 'ryan', expr: 'neutral', pose: 'talk', text: 'I’m a woman, Baba. I think I always have been. I’m tired of playing someone else’s round.' },
          { who: 'narrator', text: 'A sprinkler comes on three greens over. Neither of them moves.' },
          { who: 'baba', expr: 'worried', pose: 'sad', text: '…I don’t understand all of this. I’m sixty-one. I mow grass. I understand grass.' },
          { who: 'ryan', expr: 'worried', text: 'I know.' },
          { who: 'baba', expr: 'neutral', pose: 'talk', text: 'But I understand you. Since you were this big, holding a putter upside down.' },
          { who: 'baba', expr: 'neutral', pose: 'emphatic', text: 'Listen to me, {habibi}—' },
          { who: 'narrator', text: 'He stops. Starts again.' },
          { who: 'baba', expr: 'happy', pose: 'confident', text: '{Habibti}. …Huh. That’s going to take practice. I practised “Ryan” in the mirror for nine months before you were born. I can practise this for one week.' },
          { who: 'ryan', expr: 'laughing', text: 'You practised my name?' },
          { who: 'baba', expr: 'confident', pose: 'talk', text: 'Every day. You think I just say things? Now. Your follow-through is still a crime. That doesn’t change.' },
          { who: 'narrator', text: 'He hands her a carton of BOBO MILKY.' },
          { who: 'baba', expr: 'happy', pose: 'give', text: 'Drink. The LPGA is a long walk. You’ll need your bones.' },
        ],
        outcome: 'told_baba',
      },
    },
    outcomes: {
      told_baba: { summary: 'Told Baba. He’s going to practise.', tone: 'good', effects: { rel: { mom: 10 } }, bonds: { baba: 10 }, changes: 'Baba ♥♥ · Act III begins · the LPGA ladder: Q-School, then the Epson Tour', act: 3 },
    },
  },
];
