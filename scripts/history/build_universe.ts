/**
 * Builds the shared starting point of the living universe (Phase D part 3):
 *   src/sports/data/universe2027.json
 * Every active player entering 2027 (rostered and reserves) with ability, attributes and a
 * development profile; career records through 2026; pending Hall of Fame classes; the record
 * books; championship years; the name pool; and the retirement tables. Read-only inputs:
 * players.json, seasons.json, careers.json, honors.json, forward.json, live2027.json.
 * Run after build_careers.ts and build_forward.ts:  npx vite-node scripts/history/build_universe.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { leagueById, type LeagueId } from '../../src/sports/demo';
import type { HistoryData } from '../../src/sports/history/data';
import { compositionOf, freeSeason, LEAGUE_IDS, LIVE_YEAR, mergeForward, retirementHazard, type ForwardData, CARRY } from '../../src/sports/history/forward';
import { awardBonus, keep, SEASON_STATS, seasonValue, type RecordEntry } from '../../src/sports/history/honors';
import { attrsFor, HISTORY_SEED, level, offsetOf } from '../../src/sports/history/rosters';
import { seasonStats, type StatLine } from '../../src/sports/history/stats';
import { unpackLive } from '../../src/sports/liveRosters';
import { DEFAULT_ENGINE_POS, devKindFor, peakFor, type HofPending, type UCareer, type UniverseSeed, type UPlayer, type UState } from '../../src/sports/universe/model';

const read = (f: string) => JSON.parse(readFileSync(f, 'utf8'));
const data: HistoryData = { players: read('src/sports/history/data/players.json').players, seasons: read('src/sports/history/data/seasons.json').seasons };
const honors = read('src/sports/history/data/honors.json');
const careersCanon: Record<string, { n: number; r: StatLine }> = read('src/sports/history/data/careers.json').careers;
const fwd: ForwardData & { honors2026: { awards: { award: string; playerId: string }[]; records: RecordEntry[] } } = read('src/sports/history/data/forward.json');
const live = unpackLive(read('src/sports/data/live2027.json'));
const merged = mergeForward(data, fwd);
const byId = new Map(merged.players.map((p) => [p.i, p]));
const [o26, o27] = fwd.offseasons;

// 2026 lines and titles.
const lines2026 = new Map<string, { team: string; r: StatLine }>();
const champ2026 = new Map<LeagueId, string>();
for (const s of fwd.seasons) {
  champ2026.set(s.league, s.champion);
  for (const p of seasonStats(merged, freeSeason(merged, s)).players) lines2026.set(p.playerId, { team: p.teamId, r: p.regular });
}
const played = (l?: StatLine) => !!l && Object.values(l).some((v) => v > 0);

// Careers through 2026: canon value parts (honors.activeCareerValues) + 2026.
function careerOf(id: string): UCareer {
  const p = byId.get(id)!;
  const sport = leagueById(p.l).sport;
  const [v, n, ti, bo] = (honors.activeCareerValues[id] as [number, number, number, number] | undefined) ?? [0, 0, 0, 0];
  const tot: StatLine = {};
  for (const [stat] of SEASON_STATS[sport]) if (careersCanon[id]?.r[stat]) tot[stat] = careersCanon[id].r[stat];
  const c: UCareer = { n, ti, v, bo, tot };
  const l26 = lines2026.get(id);
  if (l26 && played(l26.r)) {
    c.n += 1;
    c.v = Math.round((c.v + seasonValue(sport, l26.r)) * 10) / 10;
    if (champ2026.get(p.l) === l26.team) c.ti += 1;
    for (const [stat] of SEASON_STATS[sport]) if (l26.r[stat]) c.tot[stat] = (c.tot[stat] ?? 0) + l26.r[stat];
  }
  c.bo += fwd.honors2026.awards.filter((a) => a.playerId === id).reduce((s, a) => s + awardBonus(a.award), 0);
  return c;
}
const score = (c: UCareer) => Math.round((c.v + c.bo + 5 * c.ti) * 10) / 10;

// Active players entering 2027.
const offset = (l: LeagueId, team: string) => CARRY * offsetOf(leagueById(l).sport, fwd.seasons.find((s) => s.league === l)!.records[team]);
const liveById = new Map(live.map((p) => [p.id, p]));
const players: UPlayer[] = [];
const careers: Record<string, UCareer> = {};
for (const l of LEAGUE_IDS) {
  const sport = leagueById(l).sport;
  for (const [team, ids] of Object.entries(o27.rosters[l])) for (const id of ids) {
    const hp = byId.get(id)!;
    const lp = liveById.get(id)!;
    const L = level(sport, hp, LIVE_YEAR, offset(l, team)); // full precision: depth charts match v0.19.7 exactly
    players.push({ i: id, n: hp.n, l, p: hp.p, b: hp.b, d: hp.d, t: team, r: 0, pk: peakFor(HISTORY_SEED, sport, id), k: devKindFor(HISTORY_SEED, id), L, L0: L, e: lp.pos, a0: Object.values(lp.attrs), dL: 0 });
  }
}
for (const id of o27.reserves) {
  const hp = byId.get(id)!;
  const sport = leagueById(hp.l).sport;
  const team = hp.s.at(-1)![0];
  const L = level(sport, hp, LIVE_YEAR, offset(hp.l, team));
  const e = DEFAULT_ENGINE_POS[sport][hp.p];
  players.push({ i: id, n: hp.n, l: hp.l, p: hp.p, b: hp.b, d: hp.d, t: team, r: 1, pk: peakFor(HISTORY_SEED, sport, id), k: devKindFor(HISTORY_SEED, id), L, L0: L, e, a0: Object.values(attrsFor(sport, e, L, id, LIVE_YEAR)), dL: 0 });
}
players.sort((a, b) => a.i.localeCompare(b.i));
for (const p of players) careers[p.i] = careerOf(p.i);

// Hall of Fame: the canon class of 2027, then classes decided by the 2026 and 2027 retirements.
const threshold: Record<LeagueId, number> = honors.hallOfFameThreshold;
const name = (id: string) => byId.get(id)!.n;
const hof2027 = honors.hallOfFameFuture.filter((x: { year: number }) => x.year === 2027).map((x: { playerId: string; league: LeagueId; score: number }) => ({ i: x.playerId, n: name(x.playerId), l: x.league, sc: x.score }));
const pending: HofPending[] = honors.hallOfFameFuture.filter((x: { year: number }) => x.year > 2027).map((x: { playerId: string; league: LeagueId; year: number; score: number; seasons: number }) => ({ i: x.playerId, n: name(x.playerId), l: x.league, y: x.year, f: x.year - 5, s: x.seasons, sc: x.score }));
for (const [ids, f] of [[o26.retired, 2025], [o27.retired, 2026]] as const) {
  for (const id of ids) {
    const c = f === 2025 ? (() => { const [v, n, ti, bo] = honors.activeCareerValues[id] ?? [0, 0, 0, 0]; return { n, ti, v, bo, tot: {} }; })() : careerOf(id);
    const l = byId.get(id)!.l;
    if (c.n >= 8 && score(c) >= threshold[l]) pending.push({ i: id, n: name(id), l, y: f + 5, f, s: c.n, sc: score(c) });
  }
}
pending.sort((a, b) => a.y - b.y || a.i.localeCompare(b.i));

// Record books: canon top 5 plus 2026 (career entries replaced by each player's latest total).
const group = (xs: RecordEntry[], unique = false) => {
  const m = new Map<string, RecordEntry[]>();
  let all = xs;
  if (unique) {
    const best = new Map<string, RecordEntry>();
    for (const r of xs) { const k = `${r.league}:${r.stat}:${r.playerId}`; if (!best.has(k) || best.get(k)!.value < r.value) best.set(k, r); }
    all = [...best.values()];
  }
  for (const r of all) m.set(`${r.league}:${r.stat}`, [...(m.get(`${r.league}:${r.stat}`) ?? []), r]);
  return [...m.keys()].sort().flatMap((k) => keep(m.get(k)!, 5));
};
const strip = ({ verdict: _v, previous: _p, ...r }: RecordEntry & { verdict?: string; previous?: number }) => r as RecordEntry;
const marks = fwd.honors2026.records.map(strip);
const career2026: RecordEntry[] = [];
for (const p of players) {
  const sport = leagueById(p.l).sport;
  for (const [stat, label] of SEASON_STATS[sport]) if (careers[p.i].tot[stat]) career2026.push({ kind: 'career', league: p.l, stat, label: label.replace('in a season', 'career'), value: careers[p.i].tot[stat], playerId: p.i, seasons: [p.d, 2026] });
}
const teamCanon = honors.records.team.filter((r: RecordEntry) => r.stat === 'streak' || r.stat === 'wins');
const book = {
  game: group([...honors.records.game, ...marks.filter((r) => r.kind === 'game')]),
  season: group([...honors.records.season, ...marks.filter((r) => r.kind === 'season')]),
  career: group([...honors.records.career, ...career2026], true),
  team: group([...teamCanon, ...marks.filter((r) => r.kind === 'team')]),
};
const titles: Record<string, number[]> = {};
for (const s of [...data.seasons, ...fwd.seasons]) titles[s.champion] = [...(titles[s.champion] ?? []), s.year].sort((a, b) => a - b);

const start: UState = { v: 1, year: LIVE_YEAR, players, rosters: o27.rosters, careers, pending, book, titles, names: [] };
const canonNames = [...new Set(merged.players.map((p) => p.n))].sort();
const first = new Set<string>();
const last = new Set<string>();
for (const n of canonNames) { const i = n.indexOf(' '); first.add(n.slice(0, i)); last.add(n.slice(i + 1)); }
const hz = retirementHazard(data);
const seed: UniverseSeed = {
  note: 'Generated by scripts/history/build_universe.ts. The shared 2027 starting point of every save\'s living sports universe (Phase D part 3). Proposed/generated, not verified history.',
  start,
  canonNames,
  vocab: { first: [...first].sort(), last: [...last].sort() },
  debutAges: Object.fromEntries(LEAGUE_IDS.map((l) => [l, data.players.filter((p) => p.l === l && p.d > 1980 && p.d <= 2025).map((p) => p.d - p.b).sort((a, b) => a - b)])) as Record<LeagueId, number[]>,
  hazard: Object.fromEntries(LEAGUE_IDS.map((l) => [l, [...hz[l]].map(([a, h]) => [a, Math.round(h * 10000) / 10000])])) as Record<LeagueId, [number, number][]>,
  composition: Object.fromEntries(LEAGUE_IDS.map((l) => [l, compositionOf(data, l)])) as Record<LeagueId, Record<string, number>>,
  threshold,
  hof2027,
};
writeFileSync('src/sports/data/universe2027.json', `${JSON.stringify(seed)}\n`);
console.log(`players ${players.length} (reserves ${players.filter((p) => p.r).length}) · pending HoF ${pending.length} (${pending.map((p) => p.y).join(',')}) · class 2027 ${hof2027.length} · names ${canonNames.length} · ${(JSON.stringify(seed).length / 1024).toFixed(0)} KB`);
