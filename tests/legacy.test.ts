/**
 * Career Legacy V1 — milestones, the Pink Jacket, timeline, save safety.
 *
 * Rule tests use controlled EventLine fixtures (the shape careerStats derives
 * from sealed results). Pipeline tests play real tournaments through the real
 * services (careerHelpers.playTournament), so every award comes from an
 * authoritative, checksum-sealed result.
 */
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EventLine } from '../src/career/careerStats';
import { DESERT_ROSE, desertRoseSeason, isDesertRose, TOP_TOUR_MAJOR_WEEKS } from '../src/career/championships';
import { gameDate, SCHEDULES } from '../src/career/config';
import { evaluateLegacy, isLegacyWin, LEGACY_MILESTONES, pinkJackets } from '../src/career/legacy';
import { findTournament } from '../src/career/tournament';
import type { CareerState } from '../src/career/types';
import { trophyInstanceId, trophyLook } from '../src/catalog/trophies';
import { checksum } from '../src/core/checksum';
import type { TrophyInstance } from '../src/core/types';
import { isVerifiedRecord } from '../src/records/albatross';
import { storyOf } from '../src/story/appearance';
import type { GameNotification } from '../src/services/notifier';
import { buildTournamentEvent } from '../src/services/tournamentPipeline';
import { playTournament, setCareer, topUp } from './careerHelpers';
import { newCareer, reload, RYAN } from './helpers';

// ───────────────────────── fixtures ─────────────────────────

let seq = 0;
/** One finished event in Ryan's verified history (controlled fixture). */
function ev(tour: EventLine['tour'], season: number, week: number, pos = 1, o: Partial<EventLine> = {}): EventLine {
  const special = tour === 'lpga' ? TOP_TOUR_MAJOR_WEEKS.includes(week) : false;
  return {
    tournamentId: tour === 'qschool' ? `qschool-${season}-s${week}` : `${tour}-${season}-w${week}`,
    name: `${tour} ${season}/${week} #${++seq}`,
    tour, special, season, week,
    position: pos, posLabel: pos === 1 ? '1' : `${pos}`, madeCut: true, hadCut: true,
    rounds: [70, 70], holes: [], pars: [], toPar: -4, prize: 0, fieldSize: 30,
    course: 'x', courseId: 'x', playoff: false,
    ...o,
  };
}
/** Every Desert Rose win in the fixture is a Pink Jacket (won in phase 3) unless a test says otherwise. */
const allJackets = (h: EventLine[]) => new Set(h.filter((e) => isDesertRose(e.tour, e.week)).map((e) => e.tournamentId));
const ids = (h: EventLine[], log: { season: number }[] = [], fame = 0, j = allJackets(h)) => evaluateLegacy(h, log, fame, j).map((e) => e.id);
const at = (h: EventLine[], id: string, log: { season: number }[] = [], fame = 0, j = allJackets(h)) => evaluateLegacy(h, log, fame, j).find((e) => e.id === id);
const L = (x: string) => `legacy_${x}`;
const [W6, W12, W18, W24] = TOP_TOUR_MAJOR_WEEKS;

// ───────────────────────── the championship ─────────────────────────

