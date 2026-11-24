/**
 * Phase C: player statistics derived from the generated historical games.
 *
 * Two kinds of numbers, both deterministic:
 *  - EXACT: what the simulation recorded (points and made shots, at-bats, hits, home runs, runs,
 *    RBI, walks, strikeouts, pitchers' lines while on the mound, touchdowns, goals, assists, shots,
 *    goalies' shots against and goals against).
 *  - ALLOCATED: secondary stats the simulation doesn't model play by play (missed shots by player,
 *    rebounds, assists, steals, blocks, turnovers, minutes; relievers' split of the bullpen line,
 *    stolen bases; yards, attempts, receptions, tackles, sacks, interceptions; penalty minutes).
 *    They come from a separate seeded stream and always add up to the game's real totals.
 * Three anchor facts are applied as documented adjustments that never change a score:
 * Soren's 71 saves (extra saved shots), Calvin Redd's 31 points (made baskets moved from
 * teammates), Voss's 1983 (generated with fixed starts, see games.ts).
 * Season totals are sums of games; career totals are sums of seasons; rates are recomputed.
 */
import { leagueById, type LeagueId, type Sport } from '../demo';
import type { Player } from '../players';
import { stream, type Rng } from '../rng';
import type { HistoryData } from './data';
import type { HGame, HistorySeason } from './games';
import { HISTORY_SEED, historyRoster } from './rosters';

export type StatLine = Record<string, number>;
export interface PlayerSeason {
  playerId: string;
  teamId: string;
  league: LeagueId;
  year: number;
  regular: StatLine;
  playoffs: StatLine;
}
export interface Adjustment { game: string; player: string; what: string; event: string }

export const ANCHOR_STATS = {
  soren: { season: 'fhl-1989', player: 'fhl_viktor_soren', saves: 71, event: 'fhl-1989-001' },
  redd: { season: 'ccl-1996', player: 'ccl_calvin_redd', points: 31, event: 'ccl-1996-001' },
} as const;

const add = (into: StatLine, from: StatLine) => {
  for (const [k, v] of Object.entries(from)) into[k] = (into[k] ?? 0) + v;
};

/** Splits an integer total across weights (largest remainder; ties by a seeded jitter). */
export function split(total: number, weights: number[], r: Rng): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (total <= 0 || sum <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (w / sum) * total);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((x, i) => ({ i, f: x - Math.floor(x) + r.next() * 1e-6 })).sort((a, b) => b.f - a.f);
  for (let k = 0; left > 0; k++, left--) out[order[k % order.length].i]++;
  return out;
}
const poisson = (r: Rng, mean: number) => {
  const L = Math.exp(-mean);
  let k = 0;
  for (let p = r.next(); p > L; p *= r.next()) k++;
  return k;
};

type Side = 'home' | 'away';
const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');

