/**
 * The career RPG loop as pure functions over CareerState.
 *
 * Nothing here touches the database or the ledger directly: every function
 * returns the next CareerState plus a list of money operations (each with an
 * idempotency key). CareerService applies both in one transaction, so money
 * and career state can never disagree.
 */
import { hashString, rng } from '../golf/math';
import type { GameTime, TransactionType } from '../core/types';
import { ACHIEVEMENTS } from './achievements';
import {
  ACTIONS_PER_WEEK, EPSON_GRADUATES, gameDate, LPGA_KEEP_CARD, PLAYER_ID, QSCHOOL, QSERIES_EPSON_CARDS,
  QSERIES_LPGA_CARDS, SEASON_WEEKS, START_AGE, TOURS, fameLevel, type QStage, type TourId,
} from './config';
import { buildPools, evolvePools, RIVAL, rivalTourFor } from './field';
import { gearById, lifestyleById, STARTING_EQUIPMENT } from './shop';
import { clampStat, skillPointCost, trainingGain, travelDiscount, energyRegen } from './stats';
import { storyById, STORIES, type Effects } from './stories';
import { careerMoneyOf, ryanRank, seedCareerMoney } from './moneyList';
import { eligibility, playerStanding, resultCourse, startTournament, type TournamentDef, type TournamentResult } from './tournament';
import { isAlbatross } from '../records/albatross';
import { appearanceBlocker, storyOf } from '../story/appearance';
import { encounterById, nextEncounter, walkEncounter } from '../story/encounters';
import type { Appearance } from '../story/types';
import { STAT_KEYS, STAT_LABELS, type CareerState, type InboxItem, type PersonId, type RoundMode, type StatKey } from './types';

export interface MoneyOp {
  amount: number;
  type: TransactionType;
  sourceId: string;
  key: string;
}

export interface Outcome {
  career: CareerState;
  money: MoneyOp[];
  /** Short line for a toast. */
  message?: string;
  /** Achievement ids newly unlocked. */
  unlocked?: string[];
}

export class CareerRuleError extends Error {}
const fail = (msg: string): never => {
  throw new CareerRuleError(msg);
};

const clone = (c: CareerState): CareerState => structuredClone(c);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const now = (c: CareerState): GameTime => gameDate(c.season, c.week);

/** Adds an inbox message (newest first, last 40 kept). */
export function inbox(c: CareerState, title: string, body: string, tone: InboxItem['tone'] = 'neutral') {
  c.inbox = [{ id: `msg_${c.season}_${c.week}_${hashString(title + body + c.inbox.length)}`, at: now(c), title, body, tone }, ...c.inbox].slice(0, 40);
}

// ───────────────────────── New career ─────────────────────────

export function newCareerState(seed = 2027): CareerState {
  const relationships: Record<PersonId, number> = { coach: 50, mom: 70, friend: 60, rival: 30, agent: 0, sponsor: 0, caddie: 0, fans: 10 };
  const c: CareerState = {
    id: 'career',
    playerId: PLAYER_ID,
    season: 1,
    week: 1,
    age: START_AGE,
    status: 'amateur',
    tourCard: 'none',
    qschool: { season: 1, nextStage: null, result: null },
    stats: { power: 34, accuracy: 36, shortGame: 32, putting: 35, nerve: 30, fitness: 40 },
    skillPoints: 3,
    energy: 90,
    form: 0,
    fame: 0,
    relationships,
    flags: { seed },
    equipment: { ...STARTING_EQUIPMENT },
    owned: [],
    sponsor: null,
    pools: buildPools(seed),
    rivalId: RIVAL.id,
    seasonPoints: {},
    seasonEarnings: {},
    inbox: [],
    pendingStory: null,
    active: null,
    entered: [],
    achievements: {},
    actionsUsed: 0,
    storiesSeen: [],
    totals: { events: 0, wins: 0, top10s: 0, cutsMade: 0, earnings: 0, majors: 0, bestFinish: null, eagles: 0, aces: 0 },
    recent: [],
    seasonLog: [],
  };
  c.careerMoney = seedCareerMoney(c);
  inbox(
    c,
    'Welcome to the road',
    "You're 18, you've got a hand-me-down driver and a dream. Play the Amateur Circuit, train hard, and turn pro when you're ready. Q-School is the door to the LPGA.",
    'good',
  );
  return c;
}

// ───────────────────────── Weekly actions ─────────────────────────

export type ActionId =
  | 'train_power' | 'train_accuracy' | 'train_shortGame' | 'train_putting'
  | 'gym' | 'mental' | 'rest' | 'job' | 'social' | 'call_mom' | 'sponsor_day' | 'content';

export interface ActionDef {
  id: ActionId;
  label: string;
  group: 'Train' | 'Life' | 'Work';
  energy: number;
  describe: (c: CareerState) => string;
  available?: (c: CareerState) => string | null;
}

export const jobWage = (c: CareerState) => (c.status === 'pro' ? Math.min(1200, 400 + Math.round(c.fame * 12)) : 350);

const trainAction = (stat: StatKey, label: string, blurb: string): ActionDef => ({
  id: `train_${stat}` as ActionId,
  label,
  group: 'Train',
  energy: -15,
  describe: (c) => `${blurb} +${trainingGain(c, stat).toFixed(2)} ${STAT_LABELS[stat]}.`,
});

