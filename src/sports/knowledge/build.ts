/**
 * Builds the history files and the knowledge facts of the sports-lore/2 pack from the shared
 * history (1972-2026). Build time only. Every fact restates history records and lists their ids
 * in `refs`; nothing is written that the data doesn't hold. Save-specific seasons are never read.
 */
import { SPORTS_CONFIG } from '../config';
import { LEAGUES, leagueById, teamById, teamsOf, type LeagueId } from '../demo';
import type { HSeason } from '../history/data';
import type { HistorySeason } from '../history/games';
import { FOUNDED, SEASON_STATS } from '../history/honors';
import type { LorePack } from '../lore/schema';
import type { Board } from '../archive/board';
import { RECORD_CATS, fmtValue } from '../archive/records';
import type { SharedArchive } from '../archive/shared';
import type { Fact } from './schema';

type Prov = Fact['provenance'];
const TIER_RANK: Record<Fact['tier'], number> = { casual: 0, fan: 1, specialist: 2, historian: 3 };
const LAST = 2026;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const AWARD_SLUG: Record<string, string> = { 'Most Valuable Player': 'mvp', 'Championship MVP': 'cmvp', 'Rookie of the Year': 'roy', 'Pitcher of the Year': 'poy', 'Defensive Player of the Year': 'dpoy', 'Goaltender of the Year': 'goy' };
const theTrophy = (t: string) => (/^the /i.test(t) ? t : `the ${t}`);
const num = (v: number) => v.toLocaleString('en-US');
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
const tn = (t: string) => teamById(t).displayName;
const LEADER: Record<string, [string, (v: number) => string]> = {
  ppg: ['scoring', (v) => `${v.toFixed(1)} points per game`], rpg: ['rebounding', (v) => `${v.toFixed(1)} rebounds per game`], apg: ['assists', (v) => `${v.toFixed(1)} assists per game`],
  avg: ['batting average', (v) => v.toFixed(3).replace(/^0/, '')], hr: ['home runs', (v) => `${num(v)} home runs`], rbi: ['runs batted in', (v) => `${num(v)} RBI`],
  era: ['earned run average', (v) => v.toFixed(2)], w: ['pitching wins', (v) => `${num(v)} wins`], so: ['strikeouts', (v) => `${num(v)} strikeouts`],
  pass_yds: ['passing yards', (v) => `${num(v)} yards`], rush_yds: ['rushing yards', (v) => `${num(v)} yards`], rec_yds: ['receiving yards', (v) => `${num(v)} yards`], sacks: ['sacks', (v) => `${num(v)} sacks`],
  g: ['goals', (v) => `${num(v)} goals`], pts: ['points', (v) => `${num(v)} points`], sv_pct: ['save percentage', (v) => v.toFixed(3).replace(/^0/, '')],
};

export interface BuildInput {
  shared: SharedArchive;
  board: Board;
  lore: LorePack;
  /** Replays a shared season (the same games the game generates). */
  replay: (s: HSeason) => HistorySeason;
}

