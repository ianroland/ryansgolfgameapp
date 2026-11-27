/**
 * CI-2 · Competitor broadcast cut-in (prototype).
 *
 * Loaded only by `useCutIn.ts` in the review build (VITE_CUTINS=1).
 *
 * Presentation reads CI-1's decisions; it never makes one. A cut-in exists
 * only for a moment CI-1 selected at the boundary Ryan just completed, claimed
 * once through CI-1's one-use boundary token. Every field shown comes from
 * the verified reveal snapshot at that boundary: the golfer's name, the hole,
 * his strokes and par on it, his position and total, and the top three.
 * Nothing is invented: no shot, no distance, no footage, no commentary.
 */
import { useCallback, useEffect, useRef } from 'react';
import { activeCourse, type TournamentDef } from '../../career/tournament';
import type { ActiveTournament, CareerState } from '../../career/types';
import { DEFAULT_PROFILE, HOT_RUN_LENGTH } from '../../cutins/constants';
import { totalsAt } from '../../cutins/detect';
import { planRound } from '../../cutins/plan';
import { markPresented, type PresentationOutcome } from '../../cutins/presentationLog';
import { revealSnapshot } from '../../cutins/snapshot';
import { claimPresentation, issueToken } from '../../cutins/token';
import type { Moment, MomentType, ProfileId, RevealSnapshot } from '../../cutins/types';
import { useBlocking, useOpenBlockingScreens } from '../blocking';
import { TourPill } from '../career/bits';
import { toPar } from '../format';
import { CUTIN_LABEL, CUTIN_UI, posLabel } from './cutinCopy';

/** On screen for about 3.5 s, skippable at once. */
export const CUTIN_MS = 3500;

/** Device-only broadcast-style choice (not part of the save). */
export const PROFILE_KEY = 'ryans-road.cutins.profile';
const PROFILE_IDS: ProfileId[] = ['off', 'balanced', 'fullTv'];

const HASH_PROFILE: Record<string, ProfileId> = { '#cutins-fulltv': 'fullTv', '#cutins-balanced': 'balanced', '#cutins-off': 'off' };

/**
 * Review build: `?cutins=fullTv|balanced|off` (or `#cutins-fulltv|balanced|off`, for hosts that
 * only pass a #name) sets the device choice; otherwise the stored choice, else Balanced.
 */
export function cutInProfile(): ProfileId {
  try {
    const fromUrl = typeof location === 'undefined' ? null : (new URLSearchParams(location.search).get('cutins') ?? HASH_PROFILE[location.hash.toLowerCase()] ?? null);
    if (fromUrl && (PROFILE_IDS as string[]).includes(fromUrl)) {
      localStorage.setItem(PROFILE_KEY, fromUrl);
      return fromUrl as ProfileId;
    }
    const stored = typeof localStorage === 'undefined' ? null : localStorage.getItem(PROFILE_KEY);
    if (stored && (PROFILE_IDS as string[]).includes(stored)) return stored as ProfileId;
  } catch {
    /* storage unavailable: default */
  }
  return DEFAULT_PROFILE;
}

// Remember a profile chosen by link as soon as the review runtime loads.
cutInProfile();

export interface CutInRow {
  id: string;
  name: string;
  pos: string;
  total: string;
  isRyan: boolean;
  isRival: boolean;
  isSubject: boolean;
}

export interface CutInView {
  momentId: string;
  type: MomentType;
  label: string;
  tour: string;
  /** 1-based round. */
  round: number;
  name: string;
  isRival: boolean;
  hole: number;
  par: number;
  strokes: number;
  /** strokes − par on the hole, formatted. */
  holeToPar: string;
  pos: string;
  total: string;
  /** ON A RUN: the run's holes, in order. */
  run: { hole: number; strokes: number; par: number }[];
  top3: CutInRow[];
}

