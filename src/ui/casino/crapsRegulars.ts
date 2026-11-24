/**
 * Craps table life (0.20.4): the regulars at the rail. The shooter and hot and cold tables are in
 * src/casino/crapsShooter.ts. PRESENTATION ONLY. The dice are the same fair dice for everyone (CasinoService rolls them);
 * nothing here changes a roll, a payout or Ryan's money. The regulars play with pretend money that
 * never touches the ledger. Streaks are read from what the dice actually did.
 *
 * Characters and every line are DRAFTS (2026-11-24) awaiting the owner's approval; see
 * docs/casino/CRAPS_REGULARS_DRAFT.md.
 */
import { addBet, betBlocker, maxLay, resolveRoll, type CrapsAction, type CrapsTable, newTable, type PointNo } from '../../casino/craps';
import { RYAN_SEAT, type Mood } from '../../casino/crapsShooter';
import type { LocationId } from '../../expansion/unlocks';

export { MOOD_LABEL, RYAN_SEAT, SEATS, tableMood, type Mood } from '../../casino/crapsShooter';

// ───────────── The regulars ─────────────

export type Style = 'rightway' | 'darkside' | 'hardways' | 'placer' | 'comer' | 'props' | 'inside';
export const STYLE_LABEL: Record<Style, string> = {
  rightway: 'Pass + odds', darkside: 'Don’t side', hardways: 'Hardways + Field', placer: 'Place 6 & 8',
  comer: 'Pass + Come', props: 'Horn & Yo', inside: 'Inside numbers',
};

export type RegularEvent =
  | 'arrive' | 'natural' | 'crapsOut' | 'pointMade' | 'sevenOut' | 'hardWin' | 'yo'
  | 'hot' | 'fire' | 'cold' | 'ryanShoots' | 'myShoot' | 'broke';

export interface Regular {
  id: string;
  name: string;
  /** Short name used on the rail. */
  short: string;
  location: LocationId;
  /** Who they are, one line (draft). */
  bio: string;
  style: Style;
  /** Base bet in pretend dollars, and the pretend stack they bring. */
  unit: number;
  stack: number;
  colour: string;
  lines: Partial<Record<RegularEvent, string[]>>;
}