describe('The Desert Rose Invitational (renamed week-6 major)', () => {
  it('is the same slot: top-tour week 6, the first of four majors, same course and definition', () => {
    expect(TOP_TOUR_MAJOR_WEEKS).toEqual([6, 12, 18, 24]);
    const e = SCHEDULES.lpga.find((x) => x.week === 6)!;
    expect(e.name).toBe('The Desert Rose Invitational');
    expect(e.special).toBe(true);
    const def = findTournament('lpga-3-w6')!;
    expect(def.name).toBe(DESERT_ROSE.name);
    expect(def.id).toBe('lpga-3-w6');
    expect(SCHEDULES.lpga.filter((x) => x.special)).toHaveLength(4); // no fifth major
    // The other three majors keep their names.
    expect(SCHEDULES.lpga.filter((x) => x.special).map((x) => [x.week, x.name])).toEqual([
      [6, 'The Desert Rose Invitational'], [12, "Women's Championship of the Americas"], [18, "Women's Open Championship"], [24, 'Evian-style Alpine Major'],
    ]);
    expect(SCHEDULES.lpga.some((x) => x.name === 'The Desert Major')).toBe(false);
  });

  it('is identified by its stable id, never by display name', () => {
    expect(desertRoseSeason('lpga-7-w6')).toBe(7);
    expect(desertRoseSeason('lpga-7-w4')).toBeNull();
    expect(desertRoseSeason('epson-7-w6')).toBeNull();
    expect(isDesertRose('lpga', 6)).toBe(true);
    expect(isDesertRose('lpga', 12)).toBe(false);
  });

  it('a jacket won under the old placeholder name is still a Pink Jacket, its record name untouched', () => {
    const base = { trophyDefinitionId: 'major_win' as const, courseName: 'Desert Palms', metadata: { milestone: 'x', pinkJacket: true } };
    const old = trophyLook({ ...base, sourceTournamentId: 'lpga-1-w6', eventName: 'The Desert Major' });
    expect(old.style).toBe('pink_jacket');
    expect(old.name).toBe('The Pink Jacket');
    expect(old.eventName).toBe('The Desert Rose Invitational (played as The Desert Major)');
    const now = trophyLook({ ...base, sourceTournamentId: 'lpga-2-w6', eventName: 'The Desert Rose Invitational' });
    expect(now.eventName).toBe('The Desert Rose Invitational');
    // Other majors and other wins keep their own look.
    expect(trophyLook({ ...base, sourceTournamentId: 'lpga-2-w12', eventName: 'x' }).style).toBe('major_cup');
    // Won before phase 3 (no stamp): a major trophy, not a Pink Jacket.
    expect(trophyLook({ ...base, metadata: { milestone: 'x' }, sourceTournamentId: 'lpga-2-w6', eventName: 'x' }).style).toBe('major_cup');
    expect(trophyLook({ ...base, trophyDefinitionId: 'lpga_win', sourceTournamentId: 'lpga-2-w4', eventName: 'x' }).style).toBe('lpga_cup');
  });
});

// ───────────────────────── milestone rules ─────────────────────────