export const ACTIONS: ActionDef[] = [
  trainAction('power', 'Range: Driving', 'Bucket after bucket with the big stick.'),
  trainAction('accuracy', 'Range: Iron Play', 'Alignment sticks and targets.'),
  trainAction('shortGame', 'Short-Game Area', 'Chips, pitches, bunkers.'),
  trainAction('putting', 'Putting Green', 'Gates, ladders and clock drills.'),
  { id: 'gym', label: 'Gym Session', group: 'Train', energy: -18, describe: (c) => `Legs, core, mobility. +${(trainingGain(c, 'fitness') * 1.2).toFixed(2)} Fitness, a little Power.` },
  { id: 'mental', label: 'Visualisation', group: 'Train', energy: -8, describe: (c) => `Breathing and pre-shot routine. +${(trainingGain(c, 'nerve') * 0.9).toFixed(2)} Nerve.` },
  { id: 'rest', label: 'Rest Day', group: 'Life', energy: 25, describe: () => 'Sleep in, stretch, eat well. +25 Energy.' },
  { id: 'social', label: 'Hang with Jess', group: 'Life', energy: 6, describe: () => 'Tacos and bad movies. +Form, Jess ♥, +6 Energy.' },
  { id: 'call_mom', label: 'Call Baba', group: 'Life', energy: 3, describe: () => 'He tells you what you did wrong, then that he\'s proud. Baba ♥, +Form.' },
  {
    id: 'content', label: 'Post a Video', group: 'Life', energy: -6, describe: () => 'Trick shots and swing tips. +Fame, Fans ♥.',
    available: (c) => (c.fame >= 4 ? null : 'Needs a little fame first'),
  },
  { id: 'job', label: 'Work a Shift', group: 'Work', energy: -12, describe: (c) => `${c.status === 'pro' ? 'Give lessons at the club' : 'Pro shop and cart barn'}. +$${jobWage(c).toLocaleString()}.` },
  {
    id: 'sponsor_day', label: 'Sponsor Appearance', group: 'Work', energy: -12, describe: (c) => `Smile, sign, shake hands. +$${Math.round((c.sponsor?.weekly ?? 0) * 1.5).toLocaleString()}, Sponsor ♥, +Fame.`,
    available: (c) => (c.sponsor ? null : 'No sponsor yet'),
  },
];

export const actionById = (id: string) => ACTIONS.find((a) => a.id === id);

export function actionBlocker(c: CareerState, id: ActionId): string | null {
  const a = actionById(id);
  if (!a) return 'Unknown activity';
  if (c.active) return 'Finish your tournament first';
  if (c.pendingStory) return 'Something needs your attention first';
  if (c.actionsUsed >= ACTIONS_PER_WEEK) return 'No time left this week';
  if (a.energy < 0 && c.energy + a.energy < 0) return 'Too tired';
  return a.available?.(c) ?? null;
}

function rel(c: CareerState, who: PersonId, d: number) {
  c.relationships[who] = clamp((c.relationships[who] ?? 0) + d, 0, 100);
}

function addStat(c: CareerState, k: StatKey, d: number) {
  c.stats[k] = Math.round(clampStat(c.stats[k] + d) * 100) / 100;
}

export function doAction(prev: CareerState, id: ActionId): Outcome {
  const block = actionBlocker(prev, id);
  if (block) fail(block);
  const c = clone(prev);
  const a = actionById(id)!;
  const money: MoneyOp[] = [];
  let message = '';
  const n = c.actionsUsed;
  if (id.startsWith('train_')) {
    const stat = id.slice(6) as StatKey;
    const g = trainingGain(c, stat);
    addStat(c, stat, g);
    rel(c, 'coach', 1);
    message = `+${g.toFixed(2)} ${STAT_LABELS[stat]}`;
  } else if (id === 'gym') {
    const g = trainingGain(c, 'fitness') * 1.2;
    addStat(c, 'fitness', g);
    addStat(c, 'power', g * 0.25);
    message = `+${g.toFixed(2)} Fitness`;
  } else if (id === 'mental') {
    const g = trainingGain(c, 'nerve') * 0.9;
    addStat(c, 'nerve', g);
    message = `+${g.toFixed(2)} Nerve`;
  } else if (id === 'rest') {
    message = 'You feel recharged.';
  } else if (id === 'social') {
    c.form = clamp(c.form + 1, -10, 10);
    rel(c, 'friend', 6);
    message = 'Jess ♥ · Form +1';
  } else if (id === 'call_mom') {
    c.form = clamp(c.form + 1, -10, 10);
    rel(c, 'mom', 5);
    message = 'Baba ♥ · Form +1';
  } else if (id === 'content') {
    const r = rng(hashString(`content:${c.season}:${c.week}:${n}`) ^ Number(c.flags.seed ?? 0));
    const viral = r.next() < 0.12;
    const fame = viral ? 4 : 1;
    c.fame = clamp(c.fame + fame, 0, 100);
    rel(c, 'fans', viral ? 8 : 3);
    message = viral ? 'It went viral! Fame +4' : 'Fame +1';
  } else if (id === 'job') {
    const wage = jobWage(c);
    money.push({ amount: wage, type: 'job_wage', sourceId: id, key: `job:${c.season}:${c.week}:${n}` });
    message = `+$${wage.toLocaleString()}`;
  } else if (id === 'sponsor_day') {
    const pay = Math.round(c.sponsor!.weekly * 1.5);
    money.push({ amount: pay, type: 'sponsor_income', sourceId: c.sponsor!.id, key: `sponsorday:${c.season}:${c.week}:${n}` });
    c.fame = clamp(c.fame + 1, 0, 100);
    rel(c, 'sponsor', 5);
    message = `+$${pay.toLocaleString()} · Fame +1`;
  }
  c.energy = clamp(c.energy + a.energy, 0, 100);
  c.actionsUsed += 1;
  return withAchievements({ career: c, money, message });
}

