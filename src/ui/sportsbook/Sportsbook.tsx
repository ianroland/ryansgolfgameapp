/**
 * Sportsbook lounge: Phase 1 visual-first vertical slice (Desert Palms), DEMO DATA ONLY.
 *
 * Layers: lounge background (art slot or labelled placeholder) → live CRT boards (React) →
 * clerk portrait slot → bet slip and HUD. Nothing here touches the ledger or the save: bets
 * placed in this slice are sandboxed demo tickets kept in memory for this session. The real
 * engine, odds, settlement and saving arrive in Phases 2-4 (docs/sportsbook/PHASE0_REPORT.md).
 */
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import {
  DEMO_MARGIN, demoNews, demoScores, demoSlate, demoStandings, fmtAmerican, LEAGUES, leagueById, teamById,
  type DemoGame, type DemoLine, type LeagueId,
} from '../../sports/demo';
import { parlayCheck, potentialReturn, selectionKey, SLIP_RULES, stakeCheck, toggleSelection, type Selection } from '../../sports/slip';
import { LOUNGE_LAYOUT, LOUNGE_SIZE, LOUNGES, rectPct, type ClerkExpression, type NativeRect } from '../../sports/themes';
import { bundledLore, leagueTimeline, lore, sportsYearForSeason, teamHistory } from '../../sports/lore/service';
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

interface DemoTicket { id: number; legs: Selection[]; stake: number; parlay: boolean; toReturn: number }

/**
 * Demo tickets and the slip live for the whole play session (leaving the tab, the casino or
 * advancing the calendar keeps them). They are deliberately NOT saved: the sandbox never writes
 * the save or the ledger, so a page reload clears them, and they never settle.
 */
const session = { tickets: [] as DemoTicket[], slip: [] as Selection[], nextId: 1 };
function useSessionState<K extends 'tickets' | 'slip'>(key: K): [(typeof session)[K], (f: (v: (typeof session)[K]) => (typeof session)[K]) => void] {
  const [v, setV] = useState(session[key]);
  const set = (f: (v: (typeof session)[K]) => (typeof session)[K]) => {
    session[key] = f(session[key]);
    setV(session[key]);
  };
  return [v, set];
}

const SPORT_LABEL = { baseball: 'Baseball', basketball: 'Basketball', football: 'Football', hockey: 'Hockey' } as const;

const teamLabel = (id: string) => teamById(id).displayName;
const lineLabel = (g: DemoGame, l: DemoLine) => {
  if (l.market === 'moneyline') return `${teamById(l.side === 'home' ? g.home : g.away).name} ML`;
  if (l.market === 'spread') return `${teamById(l.side === 'home' ? g.home : g.away).name} ${l.point! > 0 ? '+' : ''}${l.point}`;
  return `${l.side === 'over' ? 'Over' : 'Under'} ${l.point}`;
};

