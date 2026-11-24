/**
 * Craps table life: the rotating shooter and the table's mood (hot, on fire, cold), read from what
 * the dice actually did. Presentation only: it never changes a roll or a payout. The regulars who
 * sit at the rail live with the screen code (src/ui/casino/crapsRegulars.ts).
 */

// ───────────── The shooter and the table's mood ─────────────

/** Seats in shooting order: three regulars and Ryan (third). */
export const SEATS = 4;
export const RYAN_SEAT = 2;

export interface ShooterHand { seat: number; rolls: number; points: number }
export interface ShooterState { v: 1; seat: number; rolls: number; points: number; history: ShooterHand[] }
export const newShooter = (): ShooterState => ({ v: 1, seat: 0, rolls: 0, points: 0, history: [] });
export const HISTORY = 10;

/** After a roll: counts it, a point made, and passes the dice on a seven-out. */
export function advanceShooter(s: ShooterState, pointBefore: number | null, dice: [number, number]): ShooterState {
  const sum = dice[0] + dice[1];
  const rolls = s.rolls + 1;
  const points = s.points + (pointBefore !== null && sum === pointBefore ? 1 : 0);
  if (pointBefore !== null && sum === 7) {
    return { v: 1, seat: (s.seat + 1) % SEATS, rolls: 0, points: 0, history: [{ seat: s.seat, rolls, points }, ...s.history].slice(0, HISTORY) };
  }
  return { ...s, rolls, points };
}

export type Mood = 'cold' | 'steady' | 'hot' | 'fire';
export const MOOD_LABEL: Record<Mood, string> = { cold: 'Cold table', steady: 'Steady', hot: 'Hot shooter', fire: 'On fire' };

/**
 * Hot: this shooter has rolled 10+ times or made 2+ points. On fire: 20+ rolls or 3+ points.
 * Cold: the last three shooters each sevened out within 5 rolls without a point, and this one is new.
 */
export function tableMood(s: ShooterState): Mood {
  if (s.rolls >= 20 || s.points >= 3) return 'fire';
  if (s.rolls >= 10 || s.points >= 2) return 'hot';
  const last = s.history.slice(0, 3);
  if (last.length === 3 && last.every((h) => h.rolls <= 5 && h.points === 0) && s.rolls < 5) return 'cold';
  return 'steady';
}

export function readShooter(raw: unknown): ShooterState {
  if (typeof raw !== 'string' || !raw) return newShooter();
  try {
    const s = JSON.parse(raw) as ShooterState;
    return s && s.v === 1 && Number.isInteger(s.seat) ? { ...newShooter(), ...s, seat: ((s.seat % SEATS) + SEATS) % SEATS } : newShooter();
  } catch {
    return newShooter();
  }
}

