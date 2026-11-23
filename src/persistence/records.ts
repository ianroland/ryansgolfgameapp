import type { TournamentResult } from '../career/tournament';

/** A stored, validated tournament result (the authoritative history). */
export interface TournamentRecord extends TournamentResult {
  id: string; // === tournamentId
  recordedFromCareerEventId: string;
}