describe('milestone eligibility', () => {
  it('first amateur, professional and top-tour wins', () => {
    expect(ids([ev('amateur', 1, 2)])).toEqual([L('first_amateur_win')]);
    expect(ids([ev('mini', 1, 3)])).toEqual([L('first_pro_win')]);
    expect(ids([ev('epson', 1, 3)])).toEqual([L('first_pro_win')]);
    expect(ids([ev('lpga', 1, 2)])).toEqual([L('first_pro_win'), L('first_top_tour_win')]);
  });

  it('only outright wins count: not 2nd, not a tie for first, not a missed cut, not Q-School', () => {
    expect(ids([ev('amateur', 1, 2, 2)])).toEqual([]);
    expect(ids([ev('amateur', 1, 2, 1, { posLabel: 'T1' })])).toEqual([]);
    expect(ids([ev('amateur', 1, 2, 1, { madeCut: false, posLabel: 'MC' })])).toEqual([]);
    expect(ids([ev('qschool', 1, 3)])).toEqual([]);
    // A playoff win is a win.
    expect(isLegacyWin(ev('lpga', 1, 2, 1, { playoff: true }))).toBe(true);
  });

  it('5, 10, 20 and 50 career wins, each at the win that reached it', () => {
    const h: EventLine[] = [];
    for (let i = 0; i < 50; i++) h.push(ev('amateur', 1 + Math.floor(i / 12), 2 + (i % 12) * 2));
    const out = evaluateLegacy(h);
    for (const n of [5, 10, 20, 50]) {
      const e = out.find((x) => x.id === L(`wins_${n}`))!;
      expect(e.tournamentId).toBe(h[n - 1].tournamentId);
    }
    expect(ids(h.slice(0, 4))).not.toContain(L('wins_5'));
    expect(ids(h.slice(0, 49))).not.toContain(L('wins_50'));
  });

  it('first, 3 and 5 majors (top-tour majors only)', () => {
    expect(ids([ev('lpga', 1, W6)])).toContain(L('major_1'));
    expect(ids([ev('amateur', 1, 22, 1, { special: true })])).not.toContain(L('major_1')); // State Amateur isn't a major
    expect(ids([ev('epson', 1, 6)])).not.toContain(L('major_1'));
    const three = [ev('lpga', 1, W6), ev('lpga', 2, W6), ev('lpga', 3, W12)];
    expect(ids(three)).toContain(L('major_3'));
    expect(ids(three)).not.toContain(L('major_5'));
    const five = [...three, ev('lpga', 4, W12), ev('lpga', 5, W18)];
    expect(at(five, L('major_5'))!.tournamentId).toBe('lpga-5-w18');
  });

  it('Career Grand Slam needs all four distinct majors', () => {
    const notYet = [ev('lpga', 1, W6), ev('lpga', 2, W6), ev('lpga', 3, W12), ev('lpga', 4, W18), ev('lpga', 5, W18)];
    expect(ids(notYet)).not.toContain(L('grand_slam'));
    const slam = [...notYet, ev('lpga', 6, W24)];
    expect(at(slam, L('grand_slam'))!.tournamentId).toBe('lpga-6-w24');
    // Order of the four doesn't matter.
    expect(ids([ev('lpga', 1, W24), ev('lpga', 2, W18), ev('lpga', 3, W12), ev('lpga', 4, W6)])).toContain(L('grand_slam'));
  });

  it('two majors in one season; three and five wins in one season', () => {
    expect(ids([ev('lpga', 1, W6), ev('lpga', 2, W12)])).not.toContain(L('majors_season_2'));
    expect(at([ev('lpga', 2, W6), ev('lpga', 2, W12)], L('majors_season_2'))!.tournamentId).toBe('lpga-2-w12');
    const spread = [ev('mini', 1, 3), ev('mini', 1, 5), ev('mini', 2, 3), ev('mini', 2, 5)];
    expect(ids(spread)).not.toContain(L('season_wins_3'));
    const s3 = [ev('mini', 1, 3), ev('mini', 1, 5), ev('mini', 1, 9)];
    expect(at(s3, L('season_wins_3'))!.tournamentId).toBe('mini-1-w9');
    const s5 = [...s3, ev('mini', 1, 11), ev('mini', 1, 13)];
    expect(at(s5, L('season_wins_5'))!.tournamentId).toBe('mini-1-w13');
    expect(ids(s5.slice(0, 4))).not.toContain(L('season_wins_5'));
  });

  it('defending a major needs the same major in consecutive seasons', () => {
    expect(ids([ev('lpga', 1, W12), ev('lpga', 3, W12)])).not.toContain(L('major_defended'));
    expect(ids([ev('lpga', 1, W12), ev('lpga', 2, W18)])).not.toContain(L('major_defended'));
    const d = [ev('lpga', 1, W12), ev('lpga', 2, W12)];
    expect(at(d, L('major_defended'))!.tournamentId).toBe('lpga-2-w12');
    expect(ids(d)).not.toContain(L('pink_jacket_defended'));
  });

  it('the Pink Jacket: first jacket and a successful title defense', () => {
    expect(ids([ev('lpga', 1, W6)])).toEqual([L('first_pro_win'), L('first_top_tour_win'), L('major_1'), L('first_pink_jacket')]);
    const two = [ev('lpga', 1, W6), ev('lpga', 2, W6)];
    expect(at(two, L('pink_jacket_defended'))!.tournamentId).toBe('lpga-2-w6');
    expect(at(two, L('major_defended'))!.tournamentId).toBe('lpga-2-w6');
    expect(ids([ev('lpga', 1, W6), ev('lpga', 3, W6)])).not.toContain(L('pink_jacket_defended'));
    const h = [ev('lpga', 3, W6), ev('lpga', 1, W6), ev('lpga', 2, W6, 4), ev('lpga', 2, W12)];
    expect(pinkJackets(h, allJackets(h)).map((e) => e.season)).toEqual([1, 3]);
  });

  it('the Pink Jacket needs phase 3: a Desert Rose win before then is a major, not a jacket', () => {
    const h = [ev('lpga', 1, W6), ev('lpga', 2, W6)];
    const onlySecond = new Set(['lpga-2-w6']);
    expect(ids(h, [], 0, new Set())).not.toContain(L('first_pink_jacket'));
    expect(ids(h, [], 0, new Set())).toContain(L('major_1'));
    expect(at(h, L('first_pink_jacket'), [], 0, onlySecond)!.tournamentId).toBe('lpga-2-w6');
    // A defense needs two jackets in a row; season 1 was won before phase 3.
    expect(ids(h, [], 0, onlySecond)).not.toContain(L('pink_jacket_defended'));
    expect(ids(h, [], 0, onlySecond)).toContain(L('major_defended'));
  });

  it('5, 10, 15 and 20 completed seasons (from the season-end log)', () => {
    const log = (n: number) => Array.from({ length: n }, (_, i) => ({ season: i + 1 }));
    expect(ids([], log(4))).toEqual([]);
    const s5 = at([], L('seasons_5'), log(5))!;
    expect(s5).toMatchObject({ season: 5, marker: 'End of season 5', at: gameDate(6, 1) });
    expect(ids([], log(20))).toEqual([L('seasons_5'), L('seasons_10'), L('seasons_15'), L('seasons_20')]);
    expect(ids([], [...log(9), { season: 9 }])).not.toContain(L('seasons_10')); // a repeated log entry is one season
  });

  it('wins in both halves of a 20-season career', () => {
    expect(ids([ev('mini', 3, 3), ev('mini', 10, 3)])).not.toContain(L('both_halves'));
    expect(at([ev('mini', 3, 3), ev('mini', 11, 3)], L('both_halves'))!.tournamentId).toBe('mini-11-w3');
    expect(ids([ev('mini', 11, 3), ev('mini', 20, 3)])).not.toContain(L('both_halves'));
  });

  it('Legend is the existing top fame level', () => {
    expect(ids([], [], 84.9)).not.toContain(L('legend'));
    expect(ids([], [], 85)).toContain(L('legend'));
  });

  it('every V1 milestone is defined once; no-missed-cut season is not in V1', () => {
    const all = LEGACY_MILESTONES.map((m) => m.id);
    expect(new Set(all).size).toBe(all.length);
    expect(all.every((id) => id.startsWith('legacy_'))).toBe(true);
    expect(all.some((id) => /cut/.test(id))).toBe(false);
    expect(LEGACY_MILESTONES.filter((m) => m.celebrate === 'full').map((m) => m.id).sort()).toEqual(
      [L('first_pink_jacket'), L('grand_slam'), L('major_1'), L('wins_50')].sort(),
    );
  });
});

