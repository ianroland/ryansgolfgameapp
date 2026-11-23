/** Course registry: every venue on tour, by id. */
import { holeYardage, type CourseDef } from '../course';
import { DRY_CREEK_MUNI } from './dryCreek';
import { DESERT_PALMS, HIGHLAND_RIDGE, LAKESIDE_PINES, PACIFIC_BLUFFS, SKYLINE_NATIONAL } from './tourCourses';

export { DRY_CREEK_MUNI, DESERT_PALMS, HIGHLAND_RIDGE, LAKESIDE_PINES, PACIFIC_BLUFFS, SKYLINE_NATIONAL };

export const COURSES: CourseDef[] = [DRY_CREEK_MUNI, PACIFIC_BLUFFS, DESERT_PALMS, LAKESIDE_PINES, SKYLINE_NATIONAL, HIGHLAND_RIDGE];
const BY_ID = new Map(COURSES.map((c) => [c.id, c]));

/** The course for an id. Unknown ids (very old saves) fall back to Dry Creek. */
export function getCourse(id: string | undefined): CourseDef {
  return (id && BY_ID.get(id)) || DRY_CREEK_MUNI;
}

export function isCourseId(id: string): boolean {
  return BY_ID.has(id);
}

export function courseYards(c: CourseDef): number {
  return c.holes.reduce((s, h) => s + holeYardage(h), 0);
}

/** Short labels for how a course plays. */
export function courseTraits(c: CourseDef): string[] {
  const out: string[] = [];
  const d = c.difficulty ?? 0;
  if (d >= 1.2) out.push('Championship test');
  else if (d >= 0.3) out.push('Tough');
  else if (d < 0) out.push('Scoreable');
  if ((c.windiness ?? 1) >= 1.3) out.push('Windy');
  const waterHoles = c.holes.filter((h) => h.water.length > 0).length;
  if (waterHoles >= 5) out.push(`Water on ${waterHoles} holes`);
  return out;
}
