/**
 * Phase D (part 1): awards, statistical leaders, record books and career timelines (drafts,
 * transactions, retirements, Hall of Fame), all derived from the generated games and stats.
 * Proposed / generated history. Formulas are documented here so every honour is traceable.
 *
 * Not modelled: coaches (the source data has none), so there is no Coach of the Year.
 */
import { leagueById, type LeagueId, type Sport } from '../demo';
import { stream } from '../rng';
import type { HistoryData, HPlayer } from './data';
import type { HGame, HistorySeason } from './games';
import { HISTORY_SEED } from './rosters';
import { rates, type PlayerSeason, type StatLine } from './stats';

export interface Award { award: string; league: LeagueId; year: number; playerId: string; teamId: string; value: number; basis: string }
export interface Leader { stat: string; league: LeagueId; year: number; playerId: string; teamId: string; value: number }
export interface RecordEntry { kind: 'game' | 'season' | 'career' | 'team'; league: LeagueId; stat: string; label: string; value: number; playerId?: string; teamId?: string; year?: number; gameId?: string; seasons?: [number, number] }

/** First season of each league (founding rosters, no draft, no rookie award). */
export const FOUNDED: Record<LeagueId, number> = { gdc: 1972, ccl: 1974, igl: 1976, fhl: 1978 };
const n = (l: StatLine, k: string) => l[k] ?? 0;
/** Minimum share of team games to qualify for a title or an award. */
const QUALIFY = 0.6;
const GAMES: Record<Sport, number> = { baseball: 42, basketball: 28, football: 14, hockey: 28 };
const played = (_sport: Sport, l: StatLine) => n(l, 'gp') || n(l, 'g') || n(l, 'p_g') || n(l, 'g_gp');

/** Overall value of a player's regular season (MVP basis), per sport. */
export function seasonValue(sport: Sport, l: StatLine): number {
  if (sport === 'basketball') return n(l, 'pts') + 1.2 * n(l, 'reb') + 1.5 * n(l, 'ast') + 2 * n(l, 'stl') + 2 * n(l, 'blk') - n(l, 'tov');
  if (sport === 'baseball') {
    const tb = n(l, 'h') + n(l, '2b') + 2 * n(l, '3b') + 3 * n(l, 'hr');
    const bat = tb + n(l, 'bb') + n(l, 'sb') + 0.5 * (n(l, 'r') + n(l, 'rbi'));
    const pitch = n(l, 'p_outs') ? (n(l, 'p_outs') / 3) * 0.9 - 2.2 * n(l, 'p_er') + 0.25 * n(l, 'p_k') + 3 * n(l, 'w') + 2 * n(l, 'sv') : 0;
    return bat + Math.max(0, pitch);
  }
  if (sport === 'football') return n(l, 'pass_yds') / 25 + 4 * n(l, 'pass_td') - 2 * n(l, 'int_thrown') + n(l, 'rush_yds') / 10 + 6 * n(l, 'rush_td') + n(l, 'rec_yds') / 10 + 6 * n(l, 'rec_td');
  if (n(l, 'g_gp')) return n(l, 'sv') * 0.08 - n(l, 'ga') * 0.9 + 2 * n(l, 'w') + 3 * n(l, 'so');
  return n(l, 'g') * 1.2 + n(l, 'a');
}
const defenseValue = (sport: Sport, l: StatLine) =>
  sport === 'basketball' ? 2 * n(l, 'stl') + 2 * n(l, 'blk') + 0.5 * n(l, 'dreb')
    : sport === 'football' ? n(l, 'tackles') + 4 * n(l, 'sacks') + 5 * n(l, 'def_int') + 3 * n(l, 'ff')
      : sport === 'baseball' ? (n(l, 'p_outs') >= 60 ? n(l, 'p_outs') / 3 - 3 * n(l, 'p_er') + 0.3 * n(l, 'p_k') + 2 * n(l, 'w') : -Infinity)
        : n(l, 'g_gp') >= GAMES.hockey * 0.4 ? n(l, 'sv') * 0.1 - n(l, 'ga') + 3 * n(l, 'so') : -Infinity;
const SECOND_AWARD: Record<Sport, string> = { basketball: 'Defensive Player of the Year', football: 'Defensive Player of the Year', baseball: 'Pitcher of the Year', hockey: 'Goaltender of the Year' };