export const REGULARS: readonly Regular[] = [
  // Desert Palms: locals.
  {
    id: 'gus_pettibone', name: 'Gus Pettibone', short: 'Gus', location: 'desert_palms', colour: '#ff4fa8',
    bio: 'Retired neon-sign painter. Painted half the signs on the Strip, never bets the don’t, and believes dice that miss the back wall are cursed.',
    style: 'rightway', unit: 10, stack: 1500,
    lines: {
      arrive: ['Pull up a rail, kid. Right side only at this end of the table.', 'Evening! I painted that sign out front, you know. Lit it myself in ’88.'],
      natural: ['Front line winner! Now that’s how you open a show.'],
      pointMade: ['Paid the line! Leave the odds working, sweetheart.', 'There it is! Like a fresh coat of paint.'],
      sevenOut: ['Seven. Like a busted transformer, every time.', 'Dice didn’t hit the back wall. I said it. Nobody listens.'],
      hardWin: ['Hard way! Somebody tell the hardway lady.'],
      hot: ['Don’t touch anything. Don’t change a thing. This shooter’s got the glow.'],
      fire: ['I haven’t seen a roll like this since the old Starlite closed! Keep ’em coming!'],
      cold: ['These dice are colder than a sign with the power cut.'],
      ryanShoots: ['Your dice, Ryan. Both dice, back wall, nice and easy.', 'Golfer’s hands! Give ’em a little backspin, ha!'],
      myShoot: ['My turn. Watch the wrist. Thirty years of brushwork.'],
      broke: ['Well, that’s the paint budget. I’ll grab another rack.'],
    },
  },
  {
    id: 'dee_ruiz', name: 'Dolores “Dee” Ruiz', short: 'Dee', location: 'desert_palms', colour: '#2fbf71',
    bio: 'Deals blackjack across town and spends her nights off on the other side of a different table. Bets the don’t, wins quietly, never gloats out loud.',
    style: 'darkside', unit: 10, stack: 1200,
    lines: {
      arrive: ['I’m on the don’t, so I’ll be the quiet one. No offense.', 'Night off. Somebody else can do the shuffling.'],
      crapsOut: ['Little craps. I’ll take it. Quietly.'],
      pointMade: ['Good for you all. Really.'],
      sevenOut: ['…I’m not saying anything.', 'Pays the don’t. Sorry, Gus.'],
      hot: ['I’m paying for everyone’s good mood tonight, apparently.'],
      cold: ['Cold dice. Don’t look at me, I don’t make the rules.'],
      ryanShoots: ['Your roll, Ryan. I’ll be rooting for you. Mostly.'],
      myShoot: ['Shooting on the don’t. Yes, people hate this. Yes, it’s legal.'],
      broke: ['Even the don’t loses sometimes. One more stack.'],
    },
  },
  {
    id: 'wendell_fry', name: 'Wendell Fry', short: 'Wendell', location: 'desert_palms', colour: '#ffd23a',
    bio: 'Retired chemistry teacher. Knows exactly what the hardways cost him and bets them anyway, because a hard eight is the most beautiful thing in Nevada.',
    style: 'hardways', unit: 5, stack: 800,
    lines: {
      arrive: ['Hard eight, always hard eight. I know the odds. I taught the odds.'],
      hardWin: ['HARD WAY! Do you see that? Both fours! Textbook!', 'A pair! Nine to one! Somebody write this down!'],
      pointMade: ['Easy way, but I’ll take the line.'],
      sevenOut: ['The seven: the most common outcome and the least loved.'],
      yo: ['Eleven, prime number, lovely.'],
      hot: ['Statistically unusual. Personally delightful.'],
      cold: ['Regression to the mean, folks. It comes for us all.'],
      ryanShoots: ['Dealer, a dollar on the hard eight for the golfer!'],
      myShoot: ['Gentle toss. Equal and opposite reaction.'],
      broke: ['A controlled experiment in losing. Restocking.'],
    },
  },
  // The White Buffalo: resort guests and ranch folks.
  {
    id: 'walt_greer', name: 'Walt Greer', short: 'Walt', location: 'white_buffalo', colour: '#e0a060',
    bio: 'Cattle rancher, three hours’ drive away. Places the six and the eight, presses when they hit, and says about eleven words a night.',
    style: 'placer', unit: 30, stack: 4000,
    lines: {
      arrive: ['Evenin’.', 'Six and eight. Same as always.'],
      pointMade: ['Mm. Good.'],
      sevenOut: ['Huh.', 'Well. Rain’ll come.'],
      hot: ['Press it.', 'Shooter’s ridin’ a good horse.'],
      fire: ['Lord.'],
      cold: ['Dry spell.'],
      ryanShoots: ['Your dice, son. Take your time.'],
      myShoot: ['Alright then.'],
      broke: ['Sold a steer for less. Another rack.'],
    },
  },
  {
    id: 'corinne_bales', name: 'Corinne Bales', short: 'Corinne', location: 'white_buffalo', colour: '#3fb6b0',
    bio: 'Sells lake houses and keeps score of everything, including you. Pass, Come and full odds, and she knows exactly how far up she is.',
    style: 'comer', unit: 25, stack: 5000,
    lines: {
      arrive: ['Corinne Bales, Lakeside Realty. You golf? I sell the houses on the fifteenth hole.'],
      natural: ['Seven! That’s a closing!'],
      pointMade: ['Point! I’m up four hundred tonight, not that I’m counting. I’m counting.'],
      sevenOut: ['Seven out. Fine. The market corrects.', 'Down two-twenty. Still ahead on the week.'],
      hot: ['Hot market! Everybody get your come bets in!'],
      cold: ['Buyer’s market, people. Small bets.'],
      ryanShoots: ['The golfer! Ryan, I sell houses on courses, call me.'],
      myShoot: ['Shooter’s motivated to sell.'],
      broke: ['Bridge loan. Back in a second.'],
    },
  },
  {
    id: 'toby_fenn', name: 'Tobias “Toby” Fenn', short: 'Toby', location: 'white_buffalo', colour: '#ff9a3c',
    bio: 'Drove trucks coast to coast for thirty years and now drives his RV between casinos. Lives for the yo-leven and the horn, loudly.',
    style: 'props', unit: 20, stack: 3000,
    lines: {
      arrive: ['Horn high yo, dealer! Hey, new face. Toby. I’m the loud one.'],
      yo: ['YO-LEVEN! What’d I tell ya! Fifteen to one, baby!', 'YO! Breaker breaker, we got an eleven!'],
      crapsOut: ['Craps! Horn pays! Don’t cry for me!'],
      natural: ['Eleven or seven, either way it’s Christmas.'],
      sevenOut: ['Seven out. Ten-four, rubber duck. Next shooter.'],
      hot: ['Keep on truckin’, shooter! Don’t stop for fuel!'],
      fire: ['THIS TABLE IS ON FIRE! Somebody call the convoy!'],
      cold: ['Cold dice. Like the Donner Pass in January.'],
      ryanShoots: ['Golfer’s shooting! Yo on the golfer, dealer!'],
      myShoot: ['Ten-four, comin’ out!'],
      broke: ['Outta gas. Fillin’ up!'],
    },
  },
  // Morongo Sky: high rollers.
  {
    id: 'victor_sloane', name: 'Victor Sloane', short: 'Victor', location: 'morongo_sky', colour: '#d9b8ff',
    bio: 'Owns three restaurants and a superstition for each. Bets big on the pass with full odds and refuses to say the word “seven” at a dice table.',
    style: 'rightway', unit: 200, stack: 30000,
    lines: {
      arrive: ['Victor Sloane. Please don’t say the s-word at this table. You know the one.'],
      natural: ['The big red on the come-out. That one I like.'],
      pointMade: ['Exquisite. Leave everything up.'],
      sevenOut: ['…The big red. Lovely. Next shooter, please.', 'Somebody said it. I heard somebody say it.'],
      hot: ['Nobody move. Nobody touch the dice but the shooter.'],
      fire: ['Waiter, a round for the shooter’s side of the table. This is art.'],
      cold: ['This table needs a palate cleanser.'],
      ryanShoots: ['The golfer. Take a breath first. A real one.'],
      myShoot: ['A soft landing, please. Like a soufflé.'],
      broke: ['A modest setback. Another rack, thank you.'],
    },
  },
  {
    id: 'anika_raman', name: 'Anika Raman', short: 'Anika', location: 'morongo_sky', colour: '#7ff0e6',
    bio: 'Poker pro on a night off. Plays the don’t side with lay odds because the edge is smaller, and will tell you the exact number if you ask. Or don’t.',
    style: 'darkside', unit: 100, stack: 20000,
    lines: {
      arrive: ['Don’t pass with lay odds: one point three six percent. Just so you know what you’re looking at.'],
      crapsOut: ['Craps on the come-out. One in nine. Thank you.'],
      pointMade: ['The point is a 40% event for a six. Congratulations, everyone.'],
      sevenOut: ['Seven. Most likely number. Every time.'],
      hot: ['Streaks are just math with good lighting.'],
      cold: ['Cold tables don’t exist. But I’ll take it.'],
      ryanShoots: ['Your roll. It makes no difference how you throw them. Throw them anyway.'],
      myShoot: ['Rolling. Expect nothing.'],
      broke: ['Variance. Reloading.'],
    },
  },
  {
    id: 'rosalind_crane', name: 'Rosalind Crane', short: 'Rosalind', location: 'morongo_sky', colour: '#e4c35a',
    bio: 'Old desert money, older pearls. Places all the inside numbers, calls everybody darling, and has been coming to this room since before it had windows.',
    style: 'inside', unit: 120, stack: 25000,
    lines: {
      arrive: ['Darling, you’re standing in Harold’s spot. Harold’s been gone since ’07. Stay.'],
      pointMade: ['Lovely, lovely. Pay my inside, would you, dear?'],
      sevenOut: ['Oh, bother.', 'Down they come. Like the market in ’87.'],
      hardWin: ['A hard way! How marvellously old-fashioned.'],
      hot: ['Darling, you’re absolutely glowing. Keep rolling.'],
      fire: ['I haven’t had this much fun since Palm Springs in ’74.'],
      cold: ['These dice need a holiday, darling.'],
      ryanShoots: ['Our golfer! Throw them like you putt, darling.'],
      myShoot: ['My turn? How thrilling.'],
      broke: ['Do bring another rack, dear. And a fresh napkin.'],
    },
  },
];