describe('timeline chronology and determinism', () => {
  // A 20-season career: a win every season, Desert Rose in 4–5, the slam completed in 12.
  const career20: EventLine[] = [];
  for (let s = 1; s <= 20; s++) career20.push(ev(s <= 2 ? 'amateur' : s <= 3 ? 'mini' : 'lpga', s, 2));
  career20.push(ev('lpga', 4, W6), ev('lpga', 5, W6), ev('lpga', 7, W12), ev('lpga', 9, W18), ev('lpga', 12, W24));
  const log20 = Array.from({ length: 20 }, (_, i) => ({ season: i + 1 }));

  it('each milestone carries the game date of the event that proved it, in order', () => {
    const out = evaluateLegacy(career20, log20, 90, allJackets(career20));
    for (const e of out) if (e.tournamentId) expect(e.at).toBe(gameDate(e.season, e.week));
    const dated = out.filter((e) => e.at).map((e) => e.at);
    expect([...dated].sort()).toEqual(dated);
    expect(out[out.length - 1].id).toBe(L('legend')); // undated recognition goes last
    expect(out.find((e) => e.id === L('grand_slam'))!.tournamentId).toBe('lpga-12-w24');
    expect(out.find((e) => e.id === L('seasons_20'))!.marker).toBe('End of season 20');
  });

  it('the same history gives the same milestones in any order, every time', () => {
    const j = allJackets(career20);
    const a = JSON.stringify(evaluateLegacy(career20, log20, 90, j));
    const shuffled = [...career20].reverse();
    expect(JSON.stringify(evaluateLegacy(shuffled, [...log20].reverse(), 90, j))).toBe(a);
    expect(JSON.stringify(evaluateLegacy(structuredClone(career20), log20, 90, j))).toBe(a);
  });
});

// ───────────────────────── through the real pipeline ─────────────────────────

/** Test setup: a top-tour pro in phase 3 (Act III), the only time the Pink Jacket can be won. */
const topTour = (c: CareerState) => { c.status = 'pro'; c.tourCard = 'lpga'; c.story = { ...storyOf(c), act: 3, hairUnlocked: ['curly', 'bald', 'wig'] }; };
const topTourPhase1 = (c: CareerState) => { c.status = 'pro'; c.tourCard = 'lpga'; };
/** Test setup: a new season (the engine clears the entry list at season end). */
const newSeason = (c: CareerState) => { topTour(c); c.entered = []; };
const legacyKeys = (c: CareerState) => Object.keys(c.achievements).filter((k) => k.startsWith('legacy_')).sort();