/** The card's content, from the verified snapshot only. */
export function buildCutInView(snap: RevealSnapshot, q: number, m: Moment, names: Record<string, string>, holeNumbers?: number[]): CutInView {
  const hole = m.hole;
  const holeOf = (id: string, h: number) => snap.holes[id]?.[h - 1];
  const strokes = m.strokes ?? holeOf(m.golferId, hole);
  const par = m.par ?? snap.pars[hole - 1];
  if (strokes === undefined || par === undefined) throw new Error(`cut-in: no verified score for ${m.momentId}`);
  const atQ = totalsAt(snap, q);
  const nameOf = (id: string) => names[id] ?? id;
  const sorted = [...atQ.entries()].sort((a, b) => a[1] - b[1] || nameOf(a[0]).localeCompare(nameOf(b[0])));
  const rank = (t: number) => sorted.filter(([, x]) => x < t).length + 1;
  const tiedAt = (t: number) => sorted.filter(([, x]) => x === t).length > 1;
  const top3: CutInRow[] = sorted.slice(0, 3).map(([id, t]) => ({
    id,
    name: nameOf(id),
    pos: posLabel(rank(t), tiedAt(t)),
    total: toPar(t),
    isRyan: id === snap.ryanId,
    isRival: id === snap.rivalId,
    isSubject: id === m.golferId,
  }));
  /** The course's own hole number (every current course numbers its holes 1–9). */
  const numberOf = (h: number) => holeNumbers?.[h - 1] ?? h;
  const run =
    m.type === 'HOT_RUN'
      ? Array.from({ length: HOT_RUN_LENGTH }, (_, i) => hole - HOT_RUN_LENGTH + 1 + i).map((h) => ({ hole: numberOf(h), strokes: holeOf(m.golferId, h)!, par: snap.pars[h - 1] }))
      : [];
  return {
    momentId: m.momentId,
    type: m.type,
    label: CUTIN_LABEL[m.type],
    tour: snap.tour,
    round: m.round,
    name: nameOf(m.golferId),
    isRival: m.golferId === snap.rivalId,
    hole: numberOf(hole),
    par,
    strokes,
    holeToPar: toPar(strokes - par),
    pos: posLabel(m.position, m.tied),
    total: toPar(m.totalToPar),
    run,
    top3,
  };
}

/**
 * The cut-in for the saved transition `before → after`, or null.
 * Null unless CI-1 issues a boundary token (exactly one hole went from
 * unplayed to played, same tournament and round) and its plan selected a
 * moment at that boundary that this device has never presented. Claiming
 * marks the moment presented at once, so a skip, a reload or an interruption
 * can never show it again.
 */
export function prepareCutIn(before: ActiveTournament, after: ActiveTournament, def: TournamentDef, career: CareerState, profile: ProfileId = cutInProfile()): CutInView | null {
  const token = issueToken(before, after);
  if (!token) return null;
  const snap = revealSnapshot(after, def, career);
  if (snap.q !== token.q) return null;
  const plan = planRound(snap, profile);
  const id = claimPresentation(token, plan);
  if (!id) return null;
  const moment = plan.find((d) => d.q === token.q)!.candidates.find((c) => c.moment.momentId === id)!.moment;
  const names = Object.fromEntries(after.entrants.map((e) => [e.id, e.name]));
  return buildCutInView(snap, token.q, moment, names, activeCourse(after).holes.map((h) => h.number));
}

/** Records how the cut-in ended (the claim already blocked any repeat). */
export function finishCutIn(momentId: string, how: Exclude<PresentationOutcome, 'shown'>): void {
  markPresented(momentId, how);
}

/** Space, Enter and Esc skip a cut-in. */
export const isSkipKey = (key: string) => key === ' ' || key === 'Enter' || key === 'Escape';

/**
 * How one cut-in ends: the first of watched / skipped / interrupted wins and
 * is recorded once; later calls do nothing. Interrupted (torn down early)
 * records the outcome without calling back into a screen that is gone.
 */
export function cutInEnding(momentId: string, onClosed: () => void) {
  let done = false;
  return {
    get done() {
      return done;
    },
    end(how: 'watched' | 'skipped' | 'interrupted'): boolean {
      if (done) return false;
      done = true;
      finishCutIn(momentId, how);
      if (how !== 'interrupted') onClosed();
      return true;
    },
  };
}

function Score({ strokes, par }: { strokes: number; par: number }) {
  const d = strokes - par;
  return <span className={`cutin-score ${d < 0 ? 'under' : d > 0 ? 'over' : 'even'}`}>{strokes}</span>;
}

