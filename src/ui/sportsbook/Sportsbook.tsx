/**
 * Sportsbook lounge. Layers: lounge background → live CRT boards (React) → clerk → bet slip and HUD.
 *
 * Lines, scores and standings come from the sports engine for this career's world and calendar.
 * Bets are real: placing one takes the stake from the bankroll (services.sportsbook, ledger key
 * `bet:<ticketId>`), and advancing the week settles and pays them, with a note in the Inbox.
 * News is still demo copy. History opens the full Sports History Board in place of the lounge.
 */
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { DEMO_MARGIN, demoNews, fmtAmerican, LEAGUES, leagueById, teamById, type DemoGame, type DemoLine, type LeagueId } from '../../sports/demo';
import { parlayCheck, potentialReturn, selectionKey, SLIP_RULES, toggleSelection, type Selection } from '../../sports/slip';
import { boardFor, recentFinals, standingsToDate, type BookGame, type WorldRef } from '../../sports/book';
import { MAX_STAKE, type Ticket } from '../../sports/bets';
import { bookTotalsOf, sportsWorldOf, ticketsOf } from '../../career/sportsbook';
import { newId } from '../../core/ids';
import { clerkLine } from '../../sports/clerks/lines';
import { LOUNGE_LAYOUT, LOUNGE_SIZE, LOUNGES, rectPct, type ClerkExpression, type NativeRect } from '../../sports/themes';
import { useGame } from '../GameContext';
import { formatMoney } from '../format';
import { useCasinoLocation } from '../casino/casinoLocation';

type View = 'lines' | 'scores' | 'standings' | 'news' | 'history' | 'tickets';
const VIEWS: { id: View; label: string }[] = [
  { id: 'lines', label: 'Lines' },
  { id: 'scores', label: 'Scores' },
  { id: 'standings', label: 'Standings' },
  { id: 'news', label: 'News' },
  { id: 'history', label: 'History' },
  { id: 'tickets', label: 'Tickets' },
];

/** The slip lives for the play session (leaving the tab or the casino keeps it). Tickets are saved. */
const session = { slip: [] as Selection[], at: '' };
function useSessionState<K extends 'slip'>(key: K): [(typeof session)[K], (f: (v: (typeof session)[K]) => (typeof session)[K]) => void] {
  const [v, setV] = useState(session[key]);
  const set = (f: (v: (typeof session)[K]) => (typeof session)[K]) => {
    session[key] = f(session[key]);
    setV(session[key]);
  };
  return [v, set];
}

/** The archive is a separate chunk, loaded the first time History is opened. */
const HistoryBoard = lazy(() => import('../history/HistoryBoard'));

const SPORT_LABEL = { baseball: 'Baseball', basketball: 'Basketball', football: 'Football', hockey: 'Hockey' } as const;

const teamLabel = (id: string) => teamById(id).displayName;
const lineLabel = (g: DemoGame, l: DemoLine) => {
  if (l.market === 'moneyline') return `${teamById(l.side === 'home' ? g.home : g.away).name} ML`;
  if (l.market === 'spread') return `${teamById(l.side === 'home' ? g.home : g.away).name} ${l.point! > 0 ? '+' : ''}${l.point}`;
  return `${l.side === 'over' ? 'Over' : 'Under'} ${l.point}`;
};