async function listen(s: Awaited<ReturnType<typeof newCareer>>['s']) {
  const seen: GameNotification[] = [];
  s.notifier.subscribe((n) => seen.push(n));
  return seen;
}

describe('awarded by the authoritative pipeline', () => {
  it('a real win records the milestone with its game date and announces it after commit', async () => {
    const { s } = await newCareer();
    const seen = await listen(s);
    await playTournament(s, 'amateur-1-w2');
    const c = await s.career.getCareer();
    expect(c.achievements[L('first_amateur_win')]).toBe(gameDate(1, 2));
    const n = seen.filter((x) => x.kind === 'legacy');
    expect(n.map((x) => x.legacy!.id)).toEqual([L('first_amateur_win')]);
    expect(n[0].legacy!.full).toBe(false); // toast + timeline
  });

  it('nothing is awarded from an unfinished (uncommitted) tournament or a losing result', async () => {
    const { s } = await newCareer();
    const seen = await listen(s);
    const def = findTournament('amateur-1-w2')!;
    await setCareer(s, (c) => { c.season = def.season; c.week = def.week; c.pendingStory = null; c.energy = 100; });
    await s.career.enterTournament(def.id, 'full');
    const mid = await s.career.getCareer();
    expect(mid.active).toBeTruthy();
    expect(legacyKeys(mid)).toEqual([]);
    await s.career.withdraw();
    await playTournament(s, 'amateur-1-w5', { score: (p) => p + 3 });
    expect(legacyKeys(await s.career.getCareer())).toEqual([]);
    expect(await s.legacy.reconcile()).toEqual([]);
    expect(seen.filter((x) => x.kind === 'legacy')).toEqual([]);
  });

  it('a record whose seal is broken earns nothing', async () => {
    const { s } = await newCareer();
    await playTournament(s, 'amateur-1-w5', { score: (p) => p + 3 });
    const rec = (await s.db.tournaments.toArray())[0];
    const me = rec.standings.find((x) => x.id === RYAN)!;
    me.position = 1; me.posLabel = '1'; // edited without resealing
    await s.db.tournaments.put(rec);
    expect(isVerifiedRecord(rec)).toBe(false);
    expect(await s.legacy.reconcile()).toEqual([]);
  });

  it('the Pink Jacket: one per championship, a ceremony each time, defense recognized', async () => {
    const { s, dbName } = await newCareer();
    const seen = await listen(s);
    await topUp(s, 50_000, 'legacy-test-funds');
    await playTournament(s, 'lpga-1-w6', { setup: topTour });
    await playTournament(s, 'lpga-2-w6', { setup: newSeason });
    await playTournament(s, 'lpga-2-w12', { setup: topTour });

    const jackets = (await s.db.trophies.toArray()).filter((t) => trophyLook(t).style === 'pink_jacket');
    expect(jackets.map((t) => t.id).sort()).toEqual([trophyInstanceId(RYAN, 'lpga-1-w6'), trophyInstanceId(RYAN, 'lpga-2-w6')]);
    expect(jackets.every((t) => t.trophyDefinitionId === 'major_win')).toBe(true);
    expect(jackets.every((t) => t.eventName === DESERT_ROSE.name)).toBe(true);

    const ceremonies = seen.filter((x) => x.legacy?.kind === 'jacket').map((x) => x.legacy!);
    expect(ceremonies.map((m) => [m.jacketNumber, m.season, m.full])).toEqual([[1, 1, true], [2, 2, true]]);
    const ms = seen.filter((x) => x.legacy?.kind === 'milestone').map((x) => [x.legacy!.id, x.legacy!.full]).sort();
    // The ceremony is the first jacket's celebration; First Major still gets its own full-screen card.
    expect(ms).toEqual([
      [L('first_pro_win'), false], [L('first_top_tour_win'), false], [L('major_1'), true], [L('first_pink_jacket'), false],
      [L('pink_jacket_defended'), false], [L('major_defended'), false],
      [L('majors_season_2'), false], [L('major_3'), false],
    ].sort());

    const c = await s.career.getCareer();
    expect(c.achievements[L('first_pink_jacket')]).toBe(gameDate(1, 6));
    expect(c.achievements[L('pink_jacket_defended')]).toBe(gameDate(2, 6));
    expect(c.achievements[L('major_3')]).toBe(gameDate(2, 12));

    // Survives a reload exactly.
    const s2 = await reload(s, dbName);
    const after = await s2.career.getCareer();
    expect(legacyKeys(after)).toEqual(legacyKeys(c));
    for (const k of legacyKeys(c)) expect(after.achievements[k]).toBe(c.achievements[k]);
    expect((await s2.db.trophies.toArray()).filter((t) => trophyLook(t).style === 'pink_jacket')).toHaveLength(2);
    expect(await s2.legacy.reconcile()).toEqual([]);
    s2.db.close();
  }, 60_000);

  it('a Desert Rose win before phase 3 is a major championship, with no Pink Jacket and no ceremony', async () => {
    const { s } = await newCareer();
    const seen = await listen(s);
    await topUp(s, 50_000, 'legacy-test-funds');
    await playTournament(s, 'lpga-1-w6', { setup: topTourPhase1 });
    const t = await s.db.trophies.get(trophyInstanceId(RYAN, 'lpga-1-w6'));
    expect(t?.trophyDefinitionId).toBe('major_win');
    expect(trophyLook(t!).style).toBe('major_cup');
    expect(seen.some((x) => x.legacy?.kind === 'jacket')).toBe(false);
    const c = await s.career.getCareer();
    expect(c.achievements[L('major_1')]).toBe(gameDate(1, 6));
    expect(c.achievements[L('first_pink_jacket')]).toBeUndefined();
    // Reaching phase 3 later never turns that earlier win into a jacket.
    await setCareer(s, (k) => { k.story = { ...storyOf(k), act: 3 }; });
    expect(await s.legacy.reconcile()).toEqual([]);
  }, 60_000);

  it('reprocessing a result never duplicates a milestone, a jacket or a notification', async () => {
    const { s } = await newCareer();
    await topUp(s, 50_000, 'legacy-test-funds');
    const out = await playTournament(s, 'lpga-1-w6', { setup: topTour });
    const before = await s.career.getCareer();
    const trophiesBefore = await s.db.trophies.count();
    const seen = await listen(s);
    const again = await s.pipeline.process(buildTournamentEvent(out.result!));
    expect(again.status).toBe('duplicate');
    expect(await s.legacy.reconcile()).toEqual([]);
    expect(await s.legacy.reconcile()).toEqual([]);
    const after = await s.career.getCareer();
    expect(after.achievements).toEqual(before.achievements);
    expect(await s.db.trophies.count()).toBe(trophiesBefore);
    expect(seen.filter((x) => x.kind === 'legacy')).toEqual([]);
  }, 60_000);

  it('retroactive recognition: a career from before Career Legacy gets its milestones once, dated when earned, silently', async () => {
    const { s } = await newCareer();
    for (const w of [2, 5, 8, 11, 14]) await playTournament(s, `amateur-1-w${w}`);
    // Make it look like a pre-feature career: strip every legacy milestone.
    await setCareer(s, (c) => { for (const k of legacyKeys(c)) delete c.achievements[k]; });
    const other = Object.entries((await s.career.getCareer()).achievements);
    const seen = await listen(s);
    const got = await s.legacy.reconcile();
    expect(got.sort()).toEqual([L('first_amateur_win'), L('season_wins_3'), L('season_wins_5'), L('wins_5')].sort());
    const c = await s.career.getCareer();
    expect(c.achievements[L('first_amateur_win')]).toBe(gameDate(1, 2));
    expect(c.achievements[L('season_wins_3')]).toBe(gameDate(1, 8));
    expect(c.achievements[L('wins_5')]).toBe(gameDate(1, 14));
    for (const [k, v] of other) expect(c.achievements[k]).toBe(v); // existing achievements intact
    expect(seen).toEqual([]); // no celebrations for history
    expect(await s.legacy.reconcile()).toEqual([]);
  }, 60_000);

  it('season-end and fame milestones are recognized from the season log and fame', async () => {
    const { s } = await newCareer();
    await setCareer(s, (c) => {
      c.seasonLog = Array.from({ length: 5 }, (_, i) => ({ season: i + 1, age: 18 + i, status: c.status, tour: 'amateur' as const, rank: null, fame: 0 })) as CareerState['seasonLog'];
      c.fame = 85;
    });
    expect((await s.legacy.reconcile()).sort()).toEqual([L('legend'), L('seasons_5')]);
    const c = await s.career.getCareer();
    expect(c.achievements[L('seasons_5')]).toBe(gameDate(6, 1));
  });
});

