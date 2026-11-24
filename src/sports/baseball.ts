/**
 * Baseball: plate appearance by plate appearance. Batting order from the best available nine
 * hitters; starting pitchers rotate through the healthy starters by team game number; the
 * starter goes about five to seven innings depending on stamina, then the bullpen. Extra
 * innings until decided (runner on second from the 10th). Deterministic for the game's stream.
 */
import { SPORTS_CONFIG } from './config';
import type { Player } from './players';
import type { Rng } from './rng';
import { available, avg, boxOf, type GameContext, type GameResult } from './sim';

const C = SPORTS_CONFIG.baseball;
const HITTERS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH', 'UT'];
/** A pitcher forced to bat. */
const PITCHER_AT_BAT = { contact: 30, power: 25, discipline: 30, speed: 35, fielding: 40 };

interface Side {
  lineup: Player[];
  starter: Player;
  starterOuts: number;
  bullpen: number;
  next: number;
}

function side(roster: readonly Player[], gameNo: number, r: Rng, forceStarter?: string, forceOuts?: number): Side {
  const lineup = available(roster, ...HITTERS).slice(0, 9);
  // Short of nine healthy hitters: pitchers fill in (weak bats, as in an emergency).
  if (lineup.length < 9) lineup.push(...available(roster, 'RP', 'SP').slice(0, 9 - lineup.length));
  const starters = available(roster, 'SP').sort((a, b) => a.id.localeCompare(b.id));
  const forced = forceStarter ? roster.find((p) => p.id === forceStarter) : undefined;
  const starter = forced ?? (starters.length ? starters[gameNo % starters.length] : available(roster, 'RP')[0]);
  const s = C.starterInnings;
  const innings = Math.max(s.min, Math.min(s.max, s.base + (starter.attrs.stamina / 100) * s.stamina + r.normal() * s.sd));
  const pen = available(roster, 'RP');
  const pitch = (p: Player) => p.attrs.velocity * 0.5 + p.attrs.control * 0.5;
  return { lineup, starter, starterOuts: forceOuts ?? Math.round(innings * 3), bullpen: avg(pen, pitch, 55), next: 0 };
}