// ───────────────────────── Casino ─────────────────────────

export const casinoWeekKey = (c: CareerState) => `${c.season}:${c.week}`;
export const CASINO_ENERGY = 10;

/** A night at the casino uses one activity; you can play all week after. */
export function casinoBlocker(c: CareerState): string | null {
  if (c.flags.casinoVisit === casinoWeekKey(c)) return null;
  if (c.active) return 'Finish your tournament first';
  if (c.pendingStory) return 'Something needs your attention first';
  if (Number(c.flags.casinoBanUntil ?? 0) > c.season * 100 + c.week) return 'You promised Baba you\'d stay away for a while';
  if (c.actionsUsed >= ACTIONS_PER_WEEK) return 'No time left this week';
  if (c.energy < CASINO_ENERGY) return 'Too tired';
  return null;
}

export function visitCasino(prev: CareerState): Outcome {
  if (prev.flags.casinoVisit === casinoWeekKey(prev)) return { career: prev, money: [] };
  const block = casinoBlocker(prev);
  if (block) fail(block);
  const c = clone(prev);
  c.flags.casinoVisit = casinoWeekKey(c);
  c.actionsUsed += 1;
  c.energy = clamp(c.energy - CASINO_ENERGY, 0, 100);
  c.flags.casinoVisits = Number(c.flags.casinoVisits ?? 0) + 1;
  return { career: c, money: [], message: 'A night out at Desert Palms' };
}

/** Records casino results on the career (for stats, stories, achievements). */
export function recordCasino(prev: CareerState, wagered: number, returned: number, opts: { jackpot?: boolean; biggestWin?: number } = {}): CareerState {
  const c = clone(prev);
  c.flags.casinoWagered = Number(c.flags.casinoWagered ?? 0) + wagered;
  c.flags.casinoReturned = Number(c.flags.casinoReturned ?? 0) + returned;
  if (opts.jackpot) c.flags.casinoJackpot = true;
  if (opts.biggestWin && opts.biggestWin > Number(c.flags.casinoBiggestWin ?? 0)) c.flags.casinoBiggestWin = opts.biggestWin;
  return c;
}

export const casinoNet = (c: CareerState) => Number(c.flags.casinoReturned ?? 0) - Number(c.flags.casinoWagered ?? 0);

// ───────────────────────── Skill points, pro status, shop ─────────────────────────

export function spendSkillPoint(prev: CareerState, stat: StatKey): Outcome {
  const cost = skillPointCost(prev.stats[stat]);
  if (prev.skillPoints < cost) fail(`Needs ${cost} skill point${cost > 1 ? 's' : ''}`);
  if (prev.stats[stat] >= 100) fail('Already maxed');
  const c = clone(prev);
  c.skillPoints -= cost;
  addStat(c, stat, 1);
  return withAchievements({ career: c, money: [], message: `+1 ${STAT_LABELS[stat]}` });
}

export function turnPro(prev: CareerState): Outcome {
  if (prev.status === 'pro') fail('Already a professional');
  if (prev.active) fail('Finish your tournament first');
  const c = clone(prev);
  c.status = 'pro';
  c.qschool = { season: c.season, nextStage: c.week <= QSCHOOL[1].week ? 1 : null, result: null };
  c.fame = clamp(c.fame + 3, 0, 100);
  c.flags.turnedProSeason = c.season;
  inbox(
    c,
    "You're a professional!",
    c.qschool.nextStage
      ? 'You can now play the SoCal Pro Series for prize money. Q-School Stage I is in week 20 — the first step to an LPGA card.'
      : "You can now play the SoCal Pro Series for prize money. This year's Q-School has started; you'll be entered next season.",
    'good',
  );
  return withAchievements({ career: c, money: [], message: 'Turned pro!' });
}

export function buyGear(prev: CareerState, itemId: string, balance: number): Outcome {
  const g = gearById(itemId) ?? fail('Unknown item');
  if (prev.owned.includes(itemId) || prev.equipment[g.slot] === itemId) {
    const c = clone(prev);
    c.equipment[g.slot] = itemId;
    return { career: c, money: [], message: `Equipped ${g.name}` };
  }
  if (prev.fame < g.minFame) fail(`Needs ${g.minFame} fame`);
  if (balance < g.price) fail('Not enough money');
  const c = clone(prev);
  c.owned.push(itemId);
  c.equipment[g.slot] = itemId;
  return { career: c, money: g.price > 0 ? [{ amount: -g.price, type: 'gear_purchase', sourceId: itemId, key: `buy:${itemId}` }] : [], message: `Bought ${g.name}` };
}

export function buyLifestyle(prev: CareerState, itemId: string, balance: number): Outcome {
  const l = lifestyleById(itemId) ?? fail('Unknown item');
  if (prev.owned.includes(itemId)) fail('Already owned');
  if (prev.fame < l.minFame) fail(`Needs ${l.minFame} fame`);
  if (l.requiresPro && prev.status !== 'pro') fail('Professionals only');
  if (balance < l.price) fail('Not enough money');
  const c = clone(prev);
  c.owned.push(itemId);
  if (l.kind === 'caddie') {
    // One caddie at a time: the better one replaces the old.
    c.owned = c.owned.filter((id) => id === itemId || lifestyleById(id)?.kind !== 'caddie');
    rel(c, 'caddie', 60);
  }
  if (l.kind === 'car') c.owned = c.owned.filter((id) => id === itemId || lifestyleById(id)?.kind !== 'car');
  return { career: c, money: [{ amount: -l.price, type: 'lifestyle_purchase', sourceId: itemId, key: `buy:${itemId}` }], message: `Bought ${l.name}` };
}

