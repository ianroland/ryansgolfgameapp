/**
 * Builds the derived history files from the generated games (Phases C and D):
 *   careers.json  career totals for every player who played a historical season
 *   honors.json   awards, leaders, record books, drafts, transactions, Hall of Fame
 * Run: npx vite-node scripts/history/build_careers.ts   (tests check the files are current)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { leagueById } from '../../src/sports/demo';
import { historySeason } from '../../src/sports/history/games';
import {
  comebacks, drafts, FOUNDED, GAME_STATS, hallOfFame, keep, SEASON_STATS, seasonHonors, seasonValue, transactions, winStreaks,
  type Award, type Leader, type RecordEntry,
} from '../../src/sports/history/honors';
import { careerOf, seasonStats, type Adjustment, type PlayerSeason, type StatLine } from '../../src/sports/history/stats';

const data = { players: JSON.parse(readFileSync('src/sports/history/data/players.json', 'utf8')).players, seasons: JSON.parse(readFileSync('src/sports/history/data/seasons.json', 'utf8')).seasons };
const byPlayer = new Map<string, PlayerSeason[]>();
const adjustments: Adjustment[] = [];
const awards: Award[] = [];
const leaders: Leader[] = [];
const rec = { game: [] as RecordEntry[], season: [] as RecordEntry[], team: [] as RecordEntry[] };
const comeback: ReturnType<typeof comebacks> = [];
const debutValue = new Map<string, number>();
const t0 = performance.now();
for (const s of data.seasons) {
  const sport = leagueById(s.league).sport;
  const h = historySeason(data, s);
  const finals = new Map<string, StatLine>();
  const finalIds = new Set(h.playoffs[2].games.map((g) => g.id));
  const { players, adjustments: a } = seasonStats(data, h, (g, lines) => {
    for (const [pid, l] of lines) {
      if (finalIds.has(g.id)) {
        const f = finals.get(pid) ?? {};
        for (const [k, v] of Object.entries(l)) f[k] = (f[k] ?? 0) + v;
        finals.set(pid, f);
      }
      for (const [stat, label] of GAME_STATS[sport]) if ((l[stat] ?? 0) > 0) rec.game.push({ kind: 'game', league: s.league, stat, label, value: l[stat], playerId: pid, year: s.year, gameId: g.id });
    }
    rec.game = rec.game.length > 4000 ? Object.values(Object.groupBy(rec.game, (r) => `${r.league}:${r.stat}`)).flatMap((x) => keep(x!, 5)) : rec.game;
  });
  adjustments.push(...a);
  const hon = seasonHonors(data, h, players, finals);
  awards.push(...hon.awards);
  leaders.push(...hon.leaders);
  for (const p of players) {
    byPlayer.set(p.playerId, [...(byPlayer.get(p.playerId) ?? []), p]);
    const pl = data.players.find((x: { i: string }) => x.i === p.playerId);
    if (pl?.d === s.year) debutValue.set(p.playerId, seasonValue(sport, p.regular));
    for (const [stat, label] of SEASON_STATS[sport]) if ((p.regular[stat] ?? 0) > 0) rec.season.push({ kind: 'season', league: s.league, stat, label, value: p.regular[stat], playerId: p.playerId, teamId: p.teamId, year: s.year });
  }
  for (const [team, streak] of winStreaks(h)) rec.team.push({ kind: 'team', league: s.league, stat: 'streak', label: 'Longest winning streak', value: streak, teamId: team, year: s.year });
  for (const [team, [w]] of Object.entries(s.records) as [string, [number, number]][]) rec.team.push({ kind: 'team', league: s.league, stat: 'wins', label: 'Most wins in a season', value: w, teamId: team, year: s.year });
  comeback.push(...comebacks(h));
}
const group = (xs: RecordEntry[]) => Object.values(Object.groupBy(xs, (r) => `${r.league}:${r.stat}`)).flatMap((x) => keep(x!, 5));
// Careers.
const careers: Record<string, unknown> = {};
const careerRecs: RecordEntry[] = [];
const careerValue = new Map<string, { value: number; seasons: number; titles: number }>();
for (const [id, ss] of [...byPlayer].sort((a, b) => a[0].localeCompare(b[0]))) {
  const c = careerOf(ss);
  careers[id] = { n: c.seasons, y: [c.first, c.last], t: c.teams, r: c.regular, p: c.playoffs };
  const sport = leagueById(ss[0].league).sport;
  const titles = ss.filter((p) => data.seasons.find((x: { id: string }) => x.id === `${p.league}-${p.year}`)!.champion === p.teamId).length;
  careerValue.set(id, { value: ss.reduce((a, p) => a + seasonValue(sport, p.regular), 0), seasons: c.seasons, titles });
  for (const [stat, label] of SEASON_STATS[sport]) if ((c.regular[stat] ?? 0) > 0) careerRecs.push({ kind: 'career', league: ss[0].league, stat, label: label.replace('in a season', 'career'), value: c.regular[stat], playerId: id, seasons: [c.first, c.last] });
}
// Team honours: championships, repeat titles, droughts.
const titlesBy = new Map<string, number[]>();
for (const s of data.seasons) titlesBy.set(s.champion, [...(titlesBy.get(s.champion) ?? []), s.year]);
const founded = FOUNDED;
const teamRecs: RecordEntry[] = [];
for (const s of data.seasons.filter((x: { year: number }) => x.year === 2025)) {
  for (const team of Object.keys(s.records)) {
    const ys = (titlesBy.get(team) ?? []).sort((a, b) => a - b);
    teamRecs.push({ kind: 'team', league: s.league, stat: 'titles', label: 'Most championships', value: ys.length, teamId: team, seasons: [founded[s.league], 2025] });
    let run = 0;
    let bestRun = 0;
    let runEnd = 0;
    for (let i = 0; i < ys.length; i++) { run = i && ys[i] === ys[i - 1] + 1 ? run + 1 : 1; if (run > bestRun) { bestRun = run; runEnd = ys[i]; } }
    if (bestRun > 1) teamRecs.push({ kind: 'team', league: s.league, stat: 'consecutive', label: 'Consecutive championships', value: bestRun, teamId: team, seasons: [runEnd - bestRun + 1, runEnd] });
    const marks = [founded[s.league] - 1, ...ys, 2026];
    let drought = 0;
    let span: [number, number] = [0, 0];
    for (let i = 1; i < marks.length; i++) if (marks[i] - marks[i - 1] - 1 > drought) { drought = marks[i] - marks[i - 1] - 1; span = [marks[i - 1] + 1, marks[i] - 1]; }
    teamRecs.push({ kind: 'team', league: s.league, stat: 'drought', label: 'Longest championship drought (seasons)', value: drought, teamId: team, seasons: span });
  }
}
const allAwards = awards;
const honors = {
  note: 'Generated by scripts/history/build_careers.ts. Proposed/generated history derived from simulated games; not verified records. No coaches exist in the source data, so there is no Coach of the Year.',
  awards: allAwards,
  leaders,
  records: { game: group(rec.game), season: group(rec.season), career: group(careerRecs), team: [...group(rec.team), ...group(teamRecs)], comebacks: comeback },
  drafts: drafts(data, debutValue),
  transactions: transactions(data),
  hallOfFame: hallOfFame(data, careerValue, allAwards),
  /** Class of 2026: same rule and ranking; players whose final season was 2021. */
  hallOfFameNext: hallOfFame(data, careerValue, allAwards, 2026).filter((x) => x.year === 2026),
};
writeFileSync('src/sports/history/data/careers.json', `${JSON.stringify({ note: 'Generated by scripts/history/build_careers.ts. Proposed/generated history: derived from simulated games, not verified records.', adjustments, careers })}\n`);
writeFileSync('src/sports/history/data/honors.json', `${JSON.stringify(honors)}\n`);
console.log(`careers ${Object.keys(careers).length} · awards ${allAwards.length} · leaders ${leaders.length} · drafts ${honors.drafts.length} · transactions ${honors.transactions.length} · HoF ${honors.hallOfFame.length} · ${(performance.now() - t0).toFixed(0)} ms`);
