/**
 * Sports engine settings. Every number is PROPOSED and tunable here; the season format
 * (games per team, meetings per opponent) is the approved one in demo.ts SEASON_FORMAT.
 */
import type { Sport } from './demo';

export const SPORTS_CONFIG = {
  /** Calendar inside Ryan's 30-week golf season (one sports year per golf season). PROPOSED. */
  calendar: {
    basketball: { startWeek: 2, roundsPerWeek: 2, playoffWeeks: 3 },
  } as Partial<Record<Sport, { startWeek: number; roundsPerWeek: number; playoffWeeks: number }>>,

  basketball: {
    rosterSize: 10,
    /** Two players per position. */
    positions: ['PG', 'SG', 'SF', 'PF', 'C'] as const,
    /** Players who take the floor in a game (rotation), by overall. */
    rotation: 8,
    /** Share of a team's strength from the starting five vs the bench. */
    starterWeight: 0.72,
    /** Possessions per team per 48 minutes: mean and spread. */
    pace: { mean: 98, sd: 3 },
    turnoverRate: 0.13,
    threeShare: 0.36,
    threePct: 0.355,
    twoPct: 0.52,
    offRebound: 0.25,
    foulRate: 0.085,
    freeThrowPct: 0.77,
    /** How much one point of (offence − defence) moves shooting %. */
    matchupScale: 0.0035,
    /** Shooting % added for the home team. */
    homeEdge: 0.014,
    /** Per player, per game. */
    injuryChance: 0.004,
    injuryProneMultiplier: 2.2,
    injuryGames: { min: 1, max: 15 },
    /** Spread of team quality at generation (overall points, sd). */
    teamSpread: 5,
    playerSpread: 8,
  },

  playoffs: {
    teams: 4,
    /** Best-of lengths: semifinal, final. */
    basketball: { semi: 5, final: 7 },
  },
} as const;
