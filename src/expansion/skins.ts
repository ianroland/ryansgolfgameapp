/**
 * Skins on the casinos' private courses. Pure rules.
 *
 * Four players, nine holes. Everyone puts nine skins' worth in up front, so each hole is worth
 * four stakes. The lowest score on a hole wins its skin and every skin carried into it; a tie
 * carries. Skins still carried after the ninth go to a sudden-death playoff (holes one, two,
 * three… again) until somebody wins a hole outright. The whole pool is always paid out, so
 * Ryan can lose at most his buy-in and win at most the pool.
 *
 * Holes are simulated with the tournament hole model (career/field.ts simHole). Ryan picks how
 * to play each hole; that changes only his own draws:
 *   safe        a little worse on average, but never worse than bogey
 *   normal      his usual game
 *   aggressive  better birdie chances, and sometimes a penalty stroke
 * Each player's draws come from their own seeded stream, so nobody's choice moves anyone else.
 */
import { simHole } from '../career/field';
import { hashString, rng } from '../golf/math';
import type { LocationId } from './unlocks';

export type SkinsStyle = 'safe' | 'normal' | 'aggressive';
export const STYLE_HINTS: Record<SkinsStyle, string> = {
  safe: 'Middle of everything. Never worse than bogey.',
  normal: 'Your usual game.',
  aggressive: 'Flag hunting. More birdies, more trouble.',
};

export interface SkinsRival { id: string; name: string; short: string; rating: number; color: string; lines: { win: string[]; lose: string[]; playoff: string[] } }

export interface PrivateCourse {
  location: LocationId;
  name: string;
  stake: number;
  pars: number[];
  rivals: SkinsRival[];
}

export const SKINS_HOLES = 9;
export const PLAYOFF_MAX = 27;

export const PRIVATE_COURSES: readonly PrivateCourse[] = [
  {
    location: 'desert_palms', name: 'Palm Hollow', stake: 100, pars: [4, 3, 5, 4, 4, 3, 4, 5, 4],
    rivals: [
      { id: 'dutch_vankamp', name: 'Dutch Van Kamp', short: 'Dutch', rating: 60, color: '#b9770e', lines: { win: ['That\'s why my name\'s on the building.', 'Put it on my tab. Oh wait, you owe ME.'], lose: ['I own this course and it still hates me.', 'Somebody fire the groundskeeper.'], playoff: ['Sudden death! I love sudden death. Unless it\'s mine.'] } },
      { id: 'lefty_morales', name: 'Lefty Morales', short: 'Lefty', rating: 56, color: '#1f618d', lines: { win: ['Lefty strikes!', 'Southpaw supremacy.'], lose: ['The grass leans right here. It\'s rigged.'], playoff: ['One more hole. My heart can take it. Probably.'] } },
      { id: 'bunny_kessler', name: 'Bunny Kessler', short: 'Bunny', rating: 54, color: '#c0392b', lines: { win: ['Hop, hop, cha-ching!', 'Nobody expects the Bunny.'], lose: ['I was distracted by your swing. It\'s… a lot.'], playoff: ['Ooh, overtime. I brought snacks.'] } },
    ],
  },
  {
    location: 'white_buffalo', name: 'Bison Ridge', stake: 500, pars: [4, 4, 3, 5, 4, 4, 3, 5, 4],
    rivals: [
      { id: 'colt_brannigan', name: 'Colt Brannigan', short: 'Colt', rating: 68, color: '#784212', lines: { win: ['Yeehaw. Write that down.', 'That\'s ranch money, partner.'], lose: ['My horse could\'ve made that putt.'], playoff: ['Sudden death? Out here we call that Tuesday.'] } },
      { id: 'judge_pike', name: 'Judge Harlan Pike', short: 'The Judge', rating: 64, color: '#212f3d', lines: { win: ['The court rules in my favor.', 'Sustained.'], lose: ['Overruled. By a putt.', 'I\'ll allow it. Reluctantly.'], playoff: ['We\'ll settle this in chambers. The chambers are the first tee.'] } },
      { id: 'tammy_reyes', name: 'Tammy "Two-Putt" Reyes', short: 'Tammy', rating: 66, color: '#a93226', lines: { win: ['ONE putt! Somebody call the papers!', 'They\'ll have to change the nickname.'], lose: ['Two putts. As foretold.'], playoff: ['Extra holes? My nickname doubles as a strategy.'] } },
    ],
  },
  {
    location: 'morongo_sky', name: 'Mesa Vista', stake: 2500, pars: [4, 5, 3, 4, 4, 5, 4, 3, 4],
    rivals: [
      { id: 'mr_valentine', name: 'Mr. Valentine', short: 'Valentine', rating: 78, color: '#4a235a', lines: { win: ['Mm.', 'Naturally.'], lose: ['Interesting. Very interesting.'], playoff: ['Overtime. How delightful.'] } },
      { id: 'priya_castellane', name: 'Priya Castellane', short: 'Priya', rating: 75, color: '#0e6655', lines: { win: ['That was the plan from the parking lot.', 'Spreadsheet says yes.'], lose: ['Recalculating.'], playoff: ['Fine. I\'ll beat you twice.'] } },
      { id: 'rocco_bruno', name: 'Rocco "The Mulligan" Bruno', short: 'Rocco', rating: 72, color: '#922b21', lines: { win: ['No mulligan needed!', 'Rocco\'s back, baby!'], lose: ['Can I take that one again? No? Rude.'], playoff: ['I\'d like to request a mulligan on the whole round.'] } },
    ],
  },
];

