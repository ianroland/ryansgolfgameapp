/**
 * Phase F: the full audit of one generated season against the brief's quality gates (section 12).
 * Every game is checked, not a sample. Returns problems as text (none expected) and counts for the
 * validation report. Read-only.
 */
import { SPORTS_CONFIG } from '../config';
import { leagueById, SEASON_FORMAT, teamsOf } from '../demo';
import type { HistoryData, HSeason } from './data';
import type { HistorySeason } from './games';
import { historyRoster } from './rosters';
import { gameLines, type StatLine } from './stats';

export interface SeasonAudit {
  id: string;
  issues: string[];
  games: number;
  playoffGames: number;
  overtimeGames: number;
  playerLines: number;
  events: string[];
}

const sum = (ls: StatLine[], k: string) => ls.reduce((a, l) => a + (l[k] ?? 0), 0);

export function auditSeason(data: HistoryData, h: HistorySeason, loreEvents: Set<string>): SeasonAudit {
  const s: HSeason = h.season;
  const sport = leagueById(s.league).sport;
  const issues: string[] = [];
  const bad = (m: string) => issues.push(`${s.id}: ${m}`);
  const teams = Object.keys(s.records).sort();
  const official = teamsOf(s.league).map((t) => t.id).sort();
  // Franchises.
  if (teams.join() !== official.join()) bad(`franchises ${teams.join()} differ from the league's eight`);
  // Schedule: two different teams of this league, full length, balanced home and away.
  const per = new Map(teams.map((t) => [t, { gp: 0, home: 0, away: 0, w: 0, l: 0 }]));
  const pair = new Map<string, number>();
  for (const g of h.regular) {
    if (g.home === g.away || !per.has(g.home) || !per.has(g.away)) { bad(`${g.id} teams ${g.home} v ${g.away}`); continue; }
    if (g.result.homeScore === g.result.awayScore) bad(`${g.id} ended tied`);
    const w = g.result.homeScore > g.result.awayScore ? g.home : g.away;
    if (w !== g.winner || g.loser !== (w === g.home ? g.away : g.home)) bad(`${g.id} winner does not match the score`);
    const H = per.get(g.home)!;
    const A = per.get(g.away)!;
    H.gp++; A.gp++; H.home++; A.away++;
    per.get(g.winner)!.w++;
    per.get(g.loser)!.l++;
    const k = [g.home, g.away].sort().join('|');
    pair.set(k, (pair.get(k) ?? 0) + 1);
  }
  const fmt = SEASON_FORMAT[sport];
  for (const [t, x] of per) {
    if (x.gp !== s.games || x.gp !== fmt.gamesPerTeam) bad(`${t} played ${x.gp} games (season ${s.games}, format ${fmt.gamesPerTeam})`);
    if (x.home !== x.away) bad(`${t} ${x.home} home v ${x.away} away`);
    const [rw, rl] = s.records[t];
    if (x.w !== rw || x.l !== rl) bad(`${t} games give ${x.w}-${x.l}, ledger ${rw}-${rl}`);
  }
  if (pair.size !== 28 || [...pair.values()].some((n) => n !== fmt.meetingsPerOpponent)) bad('opponents not met equally');
  const wins = [...per.values()].reduce((a, x) => a + x.w, 0);
  const losses = [...per.values()].reduce((a, x) => a + x.l, 0);
  if (wins !== losses || wins !== h.regular.length) bad(`league wins ${wins} v losses ${losses} v games ${h.regular.length}`);
  // Playoffs.
  const po = SPORTS_CONFIG.playoffs[sport];
  const [s1, s2, f] = h.playoffs;
  const pairOk = (x: typeof s1, a: string, b: string) => new Set([x.high, x.low]).size === 2 && [x.high, x.low].sort().join() === [a, b].sort().join();
  if (!pairOk(s1, s.seeds[0], s.seeds[3]) || !pairOk(s2, s.seeds[1], s.seeds[2])) bad('semifinals do not follow the seeds');
  if (!pairOk(f, s1.winner, s2.winner)) bad('final is not between the semifinal winners');
  if (f.winner !== s.champion || f.loser !== s.runnerUp) bad(`final gives ${f.winner} over ${f.loser}, ledger ${s.champion} over ${s.runnerUp}`);
  for (const x of h.playoffs) {
    const bestOf = x.round === 'final' ? po.final : po.semi;
    const need = Math.ceil(bestOf / 2);
    const won = x.games.filter((g) => g.winner === x.winner).length;
    if (won !== need || x.games.length > bestOf || x.games.length < need) bad(`${x.id} ${won} wins in ${x.games.length} games (best of ${bestOf})`);
    if (!x.games.at(-1)!.decider || x.games.at(-1)!.winner !== x.winner) bad(`${x.id} deciding game wrong`);
    for (const g of x.games) {
      if (g.result.homeScore === g.result.awayScore) bad(`${g.id} playoff game tied`);
      if (sport === 'hockey' && g.result.so) bad(`${g.id} playoff shootout`);
    }
  }
  // Players: rostered players are in their career window, on that team, at a plausible age.
  for (const [team, ixs] of Object.entries(s.rosters)) {
    for (const ix of ixs) {
      const p = data.players[ix];
      if (p.l !== s.league) bad(`${p.i} is from another league`);
      if (!p.s.some(([t, a, b]) => t === team && a <= s.year && s.year <= b)) bad(`${p.i} not with ${team} in ${s.year} per career segments`);
      const age = s.year - p.b;
      if (age < 17 || age > 45) bad(`${p.i} age ${age}`);
    }
  }
  // Statistical arithmetic, every game: lines add up to the score and the sport's own totals.
  const rosters = new Map(teams.map((t) => [t, historyRoster(data, s, t)]));
  const games = [...h.regular, ...h.playoffs.flatMap((x) => x.games)];
  let lines = 0;
  let ot = 0;
  const events = new Set<string>();
  for (const g of games) {
    if (g.result.ot) ot++;
    for (const e of g.events) { events.add(e); if (!loreEvents.has(e)) bad(`${g.id} cites unknown event ${e}`); }
    const gl = gameLines(g, rosters);
    lines += gl.size;
    const side = (t: string) => [...gl].filter(([pid]) => rosters.get(t)!.some((p) => p.id === pid)).map(([, l]) => l);
    const [home, away] = [side(g.home), side(g.away)];
    for (const l of gl.values()) for (const v of Object.values(l)) if (!(v >= 0)) { bad(`${g.id} negative stat`); break; }
    if (sport === 'basketball') {
      if (sum(home, 'pts') !== g.result.homeScore || sum(away, 'pts') !== g.result.awayScore) bad(`${g.id} points do not add up`);
    } else if (sport === 'baseball') {
      if (sum(home, 'r') !== g.result.homeScore || sum(away, 'r') !== g.result.awayScore) bad(`${g.id} runs do not add up`);
      if (sum(home, 'w') + sum(away, 'w') !== 1 || sum(home, 'l') + sum(away, 'l') !== 1) bad(`${g.id} pitching decisions`);
    } else if (sport === 'football') {
      const tds = g.result.box.reduce((a, b) => a + (b.extra?.td ?? 0), 0);
      if (sum(home, 'rec_td') + sum(home, 'rush_td') + sum(away, 'rec_td') + sum(away, 'rush_td') !== tds) bad(`${g.id} touchdowns do not add up`);
      for (const x of [home, away]) if (sum(x, 'rec_yds') !== sum(x, 'pass_yds')) bad(`${g.id} receiving yards != passing yards`);
    } else {
      const so = g.result.so ? 1 : 0;
      if (sum(home, 'g') + sum(away, 'g') !== g.result.homeScore + g.result.awayScore - so) bad(`${g.id} goals do not add up`);
      const gk = [...home, ...away].filter((l) => l.g_gp);
      if (gk.length !== 2 || sum(gk, 'ga') + so !== g.result.homeScore + g.result.awayScore) bad(`${g.id} goaltending does not add up`);
    }
  }
  return { id: s.id, issues, games: h.regular.length, playoffGames: games.length - h.regular.length, overtimeGames: ot, playerLines: lines, events: [...events] };
}
