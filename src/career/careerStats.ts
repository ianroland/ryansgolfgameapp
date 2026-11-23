/**
 * Career statistics, derived purely from stored tournament results (the
 * authoritative history), so they always agree with what actually happened.
 */
import type { TourId } from './config';
import { resultCourse, type TournamentResult } from './tournament';

export interface EventLine {
  tournamentId: string;
  name: string;
  tour: TourId;
  special: boolean;
  season: number;
  week: number;
  position: number;
  posLabel: string;
  madeCut: boolean;
  hadCut: boolean;
  rounds: number[];
  /** Ryan's hole-by-hole scores per round. */
  holes: number[][];
  pars: number[];
  toPar: number;
  prize: number;
  fieldSize: number;
  /** Course name. */
  course: string;
  courseId: string;
  playoff: boolean;
}

export interface HoleMix {
  eagles: number; // eagle or better, for the chart (aces and albatrosses included)
  /** Exactly three under: counted on their own, never as eagles in the table. */
  albatrosses: number;
  birdies: number;
  pars: number;
  bogeys: number;
  doubles: number; // double bogey or worse
  aces: number;
  holes: number;
}

export interface SeasonLine {
  season: number;
  tours: TourId[];
  events: number;
  wins: number;
  top10s: number;
  cutsMade: number;
  cutsPlayed: number;
  earnings: number;
  bestFinish: number | null;
  rounds: number;
  /** Average strokes relative to par per round. */
  avgToPar: number | null;
}

export interface CourseLine {
  courseId: string;
  name: string;
  events: number;
  wins: number;
  rounds: number;
  avgToPar: number | null;
  lowRound: number | null;
}

