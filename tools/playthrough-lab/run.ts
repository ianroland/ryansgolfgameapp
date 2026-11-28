/**
 * Full-career playthrough bot (developer tool, not part of the game build).
 *
 * Plays real careers through the real services (fake IndexedDB), week by week, the way a
 * reasonable player would: train the weakest skill, rest when tired, work when broke, enter
 * every event Ryan is eligible for (simulated rounds), play every scene (a choice policy per
 * run), visit the casino and sit at a dealer's table, accept the VIP invitation, play skins and
 * poker, and Rytire once the story is done. Records a timeline and pacing metrics.
 *
 * Run:  npx vite-node tools/playthrough-lab/run.ts [careers] [maxSeasons]
 * Writes playthrough-lab-output/report.json and prints a summary.
 */
import 'fake-indexeddb/auto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { decide, viewFor } from '../../src/casino/poker/ai';
import { legal } from '../../src/casino/poker/holdem';
import * as engine from '../../src/career/engine';
import { playerRating } from '../../src/career/stats';
import { seasonSchedule } from '../../src/career/tournament';
import type { CareerState, StatKey } from '../../src/career/types';
import { PLAYER_ID } from '../../src/core/ids';
import { createServices, type GameServices } from '../../src/services';
import { HERO } from '../../src/services/pokerService';
import { storyOf } from '../../src/story/appearance';
import { encounterById, type EncounterDef } from '../../src/story/encounters';
import { seededInt } from '../../src/casino/random';
import { MUNI_PROJECTS } from '../../src/career/shop';
import { relationshipOf, tierIdOf } from '../../src/npc/relationship';
import { nightsAt } from '../../src/npc/vip';

type Policy = 'first' | 'last' | 'mixed';

interface Event { season: number; week: number; what: string }
interface Run {
  seed: number;
  policy: Policy;
  events: Event[];
  scenes: { id: string; season: number; week: number; act: number }[];
  actStart: Record<number, string>;
  seasons: { season: number; tour: string; events: number; wins: number; top10: number; earnings: number; endBalance: number; minBalance: number; rating: number; qschool: string | null; casinoNet: number }[];
  weeksTired: number;
  weeksBroke: number;
  errors: string[];
  stuck: string[];
  vipWeek: string | null;
  skins: { buyIn: number; payout: number }[];
  poker: { bought: number; cashOut: number; hands: number }[];
  storyCompleteAt: string | null;
  rytiredAt: string | null;
  finalRating: number;
  totalWeeks: number;
  casinoNights: number;
  dealer: { relationship: number; tier: string; nights: number } | null;
}

const at = (c: CareerState) => `S${c.season}W${c.week}`;

/** A path through an encounter, choosing by policy; challenges are won half the time. */
function pathFor(def: EncounterDef, policy: Policy, r: () => number): string[] {
  const path: string[] = [];
  let id = def.start;
  for (let g = 0; g < 50; g++) {
    const node = def.nodes[id];
    if (!node || 'outcome' in node) break;
    if ('next' in node) { id = node.next; continue; }
    if ('choice' in node) {
      const opts = node.choice.options;
      const pick = policy === 'first' ? opts[0] : policy === 'last' ? opts[opts.length - 1] : opts[Math.floor(r() * opts.length)];
      path.push(pick.id);
      id = pick.next;
    } else {
      const win = r() < 0.5;
      path.push(win ? 'win' : 'lose');
      id = win ? node.win : node.lose;
    }
  }
  return path;
}

async function playScene(s: GameServices, run: Run, c: CareerState, policy: Policy, r: () => number) {
  const id = storyOf(c).available;
  if (!id) return false;
  const def = encounterById(id);
  if (!def) { run.errors.push(`${at(c)} unknown encounter ${id}`); return false; }
  const block = engine.encounterBlocker(c, id, pathFor(def, policy, r), await s.economy.getBalance(PLAYER_ID));
  if (block && /money|afford|\$/i.test(block)) {
    // A stake Ryan can't afford: take the cheapest path (first options with no stake).
    const cheap = pathFor(def, 'first', r);
    try { await s.career.resolveEncounter(id, cheap); } catch (e) { run.errors.push(`${at(c)} ${id}: ${(e as Error).message}`); return false; }
  } else {
    try { await s.career.resolveEncounter(id, pathFor(def, policy, r)); } catch (e) {
      try { await s.career.resolveEncounter(id, pathFor(def, 'first', r)); } catch (e2) { run.errors.push(`${at(c)} ${id}: ${(e2 as Error).message}`); return false; }
    }
  }
  run.scenes.push({ id, season: c.season, week: c.week, act: storyOf(c).act });
  return true;
}

