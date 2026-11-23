/**
 * CI-2 · Competitor broadcast cut-ins: the build gate.
 *
 * The only module the game imports statically. It holds no CI-1 code, no
 * cut-in strings and no device keys: everything else lives in
 * `CutInCard.tsx`, loaded through the single dynamic import below, which
 * exists only when the review build sets VITE_CUTINS=1. In the default
 * release build CUTINS_ENABLED is the constant `false`, the import is dead
 * code, and the bundle stays CI-1-free (A26, as adjusted for CI-2).
 */
import { useCallback, useEffect, useState } from 'react';
import type { TournamentDef } from '../../career/tournament';
import type { ActiveTournament, CareerState } from '../../career/types';
import type { CutInView } from './CutInCard';

export const CUTINS_ENABLED = import.meta.env.VITE_CUTINS === '1';

type Runtime = typeof import('./CutInCard');
let runtime: Promise<Runtime> | null = null;

/** The cut-in runtime, or null when the feature is off. */
export function loadCutInRuntime(): Promise<Runtime> | null {
  return CUTINS_ENABLED ? (runtime ??= import('./CutInCard')) : null;
}

export interface CutInState {
  view: CutInView;
  Card: Runtime['CutInCard'];
}

/**
 * `offer(before, after, …)` is called once, after `recordHole` has saved a
 * hole Ryan played. It never runs during a hole: the only input is a
 * completed, saved transition.
 */
export function useCutIn() {
  const [shown, setShown] = useState<CutInState | null>(null);
  useEffect(() => {
    void loadCutInRuntime();
  }, []);
  const offer = useCallback(async (before: ActiveTournament | null, after: ActiveTournament | null | undefined, def: TournamentDef, career: CareerState) => {
    const rt = loadCutInRuntime();
    if (!rt || !before || !after) return;
    try {
      const { prepareCutIn, CutInCard } = await rt;
      const view = prepareCutIn(before, after, def, career);
      if (view) setShown({ view, Card: CutInCard });
    } catch (e) {
      // A cut-in is never allowed to block the round: the hole card shows as normal.
      console.warn('cut-in skipped', e);
    }
  }, []);
  const closed = useCallback(() => setShown(null), []);
  return { shown, offer, closed };
}
