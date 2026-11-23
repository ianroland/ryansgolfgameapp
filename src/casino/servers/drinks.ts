/**
 * Ryan's drinking state at the casino: pure rules, no I/O. Saved as JSON in the career's flags
 * (like Monique's memory), so it travels with every save and export.
 *
 * - Tito's Double is the only alcoholic order; water is always available.
 * - Buzz rises per drink and falls with completed rounds and water; a new casino visit starts sober.
 * - At the refusal threshold the server refuses alcohol. The refusal is a saved state: nothing
 *   (tips, relationship, dialogue) lifts it except recovering below `refusalLiftsAt`.
 * - After a few drinks in one visit, each drink draws one temporary RPG effect. The draw is
 *   deterministic for (save seed, draw number), so reloading can't re-roll it. Effects are social
 *   and stamina only: no casino game reads them.
 */
import { hashString } from '../../golf/math';
import { SERVER_CONFIG as C, type ServerEffectDef, type ServerEffectId } from './config';
import type { ServerId } from './registry';

export type DrinkLevel = 'sober' | 'buzzed' | 'tipsy' | 'impaired';

export interface DrinkState {
  v: 1;
  /** The casino visit this state belongs to (`season:week`). */
  visitKey: string;
  buzz: number;
  drinksThisVisit: number;
  watersThisVisit: number;
  /** Alcohol refused until buzz recovers (enforced). */
  refused: boolean;
  /** RPG effects drawn this visit (they end with the visit). */
  effects: ServerEffectId[];
  /** Effects drawn ever: the next draw's index (seeds the draw). */
  draws: number;
  lifetimeDrinks: number;
  lifetimeRefusals: number;
  /** Rounds completed this visit (server approaches are counted in rounds). */
  rounds: number;
  /** Servers Ryan was rude to and hasn't apologised to (this visit). */
  rude: ServerId[];
  /** Serious incidents this season (sponsor pattern), and whether the sponsor has written. */
  incidents: { season: number; count: number; warned: boolean };
}

export function freshDrinkState(): DrinkState {
  return { v: 1, visitKey: '', buzz: 0, drinksThisVisit: 0, watersThisVisit: 0, refused: false, effects: [], draws: 0, lifetimeDrinks: 0, lifetimeRefusals: 0, rounds: 0, rude: [], incidents: { season: 0, count: 0, warned: false } };
}

export function parseDrinkState(raw: unknown): DrinkState {
  if (typeof raw !== 'string') return freshDrinkState();
  try {
    const s = JSON.parse(raw) as DrinkState;
    return s && s.v === 1 ? { ...freshDrinkState(), ...s } : freshDrinkState();
  } catch {
    return freshDrinkState();
  }
}

export const drinkLevel = (buzz: number): DrinkLevel =>
  buzz >= C.levels.impaired ? 'impaired' : buzz >= C.levels.tipsy ? 'tipsy' : buzz >= C.levels.buzzed ? 'buzzed' : 'sober';

const clamp = (v: number) => Math.max(0, Math.min(100, v));

/** A new casino visit starts sober (lifetime counts and the season's incidents carry over). */
export function forVisit(s: DrinkState, visitKey: string): DrinkState {
  if (s.visitKey === visitKey) return s;
  return { ...s, visitKey, buzz: 0, drinksThisVisit: 0, watersThisVisit: 0, refused: false, effects: [], rounds: 0, rude: [] };
}

/** Lifts a refusal once Ryan has recovered enough. */
const settle = (s: DrinkState): DrinkState => (s.refused && s.buzz <= C.refusalLiftsAt ? { ...s, refused: false } : s);

export type OrderCheck = { ok: true } | { ok: false; reason: 'refused' };

/** Whether alcohol can be ordered right now. Only buzz matters: never tips, tiers or dialogue. */
export function canOrderAlcohol(s: DrinkState): OrderCheck {
  return s.refused || s.buzz >= C.refuseAt ? { ok: false, reason: 'refused' } : { ok: true };
}

/** Weighted draw of one effect; heavier buzz shifts weight toward the bad outcomes. */
export function drawEffect(seed: number, drawIndex: number, buzz: number, effects: readonly ServerEffectDef[] = C.effects): ServerEffectDef {
  const t = Math.max(0, Math.min(1, (buzz - C.levels.buzzed) / (C.refuseAt - C.levels.buzzed)));
  const w = effects.map((e) => e.weightSober + (e.weightImpaired - e.weightSober) * t);
  const total = w.reduce((a, b) => a + b, 0);
  const u = (hashString(`drink-effect:${seed}:${drawIndex}`) / 2 ** 32) * total;
  let acc = 0;
  for (let i = 0; i < effects.length; i++) {
    acc += w[i];
    if (u < acc) return effects[i];
  }
  return effects[effects.length - 1];
}

export interface OrderResult {
  state: DrinkState;
  effect: ServerEffectDef | null;
  /** Energy this drink costs Ryan (stamina). */
  energyCost: number;
  /** Ryan is now past the concern line (the server says so). */
  concern: boolean;
}

/** One Tito's Double. Call only after canOrderAlcohol(). */
export function applyOrder(s: DrinkState, seed: number): OrderResult {
  const drinks = s.drinksThisVisit + 1;
  const buzz = clamp(s.buzz + C.buzzPerDrink);
  let next: DrinkState = { ...s, buzz, drinksThisVisit: drinks, lifetimeDrinks: s.lifetimeDrinks + 1 };
  let effect: ServerEffectDef | null = null;
  if (drinks > C.effectsStartAfter) {
    effect = drawEffect(seed, s.draws, buzz);
    next = { ...next, draws: s.draws + 1, effects: [...next.effects, effect.id] };
  }
  const energyCost = C.energyPerDrink + Math.max(0, -(effect?.stats.stamina ?? 0));
  return { state: next, effect, energyCost, concern: buzz >= C.concernAt };
}

/** The server refuses: saved, so it holds across reloads and other servers. */
export function applyRefusal(s: DrinkState): DrinkState {
  return { ...s, refused: true, lifetimeRefusals: s.lifetimeRefusals + (s.refused ? 0 : 1) };
}

export function applyWater(s: DrinkState): DrinkState {
  return settle({ ...s, buzz: clamp(s.buzz - C.buzzPerWater), watersThisVisit: s.watersThisVisit + 1 });
}

/** Time passing at the tables: buzz falls with each completed round. */
export function applyRounds(s: DrinkState, n = 1): DrinkState {
  return settle({ ...s, buzz: clamp(s.buzz - C.buzzPerRound * n), rounds: s.rounds + n });
}

/** A serious incident (refused, or rude while impaired) in a season. Returns whether the sponsor should write now. */
export function recordIncident(s: DrinkState, season: number): { state: DrinkState; sponsorWarning: boolean; sponsorLoss: boolean } {
  const inc = s.incidents.season === season ? s.incidents : { season, count: 0, warned: false };
  const count = inc.count + 1;
  const sponsorWarning = count >= C.sponsorWarnAfter && !inc.warned;
  const sponsorLoss = count >= C.sponsorWarnAfter;
  return { state: { ...s, incidents: { season, count, warned: inc.warned || sponsorWarning } }, sponsorWarning, sponsorLoss };
}

/** Whether a server should come by now (between rounds): first after a round, then every few rounds. */
export function serverDue(roundsThisVisit: number): boolean {
  if (roundsThisVisit < C.approachFirstAfterRounds) return false;
  return (roundsThisVisit - C.approachFirstAfterRounds) % C.approachEveryRounds === 0;
}
