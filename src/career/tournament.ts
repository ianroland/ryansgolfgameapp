/**
 * Stroke-play tournaments: schedule, eligibility, fields, rounds (simulated
 * or played), cuts, standings with ties, payouts and ranking points.
 *
 * Results are sealed with a checksum and re-derived on validation: standings,
 * prizes and points must follow from the raw hole-by-hole scores and the
 * official schedule, or the career won't accept them.
 */
import { checksum } from '../core/checksum';
import { DRY_CREEK_MUNI, getCourse } from '../golf/courses';
import { coursePar, type CourseDef, type HoleDef } from '../golf/course';
import { hashString, inEllipse, rng } from '../golf/math';
import type { GameTime } from '../core/types';
import { gameDate, PLAYER_ID, PLAYER_NAME, QSCHOOL, SCHEDULES, TOURS, type QStage, type TourId } from './config';
import { isMensTour, pickField, RIVAL, simRound, type FieldModel } from './field';
import { playerRating } from './stats';
import type { ActiveTournament, CareerState, RoundMode } from './types';
import { courseIdForEvent } from './venues';

/** Sealed on results from tournaments on competitor model 2 (explicit par-3 ace chance). */
export const ENGINE_VERSION = 'stroke-1.3';
/** Sealed on results from tournaments begun before model 2 (no `fieldModel`). */
export const LEGACY_ENGINE_VERSION = 'stroke-1.2';

/** The competitor model a tournament plays on: the one it started with. */
export function fieldModelOf(active: Pick<ActiveTournament, 'fieldModel'>): FieldModel {
  return active.fieldModel === 2 ? 2 : 1;
}

/** The course an event is played on. */
export function courseOf(def: Pick<TournamentDef, 'courseId'>): CourseDef {
  return getCourse(def.courseId);
}

/**
 * The course an in-progress tournament is being played on. Saves from before
 * courses varied have no courseId: those events started at Dry Creek.
 */
export function activeCourse(active: Pick<ActiveTournament, 'courseId'>): CourseDef {
  return getCourse(active.courseId ?? DRY_CREEK_MUNI.id);
}

/** The course a finished result was played on (older results: Dry Creek). */
export function resultCourse(r: Pick<TournamentResult, 'courseId'>): CourseDef {
  return getCourse(r.courseId ?? DRY_CREEK_MUNI.id);
}

export const parsOf = (course: CourseDef) => course.holes.map((h) => h.par);

export interface TournamentDef {
  id: string;
  tour: TourId;
  name: string;
  season: number;
  week: number;
  rounds: number;
  fieldSize: number;
  ratingShift: number;
  purse: number;
  entryFee: number;
  travelCost: number;
  cut: { afterRound: number; top: number } | null;
  paidPlaces: number;
  prizeMoney: boolean;
  special: boolean;
  qStage: QStage | null;
  courseId: string;
}

export interface Standing {
  id: string;
  name: string;
  rounds: number[];
  total: number;
  toPar: number;
  position: number;
  posLabel: string;
  madeCut: boolean;
  prize: number;
  points: number;
  /** Won a playoff for the title. */
  playoff?: boolean;
}

export interface TournamentResult {
  tournamentId: string;
  /** The course played (missing on results from before courses varied: Dry Creek). */
  courseId?: string;
  status: 'completed';
  def: TournamentDef;
  playerId: string;
  entrants: { id: string; name: string; rating: number }[];
  /** Per golfer, per round, per hole strokes. Missed-cut golfers stop at the cut. */
  scores: Record<string, number[][]>;
  pars: number[];
  standings: Standing[];
  finalizedAt: GameTime;
  authority: { source: 'tournament_engine'; engineVersion: string; checksum: string };
}

// ───────────────────────── Schedule ─────────────────────────

