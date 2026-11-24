/**
 * Builds the forward layer (Phase D part 2): the 2026 off-season and season, its honours, and the
 * 2027 rosters the live leagues start from. The 1972-2025 files are read, never written.
 *   src/sports/history/data/forward.json   off-seasons, 2026 seasons, 2026 honours
 *   src/sports/data/live2027.json          2027 live rosters as engine players (compact)
 * Run: npx vite-node scripts/history/build_forward.ts   (tests check both files are current)
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { leagueById } from '../../src/sports/demo';
import type { HistoryData } from '../../src/sports/history/data';
import { buildForward, freeSeason, LEAGUE_IDS, liveRosters2027, mergeForward } from '../../src/sports/history/forward';
import { comebacks, GAME_STATS, SEASON_STATS, seasonHonors, winStreaks, type RecordEntry } from '../../src/sports/history/honors';
import { seasonStats, type StatLine } from '../../src/sports/history/stats';
import { packLive } from '../../src/sports/liveRosters';

const read = (f: string) => JSON.parse(readFileSync(f, 'utf8'));
const data: HistoryData = { players: read('src/sports/history/data/players.json').players, seasons: read('src/sports/history/data/seasons.json').seasons };
const honors = read('src/sports/history/data/honors.json');
const careers = read('src/sports/history/data/careers.json').careers;
const t0 = performance.now();
const fwd = buildForward(data);
const merged = mergeForward(data, fwd);

// 2026 honours and record checks against the 1972-2025 books.
const top = (kind: 'game' | 'season' | 'career', league: string, stat: string): RecordEntry[] => honors.records[kind].filter((r: RecordEntry) => r.league === league && r.stat === stat);
const verdict = (list: RecordEntry[], v: number) => (!list.length ? null : v > list[0].value ? 'new record' : v === list[0].value ? 'ties record' : v > list[list.length - 1].value ? 'top 5' : null);
const awards = [];
const leaders = [];
const marks: (RecordEntry & { verdict: string; previous?: number })[] = [];
const comeback = [];
const champions = [];
const careerAdd = new Map<string, StatLine>();
for (const s of fwd.seasons) {
  const sport = leagueById(s.league).sport;
  const h = freeSeason(merged, s);
  const finalIds = new Set(h.playoffs[2].games.map((g) => g.id));
  const finals = new Map<string, StatLine>();
  const { players } = seasonStats(merged, h, (g, lines) => {
    for (const [pid, l] of lines) {
      if (finalIds.has(g.id)) {
        const f = finals.get(pid) ?? {};
        for (const [k, v] of Object.entries(l)) f[k] = (f[k] ?? 0) + v;
        finals.set(pid, f);
      }
      for (const [stat, label] of GAME_STATS[sport]) {
        const v = l[stat] ?? 0;
        const verdictOf = v > 0 ? verdict(top('game', s.league, stat), v) : null;
        if (verdictOf) marks.push({ kind: 'game', league: s.league, stat, label, value: v, playerId: pid, year: s.year, gameId: g.id, verdict: verdictOf, previous: top('game', s.league, stat)[0].value });
      }
    }
  });
  const hon = seasonHonors(merged, h, players, finals);
  awards.push(...hon.awards);
  leaders.push(...hon.leaders);
  for (const p of players) {
    for (const [stat, label] of SEASON_STATS[sport]) {
      const v = p.regular[stat] ?? 0;
      const vd = v > 0 ? verdict(top('season', s.league, stat), v) : null;
      if (vd) marks.push({ kind: 'season', league: s.league, stat, label, value: v, playerId: p.playerId, teamId: p.teamId, year: s.year, verdict: vd, previous: top('season', s.league, stat)[0].value });
    }
    const c = careerAdd.get(p.playerId) ?? {};
    for (const [k, v] of Object.entries(p.regular)) c[k] = (c[k] ?? 0) + v;
    careerAdd.set(p.playerId, c);
  }
  const streaks = winStreaks(h);
  for (const team of Object.keys(s.records).sort()) {
    for (const [stat, v, label] of [['streak', streaks.get(team) ?? 0, 'Longest winning streak'], ['wins', s.records[team][0], 'Most wins in a season']] as const) {
      const list = honors.records.team.filter((r: RecordEntry) => r.league === s.league && r.stat === stat);
      const vd = verdict(list, v);
      if (vd) marks.push({ kind: 'team', league: s.league, stat, label, value: v, teamId: team, year: s.year, verdict: vd, previous: list[0].value });
    }
  }
  comeback.push(...comebacks(h));
  const titles = data.seasons.filter((x) => x.champion === s.champion).map((x) => x.year).sort((a, b) => a - b);
  champions.push({ league: s.league, champion: s.champion, runnerUp: s.runnerUp, record: s.records[s.champion], seed: s.seeds.indexOf(s.champion) + 1, titlesBefore: titles.length, lastTitle: titles.at(-1) ?? null, attempts: h.attempts });
}
// Career totals through 2026 against the career books.
for (const l of LEAGUE_IDS) {
  const sport = leagueById(l).sport;
  for (const [stat, label] of SEASON_STATS[sport]) {
    const list = top('career', l, stat);
    for (const [pid, add] of careerAdd) {
      if (!pid.startsWith(`${l}_`) || !add[stat]) continue;
      const v = (careers[pid]?.r[stat] ?? 0) + add[stat];
      const vd = verdict(list, v);
      if (vd) marks.push({ kind: 'career', league: l, stat, label: label.replace('in a season', 'career'), value: v, playerId: pid, verdict: vd, previous: list[0]?.value, seasons: [merged.players.find((p) => p.i === pid)!.d, 2026] });
    }
  }
}
const live = liveRosters2027(data, fwd);
const out = {
  ...fwd,
  honors2026: { awards, leaders, champions, records: marks, comebacks: comeback, hallOfFame: honors.hallOfFameNext },
};
writeFileSync('src/sports/history/data/forward.json', `${JSON.stringify(out)}\n`);
mkdirSync('src/sports/data', { recursive: true });
writeFileSync('src/sports/data/live2027.json', `${JSON.stringify(packLive(live))}\n`);
const [o26, o27] = fwd.offseasons;
console.log(`2026: retired ${o26.retired.length} · signed ${o26.signed.length} · returned ${o26.returned.length} · drafted ${o26.draft.length} · reserves ${o26.reserves.length}`);
console.log(`2027: retired ${o27.retired.length} · returned ${o27.returned.length} · drafted ${o27.draft.length} · reserves ${o27.reserves.length} · live players ${live.length}`);
console.log(`champions ${champions.map((c) => `${c.league} ${c.champion}`).join(', ')} · awards ${awards.length} · record marks ${marks.length} · ${(performance.now() - t0).toFixed(0)} ms`);
