/**
 * The Sports History Board (Phase E): the four leagues' archive, read-only. Shared history is
 * loaded on first open (separate chunks); this save's completed seasons come from the living
 * universe's stored years. Nothing here changes the save.
 *
 * It opens from the sportsbook's History button, in place of the lounge; `onClose` returns there.
 */
import { useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { sportsWorldOf } from '../../career/sportsbook';
import { buildBoard, type Board } from '../../sports/archive/board';
import { buildSaveHistory } from '../../sports/archive/save';
import { loadShared } from '../../sports/archive/shared';
import type { LeagueId } from '../../sports/demo';
import { useGame } from '../GameContext';
import { AwardsArchive } from './Awards';
import { Championships } from './Champions';
import { Hb, LeagueSwitch, type HbCtx } from './common';
import { HallOfFame } from './HallOfFame';
import { Moments } from './Moments';
import { initialNav, navReduce, SECTIONS, type Detail, type NavAction, type NavState } from './nav';
import { Overview } from './Overview';
import { Encyclopedia, PlayerProfile } from './Players';
import { RecordBooks } from './Records';
import { YearInReview } from './Review';
import { SeasonArchive, SeasonDetail } from './Seasons';
import { TeamPage } from './TeamPage';

/** Where the board was left this session (closing and reopening it comes back here). */
let remembered: NavState | null = null;
const LEAGUE_SECTIONS = new Set(['overview', 'archive', 'records', 'awards']);

export default function HistoryBoard({ onClose, league }: { onClose?: () => void; league?: LeagueId } = {}) {
  const { services, state } = useGame();
  const c = state.career;
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  // Opens on the league the sportsbook was showing, unless a drill-down was left open last time.
  const [nav, dispatch] = useReducer(navReduce, null, () => {
    const s = remembered ?? initialNav(league);
    return league && !s.stack.length ? navReduce(s, { type: 'league', league }) : s;
  });
  useEffect(() => { remembered = nav; }, [nav]);
  const navRef = useRef(nav);
  navRef.current = nav;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const rootRef = useRef<HTMLElement>(null);
  const done = typeof c.flags.sportsYearDone === 'number' ? c.flags.sportsYearDone : 0;

  useEffect(() => {
    let live = true;
    setError(null);
    (async () => {
      const [shared, input] = await Promise.all([loadShared(), services.sportsUniverse.historyInput()]);
      // Let the loading state paint before rebuilding any legacy seasons.
      await new Promise((r) => setTimeout(r, 0));
      const save = buildSaveHistory({ ref: sportsWorldOf(c), season: c.season, week: c.week, rows: input.rows, state: input.state });
      if (live) setBoard(buildBoard(shared, save));
    })().catch((e) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => { live = false; };
    // Rebuild when a season is completed or the save changes; week-to-week play doesn't change the archive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services, c.season, done, c.flags.sportsSeed, c.flags.sportsEvolveFrom, attempt]);

  const go = useCallback((a: NavAction) => {
    dispatch(a);
    if (a.type !== 'back') document.querySelector('.hb-body')?.scrollTo?.({ top: 0 });
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      // The casino stays mounted behind other tabs: ignore keys while the board isn't on screen.
      if (!rootRef.current?.getClientRects().length) return;
      if (navRef.current.stack.length) dispatch({ type: 'back' });
      else closeRef.current?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const ctx: HbCtx | null = useMemo(() => (board ? { board, nav, go } : null), [board, nav, go]);
  const top = nav.stack.at(-1);

  return (
    <main className={`hb${onClose ? ' hb-in-book' : ''}`} data-testid="history-board" ref={rootRef}>
      <header className="hb-top">
        {onClose && (
          <button type="button" className="hb-close" onClick={onClose} data-testid="hb-close" title="Back to the sportsbook (Esc)">◀ Sportsbook</button>
        )}
        <div className="hb-brand">
          <span className="hb-brand-k">Sports History Board</span>
          <span className="hb-brand-s">Four leagues · {board ? `1972–${board.lastCompleted}` : 'the archive'}</span>
        </div>
        <nav className="hb-sections" aria-label="History sections">
          {SECTIONS.map((s) => (
            <button key={s.id} type="button" className={nav.section === s.id && !top ? 'on' : nav.section === s.id ? 'trail' : ''} aria-current={nav.section === s.id ? 'page' : undefined} onClick={() => go({ type: 'section', section: s.id })} data-testid={`hb-sec-${s.id}`}>{s.label}</button>
          ))}
        </nav>
      </header>
      {error && (
        <div className="hb-state" role="alert">
          <p>The archive couldn&rsquo;t be opened: {error}</p>
          <button type="button" onClick={() => setAttempt((x) => x + 1)}>Try again</button>
        </div>
      )}
      {!error && !ctx && <div className="hb-state" role="status" aria-live="polite"><p className="hb-loading">Opening the archive…</p></div>}
      {ctx && (
        <Hb.Provider value={ctx}>
          <div className="hb-bar">
            {top ? (
              <button type="button" className="hb-back" onClick={() => go({ type: 'back' })} data-testid="hb-back">◀ Back <kbd>Esc</kbd></button>
            ) : LEAGUE_SECTIONS.has(nav.section) ? (
              <LeagueSwitch value={nav.league} onChange={(l) => go({ type: 'league', league: l as LeagueId })} />
            ) : <span />}
            <Crumbs stack={nav.stack} />
          </div>
          <div className="hb-body">
            {top ? <DetailView d={top} key={JSON.stringify(top)} /> : <SectionView section={nav.section} />}
          </div>
        </Hb.Provider>
      )}
    </main>
  );
}

function SectionView({ section }: { section: NavState['section'] }) {
  switch (section) {
    case 'overview': return <Overview />;
    case 'archive': return <SeasonArchive />;
    case 'championships': return <Championships />;
    case 'players': return <Encyclopedia />;
    case 'records': return <RecordBooks />;
    case 'awards': return <AwardsArchive />;
    case 'hof': return <HallOfFame />;
    case 'moments': return <Moments />;
    case 'review': return <YearInReview />;
  }
}

function DetailView({ d }: { d: Detail }) {
  if (d.kind === 'player') return <PlayerProfile id={d.id} />;
  if (d.kind === 'team') return <TeamPage id={d.id} />;
  if (d.kind === 'season') return <SeasonDetail league={d.league} year={d.year} />;
  return <YearInReview year={d.year} />;
}

function Crumbs({ stack }: { stack: Detail[] }) {
  const { board } = useHbSafe();
  if (!stack.length || !board) return null;
  const label = (d: Detail) => (d.kind === 'player' ? board.name(d.id) : d.kind === 'team' ? board.name(d.id) : d.kind === 'season' ? `${board.league(d.league).short} ${d.year}` : `${d.year} review`);
  return <p className="hb-crumbs" aria-label="You are here">{stack.slice(-3).map(label).join(' › ')}</p>;
}
const useHbSafe = () => useContext(Hb) ?? { board: null };