// ───────────────────────── Tournaments ─────────────────────────

export function tournamentCosts(def: TournamentDef, c: CareerState) {
  const travel = Math.round(def.travelCost * (1 - travelDiscount(c)));
  return { entry: def.entryFee, travel, total: def.entryFee + travel };
}

export function entryBlocker(c: CareerState, def: TournamentDef, balance: number): string | null {
  if (c.active) return 'Already playing a tournament';
  if (c.pendingStory) return 'Something needs your attention first';
  if (def.week !== c.week || def.season !== c.season) return def.week < c.week ? 'Already played' : `Week ${def.week}`;
  if (c.entered.includes(def.id)) return 'Already played';
  const el = eligibility(def, c);
  if (!el.ok) return el.reason!;
  if (c.entered.some((id) => id.includes(`-w${c.week}`) || id.endsWith(`-s${def.qStage}`))) return 'One event per week';
  if (balance < tournamentCosts(def, c).total) return `Needs $${tournamentCosts(def, c).total.toLocaleString()}`;
  if (c.energy < 15) return 'Too tired — rest first';
  return null;
}

export function enterTournament(prev: CareerState, def: TournamentDef, mode: RoundMode, balance: number): Outcome {
  const block = entryBlocker(prev, def, balance);
  if (block) fail(block);
  const c = clone(prev);
  const { entry, travel } = tournamentCosts(def, c);
  const money: MoneyOp[] = [];
  if (entry > 0) money.push({ amount: -entry, type: 'entry_fee', sourceId: def.id, key: `entry:${def.id}` });
  if (travel > 0) money.push({ amount: -travel, type: 'travel', sourceId: def.id, key: `travel:${def.id}` });
  c.active = startTournament(def, c, mode);
  c.entered.push(def.id);
  c.energy = clamp(c.energy - 15, 0, 100);
  return { career: c, money, message: `Entered ${def.name}` };
}

export function withdraw(prev: CareerState): Outcome {
  if (!prev.active) fail('Not in a tournament');
  const c = clone(prev);
  c.active = null;
  c.form = clamp(c.form - 2, -10, 10);
  inbox(c, 'Withdrew', 'You pulled out of the tournament. No prize, no points.', 'bad');
  return { career: c, money: [], message: 'Withdrew' };
}

const FINISH_FACTOR = (pos: number, field: number, madeCut: boolean) =>
  !madeCut ? 0 : pos === 1 ? 3 : pos <= 3 ? 1.6 : pos <= 10 ? 0.8 : pos <= field / 2 ? 0.25 : 0;

/**
 * Career consequences of a validated tournament result: fame, skill points,
 * form, money lists, Q-School progress, sponsor bonus, totals, news.
 * Prize money itself is posted by the pipeline with key `prize:<id>`.
 */
