import { appearanceOf, resolveLook } from '../../story/appearance';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type * as Phaser from 'phaser';
import { achievementById } from '../../career/achievements';
import { TOURS } from '../../career/config';
import { shotModifiers } from '../../career/stats';
import {
  activeCourse, cutLine, findTournament, holeForRound, holesToPlay, parsOf, pressureFor, previewRound, windsForRound,
  type TournamentDef, type TournamentResult,
} from '../../career/tournament';
import type { ActiveTournament, CareerState } from '../../career/types';
import { coursePar } from '../../golf/course';
import { albatrossId, isAlbatross } from '../../records/albatross';
import { celebrateAlbatross } from '../records/celebrate';
import { createRoundGame, RoundScene, type HoleSetup } from '../../game/RoundScene';
import type { ProcessOutcome } from '../../services/tournamentPipeline';
import { useGame } from '../GameContext';
import { sound } from '../../audio/sound';
import { formatMoney, toPar } from '../format';
import { TourPill } from '../career/bits';
import { CUTINS_ENABLED, useCutIn } from './useCutIn';

interface Row {
  id: string;
  name: string;
  pos: string;
  total: number;
  thru: string;
  rounds: number[];
  cut: boolean;
}

/**
 * Live leaderboard: completed rounds plus the current round revealed up to
 * the last hole Ryan has finished (the field's holes are pre-determined, so
 * this is exactly what will be recorded).
 */
function leaderboard(active: ActiveTournament, def: TournamentDef, c: CareerState): Row[] {
  const alive = new Set(active.alive);
  const played = active.playerHoles.map((h, i) => (h === null ? -1 : i));
  const thruN = Math.max(-1, ...played) + 1;
  const live = thruN > 0 && active.round < def.rounds ? previewRound(active, def, c) : {};
  const PARS = parsOf(activeCourse(active));
  const COURSE_PAR = PARS.reduce((a, b) => a + b, 0);
  const rows = active.entrants.map((e) => {
    const rounds = (active.scores[e.id] ?? []).map((r) => r.reduce((a, b) => a + b, 0));
    let total = rounds.reduce((a, b) => a + b, 0) - COURSE_PAR * rounds.length;
    let thru = active.round > 0 ? 'F' : '—';
    const cur = live[e.id];
    if (cur) {
      total += cur.slice(0, thruN).reduce((a, b, i) => a + b - PARS[i], 0);
      thru = thruN === PARS.length ? 'F' : `${thruN}`;
    }
    return { id: e.id, name: e.name, total, thru, rounds, cut: !alive.has(e.id), pos: '' };
  });
  rows.sort((a, b) => Number(a.cut) - Number(b.cut) || a.total - b.total || a.name.localeCompare(b.name));
  return rows.map((r) => {
    const tied = rows.filter((x) => x.cut === r.cut && x.total === r.total).length > 1;
    const first = rows.findIndex((x) => x.cut === r.cut && x.total === r.total);
    return { ...r, pos: r.cut ? 'MC' : `${tied ? 'T' : ''}${first + 1}` };
  });
}

