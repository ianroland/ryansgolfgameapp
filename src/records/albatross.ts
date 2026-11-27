/**
 * Albatross records: detection, verification and leaderboards.
 *
 * An albatross is a hole finished exactly three strokes under par (a par 5 in
 * 2, a par 4 in 1). It is only ever read from an authoritative, finalized
 * hole score. Stored scores already include penalty strokes. Nothing here
 * predicts or rolls anything: every record points at a real hole result.
 *
 * Record IDs are stable (`alb:<tournament>:<golfer>:r<round>:h<hole>`), so
 * processing the same result twice can never create a second record.
 */
import { tourName, type Ladder } from '../career/ladder';
import { checksum } from '../core/checksum';
import type { TourId } from '../career/config';
import { resultCourse, type TournamentResult } from '../career/tournament';
import { holeYardage } from '../golf/course';

export const ALBATROSS_TO_PAR = -3;

/** Strokes relative to par for a finalized hole. `strokes` includes penalties. */
export function holeToPar(par: number, strokes: number): number {
  return strokes - par;
}

/** Exactly three under: an eagle (−2) is not an albatross. */
export function isAlbatross(par: number, strokes: number): boolean {
  if (!Number.isInteger(par) || !Number.isInteger(strokes) || strokes < 1) return false;
  return holeToPar(par, strokes) === ALBATROSS_TO_PAR;
}

/**
 * Finalized strokes for a hole played by hand: the swings plus any penalty
 * strokes. The round scene already scores holes this way; this is the rule
 * written down once so it can be tested.
 */
export function finalHoleStrokes(swings: number, penaltyStrokes: number): number {
  return swings + penaltyStrokes;
}

export interface AlbatrossRecord {
  /** `alb:<tournamentId>:<golferId>:r<round>:h<hole>` */
  id: string;
  golferId: string;
  golferName: string;
  isPlayer: boolean;
  tournamentId: string;
  tournamentName: string;
  tour: TourId;
  tourName: string;
  major: boolean;
  season: number;
  week: number;
  /** In-game date of the tournament's finish. */
  gameDate: string;
  courseId: string;
  courseName: string;
  round: number;
  holeNumber: number;
  holeName: string;
  par: number;
  yards: number;
  strokes: number;
  /** How it was holed, when known (Ryan's hand-played holes). */
  shot?: string;
  /** Where the record came from: the live pipeline, or the one-time history scan. */
  source: 'live' | 'backfill';
  sourceCareerEventId: string;
  recordedAtReal: string;
}

export function albatrossId(tournamentId: string, golferId: string, round: number, holeNumber: number) {
  return `alb:${tournamentId}:${golferId}:r${round}:h${holeNumber}`;
}

/**
 * Is a stored result trustworthy enough to read hole scores from? Its seal must
 * still match its contents, its pars must be the course's pars, and every hole
 * score must be a real stroke count. (Unlike `validateResult`, this doesn't
 * re-check against today's schedule, which may since have moved the event.)
 */
export function isVerifiedRecord(r: TournamentResult): boolean {
  // Stored records add their table key and source event; the seal covers the result itself.
  const { authority, ...rest } = r as TournamentResult & { id?: string; recordedFromCareerEventId?: string };
  const { id: _id, recordedFromCareerEventId: _src, ...content } = rest;
  if (authority?.source !== 'tournament_engine' || authority.checksum !== checksum(content)) return false;
  const course = resultCourse(r);
  if (r.pars.length !== course.holes.length || r.pars.some((p, i) => p !== course.holes[i].par)) return false;
  return Object.values(r.scores).every((rounds) => rounds.every((h) => h.length === r.pars.length && h.every((s) => Number.isInteger(s) && s >= 1 && s <= 15)));
}

/** Every albatross in a finalized tournament result, for every golfer in the field. */
export function detectAlbatrosses(
  r: TournamentResult,
  opts: { source: AlbatrossRecord['source']; sourceCareerEventId: string; recordedAtReal: string; shotNotes?: Record<string, string>; ladder?: Ladder },
): AlbatrossRecord[] {
  const course = resultCourse(r);
  const names = new Map(r.entrants.map((e) => [e.id, e.name]));
  const out: AlbatrossRecord[] = [];
  for (const e of r.entrants) {
    (r.scores[e.id] ?? []).forEach((holes, ri) => {
      holes.forEach((strokes, hi) => {
        const par = r.pars[hi];
        if (!isAlbatross(par, strokes)) return;
        const hole = course.holes[hi];
        const id = albatrossId(r.tournamentId, e.id, ri + 1, hi + 1);
        const shot = opts.shotNotes?.[id];
        out.push({
          id,
          golferId: e.id,
          golferName: names.get(e.id) ?? e.id,
          isPlayer: e.id === r.playerId,
          tournamentId: r.tournamentId,
          tournamentName: r.def.name,
          tour: r.def.tour,
          tourName: tourName(r.def.tour, opts.ladder ?? 'pga'),
          major: r.def.tour === 'lpga' && !!r.def.special,
          season: r.def.season,
          week: r.def.week,
          gameDate: r.finalizedAt,
          courseId: course.id,
          courseName: course.name,
          round: ri + 1,
          holeNumber: hole.number,
          holeName: hole.name,
          par,
          yards: holeYardage(hole),
          strokes,
          ...(shot ? { shot } : {}),
          source: opts.source,
          sourceCareerEventId: opts.sourceCareerEventId,
          recordedAtReal: opts.recordedAtReal,
        });
      });
    });
  }
  return out;
}

