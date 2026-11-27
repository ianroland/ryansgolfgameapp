/**
 * The private poker rooms and their permanent regulars, one room per casino. A room and that
 * casino's private course unlock together, for good, when one of the dealers who works that
 * floor reaches Friend with Ryan and invites him back (see src/casino/vip.ts).
 *
 * Regulars are fictional people with fixed personalities. Their chips are the house's
 * business: when one busts, they reload between hands. Only Ryan's buy-in and cash-out touch
 * his bankroll. What they say never changes a card or a decision.
 */
import type { LocationId } from '../../expansion/unlocks';
import type { Personality } from './ai';
import type { PokerVariant } from './holdem';

export type { PokerVariant };

export interface Regular {
  id: string;
  name: string;
  /** Short name for the felt. */
  short: string;
  /** One line under the name. */
  bio: string;
  style: Personality;
  /** Colour for the text avatar (no art yet). */
  color: string;
  lines: { sit: string[]; raise: string[]; fold: string[]; win: string[]; lose: string[] };
}

export interface PokerRoom {
  location: LocationId;
  name: string;
  variant: PokerVariant;
  variantName: string;
  /** Built and playable (a room still being built shows its regulars and a note instead). */
  open: boolean;
  sb: number;
  bb: number;
  buyIn: { min: number; max: number };
  /** What each regular sits down with (and reloads to). */
  regularStack: number;
  regulars: Regular[];
  course: { name: string; blurb: string };
}