function Leaderboard({ rows, me, rival, limit = 10 }: { rows: Row[]; me: string; rival: string; limit?: number }) {
  const shown = rows.filter((r, i) => i < limit || r.id === me || r.id === rival);
  return (
    <table className="leaderboard">
      <thead>
        <tr><th>Pos</th><th className="lb-name">Player</th><th>To par</th><th>Thru</th></tr>
      </thead>
      <tbody>
        {shown.map((r) => (
          <tr key={r.id} className={`${r.id === me ? 'me' : ''} ${r.id === rival ? 'rival' : ''} ${r.cut ? 'cut' : ''}`}>
            <td>{r.pos}</td>
            <td className="lb-name">{r.name}</td>
            <td className={r.total < 0 ? 'under' : ''}>{toPar(r.total)}</td>
            <td>{r.thru}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ───────────────────────── Playing a hole ─────────────────────────

function HolePlayer({ setup, onComplete, onSimRest }: { setup: HoleSetup; onComplete: (strokes: number, shot?: string) => void; onSimRest: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<RoundScene | null>(null);
  const completeRef = useRef(onComplete);
  completeRef.current = onComplete;
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const scene = new RoundScene();
    sceneRef.current = scene;
    scene.setHandlers({ onHoleComplete: (strokes, _holed, shot) => completeRef.current(strokes, shot) });
    const game: Phaser.Game = createRoundGame(hostRef.current!, scene);
    if (import.meta.env.DEV) (window as unknown as { wtgRound: unknown }).wtgRound = scene;
    return () => {
      sceneRef.current = null;
      game.destroy(true);
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.startHole(setup);
  }, [setup]);

  useEffect(() => {
    sceneRef.current?.setPaused(paused);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPaused((p) => !p);
      if (e.key === '?') sceneRef.current?.flyover();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paused]);

  const touch = (cmd: Parameters<RoundScene['command']>[0]) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      sceneRef.current?.command(cmd, true);
    },
    onPointerUp: () => sceneRef.current?.command(cmd, false),
    onPointerLeave: () => sceneRef.current?.command(cmd, false),
  });

  return (
    <>
      <div className="round-stage" ref={hostRef} data-testid="round-canvas" />
      <div className="touch-controls" aria-label="Touch controls">
        <button {...touch('left')} aria-label="Aim left">◀</button>
        <button {...touch('right')} aria-label="Aim right">▶</button>
        <button {...touch('up')} aria-label="Club up / topspin">▲</button>
        <button {...touch('down')} aria-label="Club down / backspin">▼</button>
        <button {...touch('curveL')}>DRAW</button>
        <button {...touch('curveR')}>FADE</button>
        <button className="swing" {...touch('swing')}>SWING</button>
      </div>
      <div className="round-tools">
        <button className="btn small flyover-btn" onClick={() => sceneRef.current?.flyover()} title="See the whole hole (F or ?)" data-testid="flyover">
          <span className="q" aria-hidden="true">?</span> Flyover
        </button>
        <button className="btn ghost small pause-btn" onClick={() => setPaused(true)}>Pause (Esc)</button>
      </div>
      {paused && (
        <div className="round-overlay" role="dialog" aria-label="Paused">
          <div className="round-card">
            <h2>Paused</h2>
            <p className="muted">Simming the rest of the round plays out your remaining holes using your skills.</p>
            <div className="btn-col">
              <button className="btn primary" onClick={() => setPaused(false)} autoFocus>Keep playing</button>
              <button className="btn" onClick={() => { setPaused(false); onSimRest(); }} data-testid="sim-rest">Sim rest of round</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ───────────────────────── Tournament flow ─────────────────────────

interface Finished {
  result: TournamentResult;
  outcome: ProcessOutcome | undefined;
}

export function TournamentView({ onExit }: { onExit: () => void }) {
  const { state, services, run, refresh, setInspectTrophyId } = useGame();
  const c = state.career;
  const [finished, setFinished] = useState<Finished | null>(null);
  const [playing, setPlaying] = useState(false);
  const [holeDone, setHoleDone] = useState<{ idx: number; strokes: number } | null>(null);
  const [busy, setBusy] = useState(false);
  // CI-2: competitor cut-ins (review build only; see useCutIn.ts).
  const cutIn = useCutIn();
  const offerCutIn = cutIn.offer;
  const active = c.active;
  const def: TournamentDef | undefined = active ? findTournament(active.tournamentId) : finished?.result.def;

  const finishRound = useCallback(async () => {
    setBusy(true);
    setPlaying(false);
    setHoleDone(null);
    const out = await run(() => services.career.finishRound());
    setBusy(false);
    if (out?.result) {
      setFinished({ result: out.result, outcome: out.outcome });
      const me = out.result.standings.find((s) => s.id === out.result!.playerId);
      if (me?.madeCut && me.position === 1) {
        sound.playMusic(null);
        sound.play('win');
      } else if (me && !me.madeCut) sound.play('missed_cut');
      else if (me && me.position <= 10) sound.play('clap');
    }
  }, [run, services]);

  // A tournament whose rounds are all done (e.g. after a reload) finalizes.
  useEffect(() => {
    if (active && def && active.round >= def.rounds && !busy) {
      setBusy(true);
      void services.career.finalizeActive().then(async (out) => {
        await refresh();
        setBusy(false);
        if (out.result) setFinished({ result: out.result, outcome: out.outcome });
      });
    }
  }, [active, def, busy, services, refresh]);

  const course = active ? activeCourse(active) : null;
  const PARS = course ? parsOf(course) : [];
  const toPlay = active ? holesToPlay(active.mode, active.round, PARS) : [];
  const nextHole = active ? toPlay.find((i) => active.playerHoles[i] === null) : undefined;
  const rows = useMemo(() => (active && def ? leaderboard(active, def, c) : []), [active, def, c]);
  const me = rows.find((r) => r.id === c.playerId);

  const setup: HoleSetup | null = useMemo(() => {
    if (!active || !def || !course || nextHole === undefined) return null;
    const wind = windsForRound(active.seed, active.round, course)[nextHole];
    const mods = shotModifiers(c, pressureFor(active, def));
    return {
      hole: holeForRound(course.holes[nextHole], active.seed, active.round),
      holeIndex: nextHole,
      holeCount: course.holes.length,
      theme: course.theme,
      wind,
      golferName: 'Ryan',
      look: resolveLook(appearanceOf(c)).sheet,
      statusLine: `RD ${active.round + 1}/${def.rounds} · ${me?.pos ?? '—'} · ${toPar(me?.total ?? 0)}`,
      strength: mods.strength,
      mods,
    };
    // Only rebuild when the hole changes, not on every leaderboard update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.tournamentId, active?.round, nextHole]);

  const onHoleComplete = useCallback(
    async (strokes: number, shot?: string) => {
      if (nextHole === undefined || !active || !course) return;
      const idx = nextHole;
      const saved = await run(() => services.career.recordHole(idx, strokes, shot));
      const hole = course.holes[idx];
      // CI-2: a competitor cut-in for the boundary just saved, shown before the hole card.
      // Ryan's own albatross celebration takes the moment instead.
      if (CUTINS_ENABLED && saved && def && !isAlbatross(hole.par, strokes)) await offerCutIn(active, saved.active, def, saved);
      setHoleDone({ idx, strokes });
      // The finalized hole score (penalties included) is three under: celebrate now.
      // The permanent record is written when the tournament result is verified.
      if (saved && isAlbatross(hole.par, strokes)) {
        // Career count so far: finished events, earlier rounds here, and this round.
        const pars = course.holes.map((h) => h.par);
        const here = [...(saved.active?.scores[saved.playerId] ?? []), saved.active?.playerHoles ?? []]
          .flatMap((holes) => holes.map((s, i) => (s !== null && isAlbatross(pars[i], s) ? 1 : 0)))
          .reduce<number>((a, b) => a + b, 0);
        celebrateAlbatross({
          careerCount: (saved.totals.albatrosses ?? 0) + here,
          id: albatrossId(active.tournamentId, saved.playerId, active.round + 1, idx + 1),
          courseName: course.name,
          holeNumber: hole.number,
          holeName: hole.name,
          par: hole.par,
          strokes,
          eventName: def?.name ?? '',
          shot,
        });
      }
    },
    [nextHole, run, services, active, course, def, offerCutIn],
  );

  if (!def) return null;
  const cfg = TOURS[def.tour];

  // ── Final results ──
  if (finished) {
    const r = finished.result;
    const mine = r.standings.find((s) => s.id === r.playerId)!;
    const outcome = finished.outcome;
    const news = c.inbox[0];
    return (
      <div className="round">
        <div className="round-card wide final-card" role="dialog" aria-label="Final results">
          <h2>{r.def.name}: Final</h2>
          <p className={`final-pos ${mine.position === 1 && mine.madeCut ? 'win' : ''}`} data-testid="final-pos">
            {mine.madeCut ? (mine.position === 1 ? `🏆 Champion!${mine.playoff ? ' (won the playoff)' : ''}` : `Finished ${mine.posLabel}`) : 'Missed the cut'} · {toPar(mine.toPar)} ({mine.rounds.join('-')})
          </p>
          {mine.prize > 0 && <p className="skin-call win">Prize money: {formatMoney(mine.prize)}</p>}
          {news && <p className="muted">{news.body}</p>}
          {outcome?.status === 'applied' && outcome.awardedTrophyIds.length > 0 && (
            <div className="trophy-unlocks">
              {outcome.awardedTrophyIds.map((tid) => (
                <button key={tid} className="btn primary" onClick={() => setInspectTrophyId(tid)}>
                  🏆 New trophy: view
                </button>
              ))}
            </div>
          )}
          {outcome?.status === 'applied' && outcome.unlocked.length > 0 && (
            <p className="achieve-line">Achievements: {outcome.unlocked.map((id) => achievementById(id)?.name ?? id).join(', ')}</p>
          )}
          {outcome?.status === 'rejected' && <p className="warn-text">Result not recorded: {outcome.reason}</p>}
          <div className="lb-wrap">
            <table className="leaderboard">
              <thead>
                <tr><th>Pos</th><th className="lb-name">Player</th>{Array.from({ length: r.def.rounds }, (_, i) => <th key={i}>R{i + 1}</th>)}<th>Tot</th><th>To par</th>{r.def.prizeMoney && <th>Prize</th>}</tr>
              </thead>
              <tbody>
                {r.standings
                  .filter((s, i) => i < 10 || s.id === r.playerId || s.id === c.rivalId)
                  .map((s) => (
                    <tr key={s.id} className={`${s.id === r.playerId ? 'me' : ''} ${s.id === c.rivalId ? 'rival' : ''} ${s.madeCut ? '' : 'cut'}`}>
                      <td>{s.posLabel}</td>
                      <td className="lb-name">{s.name}{s.playoff ? ' (playoff)' : ''}</td>
                      {Array.from({ length: r.def.rounds }, (_, i) => <td key={i}>{s.rounds[i] ?? '–'}</td>)}
                      <td>{s.total}</td>
                      <td className={s.toPar < 0 ? 'under' : ''}>{toPar(s.toPar)}</td>
                      {r.def.prizeMoney && <td>{s.prize ? formatMoney(s.prize) : ''}</td>}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <div className="card-actions">
            <button className="btn primary" onClick={onExit} autoFocus data-testid="back-to-career">Back to career ▶</button>
          </div>
        </div>
      </div>
    );
  }

  if (!active || !course) return null;
  const cut = cutLine(active, def);
  const iAmIn = active.alive.includes(c.playerId);

  return (
    <div className="round">
      <div className="round-bar">
        <TourPill tour={def.tour} />
        <strong>{def.name}</strong>
        <span className="muted">Round {Math.min(active.round + 1, def.rounds)} of {def.rounds}</span>
        <span className="round-skins">
          <span className="me" data-testid="round-pos">Ryan {me?.pos} · {toPar(me?.total ?? 0)}</span>
          {cut !== null && <span>Cut {toPar(cut)}</span>}
        </span>
      </div>

      {playing && setup ? (
        <HolePlayer setup={setup} onComplete={onHoleComplete} onSimRest={finishRound} />
      ) : (
        <div className="between">
          <section className="hub-card">
            <h2 className="hub-title">
              {active.round === 0 ? 'Tee times are out' : `After round ${active.round}`}
              {cut !== null && active.round === def.cut?.afterRound && <span className={`pill ${iAmIn ? 'gold' : 'warn'}`}>{iAmIn ? 'Made the cut!' : 'Missed the cut'}</span>}
            </h2>
            <Leaderboard rows={rows} me={c.playerId} rival={c.rivalId} />
          </section>
          <section className="hub-card">
            <h2 className="hub-title">Round {active.round + 1}</h2>
            <p className="muted">
              {cfg.name} · <strong data-testid="round-course">{course.name}</strong> · par {coursePar(course)}. Energy {Math.round(c.energy)} · Form {c.form > 0 ? '+' : ''}{c.form}.
            </p>
            {toPlay.length > 0 ? (
              <p>You&rsquo;ll play holes {toPlay.map((i) => course.holes[i].number).join(', ')}. The rest are simmed from your skills.</p>
            ) : (
              <p>Quick Sim: your skills, form and nerve decide the round.</p>
            )}
            <div className="btn-col">
              {toPlay.length > 0 && (
                <button className="btn primary" onClick={() => setPlaying(true)} disabled={busy} autoFocus data-testid="tee-off">
                  {active.playerHoles.some((h) => h !== null) ? 'Continue round' : `Tee off · Hole ${course.holes[nextHole ?? toPlay[0]].number}`}
                </button>
              )}
              <button className={`btn ${toPlay.length ? '' : 'primary'}`} onClick={finishRound} disabled={busy} data-testid="sim-round">
                {busy ? 'Simulating…' : `Sim round ${active.round + 1}`}
              </button>
              {active.mode !== 'sim' && (
                <button className="btn ghost small" onClick={() => run(() => services.career.setMode('sim'))} disabled={busy}>
                  Switch to Quick Sim
                </button>
              )}
              <button className="btn ghost small" onClick={async () => { await run(() => services.career.withdraw()); onExit(); }} disabled={busy}>
                Withdraw
              </button>
            </div>
          </section>
        </div>
      )}

      {cutIn.shown && <cutIn.shown.Card view={cutIn.shown.view} onClosed={cutIn.closed} />}

      {holeDone && !cutIn.shown && (
        <div className="round-overlay" role="dialog" aria-label="Hole result">
          <div className="round-card hole-card">
            <h2>Hole {course.holes[holeDone.idx].number} · Par {PARS[holeDone.idx]}</h2>
            <p className="skin-call">
              {holeDone.strokes} strokes ({toPar(holeDone.strokes - PARS[holeDone.idx])}) · Ryan is {me?.pos} at {toPar(me?.total ?? 0)}
            </p>
            <div className="lb-wrap">
              <Leaderboard rows={rows} me={c.playerId} rival={c.rivalId} limit={5} />
            </div>
            <div className="card-actions">
              <button
                className="btn primary"
                autoFocus
                disabled={busy}
                data-testid="next-hole"
                onClick={() => (nextHole === undefined ? finishRound() : setHoleDone(null))}
              >
                {nextHole === undefined ? `Finish round ${active.round + 1} ▶` : `Next: hole ${course.holes[nextHole].number} ▶`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
