/**
 * Career Legacy V1: milestones recognized from Ryan's verified history.
 *
 * Pure. Everything here is derived from checksum-sealed tournament results
 * (via careerStats' history) and the engine's season log, so the same
 * history always yields the same milestones, with the same chronology, in
 * any season and on any device. Awarding happens in the authoritative
 * pipeline (services/legacyService.ts); earned milestones are stored in the
 * career's existing achievements map under `legacy_*` ids.
 */
import { DESERT_ROSE, isDesertRose, TOP_TOUR_MAJOR_WEEKS } from './championships';
import type { EventLine } from './careerStats';
import { fameLevel, gameDate, type TourId } from './config';

export type LegacyGroup = 'victories' | 'majors' | 'jacket' | 'season' | 'longevity' | 'status';

export interface LegacyMilestone {
  id: string;
  name: string;
  description: string;
  group: LegacyGroup;
  /** 'full': full-screen celebration; 'toast': notification and timeline entry. */
  celebrate: 'full' | 'toast';
}

const m = (id: string, name: string, description: string, group: LegacyGroup, celebrate: 'full' | 'toast' = 'toast'): LegacyMilestone => ({ id: `legacy_${id}`, name, description, group, celebrate });

export const LEGACY_MILESTONES: LegacyMilestone[] = [
  m('first_amateur_win', 'First Amateur Win', 'Win an Amateur Circuit event.', 'victories'),
  m('first_pro_win', 'First Professional Win', 'Win a professional event.', 'victories'),
  m('first_top_tour_win', 'First Top-Tour Win', 'Win an event on the top tour.', 'victories'),
  m('wins_5', '5 Career Wins', 'Win five tournaments.', 'victories'),
  m('wins_10', '10 Career Wins', 'Win ten tournaments.', 'victories'),
  m('wins_20', '20 Career Wins', 'Win twenty tournaments.', 'victories'),
  m('wins_50', '50 Career Wins', 'Win fifty tournaments.', 'victories', 'full'),
  m('major_1', 'First Major', 'Win a major championship.', 'majors', 'full'),
  m('major_3', '3 Majors', 'Win three major championships.', 'majors'),
  m('major_5', '5 Majors', 'Win five major championships.', 'majors'),
  m('grand_slam', 'Career Grand Slam', 'Win all four majors.', 'majors', 'full'),
  m('majors_season_2', 'Two Majors, One Season', 'Win two majors in the same season.', 'majors'),
  m('major_defended', 'Major Title Defense', 'Win the same major in consecutive seasons.', 'majors'),
  m('first_pink_jacket', 'First Pink Jacket', `Win ${DESERT_ROSE.name} on the LPGA in phase 3.`, 'jacket', 'full'),
  m('pink_jacket_defended', 'Defending Champion', `Win the Pink Jacket in consecutive seasons.`, 'jacket'),
  m('season_wins_3', 'Three-Win Season', 'Win three tournaments in one season.', 'season'),
  m('season_wins_5', 'Five-Win Season', 'Win five tournaments in one season.', 'season'),
  m('seasons_5', '5 Seasons', 'Complete five seasons.', 'longevity'),
  m('seasons_10', '10 Seasons', 'Complete ten seasons.', 'longevity'),
  m('seasons_15', '15 Seasons', 'Complete fifteen seasons.', 'longevity'),
  m('seasons_20', '20 Seasons', 'Complete twenty seasons.', 'longevity'),
  m('both_halves', 'Two Eras', 'Win in seasons 1–10 and again in seasons 11–20.', 'longevity'),
  m('legend', 'Legend', 'Reach Legend fame.', 'status'),
];

export const legacyMilestone = (id: string) => LEGACY_MILESTONES.find((x) => x.id === id);

/** Where and when a milestone was earned, from the record that proved it. */
export interface LegacyEarned {
  id: string;
  season: number;
  week: number;
  /** Game-calendar date of the proving event (or the season's end). */
  at: string;
  tournamentId?: string;
  eventName?: string;
  /** e.g. "End of season 5". */
  marker?: string;
}

const PRO_TOURS: TourId[] = ['mini', 'epson', 'lpga'];

/**
 * A tournament win, as trophies count it: made the cut and finished alone in
 * first (a playoff decides ties). Q-School is a qualifier, not a win.
 */
export const isLegacyWin = (e: EventLine) => e.madeCut && e.position === 1 && e.posLabel === '1' && e.tour !== 'qschool';
export const isTopTourMajor = (e: EventLine) => e.tour === 'lpga' && e.special;