// ───────────────────────── Ordering & leaderboards ─────────────────────────

/** When it happened: season, week, round, hole. */
function compareWhen(a: AlbatrossRecord, b: AlbatrossRecord): number {
  return a.season - b.season || a.week - b.week || a.round - b.round || a.holeNumber - b.holeNumber;
}

/** Chronological, then golfer name for a stable order. */
export function compareChronological(a: AlbatrossRecord, b: AlbatrossRecord): number {
  return compareWhen(a, b) || a.golferName.localeCompare(b.golferName);
}

export interface CountRow {
  golferId: string;
  golferName: string;
  isPlayer: boolean;
  count: number;
  /** Shared rank: golfers with the same count share it. */
  rank: number;
  /** "T2" when tied, else "2". */
  rankLabel: string;
  latest: AlbatrossRecord;
  /** Tracked rounds (rounds in events on file). */
  rounds: number;
  status: 'Active' | 'Retired';
}

/**
 * Ranks golfers by albatross count. Equal counts share a rank (1, T2, T2, 4);
 * within a tie the order is most recent albatross first, then name. That
 * order is display only and never implies a higher count.
 */
export function rankByCount(
  records: AlbatrossRecord[],
  rounds: Record<string, number> = {},
  retired: ReadonlySet<string> = new Set(),
): CountRow[] {
  const by = new Map<string, AlbatrossRecord[]>();
  for (const r of records) by.set(r.golferId, [...(by.get(r.golferId) ?? []), r]);
  const rows = [...by.entries()].map(([golferId, list]) => {
    const sorted = [...list].sort(compareChronological);
    const latest = sorted[sorted.length - 1];
    return {
      golferId,
      golferName: latest.golferName,
      isPlayer: latest.isPlayer,
      count: list.length,
      latest,
      rounds: rounds[golferId] ?? 0,
      status: (retired.has(golferId) ? 'Retired' : 'Active') as CountRow['status'],
      rank: 0,
      rankLabel: '',
    };
  });
  rows.sort((a, b) => b.count - a.count || compareWhen(b.latest, a.latest) || a.golferName.localeCompare(b.golferName));
  rows.forEach((row, i) => {
    row.rank = i > 0 && rows[i - 1].count === row.count ? rows[i - 1].rank : i + 1;
  });
  for (const row of rows) {
    const tied = rows.filter((x) => x.count === row.count).length > 1;
    row.rankLabel = `${tied ? 'T' : ''}${row.rank}`;
  }
  return rows;
}

/** Tracked rounds per golfer across stored tournament records. */
export function roundsPlayed(records: Pick<TournamentResult, 'scores'>[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of records) for (const [id, rounds] of Object.entries(r.scores)) out[id] = (out[id] ?? 0) + rounds.length;
  return out;
}

/** What the celebration screen shows. */
export interface AlbatrossMoment {
  id: string;
  courseName: string;
  holeNumber: number;
  holeName: string;
  par: number;
  strokes: number;
  eventName: string;
  shot?: string;
  /** Ryan's career count including this one, when known. */
  careerCount?: number;
}

export function momentOf(r: AlbatrossRecord, careerCount?: number): AlbatrossMoment {
  return {
    id: r.id,
    courseName: r.courseName,
    holeNumber: r.holeNumber,
    holeName: r.holeName,
    par: r.par,
    strokes: r.strokes,
    eventName: r.tournamentName,
    ...(r.shot ? { shot: r.shot } : {}),
    ...(careerCount ? { careerCount } : {}),
  };
}

/** Career milestones for Ryan's collection. */
export const ALBATROSS_MILESTONES = [1, 2, 3, 5, 10];

export function milestoneLabel(n: number): string | null {
  if (n === 1) return 'First career albatross';
  if (ALBATROSS_MILESTONES.includes(n)) return `Career albatross #${n}`;
  return null;
}

/** A one-line description of how a hole was scored, e.g. "Par 5 in 2". */
export function scoreLine(r: Pick<AlbatrossRecord, 'par' | 'strokes'>): string {
  return `Par ${r.par} in ${r.strokes}`;
}