export function seasonSchedule(season: number): TournamentDef[] {
  const out: TournamentDef[] = [];
  for (const tour of ['amateur', 'mini', 'epson', 'lpga'] as const) {
    const cfg = TOURS[tour];
    for (const e of SCHEDULES[tour]) {
      const major = tour === 'lpga' && !!e.special;
      out.push({
        id: `${tour}-${season}-w${e.week}`,
        tour,
        name: e.name,
        season,
        week: e.week,
        rounds: cfg.rounds,
        fieldSize: cfg.fieldSize,
        ratingShift: e.special ? 4 : 0,
        purse: major ? cfg.purse * 2.5 : e.special ? Math.round(cfg.purse * 1.5) : cfg.purse,
        entryFee: cfg.entryFee,
        travelCost: cfg.travelCost,
        cut: cfg.cut ?? null,
        paidPlaces: cfg.paidPlaces,
        prizeMoney: cfg.prizeMoney,
        special: !!e.special,
        qStage: null,
        courseId: courseIdForEvent(tour, e.week),
      });
    }
  }
  for (const stage of [1, 2, 3] as QStage[]) {
    const q = QSCHOOL[stage];
    const cfg = TOURS.qschool;
    out.push({
      id: `qschool-${season}-s${stage}`,
      tour: 'qschool',
      name: q.name,
      season,
      week: q.week,
      rounds: cfg.rounds,
      fieldSize: stage === 3 ? 60 : cfg.fieldSize,
      ratingShift: q.ratingShift,
      purse: 0,
      entryFee: q.entryFee,
      travelCost: cfg.travelCost,
      cut: null,
      paidPlaces: 0,
      prizeMoney: false,
      special: stage === 3,
      qStage: stage,
      courseId: courseIdForEvent('qschool', q.week, stage),
    });
  }
  return out.sort((a, b) => a.week - b.week || a.tour.localeCompare(b.tour));
}

export function findTournament(id: string): TournamentDef | undefined {
  const season = Number(id.split('-')[1]);
  return Number.isFinite(season) ? seasonSchedule(season).find((t) => t.id === id) : undefined;
}

export function eligibility(def: TournamentDef, c: CareerState): { ok: boolean; reason?: string } {
  if (def.season !== c.season) return { ok: false, reason: 'Different season' };
  switch (def.tour) {
    case 'amateur':
      return c.status === 'amateur' ? { ok: true } : { ok: false, reason: 'Amateurs only' };
    case 'mini':
      if (c.status !== 'pro') return { ok: false, reason: 'Professionals only. Turn pro first.' };
      return c.tourCard === 'lpga' ? { ok: false, reason: 'PGA Tour members play the big tour' } : { ok: true };
    case 'qschool':
      if (c.status !== 'pro') return { ok: false, reason: 'Turn pro to enter Q-School' };
      if (c.tourCard === 'lpga') return { ok: false, reason: 'You already have a PGA Tour card' };
      if (c.qschool.season !== c.season || c.qschool.nextStage !== def.qStage) {
        return { ok: false, reason: def.qStage === 1 ? 'First Stage is open to all pros' : `Advance from the ${def.qStage === 2 ? 'First' : 'Second'} Stage first` };
      }
      return { ok: true };
    case 'epson':
      return c.tourCard === 'epson' ? { ok: true } : { ok: false, reason: 'Needs Korn Ferry Tour status' };
    case 'lpga':
      return c.tourCard === 'lpga' ? { ok: true } : { ok: false, reason: 'Needs a PGA Tour card' };
  }
}

// ───────────────────────── Rounds ─────────────────────────

/** Hole layout for a round: same course, pins moved within each green. */
export function holeForRound(hole: HoleDef, seed: number, round: number): HoleDef {
  const r = rng(seed ^ hashString(`pin-${hole.number}-${round}`));
  for (let i = 0; i < 20; i++) {
    const p = { x: hole.green.x + r.range(-0.55, 0.55) * hole.green.rx, y: hole.green.y + r.range(-0.55, 0.55) * hole.green.ry };
    if (inEllipse(p, hole.green, -2)) return { ...hole, pin: p };
  }
  return hole;
}

export function windsForRound(seed: number, round: number, course: CourseDef) {
  const r = rng(seed ^ hashString(`wind-${round}`));
  const k = course.windiness ?? 1;
  return course.holes.map(() => ({ heading: r.range(0, Math.PI * 2), mph: Math.round(r.range(0, 13) * k) }));
}

/** Which holes Ryan plays herself this round. */
export function holesToPlay(mode: RoundMode, round: number, PARS: number[]): number[] {
  if (mode === 'sim') return [];
  if (mode === 'full') return PARS.map((_, i) => i);
  const rot = (arr: number[]) => arr[round % arr.length];
  const par3 = rot(PARS.flatMap((p, i) => (p === 3 ? [i] : [])));
  const par5 = rot(PARS.flatMap((p, i) => (p === 5 && i !== PARS.length - 1 ? [i] : [])));
  const par4 = rot(PARS.flatMap((p, i) => (p === 4 ? [i] : [])));
  return [...new Set([par3, par5, par4, PARS.length - 1])].filter((i) => i !== undefined).sort((a, b) => a - b);
}

