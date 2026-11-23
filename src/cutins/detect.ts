/**
 * CI-1 detection: the moments revealed in span (p, q] of the current round.
 * One raw moment per tag; merging per golfer happens in plan.ts.
 *
 * Reads only the snapshot, cut back to q, so later holes are unreachable.
 */
import { EVIDENCE, HOT_RUN_LENGTH, RIVAL_WINDOW } from './constants';
import { truncateSnapshot } from './snapshot';
import type { Moment, MomentType, RevealSnapshot } from './types';

/** Total to par after k holes of this round, for every alive golfer. */
export function totalsAt(snap: RevealSnapshot, k: number): Map<string, number> {
  const out = new Map<string, number>();
  for (const id of snap.alive) {
    const h = snap.holes[id] ?? [];
    let t = snap.prior[id] ?? 0;
    for (let i = 0; i < k; i++) t += h[i] - snap.pars[i];
    out.set(id, t);
  }
  return out;
}

export function leadersAt(totals: Map<string, number>): Set<string> {
  let best = Infinity;
  for (const t of totals.values()) best = Math.min(best, t);
  return new Set([...totals].filter(([, t]) => t === best).map(([id]) => id));
}

/** Position with ties sharing the best place, as the live leaderboard shows it. */
export function positionOf(totals: Map<string, number>, id: string): { position: number; tied: boolean } {
  const t = totals.get(id)!;
  let lower = 0;
  let equal = 0;
  for (const v of totals.values()) {
    if (v < t) lower++;
    else if (v === t) equal++;
  }
  return { position: lower + 1, tied: equal > 1 };
}

export function momentIdOf(tournamentId: string, round1: number, type: MomentType, golferId: string, hole1: number): string {
  return `${tournamentId}:r${round1}:${type}:${golferId}:h${hole1}`;
}

/** The tournament's first boundary: everyone started level, so there was no prior leader. */
export function isFirstBoundary(snap: RevealSnapshot, p: number): boolean {
  return snap.round === 0 && p === 0;
}

export function detect(full: RevealSnapshot, p: number, q: number): Moment[] {
  if (!(Number.isInteger(p) && Number.isInteger(q) && 0 <= p && p < q && q <= full.q)) throw new Error(`detect: bad span (${p}, ${q}]`);
  const snap = truncateSnapshot(full, q);
  const { pars } = snap;
  const round1 = snap.round + 1;
  const atQ = totalsAt(snap, q);
  const atP = totalsAt(snap, p);
  const ryanAlive = snap.alive.includes(snap.ryanId);
  const out: Moment[] = [];

  const make = (type: MomentType, golferId: string, hole1: number, scoring: boolean): Moment => {
    const { position, tied } = positionOf(atQ, golferId);
    const m: Moment = {
      momentId: momentIdOf(snap.tournamentId, round1, type, golferId, hole1),
      type,
      evidence: [...EVIDENCE[type]],
      tour: snap.tour,
      tournamentId: snap.tournamentId,
      round: round1,
      hole: hole1,
      golferId,
      totalToPar: atQ.get(golferId)!,
      position,
      tied,
      alsoTags: [],
    };
    if (scoring) {
      m.strokes = snap.holes[golferId][hole1 - 1];
      m.par = pars[hole1 - 1];
    }
    return m;
  };

  for (const id of snap.alive) {
    if (id === snap.ryanId) continue;
    const h = snap.holes[id];
    let run = 0;
    for (let i = 0; i < q; i++) {
      run = h[i] <= pars[i] - 1 ? run + 1 : 0;
      if (i < p) continue;
      const s = h[i];
      const par = pars[i];
      if (s === 1) out.push(make('ACE', id, i + 1, true));
      else if (s === par - 3) out.push(make('ALBATROSS', id, i + 1, true));
      else if (s === par - 2) out.push(make('EAGLE', id, i + 1, true));
      if (run === HOT_RUN_LENGTH) out.push(make('HOT_RUN', id, i + 1, true));
    }
    if (id === snap.rivalId && ryanAlive && Math.abs(atQ.get(id)! - atQ.get(snap.ryanId)!) <= RIVAL_WINDOW) {
      let last = -1;
      for (let i = p; i < q; i++) if (h[i] !== pars[i]) last = i;
      if (last >= 0) out.push(make('RIVAL_SWING', id, last + 1, true));
    }
  }

  if (!isFirstBoundary(snap, p)) {
    const lq = leadersAt(atQ);
    const lp = leadersAt(atP);
    if (lq.size === 1) {
      const [g] = lq;
      const wasSole = lp.size === 1 && lp.has(g);
      if (g !== snap.ryanId && !wasSole) out.push(make('LEAD_CHANGE', g, q, false));
    }
    for (const g of lp) {
      if (g === snap.ryanId || lq.has(g)) continue;
      const h = snap.holes[g];
      let doubled = false;
      for (let i = p; i < q; i++) if (h[i] >= pars[i] + 2) doubled = true;
      if (doubled) out.push(make('LEADER_STUMBLE', g, q, false));
    }
  }
  return out;
}