const TRAIN: StatKey[] = ['power', 'accuracy', 'shortGame', 'putting'];

async function playCareer(seed: number, policy: Policy, maxSeasons: number): Promise<Run> {
  const s = createServices(`lab-${seed}-${policy}-${Date.now()}`);
  await s.career.ensureCareer(PLAYER_ID, seed);
  const rand = seededInt(seed);
  const r = () => rand(1_000_000) / 1_000_000;
  const run: Run = {
    seed, policy, events: [], scenes: [], actStart: { 1: 'S1W1' }, seasons: [], weeksTired: 0, weeksBroke: 0, errors: [], stuck: [],
    vipWeek: null, skins: [], poker: [], storyCompleteAt: null, rytiredAt: null, finalRating: 0, totalWeeks: 0, casinoNights: 0, dealer: null,
  };
  let lastAvailable = '';
  let availableSince = 0;
  let season = 1;
  let seasonStats = { events: 0, wins: 0, top10: 0, earnings: 0, minBalance: Infinity, start: 0 };
  let lastAct = 1;
  let weeks = 0;

  for (let guard = 0; guard < maxSeasons * 40; guard++) {
    let c = await s.career.getCareer();
    if (c.season > maxSeasons) break;
    weeks++;
    const bal0 = await s.economy.getBalance(PLAYER_ID);
    if (c.season !== season) {
      run.seasons.push({ season, tour: c.tourCard ?? c.status, ...seasonStats, endBalance: bal0, rating: Math.round(playerRating(c)), qschool: c.qschool.result, casinoNet: engine.casinoNet(c) });
      season = c.season;
      seasonStats = { events: 0, wins: 0, top10: 0, earnings: 0, minBalance: Infinity, start: 0 };
    }
    seasonStats.minBalance = Math.min(seasonStats.minBalance, bal0);
    if (bal0 < 300) run.weeksBroke++;

    // Old-style story events, then scenes (a couple can stack up).
    for (let k = 0; k < 3 && c.pendingStory; k++) { await answerStory(s, run, c); c = await s.career.getCareer(); }
    for (let k = 0; k < 3; k++) {
      c = await s.career.getCareer();
      if (!storyOf(c).available) break;
      if (!(await playScene(s, run, c, policy, r))) break;
    }
    c = await s.career.getCareer();
    const st = storyOf(c);
    if (st.act !== lastAct) { run.actStart[st.act] = at(c); lastAct = st.act; }
    if (st.available) {
      if (st.available !== lastAvailable) { lastAvailable = st.available; availableSince = weeks; }
      else if (weeks - availableSince > 6) run.stuck.push(`${at(c)} ${st.available} waiting ${weeks - availableSince} weeks`);
    }
    if (c.flags.storyComplete && !run.storyCompleteAt) run.storyCompleteAt = at(c);

    // Rytire once the story is done (the bot's choice).
    if (c.flags.storyComplete && !engine.isRytired(c)) {
      try { await s.career.rytire(); run.rytiredAt = at(c); run.events.push({ season: c.season, week: c.week, what: 'Rytired' }); } catch { /* keep playing */ }
      c = await s.career.getCareer();
    }
    if (engine.isRytired(c)) { try { await s.career.recordMuniRound([4, 4, 3, 5, 4, 4, 3, 5, 4]); } catch { /* */ } break; }

    // Late-game money: fund the muni when there's plenty to spare.
    for (const p of MUNI_PROJECTS) {
      if (c.owned.includes(p.id) || c.fame < p.minFame) continue;
      if ((await s.economy.getBalance(PLAYER_ID)) > p.price * 2) {
        try { await s.career.buyLifestyle(p.id); run.events.push({ season: c.season, week: c.week, what: `Funded ${p.name}` }); } catch { /* */ }
      }
    }
    c = await s.career.getCareer();

    // Skill points on the weakest stat.
    for (let k = 0; k < 20 && c.skillPoints > 0; k++) {
      const weakest = (Object.keys(c.stats) as StatKey[]).sort((a, b) => c.stats[a] - c.stats[b])[0];
      try { await s.career.spendSkillPoint(weakest); } catch { break; }
      c = await s.career.getCareer();
    }

    // Turn pro once good enough for the mini tour, before Q-School.
    if (c.status === 'amateur' && (playerRating(c) >= 44 || c.season >= 2)) {
      try { await s.career.turnPro(); run.events.push({ season: c.season, week: c.week, what: `Turned pro (rating ${Math.round(playerRating(c))})` }); } catch { /* */ }
      c = await s.career.getCareer();
    }

    // A tournament this week, if eligible.
    const bal = await s.economy.getBalance(PLAYER_ID);
    // Save for Q-School: skip paid mini-tour events that would leave less than the First Stage fee.
    const saving = c.status === 'pro' && (c.tourCard === 'none' || !c.tourCard) && c.qschool.nextStage === 1 && c.week < 20;
    // The best tour Ryan can play this week (a real player picks the Epson event over the mini tour).
    const RANK: Record<string, number> = { lpga: 5, qschool: 4, epson: 3, mini: 2, amateur: 1 };
    const ev = seasonSchedule(c.season).filter((t) => t.week === c.week && !engine.entryBlocker(c, t, bal)
      && !(saving && t.tour === 'mini' && bal - engine.tournamentCosts(t, c).total < 2600))
      .sort((a, b) => RANK[b.tour] - RANK[a.tour])[0];
    if (ev && c.energy >= 30) {
      try {
        await s.career.enterTournament(ev.id, 'sim');
        for (let g = 0; g < 10; g++) {
          const cc = await s.career.getCareer();
          if (!cc.active) break;
          if (storyOf(cc).available && encounterById(storyOf(cc).available!)?.during) await playScene(s, run, cc, policy, r);
          await s.career.finishRound();
        }
        const done = await s.career.getCareer();
        const res = done.recent[0];
        if (res) {
          seasonStats.events++;
          const pos = Number(res.posLabel.replace('T', ''));
          if (res.posLabel === '1') { seasonStats.wins++; run.events.push({ season: c.season, week: c.week, what: `WON ${res.name} (${res.tour})` }); }
          if (pos && pos <= 10) seasonStats.top10++;
          seasonStats.earnings += res.prize;
        }
        if (ev.tour === 'qschool') run.events.push({ season: c.season, week: c.week, what: `Q-School stage ${ev.qStage}: ${res?.posLabel} → ${done.qschool.result ?? `next ${done.qschool.nextStage}`}` });
      } catch (e) { run.errors.push(`${at(c)} tournament ${ev.id}: ${(e as Error).message}`); }
      c = await s.career.getCareer();
    } else if (ev) run.weeksTired++;

    // Story scenes offered right after an event.
    c = await s.career.getCareer();
    if (storyOf(c).available) await playScene(s, run, c, policy, r);

    // The week's activities.
    c = await s.career.getCareer();
    const casinoWeek = c.week % 3 === 0 && (await s.economy.getBalance(PLAYER_ID)) > 2500;
    let casinoDone = false;
    for (let a = 0; a < 3; a++) {
      c = await s.career.getCareer();
      if (c.actionsUsed >= 3 || c.active) break;
      const money = await s.economy.getBalance(PLAYER_ID);
      try {
        if (casinoWeek && !casinoDone) {
          casinoDone = true;
          await s.casino.visit();
          run.casinoNights++;
          await casinoNight(s, run, c);
          continue;
        }
        if (c.energy < 40) await s.career.doAction('rest');
        else if (money < 1500 || (c.status === 'pro' && (c.tourCard === 'none' || !c.tourCard) && c.qschool.nextStage === 1 && c.week >= 6 && c.week < 20 && money < 3500)) await s.career.doAction('job');
        else {
          const weakest = TRAIN.sort((x, y) => c.stats[x] - c.stats[y])[0];
          await s.career.doAction(`train_${weakest}` as engine.ActionId);
        }
      } catch (e) {
        try { await s.career.doAction('rest'); } catch { /* no time left */ }
      }
    }

    try { await s.career.advanceWeek(); } catch (e) {
      // A scene or event may need answering first.
      c = await s.career.getCareer();
      if (c.pendingStory) await answerStory(s, run, c);
      if (storyOf(c).available) await playScene(s, run, c, policy, r);
      try { await s.career.advanceWeek(); } catch (e2) { run.errors.push(`${at(c)} advanceWeek: ${(e2 as Error).message}`); run.stuck.push(`${at(c)} could not advance`); break; }
    }
  }
  const c = await s.career.getCareer();
  const w = (await s.npc.states()).find((x) => x.npcId === 'winston');
  if (w) run.dealer = { relationship: Math.round(relationshipOf(w)), tier: tierIdOf(w), nights: nightsAt(w, 'desert_palms') };
  run.finalRating = Math.round(playerRating(c));
  run.totalWeeks = weeks;
  s.db.close();
  return run;
}