export function applyTournamentResult(prev: CareerState, r: TournamentResult): Outcome {
  const c = clone(prev);
  const def = r.def;
  const me = playerStanding(r);
  const field = r.standings.length;
  const money: MoneyOp[] = [];
  const tourName = TOURS[def.tour].name;

  // All-time career money (everyone who cashed).
  const allTimeMoney = { ...careerMoneyOf(c) };
  for (const s of r.standings) {
    if (s.prize <= 0) continue;
    const prev = allTimeMoney[s.id];
    allTimeMoney[s.id] = { name: prev?.name ?? s.name, amount: (prev?.amount ?? 0) + s.prize, tour: def.tour };
  }
  c.careerMoney = allTimeMoney;

  // Money lists and ranking points for everyone in the field.
  for (const s of r.standings) {
    if (s.prize > 0) c.seasonEarnings[`${def.tour}:${s.id}`] = (c.seasonEarnings[`${def.tour}:${s.id}`] ?? 0) + s.prize;
    if (s.points > 0) c.seasonPoints[s.id] = (c.seasonPoints[s.id] ?? 0) + s.points;
  }

  // Fame, skill points, form.
  const factor = FINISH_FACTOR(me.position, field, me.madeCut);
  const special = def.special ? 1.5 : 1;
  // Fame comes harder the more famous you already are.
  const fameGain = Math.round(TOURS[def.tour].fameBase * factor * special * (1 - c.fame / 130) * 10) / 10;
  const myRounds = r.scores[r.playerId] ?? [];
  const roundPar = r.pars.reduce((a, b) => a + b, 0);
  const subPar = myRounds.filter((h) => h.reduce((a, b) => a + b, 0) < roundPar).length;
  const sp = Math.round(TOURS[def.tour].skillPointsBase * (factor === 0 ? 0.5 : 0.8 + factor * 0.4)) + (subPar > 0 ? 1 : 0);
  c.fame = clamp(Math.round((c.fame + fameGain) * 10) / 10, 0, 100);
  c.skillPoints += sp;
  c.flags.subParRounds = Number(c.flags.subParRounds ?? 0) + subPar;
  c.form = clamp(c.form + (me.position === 1 ? 4 : me.position <= 10 && me.madeCut ? 2 : me.madeCut ? 0 : -2), -10, 10);
  c.energy = clamp(c.energy - 10, 0, 100);
  if (me.position === 1) rel(c, 'fans', 8);

  // Totals.
  const t = c.totals;
  t.events += 1;
  if (me.madeCut && def.cut) t.cutsMade += 1;
  if (me.madeCut && me.position <= 10) t.top10s += 1;
  if (me.madeCut && me.position === 1) t.wins += 1;
  if (me.madeCut && me.position === 1 && def.tour === 'lpga' && def.special) t.majors += 1;
  t.earnings += me.prize;
  if (me.madeCut) t.bestFinish = t.bestFinish === null ? me.position : Math.min(t.bestFinish, me.position);
  for (const holes of myRounds) {
    holes.forEach((s, i) => {
      const d = s - r.pars[i];
      if (s === 1) t.aces += 1;
      if (isAlbatross(r.pars[i], s)) t.albatrosses = (t.albatrosses ?? 0) + 1;
      else if (d === -2 && s !== 1) t.eagles += 1;
    });
  }
  albatrossNews(c, r);
  c.recent = [
    { tournamentId: r.tournamentId, name: def.name, tour: def.tour, posLabel: me.posLabel, toPar: me.toPar, prize: me.prize, season: def.season, week: def.week },
    ...c.recent,
  ].slice(0, 12);

  // Rival head-to-head.
  const rival = r.standings.find((s) => s.id === c.rivalId);
  if (rival) {
    const beat = me.madeCut && (!rival.madeCut || me.total < rival.total);
    c.flags.h2hWins = Number(c.flags.h2hWins ?? 0) + (beat ? 1 : 0);
    c.flags.h2hLosses = Number(c.flags.h2hLosses ?? 0) + (beat ? 0 : 1);
    if (rival.position === 1) inbox(c, `${rival.name} wins`, `Your rival took the ${def.name}. She made sure you heard about it.`, 'bad');
  }

  // Sponsor win bonus.
  if (me.position === 1 && me.madeCut && c.sponsor) {
    money.push({ amount: c.sponsor.winBonus, type: 'sponsor_income', sourceId: c.sponsor.id, key: `winbonus:${r.tournamentId}` });
    rel(c, 'sponsor', 8);
  }

  // Q-School progression.
  let qNote = '';
  if (def.qStage) {
    const stage = def.qStage as QStage;
    if (stage < 3) {
      const spots = Math.ceil(field * QSCHOOL[stage].advanceFraction);
      if (me.position <= spots) {
        c.qschool.nextStage = (stage + 1) as QStage;
        qNote = ` You advance to ${QSCHOOL[(stage + 1) as QStage].name} (top ${spots} went through).`;
      } else {
        c.qschool.nextStage = null;
        c.qschool.result = 'failed';
        qNote = ` Top ${spots} advanced. Your Q-School ends here this year.`;
      }
    } else {
      c.qschool.nextStage = null;
      if (me.position <= QSERIES_LPGA_CARDS) {
        c.qschool.result = 'lpga';
        qNote = ` TOP ${QSERIES_LPGA_CARDS}! You've earned your LPGA Tour card for next season!`;
      } else if (me.position <= QSERIES_EPSON_CARDS) {
        c.qschool.result = 'epson';
        qNote = ` You earned Epson Tour status for next season.`;
      } else {
        c.qschool.result = 'failed';
        qNote = ' No card this year. Back to the Pro Series.';
      }
    }
  }

  const headline =
    me.position === 1 && me.madeCut ? `🏆 You won the ${def.name}!` : me.madeCut ? `${me.posLabel} at the ${def.name}` : `Missed the cut at the ${def.name}`;
  const prizeLine = me.prize > 0 ? ` Prize money: $${me.prize.toLocaleString()}.` : '';
  inbox(
    c,
    headline,
    `${tourName}: ${formatScore(me.toPar)} (${me.rounds.join('-')}). Fame +${fameGain}, +${sp} skill points.${prizeLine}${qNote}`,
    me.position <= 10 && me.madeCut ? 'good' : me.madeCut ? 'neutral' : 'bad',
  );

  c.active = null;
  return withAchievements({ career: c, money, message: headline });
}

const formatScore = (n: number) => (n === 0 ? 'E' : n > 0 ? `+${n}` : `${n}`);

// ───────────────────────── Advancing the week ─────────────────────────

export interface WeekContext {
  balance: number;
  livingCost: number;
  homeEnergy: number;
}

export function advanceBlocker(c: CareerState): string | null {
  if (c.active) return 'Finish your tournament first';
  if (c.pendingStory) return 'Answer the event first';
  return null;
}

export function advanceWeek(prev: CareerState, ctx: WeekContext): Outcome {
  const block = advanceBlocker(prev);
  if (block) fail(block);
  let c = clone(prev);
  const money: MoneyOp[] = [];
  const s = c.season;
  const w = c.week;

  // Bills first, then income.
  let balance = ctx.balance;
  if (c.sponsor) {
    money.push({ amount: c.sponsor.weekly, type: 'sponsor_income', sourceId: c.sponsor.id, key: `sponsor:${s}:${w}` });
    balance += c.sponsor.weekly;
  }
  const rent = Math.min(ctx.livingCost, Math.max(0, balance));
  if (rent > 0) money.push({ amount: -rent, type: 'living_costs', sourceId: `week-${s}-${w}`, key: `living:${s}:${w}` });
  balance -= rent;
  if (rent < ctx.livingCost) {
    c.form = clamp(c.form - 3, -10, 10);
    rel(c, 'mom', -2);
    inbox(c, 'Behind on rent', "You couldn't cover this week's bills. Baba spotted you, and asked twice if you're eating. Work a shift or two.", 'bad');
  }

  c.energy = clamp(c.energy + energyRegen(c, ctx.homeEnergy), 0, 100);
  c.form = c.form > 0 ? c.form - 1 : c.form < 0 ? c.form + 1 : 0;
  // Out of sight, out of mind: fame fades a little each week.
  if (c.fame > 15) c.fame = Math.round((c.fame - 0.25) * 10) / 10;
  c.actionsUsed = 0;
  if (balance >= 30000) c.flags.richEnough = true;
  c.week += 1;

  if (c.week > SEASON_WEEKS) c = seasonRollover(c);
  else rollStory(c);
  offerEncounter(c);

  return withAchievements({ career: c, money, message: `Week ${c.week}` });
}