/**
 * Field rules: 'current' (men's fields for the Amateur Circuit and SoCal Pro Series; Kayla and
 * the Q-School hopefuls on the women's side) or 'reference-v1', the rules the frozen cut-in
 * reference dataset (tools/cutins-lab, test T7) was recorded with. The game always uses 'current'.
 */
export type FieldRules = 'current' | 'reference-v1';

export function startTournament(def: TournamentDef, c: CareerState, mode: RoundMode, rules: FieldRules = 'current'): ActiveTournament {
  const legacy = rules === 'reference-v1';
  const seed = hashString(`${def.id}:${c.playerId}`);
  const extras = [{ id: c.playerId, name: PLAYER_NAME, rating: 0 }];
  const rival = Object.values(c.pools).flat().find((g) => g.id === c.rivalId);
  const poolTour: TourId = legacy && def.tour === 'qschool' ? 'mini' : def.tour;
  // Kayla only plays the women's tours; Ryan's fields are men's until phase 3, so she isn't in them.
  if (rival && (legacy || !isMensTour(def.tour)) && (rival.tour === poolTour || def.tour === 'qschool' || def.special)) extras.push({ id: rival.id, name: rival.name, rating: rival.rating + def.ratingShift });
  let pool = c.pools[poolTour];
  // Q-School: early stages draw from the mini tours and the Epson Tour's
  // strugglers; Final Stage is Korn Ferry regulars fighting for PGA Tour cards.
  // (Current rules: the Q-School hopefuls pool rather than the mini tour.)
  if (def.tour === 'qschool') pool = def.qStage === 3 ? c.pools.epson : [...(legacy ? c.pools.mini : c.pools.qschool ?? []), ...c.pools.epson.filter((g) => g.rating < 66)];
  const entrants = pickField(pool, def.fieldSize, seed, def.ratingShift, extras);
  const course = courseOf(def);
  return {
    tournamentId: def.id,
    courseId: course.id,
    mode,
    round: 0,
    playerHoles: course.holes.map(() => null),
    scores: Object.fromEntries(entrants.map((e) => [e.id, []])),
    entrants,
    seed,
    alive: entrants.map((e) => e.id),
    fieldModel: 2,
  };
}

/** Pressure (0..1) for Ryan this round: contending late raises it. */
export function pressureFor(active: ActiveTournament, def: TournamentDef): number {
  if (active.round === 0) return def.special ? 0.3 : 0.1;
  const totals = active.alive.map((id) => sumRounds(active.scores[id]));
  const lead = Math.min(...totals);
  const mine = sumRounds(active.scores[PLAYER_ID] ?? active.scores[active.entrants[0].id]);
  const behind = mine - lead;
  const late = active.round >= def.rounds - 1 ? 1 : 0.6;
  return Math.max(0, Math.min(1, (1 - behind / 5) * late + (def.special ? 0.15 : 0)));
}

const sumRounds = (rounds: number[][]) => rounds.reduce((s, r) => s + r.reduce((a, b) => a + b, 0), 0);

/**
 * The current round's hole scores for everyone still in the field, as they
 * will be recorded: simulated for the field, and for Ryan her played holes
 * with any others simulated from her rating. Deterministic, so the UI can
 * reveal it hole by hole and `completeRound` records exactly the same.
 */
export function previewRound(active: ActiveTournament, def: TournamentDef, c: CareerState): Record<string, number[]> {
  const round = active.round;
  const course = activeCourse(active);
  const PARS = parsOf(course);
  const winds = windsForRound(active.seed, round, course).map((w) => w.mph);
  // Harder courses cost everyone strokes (difficulty is per 9 holes).
  const extra = (course.difficulty ?? 0) / PARS.length;
  const pressure = pressureFor(active, def);
  const model = fieldModelOf(active);
  const out: Record<string, number[]> = {};
  for (const id of active.alive) {
    const r = rng(active.seed ^ hashString(`${id}-r${round}`));
    if (id === c.playerId) {
      const sim = simRound(PARS, playerRating(c, { round, pressure }), r, winds, extra, model);
      out[id] = PARS.map((_, i) => active.playerHoles[i] ?? sim[i]);
    } else {
      out[id] = simRound(PARS, active.entrants.find((x) => x.id === id)!.rating, r, winds, extra, model);
    }
  }
  return out;
}

