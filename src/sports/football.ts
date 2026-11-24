/**
 * Football: drive by drive. Offence (quarterback, receivers, running back, line) against defence
 * (line, linebackers, secondary) sets each drive's chance of a touchdown or a field goal.
 * Regular-season games can end tied after a short overtime; playoff games play on until decided.
 */
import { SPORTS_CONFIG } from './config';
import type { Player } from './players';
import type { Rng } from './rng';
import { available, avg, boxOf, type GameContext, type GameResult } from './sim';

const C = SPORTS_CONFIG.football;

interface Unit {
  offense: number;
  defense: number;
  qb?: Player;
  rbs: Player[];
  receivers: Player[];
  kicker?: Player;
  dressed: Player[];
}

function unit(roster: readonly Player[]): Unit {
  const qb = available(roster, 'QB')[0];
  const rbs = available(roster, 'RB').slice(0, 2);
  const wrs = available(roster, 'WR').slice(0, 3);
  const te = available(roster, 'TE').slice(0, 1);
  const ol = available(roster, 'OL').slice(0, 5);
  const dl = available(roster, 'DL').slice(0, 4);
  const lb = available(roster, 'LB').slice(0, 3);
  const db = available(roster, 'DB').slice(0, 4);
  const kicker = available(roster, 'K')[0];
  const skill = (p: Player) => p.attrs.skill;
  const offense = (qb ? qb.overall : 40) * 0.35 + avg([...wrs, ...te], (p) => p.overall) * 0.25 + avg(rbs.slice(0, 1), (p) => p.overall) * 0.15 + avg(ol, (p) => p.overall, 40) * 0.25;
  const defense = avg(dl, (p) => p.overall) * 0.35 + avg(lb, (p) => p.overall) * 0.3 + avg(db, (p) => p.overall) * 0.35;
  return { offense, defense, qb, rbs, receivers: [...wrs, ...te].sort((a, b) => skill(b) - skill(a)), kicker, dressed: [qb, ...rbs.slice(0, 1), ...wrs, ...te, kicker].filter(Boolean) as Player[] };
}

export function playFootball(id: string, home: string, away: string, homeRoster: readonly Player[], awayRoster: readonly Player[], r: Rng, ctx: GameContext): GameResult {
  const H = unit(homeRoster);
  const A = unit(awayRoster);
  const box = boxOf([...A.dressed, ...H.dressed].map((p) => p.id));
  const score = { home: 0, away: 0 };
  const tz = () => ({ drives: 0, passTd: 0, rushTd: 0, fga: 0, fgm: 0, pat: 0, defTd: 0 });
  const tally = { home: tz(), away: tz() };

  /** One drive; returns points scored by the offence (or −7 for a defensive touchdown). */
  const drive = (off: Unit, def: Unit, isHome: boolean): { off: number; def: number } => {
    const adj = (off.offense - def.defense) * C.matchupScale + (isHome && !ctx.neutral ? C.homeEdge : 0);
    const t = tally[isHome ? 'home' : 'away'];
    t.drives++;
    if (r.chance(C.defensiveScore)) {
      tally[isHome ? 'away' : 'home'].defTd++;
      return { off: 0, def: 7 };
    }
    if (r.chance(Math.max(0.05, C.touchdown + adj))) {
      // Who scored: a pass (quarterback + receiver) or a run.
      if (r.chance(C.passShare) && off.receivers.length) {
        const rec = off.receivers[r.weighted(off.receivers.map((p, i) => p.attrs.skill / (i + 1)))];
        box.add(rec.id, 'td');
        box.points(rec.id, 6);
        if (off.qb) box.add(off.qb.id, 'passTd');
        t.passTd++;
      } else if (off.rbs[0]) {
        t.rushTd++;
        const rb = off.rbs[r.chance(0.8) || off.rbs.length < 2 ? 0 : 1];
        box.add(rb.id, 'td');
        box.points(rb.id, 6);
      }
      const pat = r.chance(C.patPct);
      if (pat) t.pat++;
      if (pat && off.kicker) box.points(off.kicker.id, 1);
      return { off: pat ? 7 : 6, def: 0 };
    }
    if (r.chance(C.fieldGoalTry)) {
      t.fga++;
      const make = C.fieldGoal.base + (off.kicker?.attrs.skill ?? 50) * C.fieldGoal.skill;
      if (r.chance(Math.min(0.97, make))) {
        t.fgm++;
        if (off.kicker) {
          box.points(off.kicker.id, 3);
          box.add(off.kicker.id, 'fg');
        }
        return { off: 3, def: 0 };
      }
    }
    return { off: 0, def: 0 };
  };
  const take = (homeOffense: boolean) => {
    const d = homeOffense ? drive(H, A, true) : drive(A, H, false);
    if (homeOffense) {
      score.home += d.off;
      score.away += d.def;
    } else {
      score.away += d.off;
      score.home += d.def;
    }
  };

  const drives = Math.max(8, Math.round(C.drives.mean + r.normal() * C.drives.sd));
  const homeFirst = r.chance(0.5);
  for (let i = 0; i < drives; i++) {
    take(homeFirst);
    take(!homeFirst);
  }
  // Overtime: both teams get the ball; then sudden death. Regular season may end tied.
  let ot = 0;
  if (score.home === score.away) {
    ot = 1;
    const first = r.chance(0.5);
    take(first);
    take(!first);
    const limit = ctx.playoff ? 200 : C.otDrives * 2;
    for (let i = 0; score.home === score.away && i < limit; i++) take(i % 2 === 0 ? first : !first);
    if (ctx.playoff && score.home === score.away) score[r.chance(0.5) ? 'home' : 'away'] += 3;
  }
  const lines = box.lines().map((l) => ({ ...l, extra: { ...l.extra, v: (l.extra!.td ?? 0) * 6 + (l.extra!.passTd ?? 0) * 4 + (l.extra!.fg ?? 0) } }));
  return {
    id,
    home,
    away,
    homeScore: score.home,
    awayScore: score.away,
    ot,
    ...(score.home === score.away ? { tie: true } : {}),
    ...(ctx.neutral ? { neutral: true } : {}),
    detail: { home: { ...tally.home, qb: H.qb?.id ?? '' }, away: { ...tally.away, qb: A.qb?.id ?? '' } },
    box: lines,
  };
}