export const courseAt = (loc: LocationId) => PRIVATE_COURSES.find((c) => c.location === loc)!;

export interface SkinsMatch {
  id: string;
  location: LocationId;
  seed: number;
  /** Ryan's rating when he teed off (fixed for the match). */
  rating: number;
  /**
   * The members' ratings for this match (1.0.3): they raise their game when a better Ryan
   * shows up, so a course stays a contest as Ryan improves. Missing on older matches: base.
   */
  rivalRatings?: number[];
  stake: number;
  /** Player ids: 'ryan' first, then the rivals. */
  players: string[];
  /** Strokes per player per hole played (playoff holes included, after the ninth). */
  scores: number[][];
  /** Skins won per player. */
  skins: number[];
  /** Skins riding on the next hole. */
  carry: number;
  /** Ryan's style on each hole. */
  styles: SkinsStyle[];
  /** One line per hole, newest last. */
  log: string[];
  done: boolean;
  v: 1;
}

export const holesPlayed = (m: SkinsMatch) => m.scores[0].length;
export const inPlayoff = (m: SkinsMatch) => holesPlayed(m) >= SKINS_HOLES && !m.done;
/** Par of the next (or a given) hole; playoff holes go round the course again. */
export const parOf = (m: SkinsMatch, i = holesPlayed(m)) => courseAt(m.location).pars[i % SKINS_HOLES];
export const skinValue = (m: SkinsMatch) => m.stake * m.players.length;
export const buyIn = (m: Pick<SkinsMatch, 'stake'>) => m.stake * SKINS_HOLES;
export const payoutOf = (m: SkinsMatch, i = 0) => m.skins[i] * skinValue(m);

/** Share of Ryan's lead over a member's base rating that the member closes for the match. */
export const RIVAL_CATCH_UP = 0.7;
export const rivalRating = (base: number, ryan: number) => Math.round(base + Math.max(0, ryan - base) * RIVAL_CATCH_UP);

export function newMatch(id: string, loc: LocationId, seed: number, rating: number): SkinsMatch {
  const course = courseAt(loc);
  const players = ['ryan', ...course.rivals.map((r) => r.id)];
  const rivalRatings = course.rivals.map((r) => rivalRating(r.rating, rating));
  return { id, location: loc, seed, rating, rivalRatings, stake: course.stake, players, scores: players.map(() => []), skins: players.map(() => 0), carry: 1, styles: [], log: [], done: false, v: 1 };
}

/** One player's strokes on hole `i` of the match (deterministic for the seed, player, hole and style). */
export function strokesFor(m: SkinsMatch, who: number, i: number, style: SkinsStyle): number {
  const r = rng(m.seed ^ hashString(`${m.players[who]}:${i}`));
  const par = parOf(m, i);
  const wind = r.next() * 12;
  const rating = who === 0 ? m.rating : m.rivalRatings?.[who - 1] ?? courseAt(m.location).rivals[who - 1].rating;
  if (style === 'safe') return Math.min(par + 1, simHole(par, rating - 5, r, wind));
  if (style === 'aggressive') {
    const s = simHole(par, rating + 9, r, wind);
    return r.next() < 0.22 ? s + 1 : s;
  }
  return simHole(par, rating, r, wind);
}

/** Plays the next hole with Ryan's chosen style. Returns the new match (unchanged if it's over). */
export function playHole(prev: SkinsMatch, style: SkinsStyle): SkinsMatch {
  if (prev.done) return prev;
  const m: SkinsMatch = { ...prev, scores: prev.scores.map((s) => [...s]), skins: [...prev.skins], styles: [...prev.styles, style], log: [...prev.log] };
  const i = holesPlayed(prev);
  const hole = m.players.map((_, w) => strokesFor(m, w, i, w === 0 ? style : 'normal'));
  hole.forEach((s, w) => m.scores[w].push(s));
  const best = Math.min(...hole);
  const winners = hole.map((s, w) => (s === best ? w : -1)).filter((w) => w >= 0);
  const label = i < SKINS_HOLES ? `Hole ${i + 1}` : `Playoff hole ${i - SKINS_HOLES + 1}`;
  if (winners.length === 1) {
    const w = winners[0];
    m.skins[w] += m.carry;
    m.log.push(`${label}: ${w === 0 ? 'You win' : `${nameOf(m, w)} wins`} ${m.carry > 1 ? `${m.carry} skins` : 'the skin'} with a ${best}.`);
    m.carry = 1;
    if (i >= SKINS_HOLES - 1) m.done = true; // ninth hole or a playoff hole won outright ends it
  } else {
    m.log.push(`${label}: tied at ${best}. ${i >= SKINS_HOLES - 1 ? 'Sudden death!' : 'The skin carries.'}`);
    if (i < SKINS_HOLES - 1) m.carry += 1;
    // After the ninth the carry stays the same: the playoff is for what's riding.
  }
  if (!m.done && holesPlayed(m) >= SKINS_HOLES + PLAYOFF_MAX) {
    // Practically never happens; the lowest total takes what's riding so the pool is always paid.
    const totals = m.scores.map((s) => s.reduce((a, b) => a + b, 0));
    m.skins[totals.indexOf(Math.min(...totals))] += m.carry;
    m.log.push('The marshal calls it: lowest total takes what was riding.');
    m.done = true;
  }
  return m;
}

export const nameOf = (m: SkinsMatch, w: number) => (w === 0 ? 'You' : courseAt(m.location).rivals[w - 1].short);