/**
 * Completes the current round: simulates every other golfer and any holes
 * Ryan didn't play, records the round, then applies the cut if due.
 */
export function completeRound(active: ActiveTournament, def: TournamentDef, c: CareerState): ActiveTournament {
  const round = active.round;
  const preview = previewRound(active, def, c);
  const scores = { ...active.scores };
  for (const id of active.alive) scores[id] = [...scores[id], preview[id]];
  let alive = active.alive;
  if (def.cut && def.cut.afterRound === round + 1) alive = cutSurvivors(scores, alive, def.cut.top);
  return { ...active, scores, alive, round: round + 1, playerHoles: activeCourse(active).holes.map(() => null) };
}

function cutSurvivors(scores: Record<string, number[][]>, ids: string[], top: number): string[] {
  const totals = ids.map((id) => ({ id, t: sumRounds(scores[id]) })).sort((a, b) => a.t - b.t);
  if (totals.length <= top) return ids;
  const line = totals[top - 1].t;
  return totals.filter((x) => x.t <= line).map((x) => x.id);
}

export function cutLine(active: ActiveTournament, def: TournamentDef): number | null {
  if (!def.cut || active.round < def.cut.afterRound) return null;
  const totals = active.alive.map((id) => sumRounds(active.scores[id].slice(0, def.cut!.afterRound)));
  return Math.max(...totals) - coursePar(activeCourse(active)) * def.cut.afterRound;
}

// ───────────────────────── Standings & payouts ─────────────────────────

/** Share of the purse for each paid place (1-based), summing to 1. */
export function payoutShares(paidPlaces: number): number[] {
  const w = Array.from({ length: paidPlaces }, (_, i) => 1 / Math.pow(i + 1.35, 1.25));
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map((x) => x / sum);
}

export function computeStandings(def: TournamentDef, entrants: { id: string; name: string }[], scores: Record<string, number[][]>, pars: number[]): Standing[] {
  const COURSE_PAR = pars.reduce((a, b) => a + b, 0);
  const rows = entrants.map((e) => {
    const rounds = (scores[e.id] ?? []).map((r) => r.reduce((a, b) => a + b, 0));
    const total = rounds.reduce((a, b) => a + b, 0);
    return { id: e.id, name: e.name, rounds, total, toPar: total - COURSE_PAR * rounds.length, madeCut: rounds.length === def.rounds };
  });
  // Made-cut first (by total), then missed cut (by total through the cut).
  rows.sort((a, b) => Number(b.madeCut) - Number(a.madeCut) || a.total - b.total || a.name.localeCompare(b.name));
  // A tie for the lead goes to a playoff, decided by countback (final round,
  // then its back holes) and, if still level, a seeded coin flip.
  const leaders = rows.filter((r) => r.madeCut && r.total === rows[0].total);
  let playoffWinner: string | null = null;
  if (rows[0]?.madeCut && leaders.length > 1) {
    const back = (id: string, n: number) => {
      const last = scores[id][scores[id].length - 1];
      return last.slice(last.length - n).reduce((a, b) => a + b, 0);
    };
    const key = (id: string) => [back(id, pars.length), back(id, 6), back(id, 3), back(id, 1), hashString(`${def.id}:playoff:${id}`)];
    playoffWinner = [...leaders].sort((a, b) => {
      const ka = key(a.id);
      const kb = key(b.id);
      for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
      return 0;
    })[0].id;
    const w = rows.findIndex((r) => r.id === playoffWinner);
    rows.unshift(...rows.splice(w, 1));
  }
  const out: Standing[] = [];
  const shares = def.prizeMoney ? payoutShares(def.paidPlaces) : [];
  const purse = def.prizeMoney ? def.purse : 0;
  let i = 0;
  while (i < rows.length) {
    let j = i;
    const alone = i === 0 && playoffWinner !== null;
    while (!alone && j + 1 < rows.length && rows[j + 1].total === rows[i].total && rows[j + 1].madeCut === rows[i].madeCut) j++;
    const tied = j - i + 1;
    const pos = i + 1;
    let prize = 0;
    if (rows[i].madeCut) {
      for (let k = i; k <= j; k++) prize += (shares[k] ?? 0) * purse;
      prize = Math.round(prize / tied);
    }
    for (let k = i; k <= j; k++) {
      out.push({
        ...rows[k],
        position: pos,
        posLabel: rows[k].madeCut ? `${tied > 1 ? 'T' : ''}${pos}` : 'MC',
        prize,
        points: rankingPoints(def, pos, rows.length, rows[k].madeCut),
        ...(alone ? { playoff: true } : {}),
      });
    }
    i = j + 1;
  }
  return out;
}