// ── Basketball ──
function basketball(g: HGame, rosters: Map<string, Player[]>, out: Map<string, StatLine>, adj: Adjustment[]) {
  const res = g.result;
  const box = new Map(res.box.map((b) => [b.playerId, { ...b.extra }]));
  // Anchor: Calvin Redd's 31 points in the deciding game of the 1996 final.
  const sr = ANCHOR_STATS.redd;
  if (g.id.startsWith('ccl:h1996:po:final') && g.winner === 'ccl_dustdevils' && g.decider) {
    const me = box.get(sr.player) ?? { fg2m: 0, fg3m: 0, ftm: 0 };
    box.set(sr.player, me);
    const mates = rosters.get('ccl_dustdevils')!.map((p) => p.id).filter((id) => id !== sr.player && box.has(id));
    const pts = (m: Record<string, number | undefined>) => 2 * (m.fg2m ?? 0) + 3 * (m.fg3m ?? 0) + (m.ftm ?? 0);
    while (pts(me) < sr.points) {
      const need = sr.points - pts(me);
      const kind = need >= 3 && need !== 4 ? 'fg3m' : need >= 2 ? 'fg2m' : 'ftm';
      const donor = mates.filter((id) => (box.get(id)![kind] ?? 0) > 0).sort((a, b) => pts(box.get(b)!) - pts(box.get(a)!))[0];
      if (!donor) throw new Error('Cannot reach Redd\'s 31 points');
      box.get(donor)![kind]!--;
      me[kind] = (me[kind] ?? 0) + 1;
    }
    adj.push({ game: g.id, player: sr.player, what: `${sr.points} points (made baskets moved from teammates; team score unchanged)`, event: sr.event });
  }
  for (const side of ['home', 'away'] as Side[]) {
    const team = side === 'home' ? g.home : g.away;
    const d = res.detail![side] as Record<string, number | string>;
    const o = res.detail![other(side)] as Record<string, number | string>;
    const roster = new Map(rosters.get(team)!.map((p) => [p.id, p]));
    const rot = String(d.rotation).split(',').filter(Boolean).map((id) => roster.get(id)!).filter(Boolean);
    const r = stream(HISTORY_SEED, 'detail', g.id, side);
    const n = rot.length;
    const minutes = split(240 + 25 * res.ot, rot.map((_, i) => (i < 5 ? 1 : 0.42) * (0.85 + 0.3 * r.next())), r);
    const mk = (p: Player, k: string) => Number(box.get(p.id)?.[k] ?? 0);
    const w = (f: (p: Player) => number) => rot.map((p, i) => minutes[i] * f(p));
    const miss2 = split(Number(d.fg2a) - Number(d.fg2m), w((p) => 0.5 + (p.attrs.inside + p.attrs.shooting) / 200), r);
    const miss3 = split(Number(d.fg3a) - Number(d.fg3m), w((p) => 0.2 + p.attrs.shooting / 100), r);
    const missFt = split(Number(d.fta) - Number(d.ftm), w((p) => 0.4 + p.attrs.inside / 100), r);
    const oreb = split(Number(d.oreb), w((p) => p.attrs.rebounding), r);
    const oppMiss = Number(o.fg2a) + Number(o.fg3a) - Number(o.fg2m) - Number(o.fg3m);
    const dreb = split(Math.max(0, oppMiss - Number(o.oreb)), w((p) => p.attrs.rebounding + 10), r);
    const ast = split(Math.round(0.58 * (Number(d.fg2m) + Number(d.fg3m))), w((p) => p.attrs.playmaking), r);
    const stl = split(Math.round(0.55 * Number(o.tov)), w((p) => p.attrs.defense), r);
    const blk = split(Math.round(0.09 * oppMiss), w((p) => p.attrs.inside + p.attrs.defense / 2), r);
    const tov = split(Number(d.tov), w((p) => p.attrs.playmaking / 2 + p.attrs.shooting / 2), r);
    for (let i = 0; i < n; i++) {
      const p = rot[i];
      const f2 = mk(p, 'fg2m');
      const f3 = mk(p, 'fg3m');
      const ft = mk(p, 'ftm');
      out.set(p.id, {
        gp: 1, gs: i < 5 ? 1 : 0, min: minutes[i], pts: 2 * f2 + 3 * f3 + ft,
        fgm: f2 + f3, fga: f2 + f3 + miss2[i] + miss3[i], fg3m: f3, fg3a: f3 + miss3[i], ftm: ft, fta: ft + missFt[i],
        oreb: oreb[i], dreb: dreb[i], reb: oreb[i] + dreb[i], ast: ast[i], stl: stl[i], blk: blk[i], tov: tov[i],
      });
    }
  }
}

