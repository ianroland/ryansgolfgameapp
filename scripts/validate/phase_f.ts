/**
 * Phase F: final validation of the sports universe. Replays every season (1972-2026), audits
 * every game against the brief's quality gates, cross-checks the derived files, and writes
 *   docs/sports-lore/VALIDATION_REPORT.md   (generated; numbers only, nothing claimed by hand)
 *   docs/sports-lore/validation.json
 * Run: npx vite-node scripts/validate/phase_f.ts      Exit code 1 if anything fails.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { leagueById, type LeagueId } from '../../src/sports/demo';
import { auditSeason, type SeasonAudit } from '../../src/sports/history/audit';
import type { HistoryData } from '../../src/sports/history/data';
import { freeSeason, mergeForward, type ForwardData } from '../../src/sports/history/forward';
import { historySeason } from '../../src/sports/history/games';
import { FOUNDED, HOF_RULE, HISTORICAL_LEGENDS, type Award, type HallOfFamer, type RecordEntry } from '../../src/sports/history/honors';
import { gameLines, seasonStats, type StatLine } from '../../src/sports/history/stats';
import { historyRoster } from '../../src/sports/history/rosters';
import { bundledLore } from '../../src/sports/lore/service';

const read = (f: string) => JSON.parse(readFileSync(f, 'utf8'));
const data: HistoryData = { players: read('src/sports/history/data/players.json').players, seasons: read('src/sports/history/data/seasons.json').seasons };
const fwd: ForwardData & { honors2026: { awards: Award[] } } = read('src/sports/history/data/forward.json');
const honors = read('src/sports/history/data/honors.json');
const careers: Record<string, { n: number; r: StatLine }> = read('src/sports/history/data/careers.json').careers;
const archive = read('src/sports/history/data/archive.json');
const merged = mergeForward(data, fwd);
const lore = bundledLore();
const loreEvents = new Set(lore.events.map((e) => e.id));
const t0 = performance.now();

type Gate = { gate: string; checked: number; failures: string[] };
const gates: Gate[] = [];
const gate = (name: string) => { const g: Gate = { gate: name, checked: 0, failures: [] }; gates.push(g); return g; };

// 1. Every season, every game.
const audits: SeasonAudit[] = [];
const seasonsG = gate('Season completeness, schedules, team records, playoffs, player assignments, per-game arithmetic, event references');
const singleGame = new Map<string, Map<string, StatLine>>();
const seasonLines = new Map<string, Map<string, StatLine>>();
for (const s of [...data.seasons, ...fwd.seasons]) {
  const src = s.year <= 2025 ? data : merged;
  const h = s.year <= 2025 ? historySeason(src, s) : freeSeason(merged, s);
  const a = auditSeason(src, h, loreEvents);
  audits.push(a);
  seasonsG.checked++;
  seasonsG.failures.push(...a.issues);
  // Keep lines for record traceability.
  const rosters = new Map(Object.keys(s.records).map((t) => [t, historyRoster(src, s, t)]));
  for (const g of [...h.regular, ...h.playoffs.flatMap((x) => x.games)]) singleGame.set(g.id, gameLines(g, rosters));
  seasonLines.set(s.id, new Map(seasonStats(src, h).players.map((p) => [p.playerId, p.regular])));
}
const coverage = gate('Every league season from founding to 2026 is present');
for (const L of ['gdc', 'ccl', 'igl', 'fhl'] as LeagueId[]) {
  for (let y = FOUNDED[L]; y <= 2026; y++) {
    coverage.checked++;
    if (!audits.some((a) => a.id === `${L}-${y}`)) coverage.failures.push(`${L}-${y} missing`);
  }
}

// 2. Career totals: the archive's season lines add up to careers.json (1972-2025).
const careerG = gate('Career totals equal the sum of season lines (archive v careers.json)');
const keys: Record<string, string[]> = archive.keys;
const totals = new Map<string, StatLine>();
for (const [id, x] of Object.entries(archive.seasons) as [string, { teams: Record<string, { r: number[][] }> }][]) {
  if (Number(id.slice(4)) > 2025) continue;
  const k = keys[leagueById(id.slice(0, 3) as LeagueId).sport];
  for (const t of Object.values(x.teams)) for (const row of t.r) {
    const pid = archive.players[row[0]];
    const tot = totals.get(pid) ?? {};
    row.slice(1).forEach((v, i) => { if (v) tot[k[i]] = (tot[k[i]] ?? 0) + v; });
    totals.set(pid, tot);
  }
}
for (const [id, c] of Object.entries(careers)) {
  careerG.checked++;
  const t = totals.get(id) ?? {};
  for (const [k, v] of Object.entries(c.r)) if ((t[k] ?? 0) !== v) { careerG.failures.push(`${id} ${k}: lines ${t[k] ?? 0}, careers ${v}`); break; }
}

// 3. Awards.
const awardsG = gate('Awards: MVP every season, championship MVP on the champion, rookies in their debut season, no Coach of the Year');
const allAwards: Award[] = [...honors.awards, ...fwd.honors2026.awards];
for (const s of [...data.seasons, ...fwd.seasons]) {
  awardsG.checked++;
  const a = allAwards.filter((x) => x.league === s.league && x.year === s.year);
  if (a.filter((x) => x.award === 'Most Valuable Player').length !== 1) awardsG.failures.push(`${s.id} MVP count`);
  const c = a.filter((x) => x.award === 'Championship MVP');
  if (c.length !== 1 || c[0].teamId !== s.champion) awardsG.failures.push(`${s.id} championship MVP`);
  for (const r of a.filter((x) => x.award === 'Rookie of the Year')) if (merged.players.find((p) => p.i === r.playerId)!.d !== s.year) awardsG.failures.push(`${s.id} rookie ${r.playerId} not in debut season`);
  if (a.some((x) => /coach/i.test(x.award))) awardsG.failures.push(`${s.id} coach award`);
}
const missingRookie = [...data.seasons, ...fwd.seasons].filter((s) => !allAwards.some((x) => x.league === s.league && x.year === s.year && x.award === 'Rookie of the Year')).map((s) => s.id);

// 4. Hall of Fame rules. Stored scores are whole numbers, so the bar is compared at that precision
// (the player who sets the bar has the bar's score exactly).
const hofG = gate('Hall of Fame: five-year wait, eight seasons, the league bar (statistical); owner-approved Legends only; once per player');
const hof: HallOfFamer[] = [...honors.hallOfFame, ...honors.hallOfFameNext];
const seen = new Set<string>();
for (const x of hof) {
  hofG.checked++;
  const p = data.players.find((q) => q.i === x.playerId)!;
  if (seen.has(x.playerId)) hofG.failures.push(`${x.playerId} inducted twice`);
  seen.add(x.playerId);
  if (x.year !== p.f + HOF_RULE.waitYears) hofG.failures.push(`${x.playerId} inducted ${x.year}, final season ${p.f}`);
  if (x.pathway === 'statistical' && (careers[x.playerId].n < HOF_RULE.minSeasons || x.score < Math.round(honors.hallOfFameThreshold[x.league]))) hofG.failures.push(`${x.playerId} below the statistical rule`);
  if (x.pathway === 'legends' && !HISTORICAL_LEGENDS.some((l) => l.playerId === x.playerId)) hofG.failures.push(`${x.playerId} legends without approval`);
}

// 5. Record traceability: every record entry is a real line.
const recG = gate('Records trace to source data (single game, season and career entries)');
for (const r of honors.records.game as RecordEntry[]) {
  recG.checked++;
  if (singleGame.get(r.gameId!)?.get(r.playerId!)?.[r.stat] !== r.value) recG.failures.push(`game record ${r.label} ${r.playerId} ${r.gameId}`);
}
for (const r of honors.records.season as RecordEntry[]) {
  recG.checked++;
  if (seasonLines.get(`${r.league}-${r.year}`)?.get(r.playerId!)?.[r.stat] !== r.value) recG.failures.push(`season record ${r.label} ${r.playerId} ${r.year}`);
}
for (const r of honors.records.career as RecordEntry[]) {
  recG.checked++;
  if ((careers[r.playerId!]?.r[r.stat] ?? -1) !== r.value) recG.failures.push(`career record ${r.label} ${r.playerId}`);
}

// 6. Drafts and transactions agree with careers.
const txG = gate('Drafts and transactions agree with player career segments');
for (const d of honors.drafts) {
  txG.checked++;
  const p = data.players.find((q) => q.i === d.playerId)!;
  if (p.d !== d.year || p.s[0][0] !== d.teamId) txG.failures.push(`draft ${d.playerId}`);
}
for (const t of honors.transactions) {
  txG.checked++;
  const p = data.players.find((q) => q.i === t.playerId)!;
  if (!p.s.some(([team, a]) => team === t.to && a === t.year)) txG.failures.push(`transaction ${t.playerId} ${t.year}`);
}

// 7. Bible events: which are represented in the generated games.
const inGames = new Set(audits.flatMap((a) => a.events));

const failed = gates.filter((g) => g.failures.length);
const ms = performance.now() - t0;
const sum = (f: (a: SeasonAudit) => number) => audits.reduce((x, a) => x + f(a), 0);
const out = {
  generated: new Date().toISOString().slice(0, 10),
  seasons: audits.length,
  games: sum((a) => a.games), playoffGames: sum((a) => a.playoffGames), overtimeGames: sum((a) => a.overtimeGames), playerGameLines: sum((a) => a.playerLines),
  gates: gates.map((g) => ({ gate: g.gate, checked: g.checked, failures: g.failures.length, examples: g.failures.slice(0, 10) })),
  missingRookieAward: missingRookie,
  bibleEvents: lore.events.map((e) => ({ id: e.id, title: e.title, inGames: inGames.has(e.id) })),
  seconds: Math.round(ms / 100) / 10,
};
writeFileSync('docs/sports-lore/validation.json', `${JSON.stringify(out, null, 1)}\n`);
const md = [
  '# Sports universe validation report (generated)',
  '',
  `Generated by \`scripts/validate/phase_f.ts\` on ${out.generated}. Every number below is computed by the script; nothing is written by hand. Re-run it after any change to the history data.`,
  '',
  `- Seasons replayed and audited: **${out.seasons}** (every league season, founding to 2026)`,
  `- Games audited one by one: **${out.games.toLocaleString('en-US')}** regular season and **${out.playoffGames.toLocaleString('en-US')}** playoff (${out.overtimeGames.toLocaleString('en-US')} went to overtime or extra innings)`,
  `- Player game lines checked: **${out.playerGameLines.toLocaleString('en-US')}**`,
  `- Run time: ${out.seconds} s`,
  '',
  '| Quality gate | Checked | Failures |',
  '|---|---:|---:|',
  ...out.gates.map((g) => `| ${g.gate} | ${g.checked.toLocaleString('en-US')} | ${g.failures} |`),
  '',
  ...(failed.length ? ['## Failures', '', ...failed.flatMap((g) => [`**${g.gate}**`, '', ...g.failures.slice(0, 20).map((f) => `- ${f}`), ''])] : ['All gates passed.', '']),
  '## Rookie of the Year with no qualifying winner',
  '',
  `${missingRookie.length} seasons: ${missingRookie.join(', ')} (founding seasons have no rookies by rule).`,
  '',
  '## Bible events and the game records',
  '',
  '| Event | Played out in the generated games |',
  '|---|---|',
  ...out.bibleEvents.map((e) => `| ${e.id} ${e.title} | ${e.inGames ? 'yes' : 'no (bible only)'} |`),
  '',
].join('\n');
writeFileSync('docs/sports-lore/VALIDATION_REPORT.md', md);
console.log(md.split('\n').slice(4, 20).join('\n'));
if (failed.length) process.exit(1);
