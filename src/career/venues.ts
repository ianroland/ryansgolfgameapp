/**
 * Which course each event is played on. The tour travels: names hint at the
 * venue (coast events on the links, desert events at the resort), and the
 * majors and finales go to Highland Ridge.
 */
import { DESERT_PALMS, DRY_CREEK_MUNI, HIGHLAND_RIDGE, LAKESIDE_PINES, PACIFIC_BLUFFS, SKYLINE_NATIONAL } from '../golf/courses';
import { SCHEDULES, type TourId } from './config';

const DRY = DRY_CREEK_MUNI.id;
const LINKS = PACIFIC_BLUFFS.id;
const DESERT = DESERT_PALMS.id;
const LAKES = LAKESIDE_PINES.id;
const CITY = SKYLINE_NATIONAL.id;
const HIGH = HIGHLAND_RIDGE.id;

/** Per tour, in schedule order. */
const VENUES: Record<Exclude<TourId, 'qschool'>, string[]> = {
  // Dry Creek City, Inland Empire, Desert Springs, Coastal, SoCal, Harbor Lights, State Championship, Fall Classic
  amateur: [DRY, CITY, DESERT, LINKS, DRY, LINKS, HIGH, LAKES],
  // Riverside, Palm Desert, Temecula, Ojai, Santa Clarita, Long Beach, Bakersfield, San Diego, Ventura, Finale
  mini: [LAKES, DESERT, DRY, HIGH, DRY, LINKS, CITY, LINKS, LAKES, CITY],
  // Desert Bloom, Gulf Coast, Magnolia, Lone Star, Prairie Winds, Lakeshore, Mountain Pines, Heartland,
  // Carolina Coast, River Valley, Bluegrass, Peach State, Twin Lakes, Tour Championship
  epson: [DESERT, LINKS, CITY, DESERT, DRY, LAKES, HIGH, CITY, LINKS, LAKES, CITY, DRY, LAKES, HIGH],
  // Sunshine Coast, Desert Palms, Desert Rose (major), Pacific Coast, Bay City, Americas (major), Great Lakes,
  // Lakeside, Women's Open (major), Heartland, Highland, Alpine Major, Asia Swing, Tour Championship
  lpga: [LINKS, DESERT, DESERT, LINKS, CITY, CITY, LAKES, LAKES, LINKS, CITY, HIGH, HIGH, CITY, HIGH],
};

/** Q-School: Stage I at the home muni, Stage II in the desert, Q-Series at altitude. */
const QSCHOOL_VENUES = [DRY, DESERT, HIGH];

export function courseIdForEvent(tour: TourId, week: number, qStage?: number): string {
  if (tour === 'qschool') return QSCHOOL_VENUES[(qStage ?? 1) - 1] ?? DRY;
  const i = SCHEDULES[tour].findIndex((e) => e.week === week);
  return VENUES[tour][i] ?? DRY;
}