function rollStory(c: CareerState) {
  if (c.pendingStory) return;
  const r = rng(hashString(`story:${c.season}:${c.week}`) ^ Number(c.flags.seed ?? 0));
  const roll = r.next();
  const eligible = STORIES.filter((st) => st.when(c) && !(st.once && c.storiesSeen.includes(st.id)));
  // Guaranteed one-off milestones (e.g. Q-School reminder) take priority.
  const urgent = eligible.find((st) => st.id === 'qschool_heads_up');
  // Repeatable stories rest for a while after they happen.
  const recent = new Set(c.storiesSeen.slice(-6));
  const pool = eligible.filter((st) => !recent.has(st.id));
  let pick = urgent;
  if (!pick && roll < 0.5 && pool.length) {
    const total = pool.reduce((sum, st) => sum + (st.weight ?? 1), 0);
    let x = r.next() * total;
    pick = pool.find((st) => (x -= st.weight ?? 1) < 0) ?? pool[0];
  }
  if (!pick) return;
  c.pendingStory = {
    storyId: pick.id,
    title: pick.title,
    body: pick.body(c),
    choices: pick.choices.map((ch) => ({ label: ch.label, hint: ch.hint })),
  };
}

export function storyChoiceBlocker(c: CareerState, index: number, balance: number): string | null {
  const st = c.pendingStory && storyById(c.pendingStory.storyId);
  if (!st) return 'No event';
  const ch = st.choices[index];
  if (!ch) return 'Unknown choice';
  if (typeof ch.effects === 'object' && (ch.effects.money ?? 0) < 0 && balance < -(ch.effects.money ?? 0)) return 'Not enough money';
  return null;
}

export function resolveStory(prev: CareerState, index: number, balance: number): Outcome & { result: string } {
  const block = storyChoiceBlocker(prev, index, balance);
  if (block) fail(block);
  const c = clone(prev);
  const st = storyById(prev.pendingStory!.storyId)!;
  const ch = st.choices[index];
  const roll = rng(hashString(`choice:${st.id}:${c.season}:${c.week}`) ^ Number(c.flags.seed ?? 0)).next();
  const fx: Effects = typeof ch.effects === 'function' ? ch.effects(c, roll) : ch.effects;
  const result = typeof ch.result === 'function' ? ch.result(c, roll) : ch.result;
  const money = applyEffects(c, fx, balance, st.id, `story:${c.season}:${c.week}:${st.id}`);
  c.storiesSeen = [...c.storiesSeen, st.id].slice(-60);
  c.pendingStory = null;
  inbox(c, st.title, `${ch.label}. ${result}`, 'neutral');
  return { ...withAchievements({ career: c, money, message: result }), result };
}

/** Applies story-style effects to a (cloned) career. Returns the money to post (at most once, by `key`). */
export function applyEffects(c: CareerState, fx: Effects, balance: number, sourceId: string, key: string): MoneyOp[] {
  const money: MoneyOp[] = [];
  if (fx.money) {
    const amount = fx.money < 0 ? -Math.min(-fx.money, balance) : fx.money;
    if (amount !== 0) money.push({ amount, type: 'story', sourceId, key });
  }
  if (fx.energy) c.energy = clamp(c.energy + fx.energy, 0, 100);
  if (fx.form) c.form = clamp(c.form + fx.form, -10, 10);
  if (fx.fame) c.fame = clamp(Math.round((c.fame + (fx.fame > 0 ? fx.fame * (1 - c.fame / 130) : fx.fame)) * 10) / 10, 0, 100);
  if (fx.skillPoints) c.skillPoints += fx.skillPoints;
  for (const [k, v] of Object.entries(fx.stats ?? {})) addStat(c, k as StatKey, v ?? 0);
  for (const [k, v] of Object.entries(fx.rel ?? {})) rel(c, k as PersonId, v ?? 0);
  Object.assign(c.flags, fx.flags ?? {});
  if (fx.grant && !c.owned.includes(fx.grant)) {
    const l = lifestyleById(fx.grant);
    if (l?.kind === 'caddie') c.owned = c.owned.filter((id) => lifestyleById(id)?.kind !== 'caddie');
    c.owned.push(fx.grant);
  }
  if (fx.sponsor) {
    c.sponsor = { id: fx.sponsor.id, name: fx.sponsor.name, weekly: fx.sponsor.weekly, winBonus: fx.sponsor.winBonus, untilSeason: c.season + fx.sponsor.seasons - 1 };
  }
  return money;
}

// ───────────────────────── Encounters & appearance ─────────────────────────

/** Offers the next eligible encounter (called when a week begins). */
function offerEncounter(c: CareerState) {
  const story = storyOf(c);
  const next = nextEncounter(c, story);
  if (next) c.story = { ...story, available: next.id };
}

export function encounterBlocker(c: CareerState, id: string, path: string[], balance: number): string | null {
  const story = storyOf(c);
  const def = encounterById(id);
  if (!def) return 'Unknown encounter';
  if (story.encounters[id]) return 'Already played';
  if (story.available !== id) return "That encounter isn't available";
  if (c.active) return 'Finish the tournament first';
  const walk = walkEncounter(def, path);
  if (!walk.ok) return walk.reason;
  if (walk.stake > balance) return `You need $${walk.stake.toLocaleString()} for that bet`;
  return null;
}

