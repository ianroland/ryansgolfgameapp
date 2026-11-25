import { activeCourse, findTournament, holesToPlay, parsOf } from '../src/career/tournament';
import type { CareerState, RoundMode } from '../src/career/types';
import type { GameServices } from '../src/services';
import { RYAN } from './helpers';

/** Test setup only: edits the stored career directly. */
export async function setCareer(s: GameServices, patch: (c: CareerState) => void) {
  const c = await s.career.getCareer();
  patch(c);
  await s.db.careers.put(c);
}

export async function topUp(s: GameServices, amount: number, key: string) {
  await s.economy.post({ ownerId: RYAN, amount, type: 'job_wage', sourceId: 'test', idempotencyKey: key });
}

/**
 * Plays a tournament through the real services. `score(par)` is what Ryan
 * makes on every hole he plays (default: eagle everything, a sure win).
 */
export async function playTournament(
  s: GameServices,
  tournamentId: string,
  opts: { score?: (par: number) => number; mode?: RoundMode; setup?: (c: CareerState) => void } = {},
) {
  const def = findTournament(tournamentId)!;
  await setCareer(s, (c) => {
    c.season = def.season;
    c.week = def.week;
    c.pendingStory = null;
    c.energy = 100;
    opts.setup?.(c);
  });
  const mode = opts.mode ?? 'full';
  const score = opts.score ?? ((par: number) => Math.max(1, par - 2));
  await s.career.enterTournament(tournamentId, mode);
  for (let guard = 0; guard < 10; guard++) {
    const c = await s.career.getCareer();
    if (!c.active) throw new Error('tournament vanished');
    const PARS = parsOf(activeCourse(c.active));
    for (const i of holesToPlay(mode, c.active.round, PARS)) await s.career.recordHole(i, score(PARS[i]));
    const out = await s.career.finishRound();
    if (out.result) return out;
  }
  throw new Error('tournament did not finish');
}