export const regularsAt = (loc: LocationId) => REGULARS.filter((r) => r.location === loc);

/** Who is in each seat: three regulars around Ryan (seat 2). */
export function seatsAt(loc: LocationId): (Regular | 'ryan')[] {
  const r = regularsAt(loc);
  return [r[0], r[1], 'ryan', r[2]];
}

/** Stick Lady's streak calls (drafts). */
export const STICK_STREAK: Record<'hot' | 'fire' | 'cold' | 'ryanShoots' | 'newShooter', (name: string) => string> = {
  hot: (n) => `We've got a hot shooter, folks! ${n} has the dice working!`,
  fire: (n) => `${n} is ON FIRE! Get your bets down while the dice are hot!`,
  cold: () => 'Cold dice, cold table. New shooter coming out, let’s turn it around.',
  ryanShoots: () => 'Dice to the golfer! Ryan, pick two, and hit the back wall.',
  newShooter: (n) => `New shooter coming out! Dice to ${n}.`,
};

// ───────────── Their pretend bets (the same rules and dice as Ryan's) ─────────────

export interface RegularState { table: CrapsTable; stack: number; rebuys: number; net: number }
export const newRegularState = (r: Regular): RegularState => ({ table: newTable(), stack: r.stack, rebuys: 0, net: 0 });