/** Leader stats per sport: [stat, label, value of a line, qualifies?]. */
const LEADERS: Record<Sport, [string, (l: StatLine) => number, (l: StatLine) => boolean][]> = {
  basketball: [
    ['ppg', (l) => n(l, 'pts') / Math.max(1, n(l, 'gp')), (l) => n(l, 'gp') >= GAMES.basketball * QUALIFY],
    ['rpg', (l) => n(l, 'reb') / Math.max(1, n(l, 'gp')), (l) => n(l, 'gp') >= GAMES.basketball * QUALIFY],
    ['apg', (l) => n(l, 'ast') / Math.max(1, n(l, 'gp')), (l) => n(l, 'gp') >= GAMES.basketball * QUALIFY],
  ],
  baseball: [
    ['avg', (l) => n(l, 'h') / Math.max(1, n(l, 'ab')), (l) => n(l, 'ab') + n(l, 'bb') >= GAMES.baseball * 3.1 * QUALIFY],
    ['hr', (l) => n(l, 'hr'), () => true],
    ['rbi', (l) => n(l, 'rbi'), () => true],
    ['era', (l) => -27 * n(l, 'p_er') / Math.max(1, n(l, 'p_outs')), (l) => n(l, 'p_outs') >= GAMES.baseball * 3 * 0.8],
    ['w', (l) => n(l, 'w'), () => true],
    ['so', (l) => n(l, 'p_k'), () => true],
  ],
  football: [
    ['pass_yds', (l) => n(l, 'pass_yds'), () => true],
    ['rush_yds', (l) => n(l, 'rush_yds'), () => true],
    ['rec_yds', (l) => n(l, 'rec_yds'), () => true],
    ['sacks', (l) => n(l, 'sacks'), () => true],
  ],
  hockey: [
    ['g', (l) => n(l, 'g'), () => true],
    ['pts', (l) => n(l, 'pts'), () => true],
    ['sv_pct', (l) => n(l, 'sv') / Math.max(1, n(l, 'sa')), (l) => n(l, 'g_gp') >= GAMES.hockey * 0.4],
  ],
};

const best = <T>(xs: T[], f: (x: T) => number, id: (x: T) => string) => [...xs].sort((a, b) => f(b) - f(a) || id(a).localeCompare(id(b)))[0];

/** Awards and leaders for one league season. */
export function seasonHonors(data: HistoryData, h: HistorySeason, players: PlayerSeason[], finalsLines: Map<string, StatLine>): { awards: Award[]; leaders: Leader[] } {
  const s = h.season;
  const sport = leagueById(s.league).sport;
  const pct = (t: string) => s.records[t][0] / s.games;
  const qualified = players.filter((p) => played(sport, p.regular) >= GAMES[sport] * QUALIFY || (sport === 'baseball' && n(p.regular, 'p_outs') >= 60));
  const awards: Award[] = [];
  const push = (award: string, p: PlayerSeason | undefined, value: number, basis: string) => p && awards.push({ award, league: s.league, year: s.year, playerId: p.playerId, teamId: p.teamId, value: Math.round(value * 10) / 10, basis });
  const mvpScore = (p: PlayerSeason) => seasonValue(sport, p.regular) * (1 + 0.6 * (pct(p.teamId) - 0.5));
  const mvp = best(qualified, mvpScore, (p) => p.playerId);
  push('Most Valuable Player', mvp, mvp ? mvpScore(mvp) : 0, 'season value × team success');
  const def = best(qualified, (p) => defenseValue(sport, p.regular), (p) => p.playerId);
  if (def && Number.isFinite(defenseValue(sport, def.regular))) push(SECOND_AWARD[sport], def, defenseValue(sport, def.regular), 'defensive or pitching value');
  const debutYear = new Map(data.players.map((p) => [p.i, p.d]));
  // Founding-season players were the league's first signings, not rookies: no award that year.
  const rookies = s.year === FOUNDED[s.league] ? [] : players.filter((p) => debutYear.get(p.playerId) === s.year);
  const roy = best(rookies, (p) => seasonValue(sport, p.regular), (p) => p.playerId);
  if (roy && seasonValue(sport, roy.regular) > 0) push('Rookie of the Year', roy, seasonValue(sport, roy.regular), 'season value, first season');
  // Championship MVP: the champion's best player in the final series.
  const champ = players.filter((p) => p.teamId === s.champion && finalsLines.has(p.playerId));
  const fmvp = best(champ, (p) => seasonValue(sport, finalsLines.get(p.playerId)!), (p) => p.playerId);
  if (fmvp) push('Championship MVP', fmvp, seasonValue(sport, finalsLines.get(fmvp.playerId)!), 'value in the final series');
  const leaders: Leader[] = [];
  for (const [stat, f, ok] of LEADERS[sport]) {
    const pool = players.filter((p) => ok(p.regular) && f(p.regular) !== 0);
    const top = best(pool, (p) => f(p.regular), (p) => p.playerId);
    if (top) leaders.push({ stat, league: s.league, year: s.year, playerId: top.playerId, teamId: top.teamId, value: Math.round(Math.abs(f(top.regular)) * 1000) / 1000 });
  }
  return { awards, leaders };
}

