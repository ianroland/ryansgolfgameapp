import { useCallback, useEffect, useRef, useState } from 'react';
import { sound } from '../../audio/sound';
import type { CareerState } from '../../career/types';
import { judgeDrive, judgePutt, puttWindow, simChallenge, type DriveResult, type PuttResult } from '../../story/challenge';

/** A value that sweeps 0→1→0 (or -1→1→-1) while `running`. */
function useSweep(running: boolean, period: number, signed = false) {
  const [v, setV] = useState(signed ? -1 : 0);
  const t0 = useRef(0);
  useEffect(() => {
    if (!running) return;
    t0.current = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = ((now - t0.current) / 1000 / period) % 2;
      const tri = t < 1 ? t : 2 - t;
      setV(signed ? tri * 2 - 1 : tri);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, period, signed]);
  return v;
}

function usePress(handler: () => void, enabled: boolean) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        ref.current();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [enabled]);
}

type Done = (win: boolean) => void;

/** Long drive: press once to set power, again to set accuracy. */
export function DriveChallenge({ c, encounterId, opponent, onDone }: { c: CareerState; encounterId: string; opponent: string; onDone: Done }) {
  const [stage, setStage] = useState<'power' | 'aim' | 'result'>('power');
  const [power, setPower] = useState(0);
  const [res, setRes] = useState<DriveResult | null>(null);
  const p = useSweep(stage === 'power', 1.05);
  const a = useSweep(stage === 'aim', 0.85, true);
  const finish = useCallback((input: { power: number; accuracy: number }) => {
    const r = judgeDrive(c, input);
    setRes(r);
    setStage('result');
    sound.play('hit_driver');
    window.setTimeout(() => sound.play(r.win ? 'cheer' : 'groan', { volume: 0.7 }), 650);
  }, [c]);
  const press = () => {
    if (stage === 'power') {
      setPower(p);
      setStage('aim');
      sound.play('meter_set');
    } else if (stage === 'aim') finish({ power, accuracy: a });
  };
  usePress(press, stage !== 'result');
  const sim = () => {
    const s = simChallenge(c, 'drive', encounterId).input as { power: number; accuracy: number };
    setPower(s.power);
    finish(s);
  };
  const max = Math.max(res?.yards ?? 0, res?.opponentYards ?? 0, 1);
  return (
    <div className="challenge" data-testid="challenge-drive">
      <p className="ch-title">Long drive vs {opponent}</p>
      {stage !== 'result' ? (
        <>
          <div className="meter" aria-label="Power meter">
            <span className="meter-fill" style={{ width: `${(stage === 'power' ? p : power) * 100}%` }} />
            <span className="meter-label">Power {Math.round((stage === 'power' ? p : power) * 100)}%</span>
          </div>
          <div className={`meter aim ${stage === 'aim' ? '' : 'off'}`} aria-label="Accuracy meter">
            <span className="aim-zone fair" />
            <span className="aim-marker" style={{ left: `${(stage === 'aim' ? (a + 1) / 2 : 0.5) * 100}%` }} />
          </div>
          <p className="ch-help">{stage === 'power' ? 'Press Space (or tap) to set power' : 'Press again inside the green to hit it straight'}</p>
          <div className="ch-actions">
            <button className="btn primary" onClick={press} data-testid="challenge-press">{stage === 'power' ? 'Set power' : 'Swing!'}</button>
            <button className="btn" onClick={sim} data-testid="challenge-sim">Sim it</button>
          </div>
        </>
      ) : (
        res && (
          <>
            <div className="drive-bars">
              <div><span>Ryan</span><i className="bar me" style={{ width: `${(res.yards / max) * 100}%` }} /><b>{res.yards ? `${res.yards} yds` : 'OB'}</b></div>
              <div><span>{opponent}</span><i className="bar them" style={{ width: `${(res.opponentYards / max) * 100}%` }} /><b>{res.opponentYards} yds</b></div>
            </div>
            <p className={`ch-result ${res.win ? 'win' : 'lose'}`} data-testid="challenge-result">
              {res.win ? 'Ryan wins!' : `${opponent} wins.`} <span className="muted">Ryan's ball: {res.lie}.</span>
            </p>
            <button className="btn primary" onClick={() => onDone(res.win)} data-testid="challenge-continue" autoFocus>Continue</button>
          </>
        )
      )}
    </div>
  );
}

/** Putt: one press to set the pace; it drops if the marker is inside the window. */
export function PuttChallenge({ c, encounterId, opponent, onDone }: { c: CareerState; encounterId: string; opponent: string; onDone: Done }) {
  const [res, setRes] = useState<(PuttResult & { pace: number }) | null>(null);
  const v = useSweep(!res, 1.15);
  const w = puttWindow(c);
  const finish = (pace: number) => {
    const r = judgePutt(c, { pace });
    setRes({ ...r, pace });
    sound.play('hit_putt');
    window.setTimeout(() => sound.play(r.win ? 'cup' : 'groan', { volume: 0.7 }), 500);
  };
  usePress(() => finish(v), !res);
  const sim = () => finish((simChallenge(c, 'putt', encounterId).input as { pace: number }).pace);
  const at = res ? res.pace : v;
  return (
    <div className="challenge" data-testid="challenge-putt">
      <p className="ch-title">Putt into the mug vs {opponent}</p>
      <div className="meter pace" aria-label="Pace meter">
        <span className="aim-zone" style={{ left: `${(0.5 - w) * 100}%`, width: `${w * 200}%` }} />
        <span className="aim-marker" style={{ left: `${at * 100}%` }} />
      </div>
      {!res ? (
        <>
          <p className="ch-help">Press Space (or tap) when the marker is inside the green: that's the right pace.</p>
          <div className="ch-actions">
            <button className="btn primary" onClick={() => finish(v)} data-testid="challenge-press">Putt!</button>
            <button className="btn" onClick={sim} data-testid="challenge-sim">Sim it</button>
          </div>
        </>
      ) : (
        <>
          <p className={`ch-result ${res.win ? 'win' : 'lose'}`} data-testid="challenge-result">
            {res.win ? 'It drops!' : res.pace < 0.5 ? 'Short. It stops on the carpet.' : 'Too firm. It lips out.'}
          </p>
          <button className="btn primary" onClick={() => onDone(res.win)} data-testid="challenge-continue" autoFocus>Continue</button>
        </>
      )}
    </div>
  );
}