/** The bets a regular makes before the next roll, by style and the table's mood. Every bet passes the real rules. */
export function chooseBets(r: Regular, t: CrapsTable, mood: Mood): [CrapsAction, number][] {
  const u = mood === 'fire' ? r.unit * 3 : mood === 'hot' ? r.unit * 2 : mood === 'cold' && r.style !== 'darkside' ? Math.max(5, Math.round(r.unit / 2)) : r.unit;
  const want: [CrapsAction, number][] = [];
  const k = Math.max(1, Math.round(u / 5));
  const place = (n: PointNo, amt: number) => { if (!t.place[n]) want.push([{ kind: 'place', n }, amt]); };
  switch (r.style) {
    case 'rightway':
      if (t.point === null && !t.pass) want.push([{ kind: 'pass' }, u]);
      if (t.point !== null && t.pass && !t.passOdds) want.push([{ kind: 'passOdds' }, t.pass * 2]);
      break;
    case 'darkside': {
      const du = mood === 'cold' ? r.unit * 2 : r.unit;
      if (t.point === null && !t.dontPass) want.push([{ kind: 'dontPass' }, du]);
      if (t.point !== null && t.dontPass && !t.dontOdds) want.push([{ kind: 'dontOdds' }, maxLay(t.dontPass, t.point)]);
      break;
    }
    case 'hardways': {
      const h = Math.min(100, Math.max(1, Math.round(u / 2)));
      if (t.point === null && !t.pass) want.push([{ kind: 'pass' }, Math.max(5, u)]);
      if (!t.hard[8]) want.push([{ kind: 'hard', n: 8 }, h]);
      if (!t.hard[6]) want.push([{ kind: 'hard', n: 6 }, h]);
      if (!t.field) want.push([{ kind: 'field' }, Math.max(5, u)]);
      break;
    }
    case 'placer':
      if (t.point !== null) {
        place(6, 6 * k);
        place(8, 6 * k);
        // Press on a hot table: up to three times the base.
        for (const n of [6, 8] as const) if ((mood === 'hot' || mood === 'fire') && (t.place[n] ?? 0) > 0 && (t.place[n] ?? 0) < 18 * Math.max(1, Math.round(r.unit / 5))) want.push([{ kind: 'place', n }, 6 * k]);
      }
      break;
    case 'comer':
      if (t.point === null && !t.pass) want.push([{ kind: 'pass' }, u]);
      if (t.point !== null && t.pass && !t.passOdds) want.push([{ kind: 'passOdds' }, t.pass * 2]);
      if (t.point !== null && !t.come && Object.keys(t.comePoints).length < 2) want.push([{ kind: 'come' }, u]);
      for (const [n, cb] of Object.entries(t.comePoints)) if (cb && !cb.odds) want.push([{ kind: 'comeOdds', n: Number(n) as PointNo }, cb.bet]);
      break;
    case 'props': {
      const p = Math.min(100, Math.max(1, Math.round(u / 4)));
      if (t.point === null && !t.pass) want.push([{ kind: 'pass' }, u]);
      want.push([{ kind: 'horn' }, p]);
      if (mood === 'hot' || mood === 'fire') want.push([{ kind: 'prop', p: 'yo' }, p]);
      break;
    }
    case 'inside':
      if (t.point !== null) {
        place(5, 5 * k);
        place(6, 6 * k);
        place(8, 6 * k);
        place(9, 5 * k);
      }
      break;
  }
  return want;
}

