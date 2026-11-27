/**
 * Act III: The Rookie (phase 3, she/her). Outline: "Ryan's Road: Acts II–IV Story Outline", 2026-11-27.
 * The Naked Gun with a dash of Leisure Suit Larry: everyone plays it straight, the golf world is absurd.
 * Ryan's transition is never the joke and nobody misgenders her. The jokes land on Biff, the tour,
 * the Commissioner, Doug, and Kayla's detective work. Approved under the owner's standing approval.
 *
 * "Not For The Public" is Baba's canon Scene 2 (docs/story/baba/BABA_SCENES_SECOND_DRAFT.md), set
 * here word for word apart from stage directions told as narration. The RYAN — PRO can stays on the
 * shelf (canon: it pays off at The Rejection and on Championship Sunday).
 */
import type { CareerState } from '../career/types';
import type { EncounterDef } from './encounters';
import type { StoryState } from './types';

const SEASON = 30;
const since = (c: CareerState, s: StoryState, id: string) => {
  const r = s.encounters[id];
  return r ? (c.season - r.season) * SEASON + (c.week - r.week) : -Infinity;
};

export const ACT_THREE: EncounterDef[] = [
  {
    id: 'act3_fresh_start',
    title: 'Fresh Start',
    teaser: 'Six a.m. at the muni range. Baba has news, and a cooler.',
    act: 3,
    location: 'driving_range',
    cast: ['baba'],
    when: (c, s) => s.act === 3 && since(c, s, 'act2_the_next_chapter') >= 1,
    start: 'start',
    nodes: {
      start: {
        lines: [
          { who: 'narrator', text: 'Six a.m., the muni range. New tour. New road. Same bucket of balls. Ryan’s visor is still a little stiff.' },
          { who: 'baba', expr: 'neutral', pose: 'idle', text: 'You’re late.' },
          { who: 'ryan', expr: 'surprised', text: 'It’s six o’clock.' },
          { who: 'baba', expr: 'neutral', pose: 'emphatic', text: 'Six o’clock is late. Five fifty-five is on time.' },
          { who: 'ryan', expr: 'neutral', pose: 'talk', text: 'Aren’t you supposed to be at work?' },
          { who: 'baba', expr: 'confident', pose: 'confident', text: 'I retired. Friday. They gave me a cake shaped like a mower. I ate the handle.' },
          { who: 'baba', expr: 'neutral', pose: 'talk', text: 'I still mow the practice green. That’s not work. That’s hygiene.' },
          { who: 'narrator', text: 'Beside him sits a small cooler. On the lid, in marker: NOT FOR THE PUBLIC.' },
          { who: 'baba', expr: 'neutral', pose: 'talk', text: 'So. LPGA Q-School. Then the Epson Tour. I looked it up on the little phone. I’m coming.' },
          { who: 'ryan', expr: 'worried', text: 'Baba, you don’t have to—' },
          { who: 'baba', expr: 'confident', pose: 'confident', text: 'I have a cooler. I have a hat. The decision is made, {habibi}.' },
        ],
        choice: {
          prompt: 'What does Ryan say?',
          options: [
            { id: 'welcome', label: 'Welcome aboard', hint: 'Baba ♥♥', next: 'welcome' },
            { id: 'cooler', label: 'Ask what’s in the cooler', hint: 'Baba ♥, +Energy', next: 'cooler' },
            { id: 'range', label: 'Hit balls first', hint: 'Form +2', next: 'range' },
          ],
        },
      },
      welcome: {
        lines: [
          { who: 'ryan', expr: 'happy', pose: 'talk', text: 'Okay. Welcome to the team, Baba.' },
          { who: 'baba', expr: 'neutral', pose: 'idle', text: 'I was always the team. Now I have a lanyard.' },
          { who: 'narrator', text: 'He has already printed the whole season’s schedule. It is laminated. Twice.' },
        ],
        outcome: 'welcome',
      },
      cooler: {
        lines: [
          { who: 'ryan', expr: 'neutral', pose: 'talk', text: 'What’s in the cooler?' },
          { who: 'baba', expr: 'neutral', pose: 'give', text: 'Forty BOBO MILKY. Thirty-nine for you. One for emergencies.' },
          { who: 'ryan', expr: 'surprised', text: 'What’s the emergency one for?' },
          { who: 'baba', expr: 'confident', pose: 'confident', text: 'If I tell you, it’s not an emergency.' },
        ],
        outcome: 'cooler',
      },
      range: {
        lines: [
          { who: 'ryan', expr: 'confident', pose: 'talk', text: 'Let me hit some balls first.' },
          { who: 'baba', expr: 'neutral', pose: 'idle', text: 'Good. Then fifty from three feet. Then breakfast.' },
          { who: 'narrator', text: 'Baba watches every swing. He says “short” eleven times. Two of them were drivers.' },
        ],
        outcome: 'range',
      },
    },
    outcomes: {
      welcome: { summary: 'Baba is officially retired, and officially on tour.', tone: 'good', effects: { rel: { mom: 10 } }, bonds: { baba: 10 }, changes: 'Baba ♥♥' },
      cooler: { summary: 'Learned about the emergency BOBO MILKY. Learned nothing else.', tone: 'good', effects: { energy: 6, rel: { mom: 6 } }, bonds: { baba: 6 }, changes: '+6 Energy · Baba ♥' },
      range: { summary: 'Range at six. “Short,” eleven times.', tone: 'neutral', effects: { form: 2, energy: -4, rel: { mom: 4 } }, bonds: { baba: 4 }, changes: 'Form +2 · −4 Energy · Baba ♥' },
    },
  },
  {
    id: 'act3_biff_ally',
    title: 'The Ally',
    teaser: 'Biff has called a press conference about Ryan. Nobody told Ryan.',
    act: 3,
    location: 'clubhouse_lounge',
    cast: ['biff_fairway', 'reporter_kim'],
    when: (c, s) => s.act === 3 && since(c, s, 'act3_fresh_start') >= 2,
    start: 'start',
    nodes: {
      start: {
        lines: [
          { who: 'narrator', text: 'Media day. Ryan came for the free coffee. There is a podium. Biff Fairway III is at it.' },
          { who: 'biff_fairway', expr: 'confident', pose: 'talk', text: 'Thank you all for coming. I’ve called this press conference to talk about my good friend, Ryan.' },
          { who: 'narrator', text: 'Ryan has not been told about the press conference.' },
          { who: 'biff_fairway', expr: 'happy', pose: 'confident', text: 'Fairway Family Holdings has always stood with Ryan. Since Tuesday.' },
          { who: 'narrator', text: 'On Biff’s lapel is a solid-gold pin that says ALLY. It is the size of a dinner plate. The clasp is struggling.' },
          { who: 'biff_fairway', expr: 'confident', pose: 'talk', text: 'And so, from all of us, we say: insert heartfelt sentiment here.' },
          { who: 'biff_fairway', expr: 'surprised', text: '...Dawson.' },
          { who: 'reporter_kim', expr: 'neutral', pose: 'talk', text: 'Kim, Channel Six. Question for Ryan, actually. How’s the putting?' },
          { who: 'ryan', expr: 'surprised', text: 'Me?' },
          { who: 'reporter_kim', expr: 'confident', pose: 'confident', text: 'You’re the golfer.' },
        ],
        choice: {
          prompt: 'What does Ryan do?',
          options: [
            { id: 'mic', label: 'Take the mic', hint: 'Fame +3', next: 'mic' },
            { id: 'let', label: 'Let Biff keep going', hint: 'Fame +1, Biff ♥', next: 'let' },
            { id: 'marks', label: 'Ask Biff about his ball marks', hint: 'Fame +2, Baba would be proud', next: 'marks' },
          ],
        },
      },
      mic: {
        lines: [
          { who: 'ryan', expr: 'happy', pose: 'talk', text: 'The putting’s fine. My Baba says it’s a crime. We’re working on it.' },
          { who: 'narrator', text: 'The room laughs. Kim writes something down and underlines it.' },
          { who: 'biff_fairway', expr: 'confident', pose: 'talk', text: 'I also have a Baba. Spiritually.' },
          { who: 'reporter_kim', expr: 'neutral', text: 'Noted, Biff.' },
        ],
        outcome: 'mic',
      },
      let: {
        lines: [
          { who: 'biff_fairway', expr: 'laughing', pose: 'celebrate', text: 'And today I am proud to announce Ryan Day: one hour of free parking at the Fairway Family parking garage!' },
          { who: 'narrator', text: 'The ALLY pin finally loses its fight with gravity. It hits the floor and cracks a tile.' },
          { who: 'reporter_kim', expr: 'worried', pose: 'talk', text: 'Is the floor okay?' },
          { who: 'biff_fairway', expr: 'disappointed', pose: 'disappointed', text: 'That pin was load-bearing.' },
        ],
        outcome: 'let',
      },
      marks: {
        lines: [
          { who: 'ryan', expr: 'confident', pose: 'talk', text: 'Biff. How many ball marks did you fix today?' },
          { who: 'biff_fairway', expr: 'worried', text: '...Is that on the record?' },
          { who: 'reporter_kim', expr: 'confident', pose: 'confident', text: 'Everything’s on the record.' },
          { who: 'biff_fairway', expr: 'surprised', text: 'Four. No. Two. Is a divot a ball mark? I’d like to speak to my lawyer, who is also Dawson.' },
          { who: 'narrator', text: 'Somewhere at the back of the room, a retired groundskeeper nods once.' },
        ],
        outcome: 'marks',
      },
    },
    outcomes: {
      mic: { summary: 'Took the mic at Biff’s press conference. The putting is a crime; the room loved it.', tone: 'good', effects: { fame: 3, rel: { fans: 4 } }, changes: 'Fame +3 · Fans ♥' },
      let: { summary: 'Let Biff announce Ryan Day: one hour of free parking.', tone: 'neutral', effects: { fame: 1 }, bonds: { biff_fairway: 6 }, changes: 'Fame +1 · Biff ♥ · one cracked tile' },
      marks: { summary: 'Asked Biff about his ball marks on the record.', tone: 'good', effects: { fame: 2, rel: { mom: 3 } }, bonds: { biff_fairway: -4, baba: 3 }, changes: 'Fame +2 · Baba ♥' },
    },
  },
  {
    id: 'act3_qschool_doug',
    title: 'Q-School, Again',
    teaser: 'Marty booked the team hotel. So did four hundred dentists.',
    act: 3,
    location: 'course_sunset',
    cast: ['marty_mulligan', 'commissioner_clipboard'],
    when: (c, s) => s.act === 3 && since(c, s, 'act3_biff_ally') >= 2,
    start: 'start',
    nodes: {
      start: {
        lines: [
          { who: 'narrator', text: 'LPGA Q-School practice day. Marty Mulligan booked the team hotel. So did the Western Regional Dental Convention.' },
          { who: 'marty_mulligan', expr: 'happy', pose: 'talk', text: 'Good news: we got a room. Bad news: it’s the ballroom. Good news: the ballroom has a stage!' },
          { who: 'narrator', text: 'Ryan slept on the stage. Four hundred dentists attended a lecture on flossing beneath her.' },
          { who: 'marty_mulligan', expr: 'confident', pose: 'celebrate', text: 'But today: a game changer. I got you a caddie.' },
          { who: 'narrator', text: 'Marty inflates Doug. Doug is wearing a visor now. It matches Ryan’s.' },
          { who: 'commissioner_clipboard', expr: 'neutral', pose: 'talk', text: 'Rule 10.3. A caddie must be a person.' },
          { who: 'marty_mulligan', expr: 'worried', text: 'Doug is a person. Spiritually.' },
          { who: 'commissioner_clipboard', expr: 'confident', pose: 'confident', text: 'Is he breathing?' },
          { who: 'marty_mulligan', expr: 'worried', text: '...He’s mostly breathing. He has a slow leak.' },
          { who: 'commissioner_clipboard', expr: 'neutral', pose: 'talk', text: 'Doug may watch from the gallery. Doug may not touch the flagstick. Doug may not “help”.' },
        ],
        choice: {
          prompt: 'What does Ryan do?',
          options: [
            { id: 'contest', label: 'Enter the practice-day putting contest', hint: 'Putting challenge, Fame +', next: 'contest' },
            { id: 'doug', label: 'Give Doug a pep talk', hint: 'Marty ♥, +Energy', next: 'doug' },
          ],
        },
      },
      contest: {
        lines: [
          { who: 'ryan', expr: 'confident', pose: 'talk', text: 'I’ll carry my own bag. Where’s the putting contest?' },
          { who: 'commissioner_clipboard', expr: 'happy', pose: 'talk', text: 'Eighteenth green. One putt. The prize is a commemorative clipboard.' },
        ],
        challenge: { kind: 'putt', opponent: 'commissioner_clipboard' },
        win: 'contest_won',
        lose: 'contest_lost',
      },
      contest_won: {
        lines: [
          { who: 'narrator', text: 'The putt drops. From the gallery, Doug deflates slightly. It reads as emotion.' },
          { who: 'commissioner_clipboard', expr: 'happy', pose: 'celebrate', text: 'Your commemorative clipboard. Please sign here to confirm receipt of the clipboard.' },
        ],
        outcome: 'contest_won',
      },
      contest_lost: {
        lines: [
          { who: 'narrator', text: 'The putt lips out. A dentist in the gallery winces professionally.' },
          { who: 'marty_mulligan', expr: 'confident', pose: 'talk', text: 'Practice day! It doesn’t count! Nothing counts until it counts!' },
        ],
        outcome: 'contest_lost',
      },
      doug: {
        lines: [
          { who: 'ryan', expr: 'happy', pose: 'talk', text: 'Doug. You’ve got this. Watch from the gallery. Be the best gallery you can be.' },
          { who: 'marty_mulligan', expr: 'laughing', pose: 'celebrate', text: 'Look at him. He’s standing up straighter.' },
          { who: 'narrator', text: 'Doug is standing up straighter. Marty has quietly topped him up with a bicycle pump.' },
        ],
        outcome: 'doug',
      },
    },
    outcomes: {
      contest_won: { summary: 'Won the Q-School practice-day putting contest and a commemorative clipboard.', tone: 'good', effects: { fame: 2, form: 2 }, bonds: { commissioner_clipboard: 4 }, changes: 'Fame +2 · Form +2 · one clipboard' },
      contest_lost: { summary: 'Lipped out the practice-day putt. It didn’t count.', tone: 'neutral', effects: { form: 1 }, changes: 'Form +1' },
      doug: { summary: 'Gave Doug a pep talk. He stood up straighter (bicycle pump).', tone: 'good', effects: { energy: 5 }, bonds: { marty_mulligan: 8 }, changes: '+5 Energy · Marty ♥' },
    },
  },
  {
    id: 'act3_have_we_met',
    title: 'Have We Met?',
    teaser: 'Someone on the practice green is watching Ryan’s stroke. Closely.',
    act: 3,
    location: 'driving_range',
    cast: ['kayla_brooks'],
    when: (c, s) => s.act === 3 && since(c, s, 'act3_qschool_doug') >= 2,
    start: 'start',
    nodes: {
      start: {
        lines: [
          { who: 'narrator', text: 'The practice green. Ryan is working on three-footers. Someone is watching. Closely.' },
          { who: 'kayla_brooks', expr: 'confident', pose: 'talk', text: 'Your left hip hangs on the short ones.' },
          { who: 'ryan', expr: 'surprised', text: '...Kayla.' },
          { who: 'kayla_brooks', expr: 'surprised', text: 'You know me?' },
          { who: 'ryan', expr: 'worried', pose: 'talk', text: 'Everybody knows you. You’re Kayla Brooks.' },
          { who: 'kayla_brooks', expr: 'neutral', pose: 'confident', text: 'I am. And you’re...' },
          { who: 'ryan', expr: 'neutral', text: 'Ryan.' },
          { who: 'narrator', text: 'A long pause. Kayla’s eyes narrow. In her head, a detective show plays its dramatic sting.' },
          { who: 'kayla_brooks', expr: 'neutral', pose: 'talk', text: 'I knew a Ryan. On the muni circuit. Same hip. Same stroke. Same terrible snacks.' },
          { who: 'narrator', text: 'Ryan is holding a bag of gas-station cheese puffs.' },
          { who: 'kayla_brooks', expr: 'laughing', text: '...Lot of Ryans in golf. Common name. Very common.' },
          { who: 'kayla_brooks', expr: 'worried', pose: 'talk', text: 'Do you have a cousin? A twin? A really dedicated stalker?' },
        ],
        choice: {
          prompt: 'Ryan could tell her right now. Does she?',
          options: [
            { id: 'tell', label: 'Tell her', hint: 'Kayla ♥... almost', next: 'tell' },
            { id: 'notyet', label: 'Not yet', hint: 'Keep it for later', next: 'notyet' },
            { id: 'putt', label: 'Challenge her: one putt', hint: 'Putting challenge, Kayla ♥', next: 'putt' },
          ],
        },
      },
      tell: {
        lines: [
          { who: 'ryan', expr: 'worried', pose: 'talk', text: 'Kayla. It’s me. I’m—' },
          { who: 'narrator', text: 'The PA system crackles. “Would the owner of a gold helicopter please move it off the ninth green.”' },
          { who: 'kayla_brooks', expr: 'laughing', pose: 'celebrate', text: 'Hold that thought. I have to see this.' },
          { who: 'narrator', text: 'She’s gone. Ryan stands alone with the cheese puffs and the rest of the sentence.' },
        ],
        outcome: 'interrupted',
      },
      notyet: {
        lines: [
          { who: 'ryan', expr: 'happy', pose: 'talk', text: 'No twin. No cousin. One Baba.' },
          { who: 'kayla_brooks', expr: 'neutral', text: '...Hm.' },
          { who: 'narrator', text: 'Kayla writes something in her yardage book. Ryan catches a glimpse: RYAN?? Underlined three times.' },
        ],
        outcome: 'notyet',
      },
      putt: {
        lines: [
          { who: 'ryan', expr: 'confident', pose: 'talk', text: 'One putt. Twelve feet. Loser buys the snacks.' },
          { who: 'kayla_brooks', expr: 'confident', pose: 'confident', text: 'Your snacks are a cry for help. You’re on.' },
        ],
        challenge: { kind: 'putt', opponent: 'kayla_brooks' },
        win: 'putt_won',
        lose: 'putt_lost',
      },
      putt_won: {
        lines: [
          { who: 'narrator', text: 'Ryan’s putt drops. Kayla’s lips out.' },
          { who: 'kayla_brooks', expr: 'surprised', text: 'Nobody beats me on the practice green except—' },
          { who: 'narrator', text: 'She stops. She stares.' },
          { who: 'kayla_brooks', expr: 'worried', text: '...Lot of Ryans.' },
        ],
        outcome: 'putt_won',
      },
      putt_lost: {
        lines: [
          { who: 'kayla_brooks', expr: 'laughing', pose: 'celebrate', text: 'Ha! You’re good. But you’re not—' },
          { who: 'narrator', text: 'She stops. She stares at Ryan’s follow-through.' },
          { who: 'kayla_brooks', expr: 'worried', text: '...You hang your left hip.' },
        ],
        outcome: 'putt_lost',
      },
    },
    outcomes: {
      interrupted: { summary: 'Almost told Kayla. A gold helicopter interrupted.', tone: 'neutral', effects: { rel: { rival: 6 } }, bonds: { kayla_brooks: 6 }, changes: 'Kayla ♥ · almost' },
      notyet: { summary: 'Kept it to herself for now. Kayla wrote RYAN?? in her yardage book.', tone: 'neutral', effects: { rel: { rival: 2 } }, bonds: { kayla_brooks: 3 }, changes: 'Kayla ♥ · she’s suspicious' },
      putt_won: { summary: 'Beat Kayla on the practice green. She’s getting suspicious.', tone: 'good', effects: { form: 2, rel: { rival: 4 } }, bonds: { kayla_brooks: 6 }, changes: 'Form +2 · Kayla ♥' },
      putt_lost: { summary: 'Lost the putt to Kayla. She noticed the hip.', tone: 'neutral', effects: { form: 1, rel: { rival: 4 } }, bonds: { kayla_brooks: 5 }, changes: 'Form +1 · Kayla ♥' },
    },
  },
  {
    id: 'act3_not_for_the_public',
    title: 'Not For The Public',
    teaser: 'Baba, a cooler, and Biff Fairway III with two velvet cases.',
    act: 3,
    location: 'driving_range',
    cast: ['baba', 'biff_fairway'],
    when: (c, s) => s.act === 3 && since(c, s, 'act3_have_we_met') >= 2,
    start: 'start',
    nodes: {
      start: {
        lines: [
          { who: 'narrator', text: 'A tour-stop practice green, mid-morning. Ryan putts. Baba stands behind her, arms crossed, beside a small cooler: NOT FOR THE PUBLIC.' },
          { who: 'baba', expr: 'neutral', pose: 'idle', text: 'Short.' },
          { who: 'ryan', expr: 'neutral', text: 'It went in.' },
          { who: 'baba', expr: 'neutral', pose: 'talk', text: 'It was short, and then it was lucky. Lucky is short with good manners.' },
          { who: 'narrator', text: 'Biff Fairway III arrives. Behind him, an assistant carries two velvet cases: one large, one larger.' },
          { who: 'biff_fairway', expr: 'confident', pose: 'talk', text: 'Ryan. Aurum-X. Four hundred dollars a vial. Gold flakes for focus, ginseng for vision, and a second layer of gold flakes in case the first ones fall out.' },
          { who: 'narrator', text: 'He drinks it. A gold flake sticks to his front tooth. It stays there for the rest of the scene.' },
          { who: 'narrator', text: 'Baba opens the cooler. On the ice: small cartons of BOBO MILKY. He hands one to Ryan without looking at her.' },
          { who: 'baba', expr: 'neutral', pose: 'give', text: 'Drink.' },
          { who: 'biff_fairway', expr: 'laughing', pose: 'talk', text: 'Is that a juice box? Champions don’t drink juice boxes, Ryan. Then again, your putting stroke is very… municipal.' },
          { who: 'narrator', text: 'Baba turns. Slowly. The way a man turns after thirty years of watching people walk across his greens in metal spikes.' },
          { who: 'baba', expr: 'angry', pose: 'angry', text: 'You don’t repair your ball marks.' },
          { who: 'biff_fairway', expr: 'surprised', text: '…I’m sorry?' },
          { who: 'baba', expr: 'neutral', pose: 'emphatic', text: 'Hole six. Hole eleven. Two on fourteen. And that one. From this morning.' },
          { who: 'narrator', text: 'He points at a deep pit in the practice green, by Biff’s left shoe.' },
          { who: 'biff_fairway', expr: 'worried', text: 'Who ARE you?' },
          { who: 'baba', expr: 'confident', pose: 'confident', text: 'Her father. Her greenkeeper, when she needs one. And today, your problem.' },
          { who: 'biff_fairway', expr: 'confident', pose: 'confident', text: 'Fine. The tool.' },
          { who: 'narrator', text: 'The assistant opens the large case. On a cushion lies a solid-gold divot repair tool, engraved B.F. III, with a diamond in the handle. Somewhere, a soft angelic “aaah”.' },
          { who: 'narrator', text: 'Biff kneels and pushes it into the ball mark. Gold is soft. Both prongs bend sideways. Bwoing. He pushes harder: a U. He stands on it, and it folds flat into the green.' },
          { who: 'narrator', text: 'The ball mark is now twice the size, with a gold tool lying in it. Baba checks his watch.' },
          { who: 'biff_fairway', expr: 'worried', text: '…The larger case.' },
          { who: 'narrator', text: 'Inside the larger case: a gold-plated pitchfork. Biff raises it over the green with both hands.' },
          { who: 'baba', expr: 'neutral', pose: 'idle', text: 'No.' },
          { who: 'narrator', text: 'Biff slowly lowers the pitchfork. Without looking, Baba holds out a broken wooden tee. Biff kneels and repairs the ball mark perfectly, in four small pushes. He stares at it.' },
          { who: 'biff_fairway', expr: 'surprised', text: '…It’s beautiful.' },
          { who: 'baba', expr: 'neutral', pose: 'idle', text: 'It’s a tee.' },
          { who: 'narrator', text: 'Biff lays the broken tee on the velvet cushion. The assistant closes the case reverently, and they carry it off towards the sixth hole like a relic.' },
          { who: 'narrator', text: 'Halfway there, Biff stops and comes back alone.' },
          { who: 'biff_fairway', expr: 'confident', pose: 'talk', text: 'What’s actually in that carton? I’ll pay ten thousand dollars.' },
          { who: 'baba', expr: 'neutral', pose: 'idle', text: 'Not for sale.' },
          { who: 'biff_fairway', expr: 'confident', text: 'Twenty.' },
          { who: 'baba', expr: 'neutral', pose: 'talk', text: 'Not to a man with four ball marks still on his conscience.' },
          { who: 'narrator', text: 'Biff leaves for good. All this time, Ryan has been trying to get the tiny straw out of its wrapper. Baba takes the carton, frees the straw in one move, pokes it in and hands it back.' },
          { who: 'baba', expr: 'neutral', pose: 'give', text: 'Thirty years I do this.' },
          { who: 'narrator', text: 'For a second: young Ryan at the muni, and Baba handing over the same carton, straw already in.' },
          { who: 'ryan', expr: 'happy', pose: 'talk', text: 'You stuck up for my putting stroke.' },
          { who: 'baba', expr: 'neutral', pose: 'emphatic', text: 'I said nothing about your putting stroke. Your putting stroke is a disaster.' },
          { who: 'baba', expr: 'confident', pose: 'confident', text: 'Only I get to say that.' },
          { who: 'ryan', expr: 'happy', text: 'Thanks, Baba.' },
          { who: 'baba', expr: 'neutral', pose: 'talk', text: 'Fifty from three feet. Then you can have the second one.' },
          { who: 'narrator', text: 'On the carton, a strip of masking tape in Baba’s handwriting: REPAIR YOUR BALL MARKS. — B.' },
        ],
        outcome: 'not_for_sale',
      },
    },
    outcomes: {
      not_for_sale: { summary: 'Biff’s gold repair tool folded. A broken wooden tee did the job. The carton was not for sale.', tone: 'good', effects: { rel: { mom: 8 } }, bonds: { baba: 8, biff_fairway: 0 }, changes: 'Baba ♥ · Biff now owns a relic' },
    },
  },
  {
    id: 'act3_butter_classic',
    title: 'The Butter Classic',
    teaser: 'This week’s trophy is made of butter. It is ninety-eight degrees.',
    act: 3,
    location: 'course_sunset',
    cast: ['reporter_kim'],
    when: (c, s) => s.act === 3 && since(c, s, 'act3_not_for_the_public') >= 2,
    start: 'start',
    nodes: {
      start: {
        lines: [
          { who: 'narrator', text: 'The Epson Tour stop at the Tri-County Fair. The first tee sits between the pie tent and a pig race.' },
          { who: 'reporter_kim', expr: 'neutral', pose: 'talk', text: 'Kim, Channel Six, live from the Tri-County Fair, where this week’s trophy is a life-size butter sculpture of last year’s champion.' },
          { who: 'narrator', text: 'It is ninety-eight degrees. Last year’s champion is visibly losing an arm.' },
          { who: 'reporter_kim', expr: 'neutral', pose: 'talk', text: 'Ryan, it’s been quite a year. New tour, new road. Anything you’d like to say?' },
          { who: 'ryan', expr: 'happy', pose: 'talk', text: 'Mostly that I’d like to win something before it melts.' },
          { who: 'reporter_kim', expr: 'confident', pose: 'confident', text: 'The fair is also offering a blue ribbon for the longest putt into a pie tin.' },
        ],
        choice: {
          prompt: 'What does Ryan do?',
          options: [
            { id: 'pie', label: 'Go for the pie-tin putt', hint: 'Putting challenge, Fame +', next: 'pie' },
            { id: 'shade', label: 'Shade the butter trophy with an umbrella', hint: 'Fans ♥', next: 'shade' },
          ],
        },
      },
      pie: {
        lines: [
          { who: 'narrator', text: 'Forty feet, across the fairground grass, into a pie tin. The crowd from the pig race wanders over.' },
        ],
        challenge: { kind: 'putt', opponent: 'reporter_kim' },
        win: 'pie_won',
        lose: 'pie_lost',
      },
      pie_won: {
        lines: [
          { who: 'narrator', text: 'Clank. In the tin. Blue ribbon. The pie tent awards her a whole cherry pie, which is technically a sponsorship.' },
          { who: 'reporter_kim', expr: 'happy', pose: 'talk', text: 'Ryan, the first golfer in Tri-County history to be sponsored by a pie.' },
        ],
        outcome: 'pie_won',
      },
      pie_lost: {
        lines: [
          { who: 'narrator', text: 'The putt misses the tin, rolls through a fence and into the pig race. A pig named Gerald finishes first.' },
          { who: 'reporter_kim', expr: 'neutral', pose: 'talk', text: 'Gerald has declined to comment.' },
        ],
        outcome: 'pie_lost',
      },
      shade: {
        lines: [
          { who: 'narrator', text: 'Ryan stands beside the butter trophy for an hour, holding an umbrella over it. The crowd starts cheering every time she shifts her grip.' },
          { who: 'reporter_kim', expr: 'happy', pose: 'talk', text: 'A true sportswoman. The arm has been saved. Mostly.' },
        ],
        outcome: 'shade',
      },
    },
    outcomes: {
      pie_won: { summary: 'Won the Tri-County Fair pie-tin putt. Sponsored by a cherry pie.', tone: 'good', effects: { fame: 3, form: 1 }, changes: 'Fame +3 · Form +1 · one cherry pie' },
      pie_lost: { summary: 'Putted into the pig race. Gerald won.', tone: 'neutral', effects: { fame: 1 }, changes: 'Fame +1 · Gerald ♥' },
      shade: { summary: 'Saved the butter trophy’s arm. Mostly.', tone: 'good', effects: { fame: 2, rel: { fans: 6 } }, changes: 'Fame +2 · Fans ♥' },
    },
  },
  {
    id: 'act3_the_card',
    title: 'The Card',
    teaser: 'Ryan has an LPGA Tour card. Baba has mown something into the practice green.',
    act: 3,
    location: 'driving_range',
    cast: ['baba'],
    // Act III ends when Ryan earns her LPGA Tour card on the new ladder; this opens Act IV.
    when: (c, s) => s.act === 3 && (c.tourCard === 'lpga' || c.qschool.result === 'lpga') && since(c, s, 'act2_the_next_chapter') >= 1,
    start: 'start',
    nodes: {
      start: {
        lines: [
          { who: 'narrator', text: 'The muni, the morning after. Ryan has an LPGA Tour card in her wallet. She has checked it eleven times.' },
          { who: 'narrator', text: 'On the practice green: fresh mower stripes, diagonal. And something else.' },
          { who: 'baba', expr: 'confident', pose: 'confident', text: 'Look at the green.' },
          { who: 'ryan', expr: 'surprised', text: 'Baba. Are those letters?' },
          { who: 'baba', expr: 'neutral', pose: 'idle', text: 'It says PRO.' },
          { who: 'narrator', text: 'It does not say PRO. It says something closer to PHO. Possibly PNG.' },
          { who: 'ryan', expr: 'laughing', text: 'It says PHO.' },
          { who: 'baba', expr: 'angry', pose: 'emphatic', text: 'It says PRO. The R is shy.' },
          { who: 'baba', expr: 'neutral', pose: 'talk', text: 'LPGA Tour card. Okay. Good. Now the hard part.' },
          { who: 'ryan', expr: 'neutral', pose: 'talk', text: 'Which is?' },
          { who: 'baba', expr: 'confident', pose: 'talk', text: 'Staying. Getting there is a door. Staying is a house.' },
        ],
        choice: {
          prompt: 'What does Ryan say?',
          options: [
            { id: 'pro', label: 'It definitely says PRO', hint: 'Baba ♥♥', next: 'pro' },
            { id: 'fifty', label: 'Fifty from three feet', hint: 'Form +2', next: 'fifty' },
            { id: 'photo', label: 'Take a picture of the green', hint: 'Fans ♥, Fame +', next: 'photo' },
          ],
        },
      },
      pro: {
        lines: [
          { who: 'ryan', expr: 'happy', pose: 'talk', text: 'You know what? It definitely says PRO.' },
          { who: 'baba', expr: 'happy', pose: 'confident', text: 'I know.' },
          { who: 'narrator', text: 'He turns away to check his watch. He checks it for quite a long time.' },
        ],
        outcome: 'pro',
      },
      fifty: {
        lines: [
          { who: 'ryan', expr: 'confident', pose: 'talk', text: 'Fifty from three feet?' },
          { who: 'baba', expr: 'neutral', pose: 'idle', text: 'Fifty from three feet. On the P. The P is flat.' },
        ],
        outcome: 'fifty',
      },
      photo: {
        lines: [
          { who: 'narrator', text: 'Ryan posts a photo of the green. By lunch it has a million views and its own hashtag: #PHO.' },
          { who: 'baba', expr: 'angry', pose: 'angry', text: 'Tell the internet the R is shy.' },
        ],
        outcome: 'photo',
      },
    },
    outcomes: {
      pro: { summary: 'Earned an LPGA Tour card. Baba mowed PRO into the green. (The R is shy.)', tone: 'good', effects: { rel: { mom: 10 } }, bonds: { baba: 10 }, changes: 'Baba ♥♥ · Act IV begins: the LPGA Tour', act: 4 },
      fifty: { summary: 'Earned an LPGA Tour card. Celebrated with fifty from three feet on the P.', tone: 'good', effects: { form: 2, rel: { mom: 6 } }, bonds: { baba: 6 }, changes: 'Form +2 · Baba ♥ · Act IV begins: the LPGA Tour', act: 4 },
      photo: { summary: 'Earned an LPGA Tour card. #PHO went viral.', tone: 'good', effects: { fame: 4, rel: { fans: 8, mom: 3 } }, bonds: { baba: 3 }, changes: 'Fame +4 · Fans ♥ · Act IV begins: the LPGA Tour', act: 4 },
    },
  },
];