/** Longest regular-season winning streak per team in a season. */
export function winStreaks(h: HistorySeason): Map<string, number> {
  const out = new Map<string, number>();
  const cur = new Map<string, number>();
  for (const g of [...h.regular].sort((a, b) => a.day - b.day || a.id.localeCompare(b.id))) {
    cur.set(g.winner, (cur.get(g.winner) ?? 0) + 1);
    cur.set(g.loser, 0);
    out.set(g.winner, Math.max(out.get(g.winner) ?? 0, cur.get(g.winner)!));
  }
  return out;
}

/** Series won after trailing by two or more games (e.g. 1998: 3-1 down). */
export function comebacks(h: HistorySeason): { seriesId: string; winner: string; loser: string; deficit: string; year: number; league: LeagueId }[] {
  const out = [];
  for (const x of h.playoffs) {
    let w = 0;
    let l = 0;
    let worst = 0;
    let at = '';
    for (const g of x.games) {
      if (g.winner === x.winner) w++;
      else l++;
      if (l - w > worst) { worst = l - w; at = `${w}-${l}`; }
    }
    if (worst >= 2) out.push({ seriesId: x.id, winner: x.winner, loser: x.loser, deficit: at, year: h.season.year, league: h.season.league });
  }
  return out;
}

/** Single-game bests in one game's lines. */
export const GAME_STATS: Record<Sport, [string, string][]> = {
  basketball: [['pts', 'Points in a game'], ['reb', 'Rebounds in a game'], ['ast', 'Assists in a game']],
  baseball: [['hr', 'Home runs in a game'], ['h', 'Hits in a game'], ['rbi', 'RBI in a game'], ['p_k', 'Strikeouts in a game']],
  football: [['pass_yds', 'Passing yards in a game'], ['rush_yds', 'Rushing yards in a game'], ['rec_yds', 'Receiving yards in a game']],
  hockey: [['g', 'Goals in a game'], ['pts', 'Points in a game'], ['sv', 'Saves in a game']],
};
export const SEASON_STATS: Record<Sport, [string, string][]> = {
  basketball: [['pts', 'Points in a season'], ['reb', 'Rebounds in a season'], ['ast', 'Assists in a season']],
  baseball: [['hr', 'Home runs in a season'], ['h', 'Hits in a season'], ['rbi', 'RBI in a season'], ['w', 'Pitching wins in a season'], ['p_k', 'Strikeouts in a season'], ['nohit', 'No-hitters in a season']],
  football: [['pass_yds', 'Passing yards in a season'], ['pass_td', 'Passing TDs in a season'], ['rush_yds', 'Rushing yards in a season'], ['rec_yds', 'Receiving yards in a season'], ['sacks', 'Sacks in a season']],
  hockey: [['g', 'Goals in a season'], ['pts', 'Points in a season'], ['sv', 'Saves in a season'], ['so', 'Shutouts in a season']],
};

/** Keeps the top of each record list (ties broken by earliest year, then id). */
export function keep(list: RecordEntry[], top = 5): RecordEntry[] {
  return [...list].sort((a, b) => b.value - a.value || (a.year ?? 0) - (b.year ?? 0) || (a.playerId ?? a.teamId ?? '').localeCompare(b.playerId ?? b.teamId ?? '')).slice(0, top);
}

// ── Careers: drafts, transactions, retirements, Hall of Fame ──
export interface DraftPick { league: LeagueId; year: number; round: number; pick: number; overall: number; playerId: string; teamId: string }
export interface Transaction { league: LeagueId; year: number; type: 'trade' | 'free_agency'; playerId: string; from: string; to: string; note?: string; event?: string }
export interface HallOfFamer { league: LeagueId; year: number; playerId: string; score: number; seasons: number }

