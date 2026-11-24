/**
 * Sports engine settings. Every number is PROPOSED and tunable here; the season format
 * (games per team, meetings per opponent) is the approved one in demo.ts SEASON_FORMAT.
 */
import type { Sport } from './demo';

export interface LeagueCalendar {
  /** First week of the regular season in Ryan's 30-week golf season. */
  startWeek: number;
  /** Game days per week. */
  daysPerWeek: number;
  /** Consecutive games against the same opponent at the same venue (baseball series). */
  seriesLength: number;
}

export const SPORTS_CONFIG = {
  /**
   * One sports year per golf season, staggered so something is always on. Each regular season
   * is 14 weeks, then one playoff week per round. PROPOSED.
   *   Baseball   weeks 1-14,  playoffs 15-16
   *   Basketball weeks 2-15,  playoffs 16-17
   *   Football   weeks 13-26, playoffs 27-28
   *   Hockey     weeks 15-28, playoffs 29-30
   */
  calendar: {
    baseball: { startWeek: 1, daysPerWeek: 3, seriesLength: 3 },
    basketball: { startWeek: 2, daysPerWeek: 2, seriesLength: 1 },
    football: { startWeek: 13, daysPerWeek: 1, seriesLength: 1 },
    hockey: { startWeek: 15, daysPerWeek: 2, seriesLength: 1 },
  } as Record<Sport, LeagueCalendar>,

  /** Team quality spread at generation (overall points, sd) and player spread around it. */
  generation: {
    basketball: { teamSpread: 5, playerSpread: 8 },
    baseball: { teamSpread: 4.5, playerSpread: 8 },
    football: { teamSpread: 5, playerSpread: 7 },
    hockey: { teamSpread: 4.5, playerSpread: 7 },
  } as Record<Sport, { teamSpread: number; playerSpread: number }>,

  /** Per player, per game; injury lengths in team games. */
  injuries: {
    basketball: { chance: 0.004, min: 1, max: 15 },
    baseball: { chance: 0.002, min: 2, max: 20 },
    football: { chance: 0.01, min: 1, max: 6 },
    hockey: { chance: 0.0035, min: 1, max: 12 },
    injuryProneMultiplier: 2.2,
    ironManMultiplier: 0.4,
  },

  basketball: {
    rosterSize: 10,
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
    // Kept for the Phase 2a tests; injuries now live in `injuries`.
    injuryChance: 0.004,
    injuryProneMultiplier: 2.2,
    injuryGames: { min: 1, max: 15 },
    teamSpread: 5,
    playerSpread: 8,
  },

  baseball: {
    /** Plate-appearance outcome rates for an average hitter vs an average pitcher. */
    rates: { k: 0.22, bb: 0.085, single: 0.148, double: 0.046, triple: 0.005, hr: 0.031 },
    /** Hit rates multiplied by this for the home team. */
    homeEdge: 0.065,
    /** Effect of one attribute point away from 60 on each rate. */
    scale: { contact: 0.011, power: 0.024, discipline: 0.012, speed: 0.02, pitch: 0.011 },
    /** Starter innings: base + stamina share + noise; then the bullpen. */
    starterInnings: { base: 4.6, stamina: 2.6, sd: 0.8, min: 3, max: 8 },
    sacFly: 0.3,
    doublePlay: 0.12,
    /** Runner on 2nd scores on a single; runner on 1st scores on a double. */
    scoreFromSecond: 0.6,
    scoreFromFirst: 0.42,
    /** From the 10th inning a runner starts on 2nd. */
    ghostRunner: true,
  },

  football: {
    drives: { mean: 11.2, sd: 0.9 },
    /** Per-drive chances for an even matchup. */
    touchdown: 0.205,
    fieldGoalTry: 0.175,
    defensiveScore: 0.012,
    /** One point of (offence − defence) moves the touchdown chance by this. */
    matchupScale: 0.006,
    homeEdge: 0.018,
    patPct: 0.94,
    passShare: 0.6,
    /** Field-goal make chance: base + kicker skill. */
    fieldGoal: { base: 0.62, skill: 0.004 },
    /** Overtime drives each before a regular-season game may end tied. */
    otDrives: 3,
  },

  hockey: {
    shotsPerPeriod: { mean: 10, sd: 2.2, min: 4 },
    /** Shots added per point of (attack − defence). */
    shotScale: 0.09,
    shootingPct: 0.095,
    /** Shooting % per point of (shooter − goalie). */
    matchupScale: 0.0016,
    homeEdge: 0.014,
    /** The backup goalie starts every Nth game. */
    backupEvery: 4,
    otShots: { mean: 4.5, sd: 1.5 },
    shootoutPct: 0.33,
    assist1: 0.9,
    assist2: 0.65,
  },

  playoffs: {
    teams: 4,
    /** Best-of lengths: semifinal, final. Football is single games, the final at a neutral site. */
    basketball: { semi: 5, final: 7 },
    baseball: { semi: 5, final: 7 },
    hockey: { semi: 5, final: 7 },
    football: { semi: 1, final: 1 },
  },
} as const;
