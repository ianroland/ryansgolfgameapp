/**
 * Which tour ladder Ryan is on (owner, 2026-11-24: "all PGA talk until phase 3 where Ryan
 * transitions"). Tour ids are stable save keys; only their names and fields change:
 *
 *   phases 1–2 (Acts I–II)  'pga':  PGA Tour Q-School → Korn Ferry Tour → PGA Tour, men's fields
 *   phase 3 (Acts III–IV)   'lpga': LPGA Q-School → Epson Tour → LPGA Tour, women's fields (Kayla in them)
 */
import type { CareerState } from './types';
import { TOURS, WOMENS_TOUR_NAMES, type TourId } from './config';

export type Ladder = 'pga' | 'lpga';

/** Read straight from the save (Act III on = phase 3), so career code never imports story code. */
export const ladderOf = (c: Pick<CareerState, 'story'>): Ladder => ((c.story?.act ?? 1) >= 3 ? 'lpga' : 'pga');
/** The field phase for `isMensTour`: 3 on the LPGA ladder, otherwise 1. */
export const fieldPhase = (c: Pick<CareerState, 'story'>): 1 | 3 => (ladderOf(c) === 'lpga' ? 3 : 1);

type LadderTour = 'qschool' | 'epson' | 'lpga';
export const LADDER: Record<Ladder, { name: Record<LadderTour, string>; short: Record<LadderTour, string>; pill: Record<LadderTour, string> }> = {
  pga: {
    name: { qschool: 'PGA Tour Q-School', epson: 'Korn Ferry Tour', lpga: 'PGA Tour' },
    short: { qschool: 'Q', epson: 'KFT', lpga: 'PGA' },
    pill: { qschool: 'Q-SCHOOL', epson: 'KORN FERRY', lpga: 'PGA TOUR' },
  },
  lpga: {
    name: { ...WOMENS_TOUR_NAMES },
    short: { qschool: 'Q', epson: 'EPSON', lpga: 'LPGA' },
    pill: { qschool: 'Q-SCHOOL', epson: 'EPSON', lpga: 'LPGA TOUR' },
  },
};

const onLadder = (t: TourId): t is LadderTour => t === 'qschool' || t === 'epson' || t === 'lpga';

export const tourName = (t: TourId, l: Ladder) => (onLadder(t) ? LADDER[l].name[t] : TOURS[t].name);
export const tourShort = (t: TourId, l: Ladder) => (onLadder(t) ? LADDER[l].short[t] : TOURS[t].short);

/** Fills `{Top}` (PGA Tour / LPGA Tour), `{Dev}` (Korn Ferry Tour / Epson Tour) and `{QSchool}`. */
export function ladderSay(l: Ladder, template: string): string {
  return template
    .replace(/\{Top\}/g, LADDER[l].name.lpga)
    .replace(/\{Dev\}/g, LADDER[l].name.epson)
    .replace(/\{QSchool\}/g, LADDER[l].name.qschool);
}

/** The ladder in force at a given week: results from before the switch keep their PGA names. */
export function ladderAt(c: Pick<CareerState, 'flags'>, season: number, week: number): Ladder {
  const fs = c.flags?.lpgaFromSeason, fw = c.flags?.lpgaFromWeek;
  if (typeof fs !== 'number') return 'pga';
  return season > fs || (season === fs && week >= (typeof fw === 'number' ? fw : 0)) ? 'lpga' : 'pga';
}