/**
 * Applies an encounter's consequences once. The path is re-walked through the
 * encounter's own graph, so only a real ending can be applied; afterwards the
 * encounter is recorded as completed and can't run again.
 */
export function resolveEncounter(prev: CareerState, id: string, path: string[], balance: number): Outcome & { outcomeId: string } {
  const block = encounterBlocker(prev, id, path, balance);
  if (block) fail(block);
  const def = encounterById(id)!;
  const walk = walkEncounter(def, path) as Extract<ReturnType<typeof walkEncounter>, { ok: true }>;
  const out = def.outcomes[walk.outcome];
  const c = clone(prev);
  const story = storyOf(c);
  const money = applyEffects(c, out.effects, balance, `encounter:${id}`, `encounter:${id}`);
  const bonds = { ...story.bonds };
  for (const [who, d] of Object.entries(out.bonds ?? {})) bonds[who] = clamp((bonds[who] ?? 50) + d, 0, 100);
  c.story = {
    ...story,
    bonds,
    available: null,
    encounters: { ...story.encounters, [id]: { outcome: walk.outcome, path, season: c.season, week: c.week, at: now(c) } },
  };
  inbox(c, def.title, `${out.summary} (${out.changes})`, out.tone);
  return { ...withAchievements({ career: c, money, message: out.summary }), outcomeId: walk.outcome };
}

export function setAppearance(prev: CareerState, a: Appearance): Outcome {
  const block = appearanceBlocker(prev, a);
  if (block) fail(block);
  const c = clone(prev);
  c.appearance = { hair: a.hair, hat: a.hat };
  return { career: c, money: [], message: 'Look updated' };
}

// ───────────────────────── Season rollover ─────────────────────────

/** Rank of a golfer on a tour's money list this season (1-based). */
export function moneyRank(c: CareerState, tour: TourId, id: string = c.playerId): number | null {
  const mine = c.seasonEarnings[`${tour}:${id}`];
  if (mine === undefined) return null;
  return Object.entries(c.seasonEarnings).filter(([k, v]) => k.startsWith(`${tour}:`) && v > mine).length + 1;
}

