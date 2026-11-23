import { useCallback, useEffect, useRef, useState } from 'react';
import { sound } from '../../audio/sound';
import { milestoneLabel, type AlbatrossMoment } from '../../records/albatross';
import { onCelebrate } from './celebrate';
import { PixelBird } from './PixelBird';

/**
 * The ALBATROSS! celebration. Arcade style, shown over everything; any key,
 * click or tap skips it. Several in a row are shown one after another.
 */
export function AlbatrossCelebration() {
  const [queue, setQueue] = useState<AlbatrossMoment[]>([]);
  const m = queue[0];
  const btn = useRef<HTMLButtonElement>(null);

  useEffect(() => onCelebrate((x) => setQueue((q) => [...q, x])), []);
  useEffect(() => {
    if (!m) return;
    sound.play('albatross');
    btn.current?.focus();
  }, [m]);

  const next = useCallback(() => setQueue((q) => q.slice(1)), []);

  useEffect(() => {
    if (!m) return;
    const opened = performance.now();
    const onKey = (e: KeyboardEvent) => {
      // Keep keys from reaching the round underneath (Space swings).
      e.stopPropagation();
      e.preventDefault();
      if (performance.now() - opened > 600) next();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [m, next]);

  if (!m) return null;
  const milestone = m.careerCount ? milestoneLabel(m.careerCount) ?? `Career albatross #${m.careerCount}` : null;
  return (
    <div className="alb-celebrate" role="alertdialog" aria-modal="true" aria-labelledby="alb-title" aria-describedby="alb-desc" data-testid="albatross-celebration" onClick={next}>
      <div className="alb-rays" aria-hidden />
      <div className="alb-confetti" aria-hidden>
        {Array.from({ length: 28 }, (_, i) => (
          <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 7) * 0.18}s`, background: ['#ffd84a', '#ffffff', '#4f8fe0', '#e8873f'][i % 4] }} />
        ))}
      </div>
      <div className="alb-card">
        <PixelBird className="alb-bird" />
        <h2 id="alb-title" className="alb-word">
          {'ALBATROSS!'.split('').map((ch, i) => (
            <span key={i} style={{ animationDelay: `${0.05 * i}s` }}>{ch}</span>
          ))}
        </h2>
        <div id="alb-desc" className="alb-lines">
          <p className="alb-score">
            <b>{m.strokes}</b> on a par {m.par}
          </p>
          <p className="alb-where">
            Hole {m.holeNumber} · {m.holeName}
          </p>
          <p className="alb-course">{m.courseName}</p>
          {m.shot && <p className="alb-shot">{m.shot}</p>}
          {milestone && <p className="alb-milestone">{milestone}</p>}
          <p className="alb-event">{m.eventName}</p>
        </div>
        <button ref={btn} className="btn primary" onClick={next} data-testid="albatross-continue">
          {queue.length > 1 ? 'Next' : 'Continue'}
        </button>
        <p className="alb-skip">Any key or tap to continue</p>
      </div>
    </div>
  );
}