export interface CareerStats {
  events: number;
  wins: number;
  top10s: number;
  cutsMade: number;
  cutsPlayed: number;
  majors: number;
  playoffWins: number;
  earnings: number;
  bestFinish: number | null;
  rounds: number;
  /** Average strokes per (9-hole) round. */
  scoringAvg: number | null;
  avgToPar: number | null;
  lowRound: { strokes: number; toPar: number; event: string; season: number } | null;
  subParRounds: number;
  parAverages: Record<3 | 4 | 5, number | null>;
  mix: HoleMix;
  bySeason: SeasonLine[];
  history: EventLine[];
  /** Per course, most-played first. */
  byCourse: CourseLine[];
  rival: { events: number; ryanAhead: number; rivalAhead: number; rivalWins: number } | null;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const avg = (xs: number[]) => (xs.length ? sum(xs) / xs.length : null);

export function careerStats(results: TournamentResult[], playerId: string, rivalId?: string): CareerStats {
  const history: EventLine[] = [];
  const mix: HoleMix = { eagles: 0, birdies: 0, pars: 0, bogeys: 0, doubles: 0, aces: 0, albatrosses: 0, holes: 0 };
  const byPar: Record<3 | 4 | 5, number[]> = { 3: [], 4: [], 5: [] };
  const roundToPar: number[] = [];
  const roundStrokes: number[] = [];
  let lowRound: CareerStats['lowRound'] = null;
  let rival: CareerStats['rival'] = rivalId ? { events: 0, ryanAhead: 0, rivalAhead: 0, rivalWins: 0 } : null;

  for (const r of [...results].sort((a, b) => a.def.season - b.def.season || a.def.week - b.def.week || a.tournamentId.localeCompare(b.tournamentId))) {
    const me = r.standings.find((s) => s.id === playerId);
    if (!me) continue;
    const holes = r.scores[playerId] ?? [];
    const parSum = sum(r.pars);
    for (const round of holes) {
      const strokes = sum(round);
      roundStrokes.push(strokes);
      roundToPar.push(strokes - parSum);
      if (!lowRound || strokes < lowRound.strokes) lowRound = { strokes, toPar: strokes - parSum, event: r.def.name, season: r.def.season };
      round.forEach((s, i) => {
        const par = r.pars[i] as 3 | 4 | 5;
        byPar[par]?.push(s);
        const d = s - par;
        mix.holes++;
        if (s === 1) mix.aces++;
        if (d === -3) mix.albatrosses++;
        if (d <= -2) mix.eagles++;
        else if (d === -1) mix.birdies++;
        else if (d === 0) mix.pars++;
        else if (d === 1) mix.bogeys++;
        else mix.doubles++;
      });
    }
    history.push({
      tournamentId: r.tournamentId,
      name: r.def.name,
      tour: r.def.tour,
      special: r.def.special,
      season: r.def.season,
      week: r.def.week,
      position: me.position,
      posLabel: me.posLabel,
      madeCut: me.madeCut,
      hadCut: !!r.def.cut,
      rounds: me.rounds,
      holes,
      pars: r.pars,
      toPar: me.toPar,
      prize: me.prize,
      fieldSize: r.standings.length,
      course: resultCourse(r).name,
      courseId: resultCourse(r).id,
      playoff: !!me.playoff,
    });
    const rv = rivalId ? r.standings.find((s) => s.id === rivalId) : undefined;
    if (rival && rv) {
      rival.events++;
      // Made cut beats missed cut; otherwise the better finishing position.
      const meScore = (me.madeCut ? 0 : 10_000) + me.position;
      const rvScore = (rv.madeCut ? 0 : 10_000) + rv.position;
      if (meScore < rvScore) rival.ryanAhead++;
      else if (rvScore < meScore) rival.rivalAhead++;
      if (rv.madeCut && rv.position === 1) rival.rivalWins++;
    }
  }

  const isWin = (e: EventLine) => e.madeCut && e.position === 1;
  const seasons = [...new Set(history.map((e) => e.season))].sort((a, b) => a - b);
  const bySeason: SeasonLine[] = seasons.map((season) => {
    const ev = history.filter((e) => e.season === season);
    const rounds = ev.flatMap((e) => e.holes.map((h) => sum(h) - sum(e.pars)));
    const finishes = ev.filter((e) => e.madeCut).map((e) => e.position);
    return {
      season,
      tours: [...new Set(ev.map((e) => e.tour))],
      events: ev.length,
      wins: ev.filter(isWin).length,
      top10s: ev.filter((e) => e.madeCut && e.position <= 10).length,
      cutsMade: ev.filter((e) => e.hadCut && e.madeCut).length,
      cutsPlayed: ev.filter((e) => e.hadCut).length,
      earnings: sum(ev.map((e) => e.prize)),
      bestFinish: finishes.length ? Math.min(...finishes) : null,
      rounds: rounds.length,
      avgToPar: avg(rounds),
    };
  });

  const courseIds = [...new Set(history.map((e) => e.courseId))];
  const byCourse: CourseLine[] = courseIds
    .map((courseId) => {
      const ev = history.filter((e) => e.courseId === courseId);
      const rounds = ev.flatMap((e) => e.holes.map((h) => sum(h) - sum(e.pars)));
      return {
        courseId,
        name: ev[0].course,
        events: ev.length,
        wins: ev.filter(isWin).length,
        rounds: rounds.length,
        avgToPar: avg(rounds),
        lowRound: rounds.length ? Math.min(...rounds) : null,
      };
    })
    .sort((a, b) => b.events - a.events || a.name.localeCompare(b.name));

  const finishes = history.filter((e) => e.madeCut).map((e) => e.position);
  return {
    byCourse,
    events: history.length,
    wins: history.filter(isWin).length,
    top10s: history.filter((e) => e.madeCut && e.position <= 10).length,
    cutsMade: history.filter((e) => e.hadCut && e.madeCut).length,
    cutsPlayed: history.filter((e) => e.hadCut).length,
    majors: history.filter((e) => isWin(e) && e.tour === 'lpga' && e.special).length,
    playoffWins: history.filter((e) => isWin(e) && e.playoff).length,
    earnings: sum(history.map((e) => e.prize)),
    bestFinish: finishes.length ? Math.min(...finishes) : null,
    rounds: roundStrokes.length,
    scoringAvg: avg(roundStrokes),
    avgToPar: avg(roundToPar),
    lowRound,
    subParRounds: roundToPar.filter((x) => x < 0).length,
    parAverages: { 3: avg(byPar[3]), 4: avg(byPar[4]), 5: avg(byPar[5]) },
    mix,
    bySeason,
    history: history.reverse(),
    rival: rival && rival.events > 0 ? rival : null,
  };
}