// ── Baseball ──
function baseball(g: HGame, rosters: Map<string, Player[]>, out: Map<string, StatLine>) {
  const res = g.result;
  for (const side of ['home', 'away'] as Side[]) {
    const team = side === 'home' ? g.home : g.away;
    const roster = rosters.get(team)!;
    const ids = new Set(roster.map((p) => p.id));
    const r = stream(HISTORY_SEED, 'detail', g.id, side);
    // Hitters: everyone who came to the plate.
    for (const b of res.box) {
      if (!ids.has(b.playerId)) continue;
      const e = b.extra ?? {};
      const ab = e.ab ?? 0;
      const bb = e.bb ?? 0;
      if (!ab && !bb) continue;
      const p = roster.find((x) => x.id === b.playerId)!;
      const onFirst = (e.h ?? 0) - (e['2b'] ?? 0) - (e['3b'] ?? 0) - (e.hr ?? 0) + bb;
      let sb = 0;
      for (let k = 0; k < onFirst; k++) if (r.chance(0.04 + Math.max(0, (p.attrs.speed ?? 40) - 55) * 0.004)) sb++;
      out.set(b.playerId, { g: 1, ab, r: e.r ?? 0, h: e.h ?? 0, '2b': e['2b'] ?? 0, '3b': e['3b'] ?? 0, hr: e.hr ?? 0, rbi: e.rbi ?? 0, bb, so: e.k ?? 0, sb });
    }
    // Pitchers: the starter's exact line; the bullpen line split across relievers.
    const d = res.detail![side] as Record<string, number | string>;
    const won = g.winner === team;
    const margin = Math.abs(res.homeScore - res.awayScore);
    const starter = String(d.starter);
    const sp = { outs: +d.sp_outs, h: +d.sp_h, r: +d.sp_r, bb: +d.sp_bb, k: +d.sp_k, hr: +d.sp_hr };
    const bp = { outs: +d.bp_outs, h: +d.bp_h, r: +d.bp_r, bb: +d.bp_bb, k: +d.bp_k, hr: +d.bp_hr };
    const pen = roster.filter((p) => p.pos === 'RP' && p.id !== starter).sort((a, b) => b.overall - a.overall || a.id.localeCompare(b.id));
    const used = bp.outs > 0 && pen.length ? Math.min(pen.length, Math.max(1, Math.ceil(bp.outs / 4))) : 0;
    // Middle relievers first, the closer (best) last.
    const relievers = used ? [...pen.slice(1, used), pen[0]].slice(-used) : [];
    const share = split(bp.outs, relievers.map((_, i) => (i === relievers.length - 1 ? 1 : 1.4)), r);
    const lines: [string, StatLine][] = [[starter, { p_g: 1, p_gs: 1, p_outs: sp.outs, p_h: sp.h, p_r: sp.r, p_er: sp.r, p_bb: sp.bb, p_k: sp.k, p_hr: sp.hr }]];
    const per = (k: keyof typeof bp) => split(bp[k], share.map((x) => x + 0.01), r);
    const [ph, pr, pbb, pk, phr] = (['h', 'r', 'bb', 'k', 'hr'] as const).map(per);
    relievers.forEach((p, i) => lines.push([p.id, { p_g: 1, p_gs: 0, p_outs: share[i], p_h: ph[i], p_r: pr[i], p_er: pr[i], p_bb: pbb[i], p_k: pk[i], p_hr: phr[i] }]));
    // Decisions: a starter who goes 5+ innings gets the decision; otherwise the first reliever.
    const deciding = sp.outs >= 15 || !relievers.length ? starter : relievers[0].id;
    for (const [id, l] of lines) {
      l.w = won && id === deciding ? 1 : 0;
      l.l = !won && id === deciding ? 1 : 0;
      l.sv = won && relievers.length && id === relievers[relievers.length - 1].id && id !== deciding && margin <= 3 ? 1 : 0;
      l.cg = id === starter && bp.outs === 0 ? 1 : 0;
      l.sho = l.cg && won && sp.r === 0 ? 1 : 0;
      l.nohit = l.cg && won && sp.h === 0 ? 1 : 0;
      const prev = out.get(id) ?? {};
      out.set(id, { ...prev, ...l });
    }
  }
}