/** Puts a regular's chosen bets down (pretend money; a regular who runs dry buys another stack). */
export function placeBets(r: Regular, s: RegularState, point: PointNo | null, mood: Mood): { state: RegularState; rebought: boolean } {
  let table: CrapsTable = { ...s.table, point };
  let stack = s.stack;
  let rebuys = s.rebuys;
  let rebought = false;
  for (const [a, amt] of chooseBets(r, table, mood)) {
    if (betBlocker(table, a, amt)) continue;
    const cost = a.kind === 'horn' ? amt * 4 : amt;
    if (cost > stack) {
      stack += r.stack;
      rebuys += 1;
      rebought = true;
    }
    stack -= cost;
    table = addBet(table, a, amt);
  }
  return { state: { ...s, table, stack, rebuys }, rebought };
}

/** The roll, for a regular's pretend bets: the same rules as Ryan's. Returns what came back. */
export function settleRegular(s: RegularState, dice: [number, number]): { state: RegularState; paid: number; lost: number } {
  const r = resolveRoll(s.table, dice);
  const paid = r.outcomes.reduce((a, o) => a + o.payout, 0);
  const lost = r.outcomes.filter((o) => o.result === 'lose').reduce((a, o) => a + o.stake, 0);
  const net = paid - r.outcomes.reduce((a, o) => a + o.stake, 0);
  return { state: { ...s, table: r.table, stack: s.stack + paid, net: s.net + net }, paid, lost };
}

// ───────────── Who says what ─────────────

/** A small stable hash, so the same roll always picks the same voice (no randomness in the talk). */
const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

/** The events a roll produced, most important first. */
export function rollEvents(pointBefore: number | null, dice: [number, number], moodBefore: Mood, moodAfter: Mood, shooterBefore: number, shooterAfter: number): RegularEvent[] {
  const sum = dice[0] + dice[1];
  const ev: RegularEvent[] = [];
  if (moodAfter !== moodBefore && (moodAfter === 'fire' || moodAfter === 'hot' || moodAfter === 'cold')) ev.push(moodAfter);
  if (shooterAfter !== shooterBefore) ev.push(shooterAfter === RYAN_SEAT ? 'ryanShoots' : 'myShoot');
  if (pointBefore !== null && sum === 7) ev.push('sevenOut');
  if (pointBefore !== null && sum === pointBefore) ev.push('pointMade');
  if (dice[0] === dice[1] && [4, 6, 8, 10].includes(sum)) ev.push('hardWin');
  if (sum === 11 && pointBefore !== null) ev.push('yo');
  if (pointBefore === null && (sum === 7 || sum === 11)) ev.push('natural');
  if (pointBefore === null && (sum === 2 || sum === 3 || sum === 12)) ev.push('crapsOut');
  return ev;
}

/** Minor events are only remarked on some of the time. */
const ALWAYS: RegularEvent[] = ['fire', 'hot', 'cold', 'ryanShoots', 'myShoot', 'sevenOut', 'broke'];

/**
 * Picks at most one regular to speak after a roll. `myShoot` is said by the new shooter;
 * everything else by a regular with a line for it, chosen by the roll number.
 */
export function pickLine(loc: LocationId, events: RegularEvent[], rollNo: number, shooterSeat: number): { who: Regular; event: RegularEvent; text: string } | null {
  const seats = seatsAt(loc);
  for (const e of events) {
    if (!ALWAYS.includes(e) && hash(`${rollNo}:${e}`) % 10 >= 6) continue;
    const pool = e === 'myShoot'
      ? [seats[shooterSeat]].filter((x): x is Regular => x !== 'ryan')
      : regularsAt(loc).filter((r) => r.lines[e]?.length);
    if (!pool.length) continue;
    const who = pool[hash(`${rollNo}:${e}:who`) % pool.length];
    const options = who.lines[e];
    if (!options?.length) continue;
    return { who, event: e, text: options[hash(`${rollNo}:${e}:line`) % options.length] };
  }
  return null;
}
