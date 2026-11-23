/**
 * Championship identities, keyed by stable schedule identity (tour + week),
 * never by display name: stored results keep the name they were played
 * under, so a championship is recognized the same way in every season.
 */
import { SCHEDULES, type TourId } from './config';

/**
 * The top tour's first major (week 6). Identity approved for Career Legacy V1
 * (author, 2026-11-22): name, venue and award only. The slot, schedule, field,
 * purse, scoring and simulation are unchanged. It is still played on the
 * Desert Palms course, which other events share; "Rosewater Springs" is the
 * championship's presented venue.
 */
export const DESERT_ROSE = {
  tour: 'lpga' as TourId,
  week: 6,
  name: 'The Desert Rose Invitational',
  venue: 'Rosewater Springs',
  award: 'The Pink Jacket',
} as const;

export const isDesertRose = (tour: TourId | string, week: number) => tour === DESERT_ROSE.tour && week === DESERT_ROSE.week;

/** Tournament ids are `<tour>-<season>-w<week>` (see seasonSchedule). */
export function desertRoseSeason(tournamentId: string): number | null {
  const m = /^lpga-(\d+)-w6$/.exec(tournamentId);
  return m ? Number(m[1]) : null;
}

/** The four top-tour majors, by week (the Grand Slam). */
export const TOP_TOUR_MAJOR_WEEKS: number[] = SCHEDULES.lpga.filter((e) => e.special).map((e) => e.week);

/** A major's current name, by week. */
export const majorName = (week: number) => SCHEDULES.lpga.find((e) => e.week === week)?.name ?? `Week ${week} major`;