// ── Football ──
function football(g: HGame, rosters: Map<string, Player[]>, out: Map<string, StatLine>) {
  const res = g.result;
  const lines = new Map<string, StatLine>();
  const line = (id: string) => {
    let l = lines.get(id);
    if (!l) lines.set(id, (l = { g: 1 }));
    return l;
  };
  const off: Record<Side, { int: number; plays: number; completions: number }> = { home: { int: 0, plays: 0, completions: 0 }, away: { int: 0, plays: 0, completions: 0 } };
  for (const side of ['home', 'away'] as Side[]) {
    const team = side === 'home' ? g.home : g.away;
    const roster = rosters.get(team)!;
    const d = res.detail![side] as Record<string, number | string>;
    const o = res.detail![other(side)] as Record<string, number | string>;
    const r = stream(HISTORY_SEED, 'detail', g.id, side);
    const by = (pos: string) => roster.filter((p) => p.pos === pos).sort((a, b) => b.overall - a.overall || a.id.localeCompare(b.id));
    const qb = roster.find((p) => p.id === d.qb) ?? by('QB')[0];
    const rbs = by('RB').slice(0, 2);
    const recv = [...by('WR').slice(0, 3), ...by('TE').slice(0, 1), ...rbs.slice(0, 1)];
    const tdDrives = +d.passTd + +d.rushTd;
    const fgDrives = +d.fga;
    const lostToDefense = +o.defTd;
    const empty = Math.max(0, +d.drives - tdDrives - fgDrives - lostToDefense);
    let yards = 0;
    for (let i = 0; i < tdDrives; i++) yards += Math.max(10, Math.round(68 + r.normal() * 12));
    for (let i = 0; i < fgDrives; i++) yards += Math.max(5, Math.round(45 + r.normal() * 10));
    for (let i = 0; i < empty; i++) yards += Math.max(0, Math.round(24 + r.normal() * 12));
    const passShare = Math.min(0.75, Math.max(0.35, 0.55 + r.normal() * 0.08));
    const passYds = Math.round(yards * passShare);
    const rushYds = yards - passYds;
    const skill = qb ? qb.attrs.skill : 50;
    const att = Math.max(+d.passTd + 1, Math.round(passYds / Math.max(4.5, 7 + r.normal() + (skill - 60) * 0.03)));
    const cmp = Math.min(att, Math.max(+d.passTd, Math.round(att * Math.min(0.75, 0.56 + (skill - 60) * 0.004))));
    const int = Math.min(empty, lostToDefense + poisson(r, 0.7));
    const carries = Math.max(+d.rushTd, Math.round(rushYds / 4.2));
    off[side] = { int, plays: carries + cmp, completions: cmp };
    if (qb) Object.assign(line(qb.id), { pass_att: att, pass_cmp: cmp, pass_yds: passYds, pass_td: +d.passTd, int_thrown: int });
    // Rushing: RB1 most, RB2 some, the quarterback a little; touchdowns exactly as scored.
    const rushers = [...rbs, ...(qb ? [qb] : [])];
    const car = split(carries, rushers.map((p, i) => (p === qb ? 0.12 : i === 0 ? 0.68 : 0.2)), r);
    const ry = split(Math.max(0, rushYds), car.map((c) => c + 0.01), r);
    rushers.forEach((p, i) => {
      const l = line(p.id);
      l.rush_att = (l.rush_att ?? 0) + car[i];
      l.rush_yds = (l.rush_yds ?? 0) + ry[i];
    });
    // Receiving: catches and yards add up to the passing line; every receiving touchdown keeps its catch.
    const tdBy = new Map(res.box.filter((b) => roster.some((p) => p.id === b.playerId)).map((b) => [b.playerId, b.extra?.td ?? 0]));
    const recTd = recv.map((p) => (p.pos === 'RB' ? 0 : tdBy.get(p.id) ?? 0));
    const rbRecTd = 0;
    const base = recTd.reduce((a, b) => a + b, 0) + rbRecTd;
    const extra = split(Math.max(0, cmp - base), recv.map((p) => (p.pos === 'RB' ? 0.5 : p.pos === 'TE' ? 0.8 : 1.2) * (0.5 + p.attrs.skill / 100)), r);
    const rec = recv.map((_, i) => recTd[i] + extra[i]);
    const recYds = split(passYds, rec.map((x) => x + 0.01), r);
    recv.forEach((p, i) => {
      const l = line(p.id);
      l.rec = (l.rec ?? 0) + rec[i];
      l.rec_yds = (l.rec_yds ?? 0) + recYds[i];
      l.rec_td = (l.rec_td ?? 0) + recTd[i];
    });
    for (const p of rbs) line(p.id).rush_td = (line(p.id).rush_td ?? 0) + (tdBy.get(p.id) ?? 0);
  }
  // Defense: tackles on the other offence's plays, sacks, interceptions, forced fumbles.
  for (const side of ['home', 'away'] as Side[]) {
    const team = side === 'home' ? g.home : g.away;
    const roster = rosters.get(team)!;
    const r = stream(HISTORY_SEED, 'defense', g.id, side);
    const dl = roster.filter((p) => p.pos === 'DL');
    const lb = roster.filter((p) => p.pos === 'LB');
    const db = roster.filter((p) => p.pos === 'DB');
    const defenders = [...dl, ...lb, ...db];
    if (!defenders.length) continue;
    const opp = off[other(side)];
    const wt = (p: Player) => (p.pos === 'LB' ? 1.5 : p.pos === 'DB' ? 1 : 0.9) * (0.5 + p.attrs.awareness / 100);
    const tk = split(opp.plays, defenders.map(wt), r);
    const sacks = split(poisson(r, 2.2), defenders.map((p) => (p.pos === 'DL' ? 1.2 : p.pos === 'LB' ? 0.6 : 0.1) * p.attrs.strength), r);
    const ints = split(opp.int, defenders.map((p) => (p.pos === 'DB' ? 1 : p.pos === 'LB' ? 0.35 : 0.05) * p.attrs.awareness), r);
    const ff = split(poisson(r, 0.6), defenders.map(wt), r);
    defenders.forEach((p, i) => Object.assign(line(p.id), { tackles: tk[i], sacks: sacks[i], def_int: ints[i], ff: ff[i] }));
  }
  for (const [id, l] of lines) out.set(id, l);
}

