/**
 * Sportsbook lounge: Phase 1 visual-first vertical slice (Desert Palms), DEMO DATA ONLY.
 *
 * Layers: lounge background (art slot or labelled placeholder) → live CRT boards (React) →
 * clerk portrait slot → bet slip and HUD. Nothing here touches the ledger or the save: bets
 * placed in this slice are sandboxed demo tickets kept in memory for this session. The real
 * engine, odds, settlement and saving arrive in Phases 2-4 (docs/sportsbook/PHASE0_REPORT.md).
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  DEMO_MARGIN, demoHistory, demoNews, demoScores, demoSlate, demoStandings, fmtAmerican, LEAGUES, leagueById, teamById,
  type DemoGame, type DemoLine, type LeagueId,
} from '../../sports/demo';
import { parlayCheck, potentialReturn, selectionKey, SLIP_RULES, stakeCheck, toggleSelection, type Selection } from '../../sports/slip';
import { LOUNGES } from '../../sports/themes';
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

const teamLabel = (id: string) => { const t = teamById(id); return `${t.city} ${t.name}`; };
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
  const [slip, setSlip] = useState<Selection[]>([]);
  const [parlay, setParlay] = useState(false);
  const [stake, setStake] = useState(10);
  const [confirming, setConfirming] = useState(false);
  const [tickets, setTickets] = useState<DemoTicket[]>([]);
  const nextId = useRef(1);
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

  const place = () => {
    const id = nextId.current++;
    setTickets((t) => [{ id, legs: slip, stake, parlay: useParlay, toReturn }, ...t]);
    setSlip([]);
    setConfirming(false);
    setView('tickets');
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

  return (
    <section className={`hub-card sportsbook loc-${loc}`} style={style} data-testid="sportsbook" aria-label={`${theme.name} sportsbook`}>
      <div className="sb-stage" data-testid="sb-stage">
        {theme.art.background ? (
          <img className="sb-bg" src={theme.art.background} alt="" width={1672} height={941} draggable={false} />
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

        <div className="sb-main">
          <div className="sb-board" data-testid="sb-board">
            <nav className="sb-leagues" aria-label="Leagues">
              {LEAGUES.map((l) => (
                <button key={l.id} className={league === l.id ? 'on' : ''} onClick={() => { setLeague(l.id); setDetail(null); }} aria-pressed={league === l.id} data-testid={`sb-league-${l.id}`} title={l.name}>
                  {l.short}
                </button>
              ))}
            </nav>
            <nav className="sb-views" aria-label="Sportsbook menu">
              {VIEWS.map((v) => (
                <button key={v.id} className={view === v.id ? 'on' : ''} onClick={() => setView(v.id)} aria-pressed={view === v.id} data-testid={`sb-view-${v.id}`}>
                  {v.label}{v.id === 'tickets' && tickets.length ? ` (${tickets.length})` : ''}
                </button>
              ))}
            </nav>
            <div className="sb-crt" data-testid={`sb-crt-${view}`}>
              <p className="sb-crt-title">{view === 'tickets' ? 'Your demo tickets' : `${L.name} · ${VIEWS.find((v) => v.id === view)!.label}`}</p>

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
                    <li key={i}><span className={`sb-tag ${n.tag}`}>{leagueById(n.league).short} · {n.tag}</span><b>{n.headline}</b><span>{n.body}</span></li>
                  ))}
                </ul>
              )}

              {view === 'history' && (
                <table className="sb-table" data-testid="sb-history">
                  <thead><tr><th>League</th><th>Season</th><th>Champion</th><th>MVP</th></tr></thead>
                  <tbody>
                    {demoHistory().map((h, i) => (
                      <tr key={i}><td>{leagueById(h.league).short}</td><td>{h.season}</td><td>{teamLabel(h.team)}</td><td>{h.mvp}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}

              {view === 'tickets' &&
                (tickets.length === 0 ? (
                  <p className="sb-empty">No tickets yet. Pick a line to start a bet slip.</p>
                ) : (
                  <ul className="sb-list sb-tickets" data-testid="sb-tickets">
                    {tickets.map((t) => (
                      <li key={t.id}>
                        <b>#{t.id} · {t.parlay ? `${t.legs.length}-leg parlay` : t.legs.length > 1 ? `${t.legs.length} singles` : 'Single'} · {formatMoney(t.parlay ? t.stake : t.stake * t.legs.length)}</b>
                        {t.legs.map((l) => <span key={selectionKey(l)}>{l.label} {fmtAmerican(l.american)}</span>)}
                        <em>To return {formatMoney(t.toReturn)} · DEMO TICKET: no money moved, never settles</em>
                      </li>
                    ))}
                  </ul>
                ))}
              <p className="sb-foot">Demo lines include a {(DEMO_MARGIN * 100).toFixed(1)}% house margin. Illustrative only.</p>
            </div>
          </div>

          <aside className="sb-side">
            <div className="sb-clerk" data-testid="sb-clerk">
              <div className="sb-clerk-portrait" aria-label="Sportsbook clerk portrait (placeholder)">
                <span>Clerk portrait<br />256×256 ×6<br />pending (NPC Factory)</span>
              </div>
              <p className="sb-clerk-line">“Lines are posted. Take your time.” <span className="rpg-draft">Placeholder</span></p>
            </div>

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
              <p className="sb-sandbox">Sandbox: demo tickets never charge or pay your bankroll.</p>
            </div>
          </aside>
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
            <span><i style={{ background: away.colors[0] }} />{away.city} {away.name}</span>
            <span><i style={{ background: home.colors[0] }} />@ {home.city} {home.name}</span>
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
