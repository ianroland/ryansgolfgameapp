/**
 * A casual round at Dry Creek Muni after Rytirement: the same course and swing as Act I, no
 * field, no prize, no career record. The best muni score is kept for bragging rights only.
 */
import { useMemo, useState } from 'react';
import { simHole } from '../../career/field';
import { playerRating, shotModifiers } from '../../career/stats';
import { getCourse } from '../../golf/courses';
import { rng } from '../../golf/math';
import { MUNI_COURSE_ID } from '../../career/engine';
import { appearanceOf, resolveLook } from '../../story/appearance';
import { useGame } from '../GameContext';
import { toPar } from '../format';
import { HolePlayer } from './TournamentView';
import type { HoleSetup } from '../../game/RoundScene';

export const MUNI_EVENT = 'wtg:muni';
export const openMuni = () => window.dispatchEvent(new CustomEvent(MUNI_EVENT));

export function MuniRound({ onExit }: { onExit: () => void }) {
  const { state, services, run, notify } = useGame();
  const c = state.career;
  const course = getCourse(MUNI_COURSE_ID);
  const [seed] = useState(() => Math.floor(Math.random() * 2 ** 30));
  const [holes, setHoles] = useState<number[]>([]);
  const [count, setCount] = useState<9 | 18 | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const idx = holes.length;
  const done = count !== null && idx >= count;
  const pars = course.holes.map((h) => h.par);
  const total = holes.reduce((a, b) => a + b, 0);
  const parSoFar = pars.slice(0, idx).reduce((a, b) => a + b, 0);

  const setup: HoleSetup | null = useMemo(() => {
    if (count === null || done) return null;
    const r = rng(seed + idx * 7919);
    const mods = shotModifiers(c, 0);
    return {
      hole: course.holes[idx % course.holes.length],
      holeIndex: idx % course.holes.length,
      holeCount: course.holes.length,
      theme: course.theme,
      courseId: course.id,
      wind: { mph: Math.round(r.next() * 10), heading: Math.round(r.next() * 360) },
      golferName: 'Ryan',
      look: resolveLook(appearanceOf(c)).sheet,
      statusLine: `MUNI · Hole ${idx + 1}/${count} · ${toPar(total - parSoFar)}`,
      strength: mods.strength,
      mods,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, idx]);

  const finish = async (card: number[]) => {
    const o = await run(() => services.career.recordMuniRound(card));
    if (o?.message) { setSaved(o.message); notify({ kind: 'info', title: o.message }); }
  };
  const holeDone = (strokes: number) => {
    const card = [...holes, strokes];
    setHoles(card);
    if (count !== null && card.length >= count) void finish(card);
  };
  const simRest = () => {
    if (count === null) return;
    const r = rng(seed ^ 0x5eed);
    const rating = playerRating(c);
    const card = [...holes];
    while (card.length < count) card.push(simHole(pars[card.length % pars.length], rating, r));
    setHoles(card);
    void finish(card);
  };

  return (
    <div className="round muni" data-testid="muni-round">
      <div className="round-bar">
        <span className="pill">Muni</span>
        <strong>{course.name}</strong>
        <span className="muted">Casual round · not in the career record</span>
        <span className="round-skins"><span className="me">Ryan {count ? toPar(total - parSoFar) : 'E'}</span></span>
      </div>
      {count === null ? (
        <section className="hub-card between">
          <h2 className="hub-title">Dry Creek Muni</h2>
          <p>Where it all started. Baba mowed the practice green this morning in a pattern he says spells nothing. The starter waves you through.</p>
          <div className="btn-row">
            <button className="btn primary" onClick={() => setCount(9)} data-testid="muni-9">Play nine</button>
            <button className="btn" onClick={() => setCount(18)} data-testid="muni-18">Play eighteen</button>
            <button className="btn ghost" onClick={onExit}>Back</button>
          </div>
          {(c.flags.muniBest9 || c.flags.muniBest18) && <p className="muted">Muni best: {c.flags.muniBest9 ? `${c.flags.muniBest9} for nine` : ''}{c.flags.muniBest9 && c.flags.muniBest18 ? ' · ' : ''}{c.flags.muniBest18 ? `${c.flags.muniBest18} for eighteen` : ''}</p>}
        </section>
      ) : !done && setup ? (
        <HolePlayer setup={setup} onComplete={holeDone} onSimRest={simRest} />
      ) : (
        <section className="hub-card between" data-testid="muni-done">
          <h2 className="hub-title">Card signed: {total} ({toPar(total - holes.reduce((a, _, i) => a + pars[i % pars.length], 0))})</h2>
          <p className="muni-card">{holes.map((h, i) => <span key={i} className={h < pars[i % pars.length] ? 'under' : h > pars[i % pars.length] ? 'over' : ''}>{h}</span>)}</p>
          {saved && <p>{saved}</p>}
          <p className="muted">Baba says your follow-through was fine. He says it like it costs him money.</p>
          <button className="btn primary" onClick={onExit} data-testid="muni-exit">Back to the clubhouse</button>
        </section>
      )}
    </div>
  );
}
