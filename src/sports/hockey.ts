/**
 * Hockey: shots per period from attack against defence, each shot against the goalie in net.
 * The backup goalie starts every few games. Tied after three periods: a short sudden-death
 * overtime, then a shootout; the shootout winner is credited one extra goal (standings give
 * the loser a point for an overtime or shootout loss).
 */
import { SPORTS_CONFIG } from './config';
import type { Player } from './players';
import type { Rng } from './rng';
import { available, avg, boxOf, type GameContext, type GameResult } from './sim';

const C = SPORTS_CONFIG.hockey;

interface Team {
  attack: number;
  defense: number;
  goalie: number;
  goalieId?: string;
  skaters: Player[];
  shooters: { p: Player; w: number }[];
}

function team(roster: readonly Player[], gameNo: number): Team {
  const cs = available(roster, 'C').slice(0, 3);
  const ws = available(roster, 'W').slice(0, 6);
  const ds = available(roster, 'D').slice(0, 6);
  const gs = available(roster, 'G');
  const g = gs.length > 1 && gameNo % C.backupEvery === C.backupEvery - 1 ? gs[1] : gs[0];
  const fwd = [...cs, ...ws];
  const skaters = [...fwd, ...ds];
  return {
    attack: avg(fwd, (p) => p.attrs.shooting * 0.4 + p.attrs.passing * 0.3 + p.attrs.skating * 0.3),
    defense: avg(ds, (p) => p.attrs.checking * 0.5 + p.attrs.skating * 0.25 + p.attrs.passing * 0.25),
    goalie: g ? g.attrs.reflexes * 0.55 + g.attrs.positioning * 0.45 : 40,
    goalieId: g?.id,
    skaters,
    shooters: skaters.map((p) => ({ p, w: (p.pos === 'D' ? 0.4 : 1) * (0.4 + p.attrs.shooting / 100) })),
  };
}

export function playHockey(id: string, home: string, away: string, homeRoster: readonly Player[], awayRoster: readonly Player[], r: Rng, ctx: GameContext): GameResult {
  const H = team(homeRoster, ctx.homeGameNo);
  const A = team(awayRoster, ctx.awayGameNo);
  const box = boxOf([...A.skaters, ...H.skaters].map((p) => p.id).concat([A.goalieId, H.goalieId].filter(Boolean) as string[]));
  const score = { home: 0, away: 0 };

  /** One shot by `off` on `def`'s goalie; true if it goes in. */
  const shot = (off: Team, def: Team, isHome: boolean): boolean => {
    const s = off.shooters[r.weighted(off.shooters.map((x) => x.w))].p;
    const pct = C.shootingPct + (s.attrs.shooting - def.goalie) * C.matchupScale + (isHome && !ctx.neutral ? C.homeEdge : 0);
    box.add(s.id, 'sog');
    if (def.goalieId) box.add(def.goalieId, 'sa');
    if (!r.chance(Math.max(0.03, pct))) return false;
    box.add(s.id, 'g');
    box.points(s.id, 1);
    if (def.goalieId) box.add(def.goalieId, 'ga');
    const mates = off.skaters.filter((p) => p.id !== s.id);
    if (mates.length && r.chance(C.assist1)) {
      const a1 = mates[r.weighted(mates.map((p) => 0.4 + p.attrs.passing / 100))];
      box.add(a1.id, 'a');
      const rest = mates.filter((p) => p.id !== a1.id);
      if (rest.length && r.chance(C.assist2)) box.add(rest[r.weighted(rest.map((p) => 0.4 + p.attrs.passing / 100))].id, 'a');
    }
    return true;
  };
  const shots = (off: Team, def: Team) => Math.max(C.shotsPerPeriod.min, Math.round(C.shotsPerPeriod.mean + (off.attack - def.defense) * C.shotScale + r.normal() * C.shotsPerPeriod.sd));

  for (let period = 0; period < 3; period++) {
    const hs = shots(H, A);
    const as = shots(A, H);
    // Interleave the shots so period order is natural (it doesn't change the totals).
    for (let i = 0; i < Math.max(hs, as); i++) {
      if (i < hs && shot(H, A, true)) score.home++;
      if (i < as && shot(A, H, false)) score.away++;
    }
  }
  let ot = 0;
  let so = false;
  if (score.home === score.away && ctx.playoff) {
    // Playoffs: full 20-minute sudden-death periods until someone scores, no shootout. `ot` counts periods.
    while (score.home === score.away && ot < 12) {
      ot++;
      const hs = shots(H, A);
      const as = shots(A, H);
      for (let i = 0; i < Math.max(hs, as) && score.home === score.away; i++) {
        if (i < hs && shot(H, A, true)) score.home++;
        else if (i < as && shot(A, H, false)) score.away++;
      }
    }
    if (score.home === score.away) score[r.chance(0.5) ? 'home' : 'away']++; // a 12th overtime never ends level
  } else if (score.home === score.away) {
    ot = 1;
    const total = Math.max(1, Math.round((C.otShots.mean + r.normal() * C.otShots.sd) * 2));
    for (let i = 0; i < total && score.home === score.away; i++) {
      // Who gets each chance depends a little on attack.
      const homeShoots = r.chance(0.5 + (H.attack - A.attack) * 0.005);
      if (homeShoots ? shot(H, A, true) : shot(A, H, false)) score[homeShoots ? 'home' : 'away']++;
    }
    if (score.home === score.away) {
      so = true;
      const shooters = (t: Team) => [...t.skaters].sort((a, b) => b.attrs.shooting - a.attrs.shooting || a.id.localeCompare(b.id));
      const hS = shooters(H);
      const aS = shooters(A);
      const attempt = (s: Player, goalie: number) => r.chance(Math.max(0.1, C.shootoutPct + (s.attrs.shooting - goalie) * 0.004));
      let h = 0;
      let a = 0;
      let round = 0;
      // Three rounds, then sudden death (a coin flip only if it somehow runs 60 rounds).
      for (; round < 3; round++) {
        if (attempt(hS[round % hS.length], A.goalie)) h++;
        if (attempt(aS[round % aS.length], H.goalie)) a++;
      }
      for (; h === a && round < 60; round++) {
        if (attempt(hS[round % hS.length], A.goalie)) h++;
        if (attempt(aS[round % aS.length], H.goalie)) a++;
      }
      if (h === a) {
        if (r.chance(0.5)) h++;
        else a++;
      }
      score[h > a ? 'home' : 'away']++;
    }
  }
  return {
    id,
    home,
    away,
    homeScore: score.home,
    awayScore: score.away,
    ot,
    ...(so ? { so } : {}),
    ...(ctx.neutral ? { neutral: true } : {}),
    detail: { home: { goalie: H.goalieId ?? '' }, away: { goalie: A.goalieId ?? '' } },
    box: box.lines().map((l) => ({ ...l, extra: { ...l.extra, v: (l.extra!.g ?? 0) * 1.2 + (l.extra!.a ?? 0) } })),
  };
}
