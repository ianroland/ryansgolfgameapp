/**
 * Madame Monique at the roulette table: her animated sprite (a character-only
 * layer drawn behind the existing table art), her RPG dialogue box, and the
 * hook that decides when she speaks. Presentation only: roulette rules and
 * payouts are untouched. Dialogue is placeholder until the Script Room
 * approves it (see src/casino/monique.ts).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import meta from '../../assets/casino/monique.json';
import atlasUrl from '../../assets/casino/monique_table.png';
import armUrl from '../../assets/casino/monique_arm.png';
import portraitsUrl from '../../assets/casino/monique_portraits.png';
import { careerStats } from '../../career/careerStats';
import { casinoWeekKey } from '../../career/engine';
import { isPinkJacket } from '../../catalog/trophies';
import {
  afterSpin, arrive, exprFor, farewellEvent, pickLine, readMemory, ryanComeback,
  type MoniqueEvent, type MoniqueExpr, type MoniqueMemory, type RyanPhase,
} from '../../casino/monique';
import { cryptoInt } from '../../casino/random';
import { sound } from '../../audio/sound';
import { appearanceOf, resolveLook, storyOf } from '../../story/appearance';
import { RYAN_ID } from '../../story/cast';
import { portraitKey } from '../../story/sprites';
import type { Expression } from '../../story/types';
import { useGame } from '../GameContext';
import { SpriteFrame } from '../story/Sprite';

const M = meta as unknown as {
  cell: [number, number];
  frames: Record<'idle' | 'spin' | 'emote', number[]>;
  heldBack: Record<string, number[]>;
  arm: { frames: Record<string, number> };
  portraitCell: [number, number];
  portraits: MoniqueExpr[];
};
/** Every frame in the atlas, including the held-back ones (they keep their slots). */
const TOTAL = new Set([...Object.values(M.frames), ...Object.values(M.heldBack)].flat()).size;

/** 'spin' is drawn as idle until a corrected character-only spin sequence exists. */
/** 'spin' is her reach to the wheel (frames 5–9), then the return (10–13), then idle. */
export type MoniqueMode = 'idle' | 'spin' | 'react';

/** Spin timing: the wheel starts on her fullest reach (frame 9), she's back in idle by SPIN_MS. */
export const MONIQUE_FRAME_MS = 120;
export const REACH_FRAMES = 5;
export const REACH_MS = MONIQUE_FRAME_MS * REACH_FRAMES;
export const SPIN_MS = MONIQUE_FRAME_MS * 9 + 60;
const ARM_TOTAL = Object.keys(M.arm.frames).length;

/** Which atlas frame shows `ms` after the mode began. Pure, so the body and arm layers always agree. */
export function moniqueFrame(mode: MoniqueMode, ms: number): number {
  if (mode === 'spin') return M.frames.spin[Math.min(Math.floor(ms / MONIQUE_FRAME_MS), M.frames.spin.length - 1)];
  if (mode === 'react') return M.frames.emote[Math.min(Math.floor(ms / 260), 2)];
  // Idle: hold still, blink now and then (frames 1–4 play quickly every ~2.6 s).
  const cyc = Math.floor(ms / 110) % 24;
  return M.frames.idle[cyc < 20 ? 0 : cyc - 19];
}

/**
 * Her table sprite. `layer="body"` is drawn behind the table art; `layer="arm"`
 * is drawn in front of it and shows only her reaching arm on the reach frames,
 * so her hand meets the wheel's far rim. Both layers time from the same `since`.
 */