/** Old-style weekly story events: the first choice Ryan can afford. */
async function answerStory(s: GameServices, run: Run, c: CareerState) {
  for (let i = 0; i < 4; i++) {
    try { await s.career.resolveStory(i); return; } catch { /* try the next choice */ }
  }
  run.errors.push(`${at(c)} story ${c.pendingStory?.id}: no choice possible`);
}

/** A casino night: sit at a dealer's table (tip a little), accept an invitation, play the VIP rooms. */
async function casinoNight(s: GameServices, run: Run, c: CareerState) {
  try {
    await s.npc.visit('winston');
    await s.npc.tip('winston', 25, `tip-${c.season}-${c.week}`);
  } catch { /* */ }
  const loc = 'desert_palms';
  const v = await s.poker.vipStatus(loc);
  if (!v.unlocked && v.inviter) {
    await s.poker.acceptInvite(loc);
    run.vipWeek = at(c);
    run.events.push({ season: c.season, week: c.week, what: `VIP invitation from ${v.inviter}` });
  }
  if (!(await s.poker.vipStatus(loc)).unlocked) return;
  // Skins, if we can.
  try {
    const m = await s.poker.skinsStart();
    let out = await s.poker.skinsPlay('normal');
    while (out.payout === null) out = await s.poker.skinsPlay('normal');
    run.skins.push({ buyIn: m.stake * 9, payout: out.payout });
  } catch { /* can't tee off this week */ }
  // Thirty hands of poker, Ryan playing like an average regular.
  try {
    const bal = await s.economy.getBalance(PLAYER_ID);
    if (bal < 1500) return;
    let t = await s.poker.sit(500, { runTwice: true, sevenDeuce: 10 });
    const r = seededInt(c.season * 100 + c.week);
    let hands = 0;
    for (; hands < 12; hands++) {
      let g = 0;
      while (!t.state.result && g++ < 40) {
        if (t.state.awaitRunout) { const o = await s.poker.runout(true); t = { ...o.table, frames: o.frames }; continue; }
        const a = decide(viewFor(t.state, HERO), { tight: 0.55, aggro: 0.5, bluff: 0.15 }, r);
        const L = legal(t.state, HERO);
        t = await s.poker.act(a.type === 'raise' && !L.maxTo ? (L.toCall ? { type: 'call' } : { type: 'check' }) : a);
      }
      if (t.state.seats[HERO].stack <= 0) break;
      t = await s.poker.nextHand();
    }
    const out = await s.poker.leave();
    run.poker.push({ bought: out.bought, cashOut: out.cashOut, hands });
  } catch (e) { run.errors.push(`${at(c)} poker: ${(e as Error).message}`); try { await s.poker.leave(); } catch { /* */ } }
}

export async function main(args: string[] = process.argv.slice(2)) {
  const careers = Number(args[0] ?? 4);
  const maxSeasons = Number(args[1] ?? 10);
  const policies: Policy[] = ['first', 'mixed', 'last', 'mixed'];
  const runs: Run[] = [];
  for (let i = 0; i < careers; i++) {
    const t0 = Date.now();
    const run = await playCareer(2027 + i * 17, policies[i % policies.length], maxSeasons);
    runs.push(run);
    console.log(`career ${i + 1}/${careers} seed ${run.seed} (${run.policy}): ${run.totalWeeks} weeks, acts ${JSON.stringify(run.actStart)}, story ${run.storyCompleteAt ?? '—'}, VIP ${run.vipWeek ?? '—'} (nights ${run.casinoNights}, dealer ${JSON.stringify(run.dealer)}), errors ${run.errors.length}, stuck ${run.stuck.length} (${Math.round((Date.now() - t0) / 1000)}s)`);
  }
  mkdirSync('playthrough-lab-output', { recursive: true });
  writeFileSync('playthrough-lab-output/report.json', JSON.stringify(runs, null, 1));
  return runs;
}

void main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