export function moneyList(c: CareerState, tour: TourId, limit = 20) {
  const names = new Map(Object.values(c.pools).flat().map((g) => [g.id, g.name]));
  names.set(c.playerId, 'Ryan');
  return Object.entries(c.seasonEarnings)
    .filter(([k]) => k.startsWith(`${tour}:`))
    .map(([k, v]) => ({ id: k.slice(tour.length + 1), name: names.get(k.slice(tour.length + 1)) ?? '—', amount: v }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}

export function pointsList(c: CareerState, limit = 20) {
  const names = new Map(Object.values(c.pools).flat().map((g) => [g.id, g.name]));
  names.set(c.playerId, 'Ryan');
  return Object.entries(c.seasonPoints)
    .map(([id, pts]) => ({ id, name: names.get(id) ?? '—', points: pts }))
    .sort((a, b) => b.points - a.points)
    .slice(0, limit);
}


export function seasonRollover(prev: CareerState): CareerState {
  const c = clone(prev);
  const lines: string[] = [];

  // Tour status for next season.
  if (c.tourCard === 'lpga') {
    const rank = moneyRank(c, 'lpga');
    if (rank !== null && rank <= LPGA_KEEP_CARD) {
      lines.push(`You finished #${rank} on the LPGA money list and kept your card.`);
      c.flags.keptCard = true;
    } else {
      c.tourCard = 'epson';
      lines.push(`You finished outside the top ${LPGA_KEEP_CARD} on the LPGA money list and lost your card. Back to the Epson Tour.`);
    }
  } else if (c.tourCard === 'epson') {
    const rank = moneyRank(c, 'epson');
    if (rank !== null && rank <= EPSON_GRADUATES) {
      c.tourCard = 'lpga';
      lines.push(`#${rank} on the Epson Tour money list — you've graduated to the LPGA Tour!`);
    }
  }
  if (c.qschool.result === 'lpga') {
    c.tourCard = 'lpga';
    lines.push('Your Q-Series finish earns an LPGA Tour card. Welcome to the big leagues.');
  } else if (c.qschool.result === 'epson' && c.tourCard === 'none') {
    c.tourCard = 'epson';
    lines.push('Your Q-Series finish earns Epson Tour status.');
  }
  if (c.status === 'amateur') {
    const rank = pointsList(c, 100).findIndex((p) => p.id === c.playerId);
    if (rank >= 0) lines.push(`You finished #${rank + 1} in the amateur rankings.`);
  }

  // Sponsor contract.
  if (c.sponsor && c.sponsor.untilSeason <= c.season) {
    if ((c.relationships.sponsor ?? 0) >= 60 && c.fame >= 30) {
      c.sponsor = { ...c.sponsor, weekly: Math.round(c.sponsor.weekly * 1.25), untilSeason: c.season + 2 };
      lines.push(`${c.sponsor.name} renewed your deal with a raise: $${c.sponsor.weekly}/week.`);
    } else {
      lines.push(`Your deal with ${c.sponsor.name} has ended.`);
      c.sponsor = null;
    }
  }

  // The world moves on.
  const seed = Number(c.flags.seed ?? 0) + c.season;
  c.pools = evolvePools(c.pools, c.seasonEarnings, seed);
  const all = Object.values(c.pools).flat();
  const rival = all.find((g) => g.id === c.rivalId);
  if (rival) {
    const r = rng(seed ^ 0x5eed);
    const rating = Math.min(85, Math.round(rival.rating + 5 + r.gauss() * 1.5));
    const tour = rivalTourFor(rating);
    for (const k of Object.keys(c.pools) as TourId[]) c.pools[k] = c.pools[k].filter((g) => g.id !== rival.id);
    c.pools[tour].push({ ...rival, rating, tour });
    if (tour !== rival.tour) lines.push(`${rival.name} moves up to the ${TOURS[tour].name}.`);
  }

  // Remember how the season went (for the Stats screen).
  const mainTour: TourId = c.status === 'amateur' ? 'amateur' : c.tourCard === 'lpga' ? 'lpga' : c.tourCard === 'epson' ? 'epson' : 'mini';
  const rank =
    mainTour === 'amateur'
      ? (() => {
          const i = pointsList(c, 1000).findIndex((p) => p.id === c.playerId);
          return i >= 0 ? i + 1 : null;
        })()
      : moneyRank(c, mainTour);
  const allTime = ryanRank(c);
  const prevAllTime = [...(c.seasonLog ?? [])].reverse().find((l) => l.allTimeRank)?.allTimeRank ?? null;
  c.seasonLog = [...(c.seasonLog ?? []), { season: c.season, age: c.age, status: c.status, tour: mainTour, rank, fame: c.fame, allTimeRank: allTime }];
  if (allTime) {
    const move = prevAllTime ? prevAllTime - allTime : null;
    lines.push(`All-time money list: #${allTime}${move ? ` (${move > 0 ? '▲' : '▼'}${Math.abs(move)})` : prevAllTime ? ' (no change)' : ' (new entry!)'}.`);
  }

  // Off-season reset.
  c.season += 1;
  c.week = 1;
  c.age += 1;
  c.energy = 100;
  c.form = 0;
  c.actionsUsed = 0;
  c.entered = [];
  c.seasonPoints = {};
  c.seasonEarnings = {};
  c.pendingStory = null;
  c.qschool = { season: c.season, nextStage: c.status === 'pro' && c.tourCard !== 'lpga' ? 1 : null, result: null };
  c.skillPoints += 2;
  inbox(c, `Season ${c.season} begins`, lines.join(' ') || 'A fresh season. Same dream.', 'good');
  return c;
}

// ───────────────────────── Albatross news ─────────────────────────

const ordinalHole = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;

/** Inbox stories for every albatross in a finished event, read from the final hole scores. */
function albatrossNews(c: CareerState, r: TournamentResult) {
  const course = resultCourse(r);
  const names = new Map(r.entrants.map((e) => [e.id, e.name]));
  // Totals already include this event: count Ryan's up from where she started it.
  const mine = (r.scores[r.playerId] ?? []).flat().filter((s, i) => isAlbatross(r.pars[i % r.pars.length], s)).length;
  let n = (c.totals.albatrosses ?? 0) - mine;
  for (const [golferId, rounds] of Object.entries(r.scores)) {
    rounds.forEach((holes, ri) => {
      holes.forEach((s, hi) => {
        if (!isAlbatross(r.pars[hi], s)) return;
        const where = `the par-${r.pars[hi]} ${ordinalHole(hi + 1)} at ${course.name}`;
        if (golferId === r.playerId) {
          n += 1;
          inbox(
            c,
            n === 1 ? `Ryan records her first career albatross at ${course.name}!` : `Albatross #${n} for Ryan`,
            `A ${s} on ${where} in round ${ri + 1} of the ${r.def.name}. It's in the record book for good.`,
            'good',
          );
        } else {
          inbox(c, `Albatross at the ${r.def.name}`, `${names.get(golferId) ?? 'A player'} made a ${s} on ${where} in round ${ri + 1}.`, 'neutral');
        }
      });
    });
  }
}

// ───────────────────────── Achievements ─────────────────────────

export interface AchievementContext {
  homeTier?: number;
}

export function pendingAchievements(c: CareerState, ctx: AchievementContext = {}): string[] {
  const t = c.totals;
  const have = (id: string) => !!c.achievements[id];
  const checks: Record<string, boolean> = {
    first_event: t.events >= 1,
    first_top10: t.top10s >= 1,
    first_cut: t.cutsMade >= 1,
    sub_par_round: Number(c.flags.subParRounds ?? 0) > 0,
    eagle: t.eagles >= 1,
    hole_in_one: t.aces >= 1,
    albatross: (t.albatrosses ?? 0) >= 1,
    albatross_5: (t.albatrosses ?? 0) >= 5,
    first_win: t.wins >= 1,
    turned_pro: c.status === 'pro',
    epson_card: c.tourCard === 'epson' || c.tourCard === 'lpga' || c.qschool.result === 'epson',
    lpga_card: c.tourCard === 'lpga' || c.qschool.result === 'lpga',
    kept_card: c.flags.keptCard === true,
    earnings_100k: t.earnings >= 100_000,
    earnings_1m: t.earnings >= 1_000_000,
    star: fameLevel(c.fame).min >= 65,
    stat_80: STAT_KEYS.some((k) => c.stats[k] >= 80),
    new_home: (ctx.homeTier ?? 1) > 1,
    jackpot: c.flags.casinoJackpot === true,
    high_roller: Number(c.flags.casinoBiggestWin ?? 0) >= 10_000,
  };
  return ACHIEVEMENTS.filter((a) => checks[a.id] && !have(a.id)).map((a) => a.id);
}

export function withAchievements(o: Outcome, ctx: AchievementContext = {}): Outcome {
  const ids = pendingAchievements(o.career, ctx);
  if (!ids.length) return o;
  for (const id of ids) o.career.achievements[id] = now(o.career);
  return { ...o, unlocked: [...(o.unlocked ?? []), ...ids] };
}