export function MoniqueSprite({ mode, since, style, layer = 'body' }: { mode: MoniqueMode; since: number; style: React.CSSProperties; layer?: 'body' | 'arm' }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 40);
    return () => window.clearInterval(t);
  }, [mode, since]);
  const frame = moniqueFrame(mode, Math.max(0, now - since));
  if (layer === 'arm') {
    const slot = M.arm.frames[String(frame)];
    if (slot === undefined) return null;
    return (
      <div
        className="monique-sprite monique-arm"
        aria-hidden
        data-testid="monique-arm"
        data-frame={frame}
        style={{ ...style, backgroundImage: `url(${armUrl})`, backgroundSize: `${ARM_TOTAL * 100}% 100%`, backgroundPosition: `${(slot / Math.max(1, ARM_TOTAL - 1)) * 100}% 0` }}
      />
    );
  }
  return (
    <div
      className="monique-sprite"
      role="img"
      aria-label="Madame Monique, the croupier"
      data-testid="monique-sprite"
      data-mode={mode}
      data-frame={frame}
      style={{ ...style, backgroundImage: `url(${atlasUrl})`, backgroundSize: `${TOTAL * 100}% 100%`, backgroundPosition: `${(frame / (TOTAL - 1)) * 100}% 0` }}
    />
  );
}

export interface DialogueItem {
  who: 'monique' | 'ryan';
  text: string;
  approved: boolean;
  expr: MoniqueExpr | Expression;
  /** Monique: switch to this portrait after a beat (surprise → composure). */
  then?: MoniqueExpr;
}

function MoniquePortrait({ expr }: { expr: MoniqueExpr }) {
  const i = Math.max(0, M.portraits.indexOf(expr));
  return (
    <span
      className="monique-portrait"
      role="img"
      aria-label={`Madame Monique (${expr})`}
      data-testid="monique-portrait"
      data-expr={expr}
      style={{ backgroundImage: `url(${portraitsUrl})`, backgroundSize: `${M.portraits.length * 100}% 100%`, backgroundPosition: `${(i / (M.portraits.length - 1)) * 100}% 0` }}
    />
  );
}

/** Classic RPG dialogue box: portrait, name, typed text, Continue. */
export function DialogueBox({ item, more, onNext }: { item: DialogueItem; more: boolean; onNext: () => void }) {
  const { state } = useGame();
  const [typed, setTyped] = useState(0);
  const [expr, setExpr] = useState(item.expr);
  useEffect(() => {
    setTyped(0);
    setExpr(item.expr);
    if (!item.then) return;
    const t = window.setTimeout(() => setExpr(item.then!), 1300);
    return () => window.clearTimeout(t);
  }, [item]);
  useEffect(() => {
    if (typed >= item.text.length) return;
    const t = window.setTimeout(() => {
      setTyped((n) => n + 1);
      if (typed % 3 === 0) sound.play('ui_click', { volume: item.who === 'monique' ? 0.12 : 0.18 });
    }, 24);
    return () => window.clearTimeout(t);
  }, [typed, item]);
  const done = typed >= item.text.length;
  const next = () => (done ? onNext() : setTyped(item.text.length));
  return (
    <div className={`rpg-box ${item.who}`} role="dialog" aria-live="polite" data-testid="monique-dialogue" data-who={item.who} onClick={next}>
      {item.who === 'monique' ? (
        <MoniquePortrait expr={expr as MoniqueExpr} />
      ) : (
        <span className="rpg-ryan">
          <SpriteFrame who={RYAN_ID} frame={portraitKey(RYAN_ID, expr as Expression, appearanceOf(state.career))} height={92} />
        </span>
      )}
      <div className="rpg-body">
        <p className="rpg-name">
          {item.who === 'monique' ? 'Madame Monique' : 'Ryan'}
          {!item.approved && <span className="rpg-draft" title="Dialogue awaiting Script Room approval">Draft line</span>}
        </p>
        <p className="rpg-text" data-testid="monique-text">{item.text.slice(0, typed)}<span className="rpg-caret" aria-hidden>{done ? '' : '▌'}</span></p>
      </div>
      <button className="btn small rpg-next" onClick={(e) => { e.stopPropagation(); next(); }} data-testid="monique-continue">{done ? (more ? 'Next ▶' : 'Continue ▶') : '▸▸'}</button>
    </div>
  );
}