export function buildKnowledge({ shared, board, lore, replay }: BuildInput) {
  const H = shared.honors;
  const name = (id: string) => board.name(id);
  const files: Record<string, unknown> = {};
  const facts: Fact[] = [];
  const fact = (f: Omit<Fact, 'rivalry' | 'events' | 'athletes' | 'teams' | 'data'> & Partial<Pick<Fact, 'rivalry' | 'events' | 'athletes' | 'teams' | 'data'>>) =>
    facts.push({ teams: [], athletes: [], events: [], rivalry: null, data: {}, ...f } as Fact);
  const loreEvents = (l: LeagueId, y: number, teams: string[]) => lore.events.filter((e) => e.league === l && e.span.start <= y && y <= e.span.end && (!e.teams.length || e.teams.some((t) => teams.includes(t)))).map((e) => e.id);

  // ── Seasons, games, series, championships ──
  const seasons = [];
  const series = [];
  const champs = [];
  const gameCols = ['id', 'league', 'season', 'week', 'day', 'phase', 'round', 'series_id', 'game_no', 'home', 'away', 'home_score', 'away_score', 'winner', 'overtime', 'shootout', 'events'];
  const gameRows: (string | number | null | string[])[][] = [];
  const comebacks = [...H.records.comebacks, ...shared.forward.honors2026.comebacks];
  for (const s of shared.seasons) {
    const l = s.league;
    const sport = leagueById(l).sport;
    const cal = SPORTS_CONFIG.calendar[sport];
    const h = replay(s);
    const prov: Prov = s.year === 2026 ? 'generated_history' : s.origin === 'owner_decision' ? 'approved_canon' : 'proposed_canon';
    seasons.push({ id: s.id, league: l, year: s.year, games_per_team: s.games, standings: Object.entries(s.records).map(([team, [w, lo]]) => ({ team, w, l: lo })), seeds: s.seeds, champion: s.champion, runner_up: s.runnerUp, origin: s.origin, adjusted: s.adjusted, provenance: s.year === 2026 ? 'generated_history' : prov });
    let lastWeek = 0;
    for (const g of h.regular) {
      const week = cal.startWeek + Math.floor(g.day / cal.daysPerWeek);
      lastWeek = Math.max(lastWeek, week);
      gameRows.push([g.id, l, s.year, week, g.day % cal.daysPerWeek, 'regular', null, null, null, g.home, g.away, g.result.homeScore, g.result.awayScore, g.winner, g.result.ot, g.result.so ? 1 : 0, g.events]);
    }
    for (const x of h.playoffs) {
      const week = lastWeek + (x.round === 'final' ? 2 : 1);
      x.games.forEach((g, n) => gameRows.push([g.id, l, s.year, week, n, 'playoff', x.round, x.id, n + 1, g.home, g.away, g.result.homeScore, g.result.awayScore, g.winner, g.result.ot, g.result.so ? 1 : 0, g.events]));
      const cb = comebacks.find((c) => c.seriesId === x.id);
      const seedOf = (t: string) => s.seeds.indexOf(t) + 1;
      series.push({ id: x.id, league: l, year: s.year, round: x.round, high_seed: x.high, low_seed: x.low, seeds: [seedOf(x.high), seedOf(x.low)] as [number, number], winner: x.winner, loser: x.loser, wins: x.wins, games: x.games.map((g) => g.id), comeback: cb?.deficit ?? null, legendary: !!cb?.tags?.includes('legendary_comeback'), provenance: 'generated_history' as Prov });
    }
    const [s1, s2, f] = h.playoffs;
    const sv = board.season(l, s.year)!;
    const cmvp = sv.awards.find((a) => a.award === 'Championship MVP');
    const decider = f.games.at(-1)!;
    const result = sport === 'football' ? `${Math.max(decider.result.homeScore, decider.result.awayScore)}-${Math.min(decider.result.homeScore, decider.result.awayScore)}` : `${f.wins[f.winner]}-${f.wins[f.loser]}`;
    const trophy = lore.leagues.find((x) => x.id === l)!.trophy;
    const ev = loreEvents(l, s.year, [s.champion, s.runnerUp]);
    champs.push({ id: s.id, league: l, year: s.year, trophy, champion: s.champion, runner_up: s.runnerUp, result, series_id: f.id, deciding_game: decider.id, championship_mvp: cmvp?.playerId ?? null, participants: s.seeds, events: ev, provenance: prov });
    const known = s.year + 1;
    const L = leagueById(l);
    fact({ id: `f.championship.${s.id}`, kind: 'championship', year: s.year, known_from: known, league: l, teams: [s.champion, s.runnerUp], events: ev, tier: 'casual', provenance: prov,
      text: `The ${tn(s.champion)} won ${theTrophy(trophy)} in ${s.year}, beating the ${tn(s.runnerUp)} in the final.`, data: { champion: s.champion, runner_up: s.runnerUp, trophy }, refs: [`season:${s.id}`, `champ:${s.id}`], uses: ['championship_memory', 'favorite_team', 'sportsbook', 'trivia'] });
    const otNote = decider.result.ot ? (sport === 'baseball' ? ' The deciding game went to extra innings.' : sport === 'hockey' && decider.result.ot > 1 ? ` The deciding game went to ${decider.result.ot} overtime periods.` : ' The deciding game went to overtime.') : '';
    fact({ id: `f.final.${s.id}`, kind: 'final', year: s.year, known_from: known, league: l, teams: [s.champion, s.runnerUp], events: ev, tier: 'fan', provenance: 'generated_history',
      text: sport === 'football' ? `The ${tn(s.champion)} beat the ${tn(s.runnerUp)} ${result.replace('-', '–')} in the ${s.year} ${trophy} game.${otNote}` : `The ${s.year} ${L.short} final went ${f.games.length} games: the ${tn(s.champion)} beat the ${tn(s.runnerUp)} ${result.replace('-', '–')}.${otNote}`,
      data: { result, games: f.games.length, overtime: decider.result.ot, winner: s.champion, loser: s.runnerUp }, refs: [`series:${f.id}`, `game:${decider.id}`], uses: ['championship_memory', 'grudge', 'favorite_team', 'trivia'] });
    for (const x of [s1, s2]) {
      const g0 = x.games[0];
      const res = sport === 'football' ? `${Math.max(g0.result.homeScore, g0.result.awayScore)}–${Math.min(g0.result.homeScore, g0.result.awayScore)}` : `${x.wins[x.winner]}–${x.wins[x.loser]}`;
      fact({ id: `f.semifinal.${s.id}.${x.winner}`, kind: 'semifinal', year: s.year, known_from: known, league: l, teams: [x.winner, x.loser], tier: 'specialist', provenance: 'generated_history',
        text: `The ${tn(x.winner)} beat the ${tn(x.loser)} ${res} in the ${s.year} ${L.short} semifinals.`, data: { winner: x.winner, loser: x.loser, result: res }, refs: [`series:${x.id}`], uses: ['grudge', 'favorite_team', 'trivia'] });
    }
    for (const x of h.playoffs) {
      const cb = comebacks.find((c) => c.seriesId === x.id);
      if (!cb) continue;
      const down = cb.deficit.split('-').reverse().join('–');
      const legendary = !!cb.tags?.includes('legendary_comeback');
      const cev = loreEvents(l, s.year, [x.winner, x.loser]).filter((e) => lore.events.find((y) => y.id === e)!.tags.includes('comeback'));
      // A comeback the bible tells is known as widely as the bible's headline says.
      const ruleTier: Fact['tier'] = legendary ? 'casual' : x.round === 'final' ? 'fan' : 'specialist';
      const bibleTier = cev.map((e) => lore.events.find((y) => y.id === e)!.knowledge.headline as Fact['tier']);
      const tier = [ruleTier, ...bibleTier].sort((a, b) => TIER_RANK[a] - TIER_RANK[b])[0];
      fact({ id: `f.comeback.${x.id}`, kind: 'comeback', year: s.year, known_from: known, league: l, teams: [x.winner, x.loser], events: cev, tier, provenance: cev.length ? 'proposed_canon' : 'generated_history',
        text: `The ${tn(x.winner)} came back from ${down} down to beat the ${tn(x.loser)} in the ${s.year} ${L.short} ${x.round}.${legendary ? ' It is one of the league\'s legendary 0–3 comebacks.' : ''}`,
        data: { winner: x.winner, loser: x.loser, deficit: cb.deficit, legendary, round: x.round }, refs: [`series:${x.id}`], uses: ['championship_memory', 'grudge', 'trivia', 'favorite_team'] });
    }
    const best = Object.entries(s.records).sort((a, b) => b[1][0] - a[1][0])[0];
    fact({ id: `f.standings.${s.id}`, kind: 'standings', year: s.year, known_from: known, league: l, teams: [best[0]], tier: 'specialist', provenance: prov,
      text: `The ${tn(best[0])} had the best regular-season record in the ${s.year} ${L.short}: ${best[1][0]}–${best[1][1]}.`, data: { team: best[0], w: best[1][0], l: best[1][1] }, refs: [`season:${s.id}`], uses: ['favorite_team', 'trivia'] });
  }
  files['history/seasons.json'] = seasons;
  files['history/games.json'] = { columns: gameCols, rows: gameRows };
  files['history/playoff_series.json'] = series;
  files['history/championships.json'] = champs;

  // ── Athletes, seasons, careers ──
  const hof = board.hallOfFame();
  const hofOf = new Map(hof.map((x) => [x.i, x]));
  const person = new Map(lore.people.map((p) => [p.name, p.id]));
  const draftOf = new Map<string, { year: number; round: number; pick: number; overall: number; team: string }>();
  const drafts = [
    ...H.drafts.map((d) => ({ id: `${d.league}-${d.year}:${d.overall}`, league: d.league, year: d.year, round: d.round, pick: d.pick, overall: d.overall, athlete_id: d.playerId, team: d.teamId })),
    ...shared.forward.offseasons.flatMap((o) => o.draft.map((d) => ({ id: `${d.league}-${d.year}:${d.overall}`, league: d.league, year: d.year, round: d.round, pick: d.pick, overall: d.overall, athlete_id: d.playerId, team: d.teamId }))),
  ];
  for (const d of drafts) draftOf.set(d.athlete_id, { year: d.year, round: d.round, pick: d.pick, overall: d.overall, team: d.team });
  files['history/players.json'] = board.players().map((p) => {
    const hp = shared.byId.get(p.i)!;
    const h1 = hofOf.get(p.i);
    const lines = board.linesOf(p.i).filter((x) => x.year <= LAST);
    return {
      id: p.i, name: p.n, league: p.l, position: p.pos, birth_year: p.born, debut: hp.d,
      final_season: p.status === 'retired' ? lines.at(-1)?.year ?? hp.f : null,
      teams: hp.s.map(([team, from, to]) => ({ team, from, to: Math.min(to, LAST) })).filter((x) => x.from <= LAST),
      status_2027: p.status, bible_person: p.legend ? person.get(p.n) ?? null : null,
      hall_of_fame: h1 && h1.year <= 2027 ? { year: h1.year, pathway: h1.pathway } : null,
      draft: draftOf.get(p.i) ?? null,
    };
  });
  const seasonLines: { regular: Record<string, { columns: string[]; rows: (string | number)[][] }>; playoffs: Record<string, { columns: string[]; rows: (string | number)[][] }> } = { regular: {}, playoffs: {} };
  for (const L of LEAGUES) {
    const keys = shared.keys[L.sport];
    const cols = ['athlete_id', 'season', 'team', ...keys];
    const lines = shared.allLines().filter((x) => x.league === L.id);
    seasonLines.regular[L.id] = { columns: cols, rows: lines.map((x) => [x.playerId, x.year, x.team, ...keys.map((k) => x.r[k] ?? 0)]) };
    seasonLines.playoffs[L.id] = { columns: cols, rows: lines.filter((x) => x.p).map((x) => [x.playerId, x.year, x.team, ...keys.map((k) => x.p![k] ?? 0)]) };
  }
  files['history/player_seasons.json'] = seasonLines;
  const totals = [...board.totals().values()].filter((c) => c.years.length);
  files['history/player_careers.json'] = totals.map((c) => ({ athlete_id: c.playerId, league: c.league, seasons: c.years.length, first: c.years[0], last: c.years.at(-1)!, teams: c.teams, regular: c.r, playoffs: c.p })).sort((a, b) => a.athlete_id.localeCompare(b.athlete_id));

  // ── Awards and leaders ──
  const awards = [...H.awards, ...shared.forward.honors2026.awards].map((a) => ({ id: `${a.league}-${a.year}:${AWARD_SLUG[a.award]}`, league: a.league, year: a.year, award: a.award, athlete_id: a.playerId, team: a.teamId, value: a.value, basis: a.basis }));
  files['history/awards.json'] = awards;
  const leaders = [...H.leaders, ...shared.forward.honors2026.leaders].map((x) => ({ id: `${x.league}-${x.year}:${x.stat}`, league: x.league, year: x.year, stat: x.stat, athlete_id: x.playerId, team: x.teamId, value: x.value }));
  files['history/leaders.json'] = leaders;
  for (const a of awards) {
    const L = leagueById(a.league);
    const tier = a.award === 'Most Valuable Player' || a.award === 'Championship MVP' ? 'fan' : 'specialist';
    const text = a.award === 'Championship MVP'
      ? `${name(a.athlete_id)} was the Championship MVP as the ${tn(a.team)} won the ${a.year} ${L.short} title.`
      : `${name(a.athlete_id)} of the ${tn(a.team)} was the ${a.year} ${L.short} ${a.award}.`;
    fact({ id: `f.award.${a.id.replace(':', '.')}`, kind: 'award', year: a.year, known_from: a.year + 1, league: a.league, teams: [a.team], athletes: [a.athlete_id], tier, provenance: 'derived_statistic', text, data: { award: a.award }, refs: [`award:${a.id}`], uses: ['legend', 'favorite_team', 'trivia'] });
  }
  for (const x of leaders) {
    const [what, val] = LEADER[x.stat] ?? [x.stat, (v: number) => num(v)];
    fact({ id: `f.leader.${x.id.replace(':', '.')}`, kind: 'leader', year: x.year, known_from: x.year + 1, league: x.league, teams: [x.team], athletes: [x.athlete_id], tier: 'historian', provenance: 'derived_statistic',
      text: `${name(x.athlete_id)} led the ${x.year} ${leagueById(x.league).short} in ${what} (${val(x.value)}).`, data: { stat: x.stat, value: x.value }, refs: [`leader:${x.id}`], uses: ['trivia', 'favorite_team'] });
  }

  // ── Records ──
  const records = [];
  for (const L of LEAGUES) {
    const rec = board.records(L.id);
    const main = new Set(SEASON_STATS[L.sport].map(([k]) => k));
    for (const cat of RECORD_CATS[L.sport]) {
      for (const kind of ['season', 'career'] as const) {
        for (const r of (kind === 'season' ? rec.season : rec.career).get(cat.key)!.slice(0, 5)) {
          const id = `${kind}:${L.id}:${cat.key}:${r.rank}`;
          records.push({ id, kind, league: L.id, category: cat.key, label: cat.label, rank: r.rank, athlete_id: r.playerId, team: r.team ?? null, year: r.year ?? null, span: r.span ?? null, value: r.value, provenance: 'derived_statistic' as Prov });
          const v = fmtValue(r.value, cat.fmt);
          const lead = r.rank === 1 ? `holds the ${L.short} ${kind === 'season' ? 'single-season' : 'career'} record for ${cat.label.toLowerCase()}` : `ranks ${ordinal(r.rank)} all-time in the ${L.short} for ${kind === 'season' ? 'a season\'s' : 'career'} ${cat.label.toLowerCase()}`;
          fact({ id: `f.record.${kind}.${L.id}.${cat.key}.${r.rank}`, kind: 'record', year: LAST, known_from: LAST + 1, league: L.id, teams: kind === 'season' ? [r.team!] : r.teams!, athletes: [r.playerId],
            tier: r.rank === 1 ? (main.has(cat.key) ? 'fan' : 'specialist') : 'historian', provenance: 'derived_statistic',
            text: `${name(r.playerId)} ${lead}: ${v}${kind === 'season' ? ` with the ${tn(r.team!)} in ${r.year}` : ` (${r.span![0]}–${r.span![1]})`}, through 2026.`,
            data: { category: cat.key, value: r.value, rank: r.rank, record: kind }, refs: [`record:${id}`], uses: ['legend', 'trivia', 'sportsbook'] });
        }
      }
    }
    const byStat = new Map<string, typeof rec.game>();
    for (const g of rec.game) byStat.set(g.stat, [...(byStat.get(g.stat) ?? []), g]);
    for (const [stat, list] of byStat) {
      list.slice(0, 5).forEach((g, i) => {
        const id = `game:${L.id}:${stat}:${i + 1}`;
        records.push({ id, kind: 'game', league: L.id, category: stat, label: g.label, rank: i + 1, athlete_id: g.playerId ?? null, team: g.teamId ?? null, year: g.year ?? null, span: null, value: g.value, provenance: 'derived_statistic' as Prov });
        if (i === 0) fact({ id: `f.record.game.${L.id}.${stat}.1`, kind: 'record', year: g.year!, known_from: LAST + 1, league: L.id, teams: g.teamId ? [g.teamId] : [], athletes: g.playerId ? [g.playerId] : [], tier: 'specialist', provenance: 'derived_statistic',
          text: `${name(g.playerId!)} holds the ${L.short} single-game record for ${g.label.replace(/ in a game$/, '').toLowerCase()}: ${num(g.value)}, in ${g.year}.`, data: { category: stat, value: g.value }, refs: [`record:${id}`], uses: ['legend', 'trivia'] });
      });
    }
    for (const [cat, list, label] of [['wins', rec.team.wins.map((w) => ({ team: w.team, year: w.year, value: w.w })), 'Most wins in a season'], ['streak', rec.team.streaks.map((s) => ({ team: s.teamId!, year: s.year!, value: s.value })), 'Longest winning streak']] as const) {
      list.slice(0, 5).forEach((x, i) => {
        const id = `team:${L.id}:${cat}:${i + 1}`;
        records.push({ id, kind: 'team', league: L.id, category: cat, label, rank: i + 1, athlete_id: null, team: x.team, year: x.year, span: null, value: x.value, provenance: 'derived_statistic' as Prov });
        if (i === 0) fact({ id: `f.record.team.${L.id}.${cat}.1`, kind: 'record', year: x.year, known_from: LAST + 1, league: L.id, teams: [x.team], tier: 'specialist', provenance: 'derived_statistic',
          text: cat === 'wins' ? `The ${tn(x.team)} hold the ${L.short} record for wins in a season: ${x.value}, in ${x.year}.` : `The ${tn(x.team)} hold the ${L.short} record winning streak: ${x.value} straight, in ${x.year}.`,
          data: { category: cat, value: x.value }, refs: [`record:${id}`], uses: ['favorite_team', 'trivia'] });
      });
    }
  }
  files['history/records.json'] = records;

  // ── Franchises: titles, droughts, dynasties; grudges and rivalries ──
  for (const L of LEAGUES) {
    const trophy = lore.leagues.find((x) => x.id === L.id)!.trophy;
    const titles = board.titles(L.id);
    const ranked = [...titles].sort((a, b) => b[1].length - a[1].length);
    fact({ id: `f.franchise.${L.id}.most_titles`, kind: 'franchise', year: LAST, known_from: LAST + 1, league: L.id, teams: [ranked[0][0]], tier: 'casual', provenance: 'derived_statistic',
      text: `The ${tn(ranked[0][0])} have won ${theTrophy(trophy)} more than any other ${L.short} team: ${ranked[0][1].length} times through 2026.`, data: { titles: ranked[0][1].length }, refs: ranked[0][1].map((y) => `champ:${L.id}-${y}`), uses: ['favorite_team', 'trivia', 'sportsbook'] });
    for (const t of teamsOf(L.id)) {
      const ys = titles.get(t.id) ?? [];
      fact({ id: `f.franchise.${t.id}`, kind: 'franchise', year: LAST, known_from: LAST + 1, league: L.id, teams: [t.id], tier: 'fan', provenance: 'derived_statistic',
        text: ys.length ? `The ${t.displayName} have won ${theTrophy(trophy)} ${ys.length} time${ys.length === 1 ? '' : 's'} (${ys.join(', ')}), through 2026.` : `The ${t.displayName} have never won ${theTrophy(trophy)} (through 2026).`,
        data: { titles: ys.length, years: ys.map(String) }, refs: ys.length ? ys.map((y) => `champ:${L.id}-${y}`) : [`team:${t.id}`], uses: ['favorite_team', 'sportsbook', 'trivia'] });
      const last = ys.at(-1);
      const since = last ?? FOUNDED[L.id] - 1;
      const gap = LAST - since;
      if (gap >= 10) fact({ id: `f.drought.${t.id}`, kind: 'drought', year: LAST, known_from: LAST + 1, league: L.id, teams: [t.id], tier: 'fan', provenance: 'derived_statistic',
        text: last ? `The ${t.displayName} haven't won ${theTrophy(trophy)} since ${last}: ${gap} seasons through 2026.` : `The ${t.displayName} have gone all ${gap} seasons since the league began without winning ${theTrophy(trophy)}.`,
        data: { seasons: gap, last: last ?? null }, refs: last ? [`champ:${L.id}-${last}`] : [`team:${t.id}`], uses: ['favorite_team', 'grudge', 'sportsbook'] });
    }
    for (const c of board.records(L.id).team.consecutive.filter((x) => x.count >= 3)) {
      fact({ id: `f.franchise.${c.team}.run_${c.span[0]}`, kind: 'franchise', year: c.span[1], known_from: c.span[1] + 1, league: L.id, teams: [c.team], tier: 'fan', provenance: 'proposed_canon',
        text: `The ${tn(c.team)} won ${theTrophy(trophy)} ${c.count} years in a row, ${c.span[0]}–${c.span[1]}.`, data: { count: c.count }, refs: Array.from({ length: c.count }, (_, i) => `champ:${L.id}-${c.span[0] + i}`), uses: ['favorite_team', 'championship_memory', 'trivia'] });
    }
    // Playoff head-to-head between franchises.
    const pairs = new Map<string, { a: string; b: string; ids: string[]; aw: number; bw: number; finals: number }>();
    for (const x of series.filter((y) => y.league === L.id)) {
      const [a, b] = [x.winner, x.loser].sort();
      const k = `${a}|${b}`;
      const p = pairs.get(k) ?? { a, b, ids: [], aw: 0, bw: 0, finals: 0 };
      p.ids.push(x.id);
      if (x.winner === a) p.aw++; else p.bw++;
      if (x.round === 'final') p.finals++;
      pairs.set(k, p);
    }
    for (const p of pairs.values()) {
      const r = lore.rivalries.find((x) => x.teams.includes(p.a) && x.teams.includes(p.b));
      if (!r && p.aw + p.bw < 4) continue;
      const [top, other, tw, ow] = p.aw >= p.bw ? [p.a, p.b, p.aw, p.bw] : [p.b, p.a, p.bw, p.aw];
      fact({ id: `f.${r ? 'rivalry' : 'grudge'}.${p.a}.${p.b}`, kind: r ? 'rivalry' : 'grudge', year: LAST, known_from: LAST + 1, league: L.id, teams: [top, other], rivalry: r?.id ?? null, events: r?.events ?? [], tier: r ? 'fan' : 'specialist', provenance: 'derived_statistic',
        text: `The ${tn(top)} and the ${tn(other)} have met ${p.aw + p.bw} times in the playoffs${p.finals ? ` (${p.finals} in the final)` : ''}; the ${teamById(top).name} won ${tw}${tw === ow ? ' each' : `, the ${teamById(other).name} ${ow}`}, through 2026.`,
        data: { meetings: p.aw + p.bw, finals: p.finals, leader: top, leader_wins: tw, other_wins: ow }, refs: p.ids.map((x) => `series:${x}`), uses: r ? ['rivalry', 'grudge', 'favorite_team'] : ['grudge', 'favorite_team', 'trivia'] });
    }
  }

  // ── Hall of Fame, legends, drafts, trades ──
  const hofRows = hof.filter((x) => x.year <= 2027).map((x) => ({ id: x.i, athlete_id: x.i, league: x.l, year: x.year, pathway: x.pathway, basis: x.basis ?? null, score: x.score ?? null, provenance: (x.pathway === 'legends' ? 'approved_canon' : 'derived_statistic') as Prov }));
  files['history/hall_of_fame.json'] = hofRows;
  for (const x of hofRows) fact({ id: `f.hall_of_fame.${x.athlete_id}`, kind: 'hall_of_fame', year: x.year, known_from: x.year, league: x.league, athletes: [x.athlete_id], teams: board.player(x.athlete_id)?.teams ?? [], tier: x.pathway === 'legends' ? 'casual' : 'fan', provenance: x.provenance,
    text: x.pathway === 'legends' ? `${name(x.athlete_id)} entered the ${leagueById(x.league).short} Hall of Fame in ${x.year} through the Historical Legends pathway: ${x.basis}.` : `${name(x.athlete_id)} was inducted into the ${leagueById(x.league).short} Hall of Fame in ${x.year}.`,
    data: { pathway: x.pathway }, refs: [`hof:${x.athlete_id}`], uses: ['legend', 'favorite_team', 'trivia'] });
  for (const p of board.players().filter((x) => x.legend)) {
    const c = board.totals().get(p.i);
    const aw = board.awardsOf(p.i);
    const count = (n: string) => aw.filter((a) => a.award === n).length;
    const bits = [count('Most Valuable Player') && `${count('Most Valuable Player')} MVP award${count('Most Valuable Player') > 1 ? 's' : ''}`, count('Championship MVP') && `${count('Championship MVP')} Championship MVP award${count('Championship MVP') > 1 ? 's' : ''}`].filter(Boolean);
    const span = c ? `${c.years[0]}–${p.status === 'retired' ? c.years.at(-1) : 'present'}` : '';
    const lp = lore.people.find((x) => x.name === p.n);
    fact({ id: `f.legend.${p.i}`, kind: 'legend', year: Math.min(LAST, c?.years.at(-1) ?? LAST), known_from: Math.min(LAST, c?.years.at(-1) ?? LAST) + 1, league: p.l, teams: p.teams, athletes: [p.i], events: lp?.events ?? [], tier: 'casual', provenance: 'proposed_canon',
      text: `${p.n} played for the ${p.teams.map(tn).join(' and the ')} (${span})${bits.length ? `, with ${bits.join(' and ')}` : ''}.`, data: { bible_person: lp?.id ?? null }, refs: [`athlete:${p.i}`], uses: ['legend', 'favorite_team', 'trivia'] });
  }
  files['history/drafts.json'] = drafts;
  for (const d of drafts.filter((x) => x.overall === 1)) fact({ id: `f.draft.${d.league}-${d.year}`, kind: 'draft', year: d.year, known_from: d.year, league: d.league, teams: [d.team], athletes: [d.athlete_id], tier: 'historian', provenance: 'generated_history',
    text: `${name(d.athlete_id)} was the first overall pick in the ${d.year} ${leagueById(d.league).short} draft, by the ${tn(d.team)}.`, data: { round: 1, pick: 1 }, refs: [`draft:${d.id}`], uses: ['trivia', 'favorite_team'] });
  const trades = H.transactions.map((t) => ({ id: `${t.playerId.slice(0, 3)}-${t.year}:${t.playerId}`, league: t.playerId.slice(0, 3) as LeagueId, year: t.year, type: t.type, athlete_id: t.playerId, from: t.from, to: t.to, note: t.note ?? null, event: (t as { event?: string }).event ?? null }));
  files['history/transactions.json'] = trades;
  for (const t of trades) fact({ id: `f.trade.${t.id.replace(':', '.')}`, kind: 'trade', year: t.year, known_from: t.year, league: t.league, teams: [t.from, t.to], athletes: [t.athlete_id], events: t.event ? [t.event] : [], tier: 'fan', provenance: 'proposed_canon',
    text: `In ${t.year} the ${tn(t.from)} traded ${name(t.athlete_id)} to the ${tn(t.to)}.${t.note ? ` ${t.note.replace(/\(the players are not yet identified in the data\)/, '(the players in the deal are not identified)')}.` : ''}`, data: { from: t.from, to: t.to }, refs: [`trade:${t.id}`], uses: ['grudge', 'legend', 'trivia'] });

  facts.sort((a, b) => a.id.localeCompare(b.id));
  files['knowledge/facts.json'] = facts;
  // ── Index ──
  const add = (m: Record<string, string[]>, k: string, v: string) => { (m[k] ??= []).push(v); };
  const ix = { by_league: {}, by_team: {}, by_athlete: {}, by_year: {}, by_event: {}, by_rivalry: {}, teams_by_city: {}, teams_by_state: {} } as Record<string, Record<string, string[]>>;
  for (const f of facts) {
    add(ix.by_league, f.league, f.id);
    add(ix.by_year, String(f.year), f.id);
    f.teams.forEach((t) => add(ix.by_team, t, f.id));
    f.athletes.forEach((a) => add(ix.by_athlete, a, f.id));
    f.events.forEach((e) => add(ix.by_event, e, f.id));
    if (f.rivalry) add(ix.by_rivalry, f.rivalry, f.id);
  }
  for (const L of LEAGUES) for (const t of teamsOf(L.id)) { add(ix.teams_by_city, `${t.city}, ${t.state}`, t.id); add(ix.teams_by_state, t.state, t.id); }
  files['knowledge/index.json'] = ix;
  return { files, facts, slug };
}

/** Every id a fact may cite, by prefix, from the history files. */
export function refTargets(files: Record<string, unknown>): Set<string> {
  const out = new Set<string>();
  const ids = (name: string, prefix: string, key = 'id') => (files[name] as Record<string, string>[]).forEach((r) => out.add(`${prefix}:${r[key]}`));
  ids('history/seasons.json', 'season');
  ids('history/championships.json', 'champ');
  ids('history/playoff_series.json', 'series');
  ids('history/awards.json', 'award');
  ids('history/leaders.json', 'leader');
  ids('history/records.json', 'record');
  ids('history/hall_of_fame.json', 'hof');
  ids('history/drafts.json', 'draft');
  ids('history/transactions.json', 'trade');
  ids('history/players.json', 'athlete');
  const g = files['history/games.json'] as { rows: string[][] };
  g.rows.forEach((r) => out.add(`game:${r[0]}`));
  for (const L of LEAGUES) teamsOf(L.id).forEach((t) => out.add(`team:${t.id}`));
  return out;
}
