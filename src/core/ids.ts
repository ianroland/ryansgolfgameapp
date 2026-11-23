export function newId(prefix: string): string {
  const uuid =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `${prefix}_${uuid}`;
}

export { PLAYER_ID, START_MONEY as STARTING_BALANCE } from '../career/config';

/** In-game date a new career begins on (career calendar, not wall clock). */
export const CAREER_START_GAME_TIME = '2027-02-01T18:00:00.000Z';
