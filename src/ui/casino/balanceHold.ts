/**
 * Holds the bank figure on screen while a game is showing a result that has already been paid.
 *
 * Games such as Spin to Win, keno, video poker and craps decide and pay a round in one transaction
 * (so a reload can never lose or repeat it), and only then animate it. Without a hold, every
 * bank display would jump to the new balance before the wheel stops or the dice land, giving the
 * result away. A game freezes the shown balance at the after-bet amount when the round starts and
 * releases it when the result is revealed. Display only: the ledger is never touched.
 */
import { useSyncExternalStore } from 'react';

let frozen: number | null = null;
let token = 0;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

/** Freezes the shown balance; returns a release function (safe to call more than once). */
export function freezeBalance(shown: number): () => void {
  const mine = ++token;
  frozen = shown;
  emit();
  // Never stick: a hold releases itself after 15 s even if a game forgets.
  const t = setTimeout(() => release(), 15_000);
  function release() {
    clearTimeout(t);
    if (token === mine && frozen !== null) {
      frozen = null;
      emit();
    }
  }
  return release;
}

const subscribe = (f: () => void) => {
  subs.add(f);
  return () => subs.delete(f);
};

/** The balance to show: the real one, or the held one while a result is being revealed. */
export function useShownBalance(real: number): number {
  const held = useSyncExternalStore(subscribe, () => frozen, () => null);
  return held ?? real;
}