export const POKER_ROOMS: readonly PokerRoom[] = [
  {
    location: 'desert_palms', name: 'The Back Room', variant: 'holdem', variantName: "No-Limit Texas Hold'em", open: true,
    sb: 5, bb: 10, buyIn: { min: 200, max: 1000 }, regularStack: 1000,
    course: { name: 'Palm Hollow', blurb: 'Nine private holes behind the parking structure. The owner plays skins for money and remembers every putt he ever missed.' },
    regulars: [
      {
        id: 'lucky_pham', name: 'Lorraine "Lucky" Pham', short: 'Lucky', color: '#c0392b',
        bio: 'Retired dental hygienist. Plays four hands an hour and wins three of them.',
        style: { tight: 0.85, aggro: 0.75, bluff: 0.08 },
        lines: {
          sit: ['Sit. Don\'t talk. Floss.', 'New blood. How nice.'],
          raise: ['Raise.', 'I\'ll make it more.', 'Open wide.'],
          fold: ['Not this one.', 'Fold. Rinse.'],
          win: ['Thank you, dear.', 'That\'s why they call me Lucky. It isn\'t luck.'],
          lose: ['Hm.', 'Enjoy it. It\'s a loan.'],
        },
      },
      {
        id: 'ike_mandel', name: 'Professor Ike Mandel', short: 'Professor', color: '#2e86c1',
        bio: 'Taught statistics for thirty-one years. Has never once been right about the river.',
        style: { tight: 0.6, aggro: 0.45, bluff: 0.15 },
        lines: {
          sit: ['Ah, a fresh variable.', 'Welcome. The house edge here is zero. The Lucky edge is not.'],
          raise: ['The math says raise.', 'Eleven outs. Raise.', 'Statistically, this is a raise.'],
          fold: ['The numbers are not my friends tonight.', 'A disciplined fold. Write that down.'],
          win: ['As predicted. Roughly.', 'Variance, you beautiful thing.'],
          lose: ['That was a four percent shot.', 'The river has no respect for tenure.'],
        },
      },
      {
        id: 'sal_moretti', name: 'Sal "The Sphinx" Moretti', short: 'The Sphinx', color: '#7d3c98',
        bio: 'Sunglasses indoors. Has not said a full sentence since 1994.',
        style: { tight: 0.45, aggro: 0.7, bluff: 0.35 },
        lines: {
          sit: ['…', '*nods once*'],
          raise: ['*slides chips without looking*', 'Mm.'],
          fold: ['*pushes cards away with one finger*'],
          win: ['*the faintest smile*', 'Heh.'],
          lose: ['*adjusts sunglasses*'],
        },
      },
      {
        id: 'coco_deluca', name: 'Coco DeLuca', short: 'Coco', color: '#e67e22',
        bio: 'Owns three nail salons and a boat named Coco. Plays every hand. Every single one.',
        style: { tight: 0.1, aggro: 0.2, bluff: 0.2 },
        lines: {
          sit: ['Oh, you\'re cute. You golf? My second husband golfed. Into a lake, mostly.', 'Sit by me, honey, I\'m lucky. Not at cards.'],
          raise: ['Ooh, I\'m feeling something. Raise!', 'Let\'s make it spicy.'],
          fold: ['Fine, FINE.', 'These cards are ugly. Like my first husband.'],
          win: ['Mama needs a new boat!', 'I had no idea what I had!'],
          lose: ['Oh, who cares, it\'s only money. Is it my money?', 'Again! Deal again!'],
        },
      },
    ],
  },
  {
    location: 'white_buffalo', name: 'The Paddock', variant: 'stud', variantName: 'Seven Card Stud ($10/$20 limit)', open: true,
    sb: 5, bb: 10, buyIn: { min: 300, max: 1500 }, regularStack: 1500,
    course: { name: 'Bison Ridge', blurb: 'Eighteen holes along the ridge, closed to the public. The resort\'s money men play the back nine for skins.' },
    regulars: [
      { id: 'hank_dorsey', name: 'Hank Dorsey', short: 'Hank', color: '#a04000', bio: 'Cattle auctioneer. Bets faster than he talks, which is very fast.', style: { tight: 0.5, aggro: 0.8, bluff: 0.25 }, lines: { sit: ['Sit down, sit down, do I hear a buy-in?'], raise: ['Raise, raise, going once!'], fold: ['Pass.'], win: ['SOLD.'], lose: ['Well, slap me.'] } },
      { id: 'gloria_vance', name: 'Gloria Vance', short: 'Gloria', color: '#1f618d', bio: 'Widowed three times. All natural causes. She\'d like you to know that.', style: { tight: 0.8, aggro: 0.5, bluff: 0.1 }, lines: { sit: ['Hello, dear. Do you have a will?'], raise: ['I\'ll raise.'], fold: ['Not today.'], win: ['How lovely.'], lose: ['Oh, well.'] } },
      { id: 'dwight_okafor', name: 'Dwight Okafor', short: 'Dwight', color: '#117a65', bio: 'Orthodontist. Counts everyone\'s up cards out loud, unprompted.', style: { tight: 0.6, aggro: 0.4, bluff: 0.1 }, lines: { sit: ['Lovely bite on you.'], raise: ['Three hearts showing. Raise.'], fold: ['Fold.'], win: ['Straightened out.'], lose: ['Overbite.'] } },
      { id: 'ruby_tran', name: 'Ruby Tran', short: 'Ruby', color: '#b03a2e', bio: 'Rodeo clown, retired. Fearless, and it shows.', style: { tight: 0.2, aggro: 0.85, bluff: 0.4 }, lines: { sit: ['Yee-haw, fresh meat.'], raise: ['Ride it!'], fold: ['Bucked off.'], win: ['Eight seconds, baby!'], lose: ['Been thrown worse.'] } },
    ],
  },
  {
    location: 'morongo_sky', name: 'The Observatory', variant: 'omaha8', variantName: 'Pot-Limit Omaha Hi-Lo', open: true,
    sb: 10, bb: 20, buyIn: { min: 500, max: 2500 }, regularStack: 2500,
    course: { name: 'Mesa Vista', blurb: 'A cliffside private course with a membership list nobody has seen. Skins here start at serious money.' },
    regulars: [
      { id: 'sterling_ash', name: 'Sterling Ash III', short: 'Sterling', color: '#5d6d7e', bio: 'Inherited a yacht company. Has never been on a yacht. Gets seasick in the tub.', style: { tight: 0.3, aggro: 0.6, bluff: 0.3 }, lines: { sit: ['Ah. A commoner. Delightful.'], raise: ['Let\'s say… more.'], fold: ['Beneath me.'], win: ['Naturally.'], lose: ['Put it on the tab. Whose tab? Someone\'s.'] } },
      { id: 'mirela_kos', name: 'Mirela Kos', short: 'Mirela', color: '#6c3483', bio: 'Former chess champion. Plays poker because chess got too easy.', style: { tight: 0.75, aggro: 0.65, bluff: 0.15 }, lines: { sit: ['You will lose. But politely, I hope.'], raise: ['Check. Mate. Raise.'], fold: ['A sacrifice.'], win: ['As calculated.'], lose: ['Interesting.'] } },
      { id: 'buddy_lamar', name: 'Buddy Lamar', short: 'Buddy', color: '#ca6f1e', bio: 'Lounge singer. Narrates his own hands like a ballad.', style: { tight: 0.35, aggro: 0.35, bluff: 0.2 }, lines: { sit: ['Ladies and gentlemen, a newcomer!'], raise: ['And now, a little number called… raise.'], fold: ['Exit, stage left.'], win: ['Thank you, thank you, I\'m here all week.'], lose: ['Tough crowd.'] } },
      { id: 'nan_whitlock', name: 'Nan Whitlock', short: 'Nan', color: '#196f3d', bio: 'Ninety-one. Has been coming here since before it was built.', style: { tight: 0.9, aggro: 0.55, bluff: 0.05 }, lines: { sit: ['Speak up, dear.'], raise: ['Raise, I said! RAISE.'], fold: ['Eh.'], win: ['Still got it.'], lose: ['Back in my day, that was a winning hand.'] } },
    ],
  },
];

export const roomAt = (loc: LocationId) => POKER_ROOMS.find((r) => r.location === loc)!;
export const regularById = (id: string) => POKER_ROOMS.flatMap((r) => r.regulars).find((g) => g.id === id);