/**
 * Drafts: a player's draft class is his debut year. Players who debuted in their league's first
 * season (or, for 90 v0.4 veterans, before the league existed) were founding-roster signings, not draftees. Order within a class: debut-season value,
 * with a seeded scouting error; the drafting team is the debut team.
 */
export function drafts(data: HistoryData, debutValue: Map<string, number>): DraftPick[] {
  const founded = FOUNDED;
  const classes = new Map<string, HPlayer[]>();
  for (const p of data.players) {
    if (p.d <= founded[p.l] || p.d > 2025) continue;
    const k = `${p.l}:${p.d}`;
    classes.set(k, [...(classes.get(k) ?? []), p]);
  }
  const out: DraftPick[] = [];
  for (const [k, ps] of [...classes].sort()) {
    const [league, y] = k.split(':') as [LeagueId, string];
    const score = (p: HPlayer) => (debutValue.get(p.i) ?? 0) + stream(HISTORY_SEED, 'scouting', p.i).normal() * 8;
    ps.sort((a, b) => score(b) - score(a) || a.i.localeCompare(b.i)).forEach((p, i) => {
      out.push({ league, year: Number(y), round: Math.floor(i / 8) + 1, pick: (i % 8) + 1, overall: i + 1, playerId: p.i, teamId: p.s[0][0] });
    });
  }
  return out;
}

/** Team changes from career segments; the anchor 2008 Bellamy deal is a trade. */
export function transactions(data: HistoryData): Transaction[] {
  const out: Transaction[] = [];
  for (const p of data.players) {
    const segs = [...p.s].sort((a, b) => a[1] - b[1]);
    for (let i = 1; i < segs.length; i++) {
      const year = segs[i][1];
      if (p.i === 'ccl_andre_bellamy' && year === 2008) {
        out.push({ league: p.l, year, type: 'trade', playerId: p.i, from: segs[i - 1][0], to: segs[i][0], note: 'Detroit received three players and two draft picks (the players are not yet identified in the data)', event: 'ccl-2008-001' });
        continue;
      }
      const type = stream(HISTORY_SEED, 'move', p.i, year).chance(0.45) ? 'trade' : 'free_agency';
      out.push({ league: p.l, year, type, playerId: p.i, from: segs[i - 1][0], to: segs[i][0] });
    }
  }
  return out.sort((a, b) => a.year - b.year || a.playerId.localeCompare(b.playerId));
}

/**
 * Hall of Fame (PROPOSED rule, awaiting owner approval): eligible five seasons after the final
 * season; inducted in the first eligible year if the career score reaches the top 2.5% of that
 * league's careers with at least eight seasons. Score: total season value plus award bonuses
 * (MVP 40, championship MVP 25, pitching/defensive award 25, rookie 5) and 5 per title.
 */
export const HOF_RULE = { waitYears: 5, minSeasons: 8, topShare: 0.025 };
export function hallOfFame(data: HistoryData, careerValue: Map<string, { value: number; seasons: number; titles: number }>, awards: Award[]): HallOfFamer[] {
  const bonus = new Map<string, number>();
  const B: Record<string, number> = { 'Most Valuable Player': 40, 'Championship MVP': 25, 'Rookie of the Year': 5 };
  for (const a of awards) bonus.set(a.playerId, (bonus.get(a.playerId) ?? 0) + (B[a.award] ?? 25));
  const out: HallOfFamer[] = [];
  for (const league of ['gdc', 'ccl', 'igl', 'fhl'] as LeagueId[]) {
    const pool = data.players.filter((p) => p.l === league && careerValue.has(p.i) && careerValue.get(p.i)!.seasons >= HOF_RULE.minSeasons);
    const score = (p: HPlayer) => careerValue.get(p.i)!.value + (bonus.get(p.i) ?? 0) + 5 * careerValue.get(p.i)!.titles;
    const ranked = [...pool].sort((a, b) => score(b) - score(a) || a.i.localeCompare(b.i));
    const cut = Math.max(1, Math.round(data.players.filter((p) => p.l === league).length * HOF_RULE.topShare));
    for (const p of ranked.slice(0, cut)) {
      const year = p.f + HOF_RULE.waitYears;
      if (p.f <= 2025 - HOF_RULE.waitYears) out.push({ league, year, playerId: p.i, score: Math.round(score(p)), seasons: careerValue.get(p.i)!.seasons });
    }
  }
  return out.sort((a, b) => a.year - b.year || a.playerId.localeCompare(b.playerId));
}

export { rates };
export type { HGame };