export function playBaseball(id: string, home: string, away: string, homeRoster: readonly Player[], awayRoster: readonly Player[], r: Rng, ctx: GameContext): GameResult {
  const H = side(homeRoster, ctx.homeGameNo, r, ctx.starter?.home, ctx.starterOuts?.home);
  const A = side(awayRoster, ctx.awayGameNo, r, ctx.starter?.away, ctx.starterOuts?.away);
  // Pitching lines for each fielding side: the starter, and the bullpen as a whole.
  const pl = () => ({ outs: 0, h: 0, r: 0, bb: 0, k: 0, hr: 0 });
  const pitching = { home: { sp: pl(), bp: pl() }, away: { sp: pl(), bp: pl() } };
  const box = boxOf([...A.lineup, ...H.lineup].map((p) => p.id));
  const score = { home: 0, away: 0 };
  const outsPitched = { home: 0, away: 0 };

  /** One half-inning: `bat` hits against `field`. Stops early on a walk-off. */
  const half = (bat: Side, fieldSide: Side, battingHome: boolean, inning: number, walkOffTarget: number | null) => {
    const k = battingHome ? 'home' : 'away';
    const fk = battingHome ? 'away' : 'home';
    let outs = 0;
    // bases[0] = first, [1] = second, [2] = third. From the 10th, the previous batter starts on second.
    const bases: (string | null)[] = [null, inning >= 10 && C.ghostRunner ? bat.lineup[(bat.next + bat.lineup.length - 1) % bat.lineup.length].id : null, null];
    const line = () => pitching[fk as 'home'][outsPitched[fk] < fieldSide.starterOuts ? 'sp' : 'bp'];
    const run = (runner: string | null, batter: string) => {
      if (!runner) return;
      score[k]++;
      line().r++;
      box.add(runner, 'r');
      box.add(batter, 'rbi');
      box.points(batter, 1);
    };
    while (outs < 3) {
      if (walkOffTarget !== null && score[k] > walkOffTarget) return;
      const batter = bat.lineup[bat.next % bat.lineup.length];
      bat.next++;
      const starterIn = outsPitched[fk] < fieldSide.starterOuts;
      const pq = starterIn ? fieldSide.starter.attrs.velocity * 0.5 + fieldSide.starter.attrs.control * 0.5 : fieldSide.bullpen;
      const ctrl = starterIn ? fieldSide.starter.attrs.control : fieldSide.bullpen;
      const a = batter.attrs.contact === undefined ? PITCHER_AT_BAT : batter.attrs;
      const hitEdge = battingHome && !ctx.neutral ? 1 + C.homeEdge : 1;
      const sc = C.scale;
      const p = {
        k: C.rates.k * (1 + (pq - 60) * sc.pitch - (a.contact - 60) * sc.contact),
        bb: C.rates.bb * (1 + (a.discipline - 60) * sc.discipline - (ctrl - 60) * sc.pitch),
        single: C.rates.single * (1 + (a.contact - 60) * sc.contact - (pq - 60) * sc.pitch) * hitEdge,
        double: C.rates.double * (1 + (a.power - 60) * sc.contact - (pq - 60) * sc.pitch) * hitEdge,
        triple: C.rates.triple * (1 + (a.speed - 60) * sc.speed) * hitEdge,
        hr: C.rates.hr * (1 + (a.power - 60) * sc.power - (pq - 60) * sc.pitch) * hitEdge,
      };
      const ws = Object.values(p).map((x) => Math.max(0.001, x));
      const inPlayOut = Math.max(0.2, 1 - ws.reduce((s2, x) => s2 + x, 0));
      const outcome = r.weighted([...ws, inPlayOut]);
      const bid = batter.id;
      const pa = (stat: string) => box.add(bid, stat);
      const pline = line();
      if (outcome !== 1) pa('ab');
      if (outcome === 0) {
        pa('k');
        pline.k++;
        pline.outs++;
        outs++;
        outsPitched[fk]++;
      } else if (outcome === 1) {
        pa('bb');
        pline.bb++;
        // Forced runners only.
        if (bases[0]) {
          if (bases[1]) {
            if (bases[2]) run(bases[2], bid);
            bases[2] = bases[1];
          }
          bases[1] = bases[0];
        }
        bases[0] = bid;
      } else if (outcome === 2) {
        pa('h');
        pline.h++;
        run(bases[2], bid);
        bases[2] = null;
        if (bases[1]) {
          if (r.chance(C.scoreFromSecond)) run(bases[1], bid);
          else bases[2] = bases[1];
          bases[1] = null;
        }
        if (bases[0]) bases[1] = bases[0];
        bases[0] = bid;
      } else if (outcome === 3) {
        pa('h');
        pa('2b');
        pline.h++;
        run(bases[2], bid);
        run(bases[1], bid);
        bases[2] = null;
        bases[1] = null;
        if (bases[0]) {
          if (r.chance(C.scoreFromFirst)) run(bases[0], bid);
          else bases[2] = bases[0];
        }
        bases[0] = null;
        bases[1] = bid;
      } else if (outcome === 4) {
        pa('h');
        pa('3b');
        pline.h++;
        for (const b of [2, 1, 0]) run(bases[b], bid);
        bases.fill(null);
        bases[2] = bid;
      } else if (outcome === 5) {
        pa('h');
        pa('hr');
        pline.h++;
        pline.hr++;
        for (const b of [2, 1, 0]) run(bases[b], bid);
        bases.fill(null);
        run(bid, bid);
      } else {
        // Ball in play, out: maybe a sacrifice fly or a double play.
        pline.outs++;
        outs++;
        outsPitched[fk]++;
        if (outs < 3 && bases[0] && r.chance(C.doublePlay)) {
          pline.outs++;
          outs++;
          outsPitched[fk]++;
          bases[0] = null;
        } else if (outs < 3 && bases[2] && r.chance(C.sacFly)) {
          run(bases[2], bid);
          bases[2] = null;
        }
      }
    }
  };

  let inning = 1;
  for (;; inning++) {
    half(A, H, false, inning, null);
    // Home team skips the bottom half when already ahead from the 9th on.
    if (inning >= 9 && score.home > score.away) break;
    half(H, A, true, inning, inning >= 9 ? score.away : null);
    if (inning >= 9 && score.home !== score.away) break;
  }
  return {
    id,
    home,
    away,
    homeScore: score.home,
    awayScore: score.away,
    ot: Math.max(0, inning - 9),
    ...(ctx.neutral ? { neutral: true } : {}),
    detail: {
      home: { starter: H.starter.id, ...Object.fromEntries(Object.entries(pitching.home.sp).map(([k2, v]) => [`sp_${k2}`, v])), ...Object.fromEntries(Object.entries(pitching.home.bp).map(([k2, v]) => [`bp_${k2}`, v])) },
      away: { starter: A.starter.id, ...Object.fromEntries(Object.entries(pitching.away.sp).map(([k2, v]) => [`sp_${k2}`, v])), ...Object.fromEntries(Object.entries(pitching.away.bp).map(([k2, v]) => [`bp_${k2}`, v])) },
    },
    box: box.lines().map((l) => ({ ...l, extra: { ...l.extra, v: (l.extra!.h ?? 0) + 2 * (l.extra!.hr ?? 0) + (l.extra!.rbi ?? 0) + (l.extra!.r ?? 0) + (l.extra!.bb ?? 0) * 0.5 } })),
  };
}
