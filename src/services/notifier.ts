import type { AlbatrossMoment } from '../records/albatross';

export type NotificationKind = 'trophy' | 'payout' | 'purchase' | 'info' | 'error' | 'albatross' | 'legacy';

/** Career Legacy: what a milestone celebration or the Pink Jacket ceremony shows (verified data only). */
export interface LegacyMoment {
  kind: 'milestone' | 'jacket';
  /** Milestone id (`legacy_*`), or the jacket's trophy instance id. */
  id: string;
  title: string;
  /** Full-screen presentation (major milestones and every Pink Jacket); otherwise a toast. */
  full: boolean;
  season: number;
  eventName?: string;
  venue?: string;
  /** Jackets: which jacket this is (1st, 2nd, …) and Ryan's verified finish. */
  jacketNumber?: number;
  toPar?: number;
  rounds?: number[];
  runnerUp?: string | null;
}

export interface GameNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  /** e.g. trophy instance ID for "view" actions. */
  refId?: string;
  /** For `albatross`: what the celebration shows. */
  moment?: AlbatrossMoment;
  /** For `legacy`: the milestone or Pink Jacket presentation. */
  legacy?: LegacyMoment;
}

type Listener = (n: GameNotification) => void;

export class Notifier {
  private listeners = new Set<Listener>();
  private counter = 0;

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(n: Omit<GameNotification, 'id'>) {
    const full = { ...n, id: `note_${++this.counter}` };
    for (const l of this.listeners) l(full);
  }
}