export function Sportsbook() {
  const { state, services, run } = useGame();
  const loc = useCasinoLocation();
  const theme = LOUNGES[loc];
  const [league, setLeague] = useState<LeagueId>('ccl');
  const [view, setView] = useState<View>('lines');
  const [detail, setDetail] = useState<string | null>(null);
  const [slip, setSlipState] = useSessionState('slip');
  const setSlip = (f: Selection[] | ((s: Selection[]) => Selection[])) => setSlipState(typeof f === 'function' ? f : () => f);
  const [parlay, setParlay] = useState(false);
  const [stake, setStake] = useState(10);
  const [confirming, setConfirming] = useState(false);
  const c = state.career;
  const worldKey = JSON.stringify(sportsWorldOf(c));
  const seed = useMemo(() => JSON.parse(worldKey) as WorldRef, [worldKey]);
  const tickets = useMemo(() => ticketsOf(c), [c]);
  const openTickets = tickets.filter((t) => t.status === 'open');
  const board = useMemo(() => boardFor(seed, c.season, c.week, league), [seed, c.season, c.week, league]);
  const slate = board.games;
  const L = leagueById(league);
  const maxStake = MAX_STAKE[loc] ?? SLIP_RULES.maxStake;
  const requestId = useRef<string | null>(null);

  // A new week closes last week's games: drop picks on them, and settle anything left over.
  useEffect(() => {
    const at = `${c.season}:${c.week}`;
    if (session.at && session.at !== at) setSlip([]);
    session.at = at;
  }, [c.season, c.week]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    void services.sportsbook.settleDue().catch(() => undefined);
  }, [services, c.season, c.week]);

  useEffect(() => {
    if (!confirming) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setConfirming(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirming]);

  const pick = (g: DemoGame, l: DemoLine) =>
    setSlip((s) => toggleSelection(s, { gameId: g.id, market: l.market, side: l.side, point: l.point, american: l.american, label: `${lineLabel(g, l)} (${teamById(g.away).short} @ ${teamById(g.home).short})` }));
  const picked = new Set(slip.map(selectionKey));
  const pc = parlayCheck(slip);
  const useParlay = parlay && pc.ok;
  const charge = useParlay ? stake : stake * slip.length;
  const sc: { ok: true } | { ok: false; reason: string } =
    !Number.isInteger(stake) || stake < SLIP_RULES.minStake ? { ok: false, reason: `Minimum stake is $${SLIP_RULES.minStake}` }
      : stake > maxStake ? { ok: false, reason: `Maximum stake here is ${formatMoney(maxStake)}` }
        : charge > state.balance ? { ok: false, reason: 'Not enough in the bank' } : { ok: true };
  const toReturn = potentialReturn(slip, stake, useParlay);
  const canPlace = slip.length > 0 && sc.ok && (!parlay || pc.ok);

  // Clerk expression: friendly by default, a playful beat after a ticket goes in, concerned while the
  // stake is more than the bankroll. Presentation only: it never touches the slip, odds or ledger.
  const [reaction, setReaction] = useState<ClerkExpression | null>(null);
  useEffect(() => {
    if (!reaction) return;
    const t = window.setTimeout(() => setReaction(null), 4000);
    return () => window.clearTimeout(t);
  }, [reaction]);
  const short = slip.length > 0 && charge > state.balance;
  // The clerk talks sports history (and this week's board) for the league on screen.
  const [talk, setTalk] = useState(0);
  const lastLeague = useRef(league);
  useEffect(() => {
    if (lastLeague.current !== league) setTalk((n) => n + 1);
    lastLeague.current = league;
  }, [league]);
  const line = theme.art.clerk ? clerkLine(theme.art.clerk.npcId, { seed, season: c.season, week: c.week, league, nonce: talk }) : null;
  const expression: ClerkExpression = short ? 'concerned' : reaction ?? line?.mood ?? 'friendly';
  const clerkBody = theme.art.clerk ? (
    <>
      <button className="sb-clerk-tap" onClick={() => setTalk((n) => n + 1)} aria-label={`Ask ${theme.art.clerk.name} for another story`} data-testid="sb-clerk-next">
      <img
        className="sb-clerk-portrait sb-clerk-img"
        src={theme.art.clerk.portraits[expression]}
        alt={`${theme.art.clerk.name}, sportsbook clerk (${expression})`}
        width={256}
        height={256}
        draggable={false}
        data-expression={expression}
        data-testid="sb-clerk-portrait"
      />
      </button>
      <div className="sb-clerk-text">
        <span className="sb-clerk-name">{theme.art.clerk.name}</span>
        <p className="sb-clerk-line" data-testid="sb-clerk-line" data-line={line?.id} data-events={line?.events.join(' ')}>“{line?.text ?? 'Lines are posted. Take your time.'}”</p>
        <button className="sb-clerk-more" onClick={() => setTalk((n) => n + 1)} data-testid="sb-clerk-more">Another one ›</button>
      </div>
    </>
  ) : (
    <>
      <div className="sb-clerk-portrait" aria-label="Sportsbook clerk portrait (placeholder)">
        <span>Clerk portrait<br />256×256 ×6<br />pending (NPC Factory)</span>
      </div>
      <p className="sb-clerk-line">“Lines are posted. Take your time.” <span className="rpg-draft">Placeholder</span></p>
    </>
  );

  const openConfirm = () => {
    requestId.current = newId('sb');
    setConfirming(true);
  };
  const place = async () => {
    const id = requestId.current;
    if (!id) return;
    const r = await run(() => services.sportsbook.place({ picks: slip, stake, parlay: useParlay, lounge: loc, requestId: id }));
    setConfirming(false);
    if (!r) return;
    requestId.current = null;
    setSlip([]);
    setView('tickets');
    setReaction('playful');
  };

  const style = {
    '--sb-bg1': theme.tokens.bg1, '--sb-bg2': theme.tokens.bg2, '--sb-neon': theme.tokens.neon, '--sb-trim': theme.tokens.trim,
    '--sb-crt': theme.tokens.crt, '--sb-crt-text': theme.tokens.crtText, '--sb-accent': theme.tokens.accent, '--sb-panel': theme.tokens.panel,
  } as CSSProperties;

  const lineBtn = (g: DemoGame, l: DemoLine) => {
    const key = selectionKey({ gameId: g.id, market: l.market, side: l.side });
    const on = picked.has(key);
    return (
      <button
        key={key}
        className={`sb-line ${on ? 'on' : ''}`}
        onClick={() => pick(g, l)}
        aria-pressed={on}
        aria-label={`${lineLabel(g, l)}, ${fmtAmerican(l.american)}`}
        data-testid={`sb-line-${l.market}-${l.side}-${g.id}`}
      >
        {l.point !== null && <span className="sb-pt">{l.market === 'total' ? (l.side === 'over' ? 'O ' : 'U ') : l.point > 0 ? '+' : ''}{l.market === 'total' ? l.point : l.point}</span>}
        <b>{fmtAmerican(l.american)}</b>
      </button>
    );
  };

  const at = (r: NativeRect) => {
    const p = rectPct(r);
    return { '--l': p.left, '--t': p.top, '--w': p.width, '--h': p.height } as CSSProperties;
  };

  // History opens the full Sports History Board in place of the lounge; its Sportsbook button (or Esc) comes back.
  if (view === 'history') {
    return (
      <Suspense fallback={<main className="hb hb-in-book"><div className="hb-state" role="status"><p className="hb-loading">Opening the archive…</p></div></main>}>
        <HistoryBoard league={league} onClose={() => setView('lines')} />
      </Suspense>
    );
  }

  return (
    <section className={`hub-card sportsbook loc-${loc}`} style={style} data-testid="sportsbook" aria-label={`${theme.name} sportsbook`}>
      <div className="sb-stage" data-testid="sb-stage">
        {/* The lounge art at its own 1672x941 proportions; live UI is layered on top. */}
        <div className="sb-scene" style={{ aspectRatio: `${LOUNGE_SIZE[0]} / ${LOUNGE_SIZE[1]}` }}>
          {theme.art.background ? (
            <img className="sb-bg" src={theme.art.background} alt="" width={LOUNGE_SIZE[0]} height={LOUNGE_SIZE[1]} draggable={false} data-testid="sb-bg" />
          ) : (
            <div className="sb-bg sb-bg-placeholder" aria-hidden>
              <span className="sb-ph-tag">PLACEHOLDER · bg_lounge.png 1672×941 not supplied</span>
            </div>
          )}

          <header className="sb-hud">
            <span className="sb-title">{theme.name}</span>
            <span className="sb-demo sb-when" data-testid="sb-when">Season {c.season} · Week {c.week}</span>
            <span className="sb-bank" data-testid="sb-bank">Bankroll <b>{formatMoney(state.balance)}</b></span>
          </header>

          {/* Wide screens: the four monitors are the league screens, the board under them is the menu, the clerk sits on the pillar. */}
          <div className="sb-onart">
            {LEAGUES.map((l, i) => (
              <button key={l.id} className={`sb-screen ${league === l.id ? 'on' : ''}`} style={at(LOUNGE_LAYOUT.screens[i])} onClick={() => { setLeague(l.id); setDetail(null); }} aria-pressed={league === l.id} aria-label={`${SPORT_LABEL[l.sport]}: ${l.name} lines`} data-testid={`sb-league-${l.id}`}>
                <b>{SPORT_LABEL[l.sport]}</b>
                <em>{monitorLine(seed, c.season, c.week, l.id)}</em>
              </button>
            ))}
            <nav className="sb-boardmenu" style={at(LOUNGE_LAYOUT.board)} aria-label="Sportsbook menu">
              {VIEWS.map((v) => (
                <button key={v.id} className={view === v.id ? 'on' : ''} onClick={() => setView(v.id)} aria-pressed={view === v.id} data-testid={`sb-view-${v.id}`}>
                  {v.label}{v.id === 'tickets' && openTickets.length ? ` (${openTickets.length})` : ''}
                </button>
              ))}
            </nav>
            <div className="sb-clerk sb-clerk-art" style={at(LOUNGE_LAYOUT.clerk)} data-testid="sb-clerk">
              {clerkBody}
            </div>
          </div>
        </div>

        <div className="sb-dock">
          {/* Phones: the same controls under the scene (the art is too small to tap). */}
          <nav className="sb-leagues sb-inline" aria-label="Leagues">
              {LEAGUES.map((l) => (
                <button key={l.id} className={league === l.id ? 'on' : ''} onClick={() => { setLeague(l.id); setDetail(null); }} aria-pressed={league === l.id} data-testid={`sb-league-${l.id}-m`} title={l.name}>
                  {SPORT_LABEL[l.sport]}
                </button>
              ))}
          </nav>
          <nav className="sb-views sb-inline" aria-label="Sportsbook menu">
              {VIEWS.map((v) => (
                <button key={v.id} className={view === v.id ? 'on' : ''} onClick={() => setView(v.id)} aria-pressed={view === v.id} data-testid={`sb-view-${v.id}-m`}>
                  {v.label}{v.id === 'tickets' && openTickets.length ? ` (${openTickets.length})` : ''}
                </button>
              ))}
          </nav>
          <div className="sb-content" style={at(LOUNGE_LAYOUT.content)}>
            <div className="sb-crt" data-testid={`sb-crt-${view}`}>
              <p className="sb-crt-title">{view === 'tickets' ? 'Your tickets' : `${SPORT_LABEL[L.sport]} · ${VIEWS.find((v) => v.id === view)!.label}`}</p>

              {view === 'lines' && board.week === null && <p className="sb-empty" data-testid="sb-no-games">The {L.name} season is over. Lines return next season.</p>}
              {view === 'lines' && board.week !== null && board.week !== c.week && (
                <p className="sb-note" data-testid="sb-next-week">No {SPORT_LABEL[L.sport].toLowerCase()} this week. These are Week {board.week}'s games; you can bet them now.</p>
              )}
              {view === 'lines' && slate.length > 0 && (
                <table className="sb-table sb-lines">
                  <thead>
                    <tr><th>Game</th><th>Moneyline</th><th>{L.spreadName}</th><th>Total</th></tr>
                  </thead>
                  <tbody>
                    {slate.map((g) => (
                      <FragmentRows key={g.id} g={g} lineBtn={lineBtn} open={detail === g.id} toggle={() => setDetail(detail === g.id ? null : g.id)} unit={L.unit} />
                    ))}
                  </tbody>
                </table>
              )}

              {view === 'scores' && <Scores seed={seed} season={c.season} week={c.week} league={league} />}

              {view === 'standings' && <Standings seed={seed} season={c.season} week={c.week} league={league} />}

              {view === 'news' && (
                <ul className="sb-list sb-news" data-testid="sb-news">
                  <li><em>Demo stories: league news from real results is coming in a later update.</em></li>
                  {demoNews().map((n, i) => (
                    <li key={i}><span className={`sb-tag ${n.tag}`}>{SPORT_LABEL[leagueById(n.league).sport]} · {n.tag}</span><b>{n.headline}</b><span>{n.body}</span></li>
                  ))}
                </ul>
              )}

              {view === 'tickets' && <Tickets tickets={tickets} totals={bookTotalsOf(c)} week={c.week} season={c.season} />}
              <p className="sb-foot">Lines include a {(DEMO_MARGIN * 100).toFixed(1)}% house margin. Bets settle when you advance the week; results go to your Inbox.</p>
            </div>
          </div>
          <div className="sb-clerk sb-inline" data-testid="sb-clerk-m">
            {clerkBody}
          </div>
          <div className="sb-slipwrap" style={at(LOUNGE_LAYOUT.slip)}>
            <div className="sb-slip" data-testid="sb-slip" aria-label="Bet slip">
              <p className="sb-slip-title">Bet slip {slip.length > 0 && <span>({slip.length})</span>}</p>
              {slip.length === 0 ? (
                <p className="sb-empty">Tap a line to add it.</p>
              ) : (
                <ul className="sb-slip-legs">
                  {slip.map((s) => (
                    <li key={selectionKey(s)}>
                      <span>{s.label}</span>
                      <b>{fmtAmerican(s.american)}</b>
                      <button className="sb-x" onClick={() => setSlip((x) => x.filter((y) => selectionKey(y) !== selectionKey(s)))} aria-label={`Remove ${s.label}`}>×</button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="sb-mode" role="radiogroup" aria-label="Bet type">
                <button role="radio" aria-checked={!parlay} className={!parlay ? 'on' : ''} onClick={() => setParlay(false)} data-testid="sb-singles">Singles</button>
                <button role="radio" aria-checked={parlay} className={parlay ? 'on' : ''} onClick={() => setParlay(true)} data-testid="sb-parlay">Parlay</button>
              </div>
              {parlay && !pc.ok && slip.length > 0 && <p className="sb-warn" data-testid="sb-parlay-warn">{pc.reason}</p>}
              <div className="sb-stake">
                <label htmlFor="sb-stake-input">Stake{!parlay && slip.length > 1 ? ' each' : ''}</label>
                <button onClick={() => setStake((v) => Math.max(SLIP_RULES.minStake, v - 5))} aria-label="Lower stake">−</button>
                <input id="sb-stake-input" type="number" inputMode="numeric" min={SLIP_RULES.minStake} max={maxStake} step={5} value={stake} onChange={(e) => setStake(Math.round(Number(e.target.value) || 0))} data-testid="sb-stake" />
                <button onClick={() => setStake((v) => Math.min(maxStake, v + 5))} aria-label="Raise stake">+</button>
              </div>
              {slip.length > 0 && !sc.ok && <p className="sb-warn">{sc.reason}</p>}
              <p className="sb-return">To return <b data-testid="sb-return">{formatMoney(toReturn)}</b></p>
              <button className="btn primary sb-place" disabled={!canPlace} onClick={openConfirm} data-testid="sb-place">
                Place bet
              </button>
              <p className="sb-sandbox">The stake comes out of your bankroll now. Max {formatMoney(maxStake)} per bet here. Settles when you advance the week.</p>
            </div>
          </div>
        </div>

        {confirming && (
          <div className="sb-confirm" role="dialog" aria-modal="true" aria-label="Confirm bet" data-testid="sb-confirm">
            <div className="sb-confirm-box">
              <p className="sb-slip-title">Confirm {useParlay ? `${slip.length}-leg parlay` : slip.length > 1 ? `${slip.length} singles` : 'single'}</p>
              <ul className="sb-slip-legs">{slip.map((s) => <li key={selectionKey(s)}><span>{s.label}</span><b>{fmtAmerican(s.american)}</b></li>)}</ul>
              <p>Stake {formatMoney(charge)} · to return <b>{formatMoney(toReturn)}</b></p>
              <p className="sb-sandbox">{formatMoney(charge)} leaves your bankroll now. Odds are locked as shown. Results arrive in your Inbox when the week ends.</p>
              <div className="btn-row">
                <button className="btn ghost" onClick={() => setConfirming(false)} autoFocus data-testid="sb-cancel">Back</button>
                <button className="btn primary" onClick={() => void place()} data-testid="sb-confirm-place">Confirm bet</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function FragmentRows({ g, lineBtn, open, toggle, unit }: { g: DemoGame; lineBtn: (g: DemoGame, l: DemoLine) => ReactNode; open: boolean; toggle: () => void; unit: string }) {
  const ml = g.lines.filter((l) => l.market === 'moneyline');
  const sp = g.lines.filter((l) => l.market === 'spread');
  const tot = g.lines.filter((l) => l.market === 'total');
  const away = teamById(g.away);
  const home = teamById(g.home);
  return (
    <>
      <tr className="sb-game" data-testid={`sb-game-${g.id}`}>
        <td>
          <button className="sb-matchup" onClick={toggle} aria-expanded={open} data-testid={`sb-matchup-${g.id}`}>
            <span><i style={{ background: away.colors[0] }} />{away.displayName}</span>
            <span><i style={{ background: home.colors[0] }} />@ {home.displayName}</span>
            <em>{g.when}</em>
          </button>
        </td>
        <td><div className="sb-pair">{lineBtn(g, ml[1])}{lineBtn(g, ml[0])}</div></td>
        <td><div className="sb-pair">{lineBtn(g, sp[1])}{lineBtn(g, sp[0])}</div></td>
        <td><div className="sb-pair">{lineBtn(g, tot[0])}{lineBtn(g, tot[1])}</div></td>
      </tr>
      {open && (
        <tr className="sb-detail" data-testid={`sb-detail-${g.id}`}>
          <td colSpan={4}>
            {home.displayName} win {(g.homeWinProb * 100).toFixed(0)}% of the book's simulations{(g as BookGame).neutral ? ' (neutral site)' : ' (home edge included)'} · total in {unit}
          </td>
        </tr>
      )}
    </>
  );
}

function monitorLine(seed: WorldRef, season: number, week: number, league: LeagueId) {
  const b = boardFor(seed, season, week, league);
  const g = b.games[0];
  if (!g) return 'Season over';
  return `${teamById(g.away).short} @ ${teamById(g.home).short} · ${b.week === week ? 'this week' : `Wk ${b.week}`}`;
}

function Scores({ seed, season, week, league }: { seed: WorldRef; season: number; week: number; league: LeagueId }) {
  const finals = recentFinals(seed, season, week, league);
  if (!finals.length) return <p className="sb-empty" data-testid="sb-scores">No {leagueById(league).name} games played yet this season.</p>;
  return (
    <ul className="sb-list" data-testid="sb-scores">
      {finals.map((g) => {
        const r = g.result;
        const note = r.so ? 'SO' : r.ot ? (leagueById(league).sport === 'baseball' ? `${9 + r.ot} inn` : 'OT') : '';
        return (
          <li key={g.id}>
            <span>{teamLabel(g.away)} <b>{r.awayScore}</b></span>
            <span>@ {teamLabel(g.home)} <b>{r.homeScore}</b></span>
            <em>Final{note ? ` · ${note}` : ''}{r.tie ? ' · tie' : ''} · {g.when}</em>
          </li>
        );
      })}
    </ul>
  );
}

function Standings({ seed, season, week, league }: { seed: WorldRef; season: number; week: number; league: LeagueId }) {
  const rows = standingsToDate(seed, season, week, league);
  const sport = leagueById(league).sport;
  const played = rows.some((r) => r.w + r.l + r.t + r.otl > 0);
  return (
    <>
      {!played && <p className="sb-note">No games played yet. Teams are listed alphabetically by tiebreak.</p>}
      <table className="sb-table" data-testid="sb-standings">
        <thead><tr><th>#</th><th>Team</th><th>W</th><th>L</th>{sport === 'football' && <th>T</th>}{sport === 'hockey' && <><th>OTL</th><th>Pts</th></>}<th>Streak</th></tr></thead>
        <tbody>
          {rows.map((s, i) => (
            <tr key={s.team} className={i < 4 && played ? 'sb-playoff' : ''}>
              <td>{i + 1}</td><td>{teamLabel(s.team)}</td><td>{s.w}</td><td>{s.l}</td>
              {sport === 'football' && <td>{s.t}</td>}
              {sport === 'hockey' && <><td>{s.otl}</td><td>{s.pts}</td></>}
              <td>{s.streak || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {played && <p className="sb-foot">Top four make the playoffs.</p>}
    </>
  );
}

function Tickets({ tickets, totals, week, season }: { tickets: Ticket[]; totals: ReturnType<typeof bookTotalsOf>; week: number; season: number }) {
  const open = tickets.filter((t) => t.status === 'open');
  const done = tickets.filter((t) => t.status !== 'open');
  const net = totals.returned - totals.staked + open.reduce((a, t) => a + t.stake, 0);
  const settledStaked = totals.staked - open.reduce((a, t) => a + t.stake, 0);
  const legLine = (t: Ticket) => t.legs.map((l) => (
    <span key={`${l.gameId}|${l.market}|${l.side}`} className={l.result ? `sb-leg ${l.result}` : 'sb-leg'}>
      {l.label} {fmtAmerican(l.american)}
      {l.final ? ` · final ${teamById(l.away).short} ${l.final[1]}, ${teamById(l.home).short} ${l.final[0]}` : ` · ${l.when}`}
      {t.kind === 'parlay' && l.result ? ` · ${l.result}` : ''}
    </span>
  ));
  const head = (t: Ticket) => `${t.kind === 'parlay' ? `${t.legs.length}-leg parlay` : 'Single'} · stake ${formatMoney(t.stake)}`;
  return (
    <div className="sb-tickets-view" data-testid="sb-tickets">
      <p className="sb-ticket-sum" data-testid="sb-ticket-sum">
        Record: {totals.won} won · {totals.lost} lost · {totals.pushed} push · Net on settled bets{' '}
        <b className={net > 0 ? 'pos' : net < 0 ? 'neg' : ''}>{net > 0 ? '+' : net < 0 ? '−' : ''}{formatMoney(Math.abs(net))}</b>
        {settledStaked > 0 && <> on {formatMoney(settledStaked)} staked</>}
      </p>
      <p className="sb-hist-sub">Open ({open.length})</p>
      {open.length === 0 ? <p className="sb-empty">No open tickets. Pick a line to start a bet slip.</p> : (
        <ul className="sb-list sb-tickets" data-testid="sb-open-tickets">
          {open.map((t) => {
            const lastWeek = Math.max(...t.legs.map((l) => l.week));
            const thisWeek = t.legs.every((l) => l.season === season) && lastWeek === week;
            return (
              <li key={t.id} data-status="open">
                <b>{head(t)} · to return {formatMoney(t.toReturn)}</b>
                {legLine(t)}
                <em>{thisWeek ? 'Settles when you advance to next week.' : `Settles after Week ${lastWeek}.`}</em>
              </li>
            );
          })}
        </ul>
      )}
      <p className="sb-hist-sub">History ({done.length})</p>
      {done.length === 0 ? <p className="sb-empty">Settled tickets will appear here, newest first.</p> : (
        <ul className="sb-list sb-tickets" data-testid="sb-ticket-history">
          {done.map((t) => (
            <li key={t.id} data-status={t.status}>
              <b>
                <span className={`sb-res ${t.status}`}>{t.status === 'won' ? 'WON' : t.status === 'lost' ? 'LOST' : 'PUSH'}</span>{' '}
                {head(t)} · {t.status === 'won' ? `paid ${formatMoney(t.payout)}` : t.status === 'push' ? `${formatMoney(t.payout)} back` : 'paid $0'}
              </b>
              {legLine(t)}
              {t.settled && <em>Settled Season {t.settled.season}, Week {t.settled.week}</em>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
