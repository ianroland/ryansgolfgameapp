/**
 * Career Legacy celebrations: the full-screen milestone announcement (first
 * major, first Pink Jacket, Career Grand Slam, 50 wins) and the Pink Jacket
 * ceremony. Shown only for notifications the authoritative pipeline emits
 * after a result commits, so each plays once. Verified data and UI labels
 * only: no dialogue, no headlines. Several in a row play one after another.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { sound } from '../../audio/sound';
import type { LegacyMoment } from '../../services/notifier';
import { useBlocking } from '../blocking';
import { toPar } from '../format';
import { appearanceOf, resolveLook } from '../../story/appearance';
import caseUrl from '../../assets/legacy/pink_jacket_case.png';
import { useGame } from '../GameContext';
import { onLegacyCelebration } from './celebrateLegacy';
import { PinkJacket } from './PinkJacket';
import { RyanJacketCelebration, CELEBRATE_MS } from './RyanJacketCelebration';

type Beat = 'result' | 'jacket' | 'ryan' | 'case';
const STAGE_MS = 2400;

export function LegacyCelebration() {
  const { state } = useGame();
  // Ryan celebrating in the jacket is drawn for phase 3 only (author-supplied art); other phases see the jacket alone.
  const phase3 = resolveLook(appearanceOf(state.career)).sheet === 'wig';
  const beats: Beat[] = phase3 ? ['result', 'jacket', 'ryan', 'case'] : ['result', 'jacket', 'case'];
  const STAGES = beats.length;
  const [queue, setQueue] = useState<LegacyMoment[]>([]);
  const [stage, setStage] = useState(0);
  const m = queue[0];
  const btn = useRef<HTMLButtonElement>(null);
  useBlocking('legacy-celebration', !!m);

  useEffect(() => onLegacyCelebration((x) => setQueue((q) => [...q, x])), []);
  useEffect(() => {
    if (!m) return;
    setStage(0);
    sound.play(m.kind === 'jacket' ? 'trophy' : 'achievement');
  }, [m]);

  const close = useCallback(() => setQueue((q) => q.slice(1)), []);
  const advance = useCallback(() => {
    if (!m || m.kind !== 'jacket' || stage >= STAGES - 1) close();
    else setStage((s) => s + 1);
  }, [m, stage, close, STAGES]);

  // The ceremony moves on by itself; the last beat waits for Continue.
  useEffect(() => {
    if (!m || m.kind !== 'jacket' || stage >= STAGES - 1) return;
    const t = setTimeout(() => setStage((s) => s + 1), beats[stage] === 'ryan' ? CELEBRATE_MS + 900 : STAGE_MS);
    return () => clearTimeout(t);
  }, [m, stage, STAGES]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (m && (m.kind !== 'jacket' || stage === STAGES - 1)) btn.current?.focus();
  }, [m, stage, STAGES]);

  useEffect(() => {
    if (!m) return;
    const opened = performance.now();
    const onKey = (e: KeyboardEvent) => {
      // Keep keys from reaching the screens underneath.
      e.stopPropagation();
      e.preventDefault();
      if (performance.now() - opened > 500) advance();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [m, advance]);

  if (!m) return null;

  if (m.kind === 'milestone') {
    return (
      <div className="legacy-celebrate" role="alertdialog" aria-modal="true" aria-labelledby="legacy-title" data-testid="legacy-celebration" onClick={advance}>
        <div className="alb-rays" aria-hidden />
        <div className="legacy-card">
          <p className="legacy-kicker">Career milestone</p>
          <h2 id="legacy-title" className="legacy-word">{m.title}</h2>
          {m.eventName && <p className="legacy-event">{m.eventName}</p>}
          {m.season > 0 && <p className="legacy-season">Season {m.season}</p>}
          <button ref={btn} className="btn primary" onClick={(e) => { e.stopPropagation(); advance(); }} data-testid="legacy-continue">
            {queue.length > 1 ? 'Next' : 'Continue'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`legacy-celebrate jacket stage-${stage}`} role="alertdialog" aria-modal="true" aria-labelledby="ceremony-title" data-testid="jacket-ceremony" data-stage={stage} onClick={advance}>
      <div className="alb-rays rose" aria-hidden />
      <div className="petals" aria-hidden>
        {Array.from({ length: 24 }, (_, i) => (
          <i key={i} style={{ left: `${(i * 41) % 100}%`, animationDelay: `${(i % 8) * 0.22}s` }} />
        ))}
      </div>
      <div className="legacy-card ceremony">
        {beats[stage] === 'result' && (
          <div className="ceremony-beat" data-testid="ceremony-result">
            <p className="legacy-kicker">Champion</p>
            <h2 id="ceremony-title" className="legacy-word">{m.eventName}</h2>
            <p className="legacy-event">{m.venue} · Season {m.season}</p>
            {m.toPar !== undefined && (
              <p className="ceremony-score">
                <b>{toPar(m.toPar)}</b>
                {m.rounds && <span> · {m.rounds.join('-')}</span>}
              </p>
            )}
            {m.runnerUp && <p className="legacy-season">Runner-up: {m.runnerUp}</p>}
          </div>
        )}
        {beats[stage] === 'jacket' && (
          <div className="ceremony-beat" data-testid="ceremony-jacket">
            <PinkJacket size={190} className="jacket-drop" title={m.title} />
            <h2 id="ceremony-title" className="legacy-word rose">{m.title}</h2>
          </div>
        )}
        {beats[stage] === 'ryan' && (
          <div className="ceremony-beat" data-testid="ceremony-ryan">
            <RyanJacketCelebration height={320} />
            <h2 id="ceremony-title" className="legacy-word rose small">Season {m.season} champion</h2>
          </div>
        )}
        {beats[stage] === 'case' && (
          <div className="ceremony-beat" data-testid="ceremony-room">
            <img className="ceremony-case jacket-drop" src={caseUrl} alt="" height={210} />
            <h2 id="ceremony-title" className="legacy-word rose small">{m.title} · No. {m.jacketNumber ?? 1}</h2>
            <p className="legacy-event">In your display case at home</p>
            <button ref={btn} className="btn primary" onClick={(e) => { e.stopPropagation(); advance(); }} data-testid="ceremony-continue">
              {queue.length > 1 ? 'Next' : 'Continue'}
            </button>
          </div>
        )}
        <div className="ceremony-dots" aria-hidden>
          {Array.from({ length: STAGES }, (_, i) => <i key={i} className={i === stage ? 'on' : ''} />)}
        </div>
      </div>
    </div>
  );
}
