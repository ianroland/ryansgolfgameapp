/** The bag. Carry is full-power, no-wind, from a clean lie, for a stat-neutral golfer. */
export type ClubId = 'DR' | '3W' | '3I' | '5I' | '7I' | '9I' | 'PW' | 'SW' | 'PT';

export interface Club {
  id: ClubId;
  name: string;
  carry: number; // yards
  launchDeg: number;
  /** Fraction of carry that typically rolls out on fairway. */
  rollFactor: number;
  teeOnly?: boolean;
}

export const CLUBS: Club[] = [
  { id: 'DR', name: 'Driver', carry: 245, launchDeg: 12, rollFactor: 0.12, teeOnly: true },
  { id: '3W', name: '3 Wood', carry: 222, launchDeg: 14, rollFactor: 0.1 },
  { id: '3I', name: '3 Iron', carry: 196, launchDeg: 18, rollFactor: 0.08 },
  { id: '5I', name: '5 Iron', carry: 176, launchDeg: 22, rollFactor: 0.07 },
  { id: '7I', name: '7 Iron', carry: 154, launchDeg: 28, rollFactor: 0.05 },
  { id: '9I', name: '9 Iron', carry: 132, launchDeg: 35, rollFactor: 0.04 },
  { id: 'PW', name: 'Pitching Wedge', carry: 110, launchDeg: 41, rollFactor: 0.03 },
  { id: 'SW', name: 'Sand Wedge', carry: 78, launchDeg: 50, rollFactor: 0.02 },
  { id: 'PT', name: 'Putter', carry: 0, launchDeg: 0, rollFactor: 0 },
];

export const CLUB_BY_ID = Object.fromEntries(CLUBS.map((c) => [c.id, c])) as Record<ClubId, Club>;

/** Putting scales (max putt length on a flat green) like an arcade putting meter. */
export const PUTT_SCALES = [8, 16, 32] as const;
export function puttScaleFor(distanceYds: number): number {
  return PUTT_SCALES.find((s) => s >= distanceYds * 1.25) ?? PUTT_SCALES[PUTT_SCALES.length - 1];
}
