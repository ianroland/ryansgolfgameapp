import { useGameMaybe } from '../GameContext';
import { LADDER, ladderAt, ladderOf } from '../../career/ladder';
import type { ReactNode } from 'react';

/** Chunky pixel progress bar. */
export function Bar({ value, max = 100, tone = 'gold', label, children }: { value: number; max?: number; tone?: 'gold' | 'green' | 'blue' | 'red' | 'pink'; label?: string; children?: ReactNode }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={`bar ${tone}`} role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(value)} aria-label={label}>
      <div className="bar-fill" style={{ width: `${pct}%` }} />
      {children !== undefined && <span className="bar-text">{children}</span>}
    </div>
  );
}

/** Form meter from −10 (cold) to +10 (hot). */
export function FormMeter({ form }: { form: number }) {
  const pct = ((form + 10) / 20) * 100;
  const word = form >= 6 ? 'On fire' : form >= 2 ? 'Confident' : form > -2 ? 'Steady' : form > -6 ? 'Shaky' : 'Ice cold';
  return (
    <div className="form-meter" role="meter" aria-valuemin={-10} aria-valuemax={10} aria-valuenow={form} aria-label={`Form: ${word}`}>
      <div className="form-track">
        <div className="form-pip" style={{ left: `${pct}%` }} />
      </div>
      <span className="form-word">{word}</span>
    </div>
  );
}

export function Hearts({ value }: { value: number }) {
  const full = Math.round(value / 20);
  return (
    <span className="hearts" aria-label={`${Math.round(value)} out of 100`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={i < full ? 'on' : ''}>♥</span>
      ))}
    </span>
  );
}

/** A tour's pill. Ladder tours are named for the ladder in force then (given a week) or now. */
export function TourPill({ tour, season, week }: { tour: string; season?: number; week?: number }) {
  const c = useGameMaybe()?.state.career;
  const l = !c ? 'pga' : season !== undefined ? ladderAt(c, season, week ?? 0) : ladderOf(c);
  const label: Record<string, string> = { amateur: 'AMATEUR', mini: 'PRO SERIES', ...LADDER[l].pill };
  return <span className={`pill tour-${tour}`}>{label[tour] ?? tour}</span>;
}