// ── Hockey ──
function hockey(g: HGame, rosters: Map<string, Player[]>, out: Map<string, StatLine>, adj: Adjustment[]) {
  const res = g.result;
  const box = new Map(res.box.map((b) => [b.playerId, { ...b.extra }]));
  const goalies = new Set([res.detail!.home.goalie, res.detail!.away.goalie].map(String));
  // Anchor: Viktor Soren's 71 saves in the 1989 triple-overtime game (extra saved shots; score unchanged).
  const ss = ANCHOR_STATS.soren;
  if (g.events.includes(ss.event)) {
    const gl = box.get(ss.player)!;
    const saves = (gl.sa ?? 0) - (gl.ga ?? 0);
    const extra = ss.saves - saves;
    if (extra < 0) throw new Error(`Soren already has ${saves} saves`);
    gl.sa = (gl.sa ?? 0) + extra;
    const oppTeam = g.winner === g.home ? g.away : g.home;
    const shooters = rosters.get(oppTeam)!.filter((p) => p.pos !== 'G' && box.has(p.id));
    const r = stream(HISTORY_SEED, 'soren', g.id);
    const add2 = split(extra, shooters.map((p) => 0.4 + p.attrs.shooting / 100), r);
    shooters.forEach((p, i) => (box.get(p.id)!.sog = (box.get(p.id)!.sog ?? 0) + add2[i]));
    adj.push({ game: g.id, player: ss.player, what: `${ss.saves} saves (${extra} extra saved shots added; score unchanged)`, event: ss.event });
  }
  for (const side of ['home', 'away'] as Side[]) {
    const team = side === 'home' ? g.home : g.away;
    const roster = rosters.get(team)!;
    const r = stream(HISTORY_SEED, 'detail', g.id, side);
    const skaters = roster.filter((p) => p.pos !== 'G' && box.has(p.id));
    const pimUnits = split(poisson(r, 4), skaters.map((p) => 0.3 + p.attrs.checking / 100), r);
    skaters.forEach((p, i) => {
      const e = box.get(p.id)!;
      out.set(p.id, { gp: 1, g: e.g ?? 0, a: e.a ?? 0, pts: (e.g ?? 0) + (e.a ?? 0), sog: e.sog ?? 0, pim: pimUnits[i] * 2 });
    });
    const gid = String(res.detail![side].goalie);
    if (gid && goalies.has(gid)) {
      const e = box.get(gid) ?? {};
      const won = g.winner === team;
      const ga = e.ga ?? 0;
      const min = 60 + (g.playoff ? 20 * res.ot : res.ot ? 5 : 0);
      out.set(gid, { g_gp: 1, g_gs: 1, w: won ? 1 : 0, l: !won && (!res.ot || g.playoff) ? 1 : 0, otl: !won && res.ot && !g.playoff ? 1 : 0, sa: e.sa ?? 0, sv: (e.sa ?? 0) - ga, ga, so: won && ga === 0 ? 1 : 0, min });
    }
  }
}

