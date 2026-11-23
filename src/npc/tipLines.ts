/**
 * Dealer reactions to tips. ALL LINES ARE DRAFT pending Script Room approval (the dialogue
 * boxes show a Draft tag). Written in each dealer's established voice; no accents, no
 * stereotypes; no suggestion that a tip changes the cards, dice or wheel.
 */
import { cryptoInt, type RandomInt } from '../casino/random';
import type { TipEvent } from './relationship';
import type { NpcId } from './types';

export interface TipLine {
  id: string;
  text: string;
  status: 'draft' | 'approved';
}

type Script = Record<TipEvent, string[]>;

const SCRIPTS: Record<NpcId, Script> = {
  velvet_vega: {
    tip_first: ["A tip. From you. I'll mark the date.", 'Thank you. The cards still won’t like you, but I might.'],
    tip_small: ['Noted. Appreciated, even.', 'Thank you. Every chip counts.'],
    tip_generous: ['That’s generous. Careful, I’ll start remembering your name.', 'Now that is how you treat a dealer.'],
    tip_huge: ['That’s too much. I’m keeping it, but it’s too much.', 'You know I can’t change the cards for that, right? Good. Thank you.'],
    tip_regular: ['You again. And polite again. Welcome back.', 'Consistent. I like consistent.'],
    tip_maxed: ['You’re already in my good books. Save some for the table.', 'We’re fine, you and me. Play your hand.'],
    tier_up: ['You know, you’re not the worst regular I’ve had.', 'Stick around. I’m starting to enjoy your company.'],
  },
  stick_lady: {
    tip_first: ['Hey, thank you! First one from you, I won’t forget it.', 'Look at that, a tip for the stick! Thanks, hon.'],
    tip_small: ['Thanks! Dice don’t care, but I do.', 'Appreciate it. Shooter’s got manners.'],
    tip_generous: ['Whoa, generous shooter! Thank you!', 'That’s a big thank-you. Right back at you.'],
    tip_huge: ['Hold on, that’s a lot! Thank you, really.', 'You sure? Okay, okay. Thank you!'],
    tip_regular: ['My favourite regular is back!', 'Every time you’re here, you look after the crew. Thanks.'],
    tip_maxed: ['You’ve done plenty for me already. Roll the bones!', 'We’re good, friend. Save it for your bets.'],
    tier_up: ['You’re one of the regulars now, you know that?', 'Table feels better when you’re on it.'],
  },
  madame_monique: {
    tip_first: ['A gift for Madame? The wheel takes notice. So do I.', 'How kind. I sensed generosity in you.'],
    tip_small: ['Merci. A small kindness travels far.', 'A token, gratefully received.'],
    tip_generous: ['Generous. The spirits approve, and so does Madame.', 'Such warmth. You will be remembered at this table.'],
    tip_huge: ['Too much, darling. Madame accepts, but the wheel cannot be bribed.', 'Extravagant. I adore it. The wheel, alas, is indifferent.'],
    tip_regular: ['You return, and you remember Madame. How lovely.', 'A familiar hand. A familiar kindness.'],
    tip_maxed: ['You have nothing more to prove to Madame. Spin, my dear.', 'We understand each other already.'],
    tier_up: ['I have read many fortunes. Yours is growing on me.', 'You are becoming one of my favourite stories.'],
  },
  waifu: {
    tip_first: ['Thank you. That was unexpected, and appreciated.', 'How thoughtful. Thank you.'],
    tip_small: ['Thank you.', 'Kindly done. Thank you.'],
    tip_generous: ['That is generous. Thank you.', 'Very kind. I will remember it.'],
    tip_huge: ['That is far too generous. Thank you, truly. The shoe, of course, remains impartial.', 'I am almost speechless. Almost. Thank you.'],
    tip_regular: ['Welcome back. You are always considerate.', 'A familiar face, and a kind one.'],
    tip_maxed: ['You have already been more than kind. Please, enjoy the game.', 'There is no need. We are on good terms.'],
    tier_up: ['I look forward to your visits.', 'It is pleasant to deal for someone so courteous.'],
  },
  winston: {
    tip_first: ['Hey, thank you! First one from you. I appreciate that.', 'Well, look at that. Thank you, friend.'],
    tip_small: ['Thanks, I appreciate it.', 'Every little bit. Thank you.'],
    tip_generous: ['That’s generous! Thank you.', 'Now you’re looking after the dealer. Thanks!'],
    tip_huge: ['Whoa! That’s too much. Thank you! The cards still don’t know who you are, though.', 'You’re making my whole night. Thank you!'],
    tip_regular: ['My friend is back! Good to see you.', 'Always good to see you at this table.'],
    tip_maxed: ['You’ve been more than good to me. Play your cards.', 'We’re good, friend. Keep it for the felt.'],
    tier_up: ['You’re one of my regulars now.', 'Table’s always better when you sit down.'],
  },
};

export const TIP_SCRIPTS = SCRIPTS;

/** Picks a draft tip line, avoiding the last line this dealer said about tips. */
export function pickTipLine(npcId: NpcId, event: TipEvent, recent: string[], rand: RandomInt = cryptoInt): TipLine {
  const pool = SCRIPTS[npcId][event].map((text, i) => ({ id: `${npcId}_${event}_${i + 1}`, text, status: 'draft' as const }));
  const fresh = pool.filter((l) => !recent.slice(-3).includes(l.id));
  const from = fresh.length ? fresh : pool;
  return from[rand(from.length)];
}