export function Sportsbook() {
  const { state } = useGame();
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
  const [tickets, setTickets] = useSessionState('tickets');
  const slate = useMemo(() => demoSlate(league), [league]);
  const L = leagueById(league);

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
  const sc = stakeCheck(stake, slip.length, useParlay, state.balance);
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
  const short = slip.length > 0 && stake > state.balance;
  const expression: ClerkExpression = short ? 'concerned' : reaction ?? 'friendly';
  const clerkBody = theme.art.clerk ? (
    <>
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
      <div className="sb-clerk-text">
        <span className="sb-clerk-name">{theme.art.clerk.name}</span>
        <p className="sb-clerk-line">“Lines are posted. Take your time.” <span className="rpg-draft">Placeholder</span></p>
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

  const place = () => {
    const id = session.nextId++;
    setTickets((t) => [{ id, legs: slip, stake, parlay: useParlay, toReturn }, ...t]);
    setSlip([]);
    setConfirming(false);
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
            <span className="sb-demo" title="Demo data: teams, lines and results are placeholders. Bets are sandboxed and never touch your bankroll." data-testid="sb-demo">DEMO DATA</span>
            <span className="sb-bank" data-testid="sb-bank">Bankroll <b>{formatMoney(state.balance)}</b></span>
          </header>

          {/* Wide screens: the four monitors are the league screens, the board under them is the menu, the clerk sits on the pillar. */}
          <div className="sb-onart">
            {LEAGUES.map((l, i) => {
              const g = demoSlate(l.id)[0];
              const ml = g.lines.find((x) => x.market === 'moneyline' && x.side === 'home')!;
              return (
                <button key={l.id} className={`sb-screen ${league === l.id ? 'on' : ''}`} style={at(LOUNGE_LAYOUT.screens[i])} onClick={() => { setLeague(l.id); setDetail(null); }} aria-pressed={league === l.id} aria-label={`${SPORT_LABEL[l.sport]}: ${l.name} lines`} data-testid={`sb-league-${l.id}`}>
                  <b>{SPORT_LABEL[l.sport]}</b>
                  <em>{teamById(g.away).short} @ {teamById(g.home).short} {fmtAmerican(ml.american)}</em>
                </button>
              );
            })}
            <nav className="sb-boardmenu" style={at(LOUNGE_LAYOUT.board)} aria-label="Sportsbook menu">
              {VIEWS.map((v) => (
                <button key={v.id} className={view === v.id ? 'on' : ''} onClick={() => setView(v.id)} aria-pressed={view === v.id} data-testid={`sb-view-${v.id}`}>
                  {v.label}{v.id === 'tickets' && tickets.length ? ` (${tickets.length})` : ''}
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
                  {v.label}{v.id === 'tickets' && tickets.length ? ` (${tickets.length})` : ''}
                </button>
              ))}
          </nav>
          <div className="sb-content" style={at(LOUNGE_LAYOUT.content)}>
            <div className="sb-crt" data-testid={`sb-crt-${view}`}>
              <p className="sb-crt-title">{view === 'tickets' ? 'Your demo tickets' : `${SPORT_LABEL[L.sport]} · ${VIEWS.find((v) => v.id === view)!.label}`}</p>

              {view === 'lines' && (
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

              {view === 'scores' && (
                <ul className="sb-list" data-testid="sb-scores">
                  {demoScores(league).map((f, i) => (
                    <li key={i}>
                      <span>{teamLabel(f.away)} <b>{f.as}</b></span>
                      <span>@ {teamLabel(f.home)} <b>{f.hs}</b></span>
                      <em>Final{f.note ? ` · ${f.note}` : ''}</em>
                    </li>
                  ))}
                </ul>
              )}

              {view === 'standings' && (
                <table className="sb-table" data-testid="sb-standings">
                  <thead><tr><th>#</th><th>Team</th><th>W</th><th>L</th><th>Streak</th></tr></thead>
                  <tbody>
                    {demoStandings(league).map((s, i) => (
                      <tr key={s.team} className={i < 4 ? 'sb-playoff' : ''}><td>{i + 1}</td><td>{teamLabel(s.team)}</td><td>{s.w}</td><td>{s.l}</td><td>{s.streak}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}

              {view === 'news' && (
                <ul className="sb-list sb-news" data-testid="sb-news">
                  {demoNews().map((n, i) => (
                    <li key={i}><span className={`sb-tag ${n.tag}`}>{SPORT_LABEL[leagueById(n.league).sport]} · {n.tag}</span><b>{n.headline}</b><span>{n.body}</span></li>
                  ))}
                </ul>
              )}

              {view === 'history' && <LeagueHistory league={league} year={sportsYearForSeason(state.career.season)} />}

              {view === 'tickets' &&
                (tickets.length === 0 ? (
                  <p className="sb-empty">No tickets yet. Pick a line to start a bet slip.</p>
                ) : (
                  <ul className="sb-list sb-tickets" data-testid="sb-tickets">
                    {tickets.map((t) => (
                      <li key={t.id}>
                        <b>#{t.id} · {t.parlay ? `${t.legs.length}-leg parlay` : t.legs.length > 1 ? `${t.legs.length} singles` : 'Single'} · {formatMoney(t.parlay ? t.stake : t.stake * t.legs.length)}</b>
                        {t.legs.map((l) => <span key={selectionKey(l)}>{l.label} {fmtAmerican(l.american)}</span>)}
                        <em>To return {formatMoney(t.toReturn)} · DEMO TICKET: no money moved, never settles, kept until you reload the game</em>
                      </li>
                    ))}
                  </ul>
                ))}
              <p className="sb-foot">Demo lines include a {(DEMO_MARGIN * 100).toFixed(1)}% house margin. Illustrative only.</p>
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
                <input id="sb-stake-input" type="number" inputMode="numeric" min={SLIP_RULES.minStake} max={SLIP_RULES.maxStake} step={5} value={stake} onChange={(e) => setStake(Math.round(Number(e.target.value) || 0))} data-testid="sb-stake" />
                <button onClick={() => setStake((v) => Math.min(SLIP_RULES.maxStake, v + 5))} aria-label="Raise stake">+</button>
              </div>
              {slip.length > 0 && !sc.ok && <p className="sb-warn">{sc.reason}</p>}
              <p className="sb-return">To return <b data-testid="sb-return">{formatMoney(toReturn)}</b></p>
              <button className="btn primary sb-place" disabled={!canPlace} onClick={() => setConfirming(true)} data-testid="sb-place">
                Place demo bet
              </button>
              <p className="sb-sandbox">Sandbox: demo tickets never charge or pay your bankroll, and aren't saved (a reload clears them).</p>
            </div>
          </div>
        </div>

        {confirming && (
          <div className="sb-confirm" role="dialog" aria-modal="true" aria-label="Confirm demo bet" data-testid="sb-confirm">
            <div className="sb-confirm-box">
              <p className="sb-slip-title">Confirm {useParlay ? `${slip.length}-leg parlay` : slip.length > 1 ? `${slip.length} singles` : 'single'}</p>
              <ul className="sb-slip-legs">{slip.map((s) => <li key={selectionKey(s)}><span>{s.label}</span><b>{fmtAmerican(s.american)}</b></li>)}</ul>
              <p>Stake {formatMoney(useParlay ? stake : stake * slip.length)} · to return <b>{formatMoney(toReturn)}</b></p>
              <p className="sb-sandbox">DEMO: odds are locked on the ticket, but nothing is charged.</p>
              <div className="btn-row">
                <button className="btn ghost" onClick={() => setConfirming(false)} autoFocus data-testid="sb-cancel">Back</button>
                <button className="btn primary" onClick={place} data-testid="sb-confirm-place">Confirm</button>
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
            <b>{away.short}</b> demo strength {away.rating} · <b>{home.short}</b> demo strength {home.rating} (home edge) · model win chance {home.short} {(g.homeWinProb * 100).toFixed(0)}% · total in {unit}
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * League history from the sports-lore canon (draft until approved). Read-only: it shows only what
 * the canon has written, marks proposed inferences as such, and counts the rest as unwritten.
 * Seasons from 2027 on will come from the save's own simulated ledger (Phase 4), not from canon.
 * Split into sections so each one fits the board without hidden overflow.
 */
const HIST_SECTIONS = [
  { id: 'about', label: 'About' },
  { id: 'champions', label: 'Champions' },
  { id: 'moments', label: 'Moments' },
  { id: 'legends', label: 'Legends' },
  { id: 'teams', label: 'Teams' },
] as const;
type HistSection = (typeof HIST_SECTIONS)[number]['id'];

function LeagueHistory({ league, year }: { league: LeagueId; year: number }) {
  const [section, setSection] = useState<HistSection>('about');
  const [team, setTeam] = useState<string | null>(null);
  useEffect(() => setTeam(null), [league]);
  const viewer = { year, tier: 'historian' as const };
  const t = leagueTimeline(league, viewer);
  const L = lore.league(league)!;
  const written = t.ledger.filter((r) => r.status !== 'unwritten');
  const legends = bundledLore().people.filter((p) => p.league === league && p.events.some((e) => t.events.some((x) => x.id === e)));
  const th = team ? teamHistory(team, viewer) : null;
  const span = (e: { span: { start: number; end: number } }) => (e.span.start === e.span.end ? `${e.span.start}` : `${e.span.start}–${e.span.end}`);
  return (
    <div className="sb-history" data-testid="sb-history">
      <p className="sb-hist-head">
        <b>{t.name}</b> · founded {t.founded} · {t.trophy}
        {t.canonStatus !== 'approved' && <span className="rpg-draft" title={`Proposed canon ${t.canonRevision}, not yet approved`}>Draft canon</span>}
      </p>
      <nav className="sb-hist-tabs" aria-label="History sections">
        {HIST_SECTIONS.map((x) => (
          <button key={x.id} className={section === x.id ? 'on' : ''} aria-pressed={section === x.id} onClick={() => { setSection(x.id); setTeam(null); }} data-testid={`sb-hist-${x.id}`}>{x.label}</button>
        ))}
      </nav>

      {section === 'about' && (
        <div className="sb-hist-body" data-testid="sb-history-about">
          <p><b>“{t.identity}”</b></p>
          <p>{L.summary}</p>
          <p className="sb-foot">
            Founded {L.founded}{L.founding.charter_city ? ` in ${L.founding.charter_city}` : ''}{L.founding.founding_clubs ? ` by ${L.founding.founding_clubs} clubs` : ''}.
            {' '}Today: {L.current_format.teams} teams, {L.current_format.games_per_team} games each.
          </p>
          {t.rivalries.length > 0 && (
            <ul className="sb-list">
              {t.rivalries.map((r) => (
                <li key={r.id}><b>{r.teams.map((x) => teamById(x).displayName).join(' vs ')}</b><span>{r.summary}</span></li>
              ))}
            </ul>
          )}
        </div>
      )}

      {section === 'champions' && (
        <div className="sb-hist-body">
          <table className="sb-table" data-testid="sb-history-ledger">
            <thead><tr><th>Season</th><th>Champion</th><th>Final opponent</th></tr></thead>
            <tbody>
              {written.map((r) => (
                <tr key={r.season} data-status={r.status}>
                  <td>{r.season}</td>
                  {r.status === 'established' && (<><td>{teamLabel(r.champion)}</td><td>{r.runnerUp ? teamLabel(r.runnerUp) : <i>Not written</i>}</td></>)}
                  {r.status === 'winner_unknown' && (<><td><i>Not written</i></td><td>Finalist: {r.finalists.map(teamLabel).join(', ')}</td></>)}
                  {r.status === 'inference_pending_approval' && (<><td>{teamLabel(r.champion)} <span className="sb-tag">proposed</span></td><td><i>Not written</i></td></>)}
                  {r.status === 'simulated' && (<><td>{teamLabel(r.champion)}</td><td>{r.runnerUp ? teamLabel(r.runnerUp) : '—'}</td></>)}
                </tr>
              ))}
              {t.undatedTitles.map((u) => (
                <tr key={u.record} data-status="year_unknown"><td>{u.from}–{u.to}</td><td>{teamLabel(u.champion)} ×{u.count}</td><td><i>Years not written</i></td></tr>
              ))}
            </tbody>
          </table>
          <p className="sb-foot" data-testid="sb-history-unwritten">{t.counts.unwritten} of {t.ledger.length} seasons since {t.founded} are not written yet.</p>
        </div>
      )}

      {section === 'moments' && (
        <ul className="sb-list sb-hist-body" data-testid="sb-history-events">
          {[...t.events].reverse().map((e) => (
            <li key={e.id}>
              <b>{span(e)} · {e.title}</b>
              <span>{e.summary}</span>
            </li>
          ))}
        </ul>
      )}

      {section === 'legends' && (
        <ul className="sb-list sb-hist-body" data-testid="sb-history-legends">
          {legends.map((p) => {
            const aff = p.affiliations.map((a) => teamById(a.team).displayName);
            const ev = p.events.map((e) => lore.event(e)!).filter(Boolean);
            return (
              <li key={p.id}>
                <b>{p.name}</b>
                <em>{p.roles.join(', ')} · {aff.length ? aff.join(' → ') : 'team not written yet'}{p.career_status === 'retired' ? ' · retired' : ''}</em>
                <span>{ev.map((e) => `${span(e)} ${e.title}`).join(' · ')}</span>
              </li>
            );
          })}
          {legends.length === 0 && <li>No legends written yet.</li>}
        </ul>
      )}

      {section === 'teams' && !th && (
        <div className="sb-hist-teams sb-hist-body" data-testid="sb-history-teams">
          {bundledLore().teams.filter((x) => x.league === league).map((x) => {
            const h = teamHistory(x.id, viewer)!;
            const titles = h.titles.length + h.undatedTitles.reduce((n, u) => n + u.count, 0);
            return (
              <button key={x.id} className="sb-hist-team" onClick={() => setTeam(x.id)} data-testid={`sb-hist-team-${x.id}`}>
                <i className="sb-swatch" style={{ background: teamById(x.id).colors[0] }} />
                <span>{teamById(x.id).displayName}</span>
                <em>{titles ? `${titles} title${titles > 1 ? 's' : ''} on record` : h.events.length ? `${h.events.length} moment${h.events.length > 1 ? 's' : ''}` : 'history unwritten'}</em>
              </button>
            );
          })}
        </div>
      )}

      {section === 'teams' && th && (
        <div className="sb-hist-body" data-testid="sb-history-team">
          <p><button className="sb-hist-back" onClick={() => setTeam(null)}>‹ All teams</button> <b>{teamById(th.team.id).displayName}</b> · {th.team.colors_named.join(' / ')}</p>
          <p className="sb-foot">
            Titles on record: {th.titles.length ? th.titles.join(', ') : 'none written'}
            {th.undatedTitles.map((u) => ` · ${u.count} more in ${u.from}–${u.to} (years not written)`).join('')}
            {th.pendingTitles.length ? ` · proposed: ${th.pendingTitles.join(', ')}` : ''}
            {th.finalsLost.length ? ` · finals lost: ${th.finalsLost.join(', ')}` : ''}
          </p>
          {th.perspectives.map((p) => <p key={p.stance} className="sb-hist-voice">Fans: {p.stance}</p>)}
          <ul className="sb-list">
            {th.events.map((e) => (<li key={e.id}><b>{span(e)} · {e.title}</b><span>{e.summary}</span></li>))}
          </ul>
          {th.events.length === 0 && <p className="sb-foot">No moments written for this franchise yet. Founding city and history before today are also unwritten.</p>}
          {th.rivalries.length > 0 && <p className="sb-foot">Rival: {th.rivalries.map((r) => teamById(r.teams.find((x) => x !== th.team.id)!).displayName).join(', ')}</p>}
        </div>
      )}
    </div>
  );
}
