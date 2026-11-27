/**
 * The recurring cast. Every character has a stable ID, an atlas of portraits
 * (8 expressions) and full-body poses, a personality line for writers, and a
 * relationship: either one of the classic People (coach, rival…) or a story
 * bond kept in `story.bonds`.
 */
import type { PersonId } from '../career/types';

export interface CharacterDef {
  id: string;
  name: string;
  /** Name shown on the dialogue nameplate. */
  short: string;
  role: string;
  personality: string;
  /** Classic relationship this character uses, if any. */
  person?: PersonId;
  /** Nameplate colour. */
  color: string;
}

export const RYAN_ID = 'ryan';

export const CAST: CharacterDef[] = [
  { id: 'kayla_brooks', name: 'Kayla Brooks', short: 'Kayla', role: 'Rival', personality: 'Confident, sharp-tongued, secretly keeps score of everything.', person: 'rival', color: '#7b4fd6' },
  { id: 'coach_martinez', name: 'Dana Martinez', short: 'Coach Martinez', role: 'Swing coach', personality: 'Gruff mentor. Terrible windbreakers, unexpectedly good advice.', person: 'coach', color: '#5b3fa0' },
  { id: 'biff_fairway', name: 'Biff Fairway III', short: 'Biff', role: 'Wealthy amateur', personality: 'Believes expensive equipment is the same thing as talent.', color: '#e0458f' },
  { id: 'marty_mulligan', name: 'Marty Mulligan', short: 'Marty', role: 'Agent', personality: 'Overenthusiastic. Every idea is a "game changer". Most are inflatable.', color: '#2f5fbf' },
  { id: 'commissioner_clipboard', name: 'Commissioner Clipboard', short: 'Commissioner', role: 'Tour administrator', personality: 'Treats paperwork like a competitive sport, and is undefeated.', color: '#6b2f7a' },
  { id: 'agent_reese', name: 'Agent Reese', short: 'Reese', role: 'Agent', personality: 'Professional, ambitious, always negotiating, even about lunch.', color: '#2b2b3a' },
  { id: 'sponsor_dawson', name: 'Mr. Dawson', short: 'Dawson', role: 'Sponsor executive', personality: 'Corporate. Questionable marketing instincts, unshakeable confidence in them.', color: '#1d3f8a' },
  { id: 'caddie_jordan', name: 'Jordan', short: 'Jordan', role: 'Caddie', personality: 'Dependable, dry sense of humour, reads greens and people.', person: 'caddie', color: '#3f6f3a' },
  { id: 'friend_avery', name: 'Avery', short: 'Avery', role: 'Friend', personality: 'Knows Ryan outside golf. Supportive, honest, brings snacks.', color: '#d8457a' },
  { id: 'baba', name: 'Baba', short: 'Baba', role: 'Ryan\u2019s father', personality: 'Blunt, funny, demanding, loyal. Never sentimental. Always has a BOBO MILKY.', person: 'mom', color: '#2f6b3a' },
  { id: 'reporter_kim', name: 'Kim', short: 'Reporter Kim', role: 'Sports reporter', personality: "Follows Ryan's increasingly strange career with a microphone and a straight face.", color: '#7a2f6b' },
];

export const characterById = (id: string) => CAST.find((c) => c.id === id);

/**
 * People who speak in a scene without character art (a name tag, no portrait or sprite).
 * Mom has no art yet; none is invented for her.
 */
export const VOICES: readonly { id: string; short: string; color: string }[] = [{ id: 'mom', short: 'Mom', color: '#a0522d' }];
export const voiceById = (id: string) => VOICES.find((v) => v.id === id);

/** Expression → which head is drawn. Cast sheets have 7 heads; "worried" shares the disappointed head. */
export const CAST_EXPRESSION_NOTE = 'Cast sheets have 7 drawn heads; "worried" reuses "disappointed".';
