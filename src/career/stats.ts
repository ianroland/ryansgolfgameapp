/**
 * Ryan's attributes and how they turn into golf: a single rating for
 * simulated holes, and concrete shot modifiers for holes you play yourself.
 */
import { gearById, lifestyleById } from './shop';
import { STAT_KEYS, type CareerState, type StatKey } from './types';

export const clampStat = (v: number) => Math.max(1, Math.min(100, v));

/** Stats including equipment (and tournament-only perks when `inTournament`). */
export function effectiveStats(c: CareerState, inTournament = false): Record<StatKey, number> {
  const out = { ...c.stats };
  for (const id of Object.values(c.equipment)) {
    const g = gearById(id);
    if (g) for (const [k, v] of Object.entries(g.bonus)) out[k as StatKey] += v ?? 0;
  }
  if (inTournament) {
    for (const id of c.owned) {
      const l = lifestyleById(id);
      if (l?.tournamentBonus) for (const [k, v] of Object.entries(l.tournamentBonus)) out[k as StatKey] += v ?? 0;
    }
  }
  for (const k of STAT_KEYS) out[k] = clampStat(out[k]);
  return out;
}

export function trainingBoost(c: CareerState): number {
  return c.owned.reduce((s, id) => s + (lifestyleById(id)?.trainingBoost ?? 0), 0);
}

export function energyRegen(c: CareerState, homeBonus: number): number {
  const car = c.owned.reduce((s, id) => s + (lifestyleById(id)?.energyRegen ?? 0), 0);
  return 22 + car + homeBonus + Math.round((c.stats.fitness - 40) * 0.15);
}

export function travelDiscount(c: CareerState): number {
  return Math.max(0, ...c.owned.map((id) => lifestyleById(id)?.travelDiscount ?? 0));
}

/**
 * Overall playing rating (0–100) for simulated holes.
 * `round` adds late-tournament fatigue for low fitness; `pressure` (0..1)
 * rewards or punishes Nerve when contending.
 */
export function playerRating(c: CareerState, opts: { round?: number; pressure?: number } = {}): number {
  const s = effectiveStats(c, true);
  let r = 0.22 * s.accuracy + 0.2 * s.power + 0.2 * s.shortGame + 0.26 * s.putting + 0.12 * s.nerve;
  r += c.form * 0.6;
  if (c.energy < 40) r -= (40 - c.energy) * 0.15;
  r -= Math.max(0, (opts.round ?? 0) * (60 - s.fitness) * 0.04);
  r += (opts.pressure ?? 0) * (s.nerve - 50) * 0.1;
  return Math.max(1, Math.min(100, r));
}

export interface ShotModifiers {
  /** Carry multiplier. */
  strength: number;
  /** Extra aim wobble (degrees, standard deviation) on full shots. */
  aimWobbleDeg: number;
  /** Extra power wobble (fraction) on full shots. */
  powerWobble: number;
  /** Extra wobble on short shots (< 100y). */
  shortWobble: number;
  puttAimWobbleDeg: number;
  puttPowerWobble: number;
  /** Power-meter speed multiplier (pressure makes it faster). */
  meterSpeed: number;
}

/** How Ryan's stats feel when you play a hole yourself. */
export function shotModifiers(c: CareerState, pressure = 0): ShotModifiers {
  const s = effectiveStats(c, true);
  const tired = c.energy < 40 ? 1.25 : 1;
  return {
    strength: 0.9 + 0.0022 * s.power,
    aimWobbleDeg: (100 - s.accuracy) * 0.022 * tired,
    powerWobble: (100 - s.accuracy) * 0.0004 * tired,
    shortWobble: (100 - s.shortGame) * 0.0006 * tired,
    puttAimWobbleDeg: (100 - s.putting) * 0.02 * tired,
    puttPowerWobble: (100 - s.putting) * 0.0008 * tired,
    meterSpeed: 1 + pressure * (1 - s.nerve / 100) * 0.55,
  };
}

/** Stat gain from one training session. */
export function trainingGain(c: CareerState, stat: StatKey): number {
  const coach = c.relationships.coach ?? 50;
  const energyFactor = c.energy < 30 ? 0.5 : 1;
  return 0.6 * (1 - c.stats[stat] / 115) * (0.8 + coach / 250) * (1 + trainingBoost(c)) * energyFactor;
}

/** Skill-point cost of the next +1 in a stat. */
export function skillPointCost(value: number): number {
  return value >= 85 ? 4 : value >= 70 ? 3 : value >= 50 ? 2 : 1;
}