// ───────────────────────── save safety ─────────────────────────

describe('save safety', () => {
  it('export and import keep every milestone, date and jacket; results stay sealed and unchanged', async () => {
    const { s } = await newCareer();
    await topUp(s, 50_000, 'legacy-test-funds');
    await playTournament(s, 'lpga-1-w6', { setup: topTour });
    await playTournament(s, 'lpga-2-w6', { setup: newSeason });
    const file = JSON.parse(JSON.stringify(await s.saves.exportSave()));
    const recordsBefore = await s.db.tournaments.toArray();

    const { s: b } = await newCareer();
    await b.saves.importSave(file);
    expect(await b.legacy.reconcile()).toEqual([]); // nothing new: import never re-awards
    const c = await b.career.getCareer();
    expect(c.achievements).toEqual((await s.career.getCareer()).achievements);
    const jackets = (await b.db.trophies.toArray()).filter((t: TrophyInstance) => trophyLook(t).style === 'pink_jacket');
    expect(jackets).toHaveLength(2);
    const recordsAfter = await b.db.tournaments.toArray();
    expect(recordsAfter).toEqual(recordsBefore);
    for (const r of recordsAfter) {
      expect(isVerifiedRecord(r)).toBe(true);
      const { authority, id: _id, recordedFromCareerEventId: _src, ...content } = r;
      expect(checksum(content)).toBe(authority.checksum);
    }
  }, 60_000);

  it('an import with the milestones stripped is recognized once on import (as the game does after loading)', async () => {
    const { s } = await newCareer();
    for (const w of [2, 5]) await playTournament(s, `amateur-1-w${w}`);
    const file = JSON.parse(JSON.stringify(await s.saves.exportSave()));
    for (const k of Object.keys(file.tables.careers[0].achievements)) if (k.startsWith('legacy_')) delete file.tables.careers[0].achievements[k];
    const { s: b } = await newCareer();
    await b.saves.importSave(file);
    expect(await b.legacy.reconcile()).toEqual([L('first_amateur_win')]);
    expect(await b.legacy.reconcile()).toEqual([]);
  });

  for (const name of ['legacy-old-save-v0.10.0.json', 'legacy-old-save-v1.json']) {
    it(`an existing save (${name}) still loads; its records, trophies and achievements are intact`, async () => {
      const file = JSON.parse(readFileSync(join(__dirname, 'fixtures', name), 'utf8'));
      const { s } = await newCareer();
      await s.saves.importSave(structuredClone(file));
      await s.records.reconcile();
      const got = await s.legacy.reconcile();
      const c = await s.career.getCareer();
      const old = file.tables.careers[0];
      for (const [k, v] of Object.entries(old.achievements)) expect(c.achievements[k]).toBe(v);
      // This save's only event was a T18 finish: no milestones to recognize.
      expect(got).toEqual([]);
      const recs = await s.db.tournaments.toArray();
      expect(recs.map((r) => r.tournamentId)).toEqual(file.tables.tournaments.map((r: { tournamentId: string }) => r.tournamentId));
      expect(recs).toEqual(file.tables.tournaments);
      expect(await s.db.trophies.count()).toBe(file.tables.trophies.length);
    });
  }

  it('a sealed result recorded under the old name "The Desert Major" stays valid and keeps its name', async () => {
    // Recorded by an earlier build (the ace-fix reference run), before the rename. Stored with its table key.
    const result = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'legacy-desert-major-record.json'), 'utf8'));
    const r = { ...result, id: result.tournamentId, recordedFromCareerEventId: `evt:tournament_completed:${result.tournamentId}:${result.playerId}` };
    expect(r.tournamentId).toBe('lpga-1-w6');
    expect(r.def.name).toBe('The Desert Major');
    expect(isVerifiedRecord(r)).toBe(true);
    const { s } = await newCareer();
    const file = JSON.parse(JSON.stringify(await s.saves.exportSave()));
    file.tables.tournaments = [r];
    await s.saves.importSave(file);
    await s.legacy.reconcile();
    const stored = await s.db.tournaments.get('lpga-1-w6');
    expect(stored).toEqual(r);
    expect(isVerifiedRecord(stored!)).toBe(true);
  });
});