export function rankingPoints(def: TournamentDef, pos: number, field: number, madeCut: boolean): number {
  if (def.tour !== 'amateur' || !madeCut) return 0;
  return Math.round(100 * Math.max(0, 1 - (pos - 1) / (field * 0.6)) * (def.special ? 1.5 : 1));
}

// ───────────────────────── Seal & validate ─────────────────────────

export function finalizeTournament(active: ActiveTournament, def: TournamentDef, playerId: string): TournamentResult {
  if (active.round < def.rounds) throw new Error('Tournament not finished');
  const course = activeCourse(active);
  const pars = parsOf(course);
  const standings = computeStandings(def, active.entrants, active.scores, pars);
  const unsealed = {
    tournamentId: def.id,
    // Left off for tournaments begun on an older save (played at Dry Creek).
    courseId: active.courseId,
    status: 'completed' as const,
    def,
    playerId,
    entrants: active.entrants,
    scores: active.scores,
    pars,
    standings,
    finalizedAt: gameDate(def.season, def.week),
  };
  const engineVersion = fieldModelOf(active) === 2 ? ENGINE_VERSION : LEGACY_ENGINE_VERSION;
  return { ...unsealed, authority: { source: 'tournament_engine', engineVersion, checksum: checksum(unsealed) } };
}

export type ResultValidation = { ok: true } | { ok: false; reason: string };

export function validateResult(r: TournamentResult): ResultValidation {
  const { authority, ...content } = r;
  if (authority?.source !== 'tournament_engine') return { ok: false, reason: 'Not produced by the tournament engine' };
  if (authority.checksum !== checksum(content)) return { ok: false, reason: 'Result is not sealed (checksum mismatch)' };
  const official = findTournament(r.tournamentId);
  if (!official || checksum(official) !== checksum(r.def)) return { ok: false, reason: 'Tournament does not match the official schedule' };
  // Older results carry no courseId: those were all played at Dry Creek.
  if (r.courseId !== undefined && r.courseId !== r.def.courseId) return { ok: false, reason: 'Course does not match the schedule' };
  const PARS = parsOf(resultCourse(r));
  if (checksum(r.pars) !== checksum(PARS)) return { ok: false, reason: 'Course pars do not match' };
  if (!r.entrants.some((e) => e.id === r.playerId)) return { ok: false, reason: 'Player was not in the field' };
  if (new Set(r.entrants.map((e) => e.id)).size !== r.entrants.length) return { ok: false, reason: 'Duplicate entrants' };
  for (const e of r.entrants) {
    const rounds = r.scores[e.id];
    if (!rounds) return { ok: false, reason: `Missing scores for ${e.name}` };
    if (rounds.length !== r.def.rounds && !(r.def.cut && rounds.length === r.def.cut.afterRound)) return { ok: false, reason: `Incomplete scores for ${e.name}` };
    for (const holes of rounds) {
      if (holes.length !== PARS.length || holes.some((s) => !Number.isInteger(s) || s < 1 || s > 15)) return { ok: false, reason: `Invalid hole scores for ${e.name}` };
    }
  }
  // The cut must follow from the scores.
  if (r.def.cut) {
    const ids = r.entrants.map((e) => e.id);
    const through = Object.fromEntries(ids.map((id) => [id, r.scores[id].slice(0, r.def.cut!.afterRound)]));
    const survivors = new Set(cutSurvivors(through, ids, r.def.cut.top));
    for (const id of ids) {
      const made = r.scores[id].length === r.def.rounds;
      if (made !== survivors.has(id)) return { ok: false, reason: 'Cut does not follow from the scores' };
    }
  } else if (r.entrants.some((e) => r.scores[e.id].length !== r.def.rounds)) {
    return { ok: false, reason: 'Incomplete scores' };
  }
  if (checksum(computeStandings(r.def, r.entrants, r.scores, r.pars)) !== checksum(r.standings)) return { ok: false, reason: 'Standings do not follow from the scores' };
  return { ok: true };
}

export function playerStanding(r: TournamentResult): Standing {
  return r.standings.find((s) => s.id === r.playerId)!;
}

export function formatToPar(n: number) {
  return n === 0 ? 'E' : n > 0 ? `+${n}` : `${n}`;
}

export { RIVAL };