/**
 * The lower-third. Waits while any other blocking screen is open, registers
 * itself as blocking while visible, ends after CUTIN_MS ("watched"), on
 * click / Space / Enter / Esc ("skipped"), or if it is torn down early
 * ("interrupted"). Each ending is recorded exactly once.
 */
export function CutInCard({ view, onClosed }: { view: CutInView; onClosed: () => void }) {
  const others = useOpenBlockingScreens().filter((id) => id !== 'cutin');
  const visible = others.length === 0;
  useBlocking('cutin', visible);
  const closedRef = useRef(onClosed);
  closedRef.current = onClosed;
  const ending = useRef<ReturnType<typeof cutInEnding> | null>(null);
  if (!ending.current) ending.current = cutInEnding(view.momentId, () => closedRef.current());
  const mounted = useRef(false);
  const end = useCallback((how: 'watched' | 'skipped') => void ending.current!.end(how), []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // Deferred so React's development double-mount isn't mistaken for a teardown.
      setTimeout(() => {
        if (!mounted.current) ending.current!.end('interrupted');
      }, 0);
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => end('watched'), CUTIN_MS);
    const onKey = (e: KeyboardEvent) => {
      if (isSkipKey(e.key)) {
        // Captured first, so the paused game and the hole card never see the key.
        e.preventDefault();
        e.stopImmediatePropagation();
        end('skipped');
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [visible, end]);

  if (!visible) return null;
  return <CutInFrame view={view} onSkip={() => end('skipped')} />;
}

/** The broadcast graphic itself, with no timing or claiming (also used by the review gallery). */
export function CutInFrame({ view, onSkip, still = false }: { view: CutInView; onSkip?: () => void; still?: boolean }) {
  return (
    <div className={`cutin-layer ${still ? 'still' : ''} type-${view.type.toLowerCase()} ${view.isRival ? 'rival' : ''}`} role="dialog" aria-label={`${view.label}: ${view.name}`} data-testid="cutin" onClick={onSkip}>
      <div className="cutin-scan" aria-hidden="true" />
      <div className="cutin-third">
        <div className="cutin-bug" aria-hidden="true">
          <span className="cutin-live" />
          <TourPill tour={view.tour} />
          <span className="cutin-rd">{CUTIN_UI.round}{view.round}</span>
        </div>
        <div className="cutin-badge" data-testid="cutin-label">{view.label}</div>
        <div className="cutin-main">
          <div className="cutin-name" data-testid="cutin-name">{view.name}</div>
          <div className="cutin-fact" data-testid="cutin-fact">
            <span className="cutin-hole">{CUTIN_UI.hole} {view.hole}</span>
            <span className="cutin-par">{CUTIN_UI.par} {view.par}</span>
            <Score strokes={view.strokes} par={view.par} />
            <span className="cutin-rel">{view.holeToPar}</span>
          </div>
          {view.run.length > 0 && (
            <div className="cutin-run" aria-label="run">
              {view.run.map((h) => (
                <span key={h.hole} className="cutin-run-hole">
                  <small>{h.hole}</small>
                  <Score strokes={h.strokes} par={h.par} />
                </span>
              ))}
            </div>
          )}
        </div>
        <ol className="cutin-board" data-testid="cutin-board">
          {view.top3.map((r) => (
            <li key={r.id} className={`${r.isSubject ? 'subject' : ''} ${r.isRyan ? 'me' : ''} ${r.isRival ? 'rival' : ''}`}>
              <span className="b-pos">{r.pos}</span>
              <span className="b-name">{r.name}</span>
              <span className="b-tot">{r.total}</span>
            </li>
          ))}
        </ol>
        <div className="cutin-standing" data-testid="cutin-standing">
          <span className="cutin-pos">{view.pos}</span>
          <span className="cutin-total">{view.total}</span>
        </div>
      </div>
      <button
        className="cutin-skip"
        autoFocus={!still}
        data-testid="cutin-skip"
        onClick={(e) => {
          e.stopPropagation();
          onSkip?.();
        }}
      >
        {CUTIN_UI.skip} ▶
      </button>
      <div className="cutin-timer" style={{ animationDuration: `${CUTIN_MS}ms` }} aria-hidden="true" />
    </div>
  );
}