const RYAN_EXPR: Record<RyanPhase, Expression> = { 1: 'confident', 2: 'worried', 3: 'confident' };

/** When Monique speaks: greetings on arrival, reactions after a spin (never during), farewells. */
export function useMonique(active: boolean) {
  const { state, services } = useGame();
  const c = state.career;
  const memRef = useRef<MoniqueMemory>(readMemory(c.flags));
  const [queue, setQueue] = useState<DialogueItem[]>([]);
  const [mode, setModeRaw] = useState<{ mode: MoniqueMode; since: number }>({ mode: 'idle', since: Date.now() });
  const setMode = useCallback((m: MoniqueMode) => setModeRaw({ mode: m, since: Date.now() }), []);
  const lines = useRef(0);
  const leaveAfter = useRef<(() => void) | null>(null);
  const phase = (resolveLook(appearanceOf(c)).sheet === 'wig' ? 3 : resolveLook(appearanceOf(c)).sheet === 'bald' ? 2 : 1) as RyanPhase;

  const save = useCallback((m: MoniqueMemory) => {
    memRef.current = m;
    void services.casino.saveMonique(m).catch(() => {});
  }, [services]);

  const say = useCallback((ev: MoniqueEvent) => {
    const m0 = memRef.current;
    const { line, mem } = pickLine(m0, ev, m0.lossStreak);
    save(mem);
    const items: DialogueItem[] = [{ who: 'monique', text: line.text, approved: !!line.approved, expr: exprFor(ev, m0.lossStreak), then: ev === 'extraordinary' ? 'neutral' : undefined }];
    const r = ryanComeback(ev, phase, lines.current++);
    if (r) items.push({ who: 'ryan', text: r.text, approved: !!r.approved, expr: RYAN_EXPR[phase] });
    setQueue(items);
    if (ev === 'extraordinary') sound.play('achievement', { volume: 0.35 });
  }, [phase, save]);

  // Arriving at the table: one greeting per arrival.
  const arrived = useRef(false);
  useEffect(() => {
    if (!active) {
      arrived.current = false;
      return;
    }
    if (arrived.current) return;
    arrived.current = true;
    let live = true;
    void services.career.listTournaments().then((records) => {
      if (!live) return;
      const history = careerStats(records, c.playerId).history;
      const { ev, mem } = arrive(memRef.current, {
        sessionKey: casinoWeekKey(c),
        wins: c.totals.wins,
        missedCuts: history.filter((e) => e.hadCut && !e.madeCut).length,
        act: storyOf(c).act,
        pinkJackets: state.trophies.filter((t) => t.ownerId === c.playerId && isPinkJacket(t)).length,
      });
      save(mem);
      say(ev);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return {
    mode: mode.mode,
    modeSince: mode.since,
    item: queue[0] ?? null,
    more: queue.length > 1,
    memory: () => memRef.current,
    next: () => {
      setQueue((q) => q.slice(1));
      if (queue.length <= 1 && leaveAfter.current) {
        const go = leaveAfter.current;
        leaveAfter.current = null;
        go();
      }
    },
    /** The wheel is about to move: close any dialogue (she never talks over a spin). */
    spinStart: () => {
      setQueue([]);
      setMode('spin');
      window.setTimeout(() => setMode('idle'), SPIN_MS);
    },
    spinEnd: (s: { staked: number; paid: number; straightHit: boolean; bankBefore: number }) => {
      const { ev, mem } = afterSpin(memRef.current, s, () => 3 + cryptoInt(3));
      save(mem);
      if (ev === 'extraordinary') {
        setMode('react');
        window.setTimeout(() => setMode('idle'), 1800);
      } else setMode('idle');
      if (ev) window.setTimeout(() => say(ev), 500);
    },
    insufficient: () => say('insufficient_funds'),
    leave: (balance: number, go: () => void) => {
      leaveAfter.current = go;
      say(farewellEvent(memRef.current, balance));
    },
  };
}