/** Every player's stat line for one game. */
export function gameLines(g: HGame, rosters: Map<string, Player[]>, adj: Adjustment[] = []): Map<string, StatLine> {
  const out = new Map<string, StatLine>();
  const sport = leagueById(g.league).sport;
  if (sport === 'basketball') basketball(g, rosters, out, adj);
  else if (sport === 'baseball') baseball(g, rosters, out);
  else if (sport === 'football') football(g, rosters, out);
  else hockey(g, rosters, out, adj);
  return out;
}

/** Season stat lines for every rostered player (regular season and playoffs separately). */
export function seasonStats(data: HistoryData, h: HistorySeason, onGame?: (g: HGame, lines: Map<string, StatLine>) => void): { players: PlayerSeason[]; adjustments: Adjustment[] } {
  const s = h.season;
  const rosters = new Map(Object.keys(s.records).map((t) => [t, historyRoster(data, s, t)]));
  const team = new Map<string, string>();
  for (const [t, ps] of rosters) for (const p of ps) team.set(p.id, t);
  const acc = new Map<string, PlayerSeason>();
  for (const [id, t] of team) acc.set(id, { playerId: id, teamId: t, league: s.league, year: s.year, regular: {}, playoffs: {} });
  const adjustments: Adjustment[] = [];
  const games = [...h.regular, ...h.playoffs.flatMap((x) => x.games)];
  for (const g of games) {
    const lines = gameLines(g, rosters, adjustments);
    onGame?.(g, lines);
    for (const [id, l] of lines) {
      const ps = acc.get(id);
      if (ps) add(g.playoff ? ps.playoffs : ps.regular, l);
    }
  }
  return { players: [...acc.values()], adjustments };
}

/** Averages and percentages, always computed from totals (never summed). */
export function rates(sport: Sport, l: StatLine): Record<string, number> {
  const q = (a: number, b: number, d = 3) => (b ? Math.round((a / b) * 10 ** d) / 10 ** d : 0);
  if (sport === 'basketball') return { ppg: q(l.pts ?? 0, l.gp ?? 0, 1), rpg: q(l.reb ?? 0, l.gp ?? 0, 1), apg: q(l.ast ?? 0, l.gp ?? 0, 1), fg_pct: q(l.fgm ?? 0, l.fga ?? 0), fg3_pct: q(l.fg3m ?? 0, l.fg3a ?? 0), ft_pct: q(l.ftm ?? 0, l.fta ?? 0) };
  if (sport === 'baseball') {
    const tb = (l.h ?? 0) + (l['2b'] ?? 0) + 2 * (l['3b'] ?? 0) + 3 * (l.hr ?? 0);
    return { avg: q(l.h ?? 0, l.ab ?? 0), obp: q((l.h ?? 0) + (l.bb ?? 0), (l.ab ?? 0) + (l.bb ?? 0)), slg: q(tb, l.ab ?? 0), era: q(27 * (l.p_er ?? 0), l.p_outs ?? 0, 2), ip: Math.floor((l.p_outs ?? 0) / 3) + ((l.p_outs ?? 0) % 3) / 10 };
  }
  if (sport === 'football') return { cmp_pct: q(l.pass_cmp ?? 0, l.pass_att ?? 0), ypa: q(l.pass_yds ?? 0, l.pass_att ?? 0, 1), ypc: q(l.rush_yds ?? 0, l.rush_att ?? 0, 1) };
  return { ppg: q(l.pts ?? 0, l.gp ?? 0, 2), sv_pct: q(l.sv ?? 0, l.sa ?? 0), gaa: q(60 * (l.ga ?? 0), l.min ?? 0, 2) };
}

/** Career totals from season lines (regular season and playoffs). */
export function careerOf(seasons: PlayerSeason[]): { seasons: number; regular: StatLine; playoffs: StatLine; teams: string[]; first: number; last: number } {
  const regular: StatLine = {};
  const playoffs: StatLine = {};
  for (const s of seasons) {
    add(regular, s.regular);
    add(playoffs, s.playoffs);
  }
  const ys = seasons.map((s) => s.year);
  return { seasons: seasons.length, regular, playoffs, teams: [...new Set(seasons.map((s) => s.teamId))], first: Math.min(...ys), last: Math.max(...ys) };
}