/**
 * Every Pink Jacket, in order: Desert Rose wins whose trophy carries the jacket
 * (won on the top tour in phase 3). `jackets` = those tournament ids.
 */
export function pinkJackets(history: EventLine[], jackets: ReadonlySet<string>): EventLine[] {
  return chronological(history).filter((e) => isLegacyWin(e) && isDesertRose(e.tour, e.week) && jackets.has(e.tournamentId));
}

const chronological = (h: EventLine[]) => [...h].sort((a, b) => a.season - b.season || a.week - b.week || a.tournamentId.localeCompare(b.tournamentId));

/**
 * Milestones proven by the history, each with the record that first proved it.
 * `seasonLog`: the engine's season-end log (one entry per completed season).
 * `fame`: current fame (Legend is the existing top fame level).
 * `jackets`: tournament ids of Pink Jacket trophies (Desert Rose wins in phase 3).
 */
export function evaluateLegacy(history: EventLine[], seasonLog: readonly { season: number }[] = [], fame = 0, jackets: ReadonlySet<string> = new Set()): LegacyEarned[] {
  const out = new Map<string, LegacyEarned>();
  const earn = (id: string, e: EventLine) => {
    if (!out.has(`legacy_${id}`)) out.set(`legacy_${id}`, { id: `legacy_${id}`, season: e.season, week: e.week, at: gameDate(e.season, e.week), tournamentId: e.tournamentId, eventName: e.name });
  };
  let wins = 0;
  let majors = 0;
  const majorWeeks = new Set<number>();
  const seasonWins = new Map<number, number>();
  const seasonMajors = new Map<number, number>();
  const majorWon = new Set<string>(); // `${season}:${week}`
  let earlyWin = false;
  let lateWin = false;
  for (const e of chronological(history)) {
    if (!isLegacyWin(e)) continue;
    wins++;
    if (e.tour === 'amateur') earn('first_amateur_win', e);
    if (PRO_TOURS.includes(e.tour)) earn('first_pro_win', e);
    if (e.tour === 'lpga') earn('first_top_tour_win', e);
    for (const n of [5, 10, 20, 50]) if (wins >= n) earn(`wins_${n}`, e);
    const sw = (seasonWins.get(e.season) ?? 0) + 1;
    seasonWins.set(e.season, sw);
    if (sw >= 3) earn('season_wins_3', e);
    if (sw >= 5) earn('season_wins_5', e);
    if (e.season <= 10) earlyWin = true;
    else lateWin = true;
    if (earlyWin && lateWin) earn('both_halves', e);
    if (isTopTourMajor(e)) {
      majors++;
      for (const n of [1, 3, 5]) if (majors >= n) earn(`major_${n}`, e);
      majorWeeks.add(e.week);
      if (TOP_TOUR_MAJOR_WEEKS.every((w) => majorWeeks.has(w))) earn('grand_slam', e);
      const sm = (seasonMajors.get(e.season) ?? 0) + 1;
      seasonMajors.set(e.season, sm);
      if (sm >= 2) earn('majors_season_2', e);
      if (majorWon.has(`${e.season - 1}:${e.week}`)) {
        earn('major_defended', e);
        const prev = `lpga-${e.season - 1}-w${e.week}`;
        if (isDesertRose(e.tour, e.week) && jackets.has(e.tournamentId) && jackets.has(prev)) earn('pink_jacket_defended', e);
      }
      majorWon.add(`${e.season}:${e.week}`);
      if (isDesertRose(e.tour, e.week) && jackets.has(e.tournamentId)) earn('first_pink_jacket', e);
    }
  }
  // Longevity: the engine logs each season as it ends.
  const completed = [...new Set(seasonLog.map((l) => l.season))].sort((a, b) => a - b);
  for (const n of [5, 10, 15, 20]) {
    const s = completed[n - 1];
    if (s !== undefined) out.set(`legacy_seasons_${n}`, { id: `legacy_seasons_${n}`, season: s, week: 99, at: gameDate(s + 1, 1), marker: `End of season ${s}` });
  }
  // Legend: the existing top fame level (no history of when; recognized when seen).
  if (fameLevel(fame).name === 'Legend') out.set('legacy_legend', { id: 'legacy_legend', season: 0, week: 0, at: '', marker: 'Legend fame' });
  const order = new Map(LEGACY_MILESTONES.map((x, i) => [x.id, i]));
  return [...out.values()].sort((a, b) => (a.at && b.at ? a.at.localeCompare(b.at) : a.at ? -1 : b.at ? 1 : 0) || order.get(a.id)! - order.get(b.id)!);
}
