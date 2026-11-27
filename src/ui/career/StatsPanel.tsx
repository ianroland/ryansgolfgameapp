import { ladderAt, tourShort } from '../../career/ladder';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { careerStats, type EventLine, type HoleMix } from '../../career/careerStats';
import { pinkJackets } from '../../career/legacy';
import { isPinkJacket } from '../../catalog/trophies';
import { RIVAL } from '../../career/field';
import type { TournamentRecord } from '../../persistence/records';
import { useGame } from '../GameContext';
import { formatMoney, ordinal, shortMoney, toPar } from '../format';
import { TourPill } from './bits';
import { MoneyBoard } from './MoneyBoard';

/** Diverging scale around par (validated for CVD on the cream chart card). */
const MIX: { key: keyof Omit<HoleMix, 'holes' | 'aces' | 'albatrosses'>; label: string; color: string }[] = [
  { key: 'eagles', label: 'Eagle+', color: '#1b4a96' },
  { key: 'birdies', label: 'Birdie', color: '#4f8fe0' },
  { key: 'pars', label: 'Par', color: '#c2beb4' },
  { key: 'bogeys', label: 'Bogey', color: '#e8873f' },
  { key: 'doubles', label: 'Double+', color: '#a8301a' },
];

const fmtToPar = (x: number | null, digits = 2) => (x === null ? '—' : x === 0 ? 'E' : `${x > 0 ? '+' : ''}${x.toFixed(digits)}`);
const fmtAvg = (x: number | null, digits = 2) => (x === null ? '—' : x.toFixed(digits));
const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(1)}%` : '—');

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="stat-tile">
      <span className="st-label">{label}</span>
      <span className="st-value">{value}</span>
      {sub && <span className="st-sub">{sub}</span>}
    </div>
  );
}

function HoleMixChart({ mix }: { mix: HoleMix }) {
  const [hover, setHover] = useState<string | null>(null);
  if (!mix.holes) return <p className="empty">No holes played yet.</p>;
  return (
    <div className="chart-card">
      <div className="mix-bar" role="img" aria-label={MIX.map((m) => `${m.label} ${pct(mix[m.key], mix.holes)}`).join(', ')}>
        {MIX.filter((m) => mix[m.key] > 0).map((m) => (
          <div
            key={m.key}
            className={`mix-seg ${hover && hover !== m.key ? 'dim' : ''}`}
            style={{ flexGrow: mix[m.key], background: m.color }}
            onMouseEnter={() => setHover(m.key)}
            onMouseLeave={() => setHover(null)}
          >
            {hover === m.key && (
              <span className="chart-tip">
                <b>{m.label}</b> {mix[m.key]} holes · {pct(mix[m.key], mix.holes)}
              </span>
            )}
          </div>
        ))}
      </div>
      <ul className="mix-legend">
        {MIX.map((m) => (
          <li key={m.key} onMouseEnter={() => setHover(m.key)} onMouseLeave={() => setHover(null)}>
            <span className="sw" style={{ background: m.color }} />
            <span className="lg-label">{m.label}</span>
            <span className="lg-val">{pct(mix[m.key], mix.holes)}</span>
            <span className="lg-n">{mix[m.key]}</span>
          </li>
        ))}
      </ul>
      <p className="chart-note">
        {mix.holes} holes played{mix.aces ? ` · ${mix.aces} hole${mix.aces > 1 ? 's' : ''}-in-one` : ''}
        {mix.albatrosses ? ` · ${mix.albatrosses} albatross${mix.albatrosses > 1 ? 'es' : ''}` : ''}
      </p>
    </div>
  );
}

function EarningsChart({ seasons }: { seasons: { season: number; earnings: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...seasons.map((s) => s.earnings), 1);
  if (seasons.every((s) => s.earnings === 0)) return <p className="empty">No prize money yet. Amateurs play for ranking points; turn pro to start earning.</p>;
  return (
    <div className="chart-card">
      <div className="col-chart" role="img" aria-label={seasons.map((s) => `Season ${s.season}: ${formatMoney(s.earnings)}`).join(', ')}>
        {seasons.map((s) => (
          <div key={s.season} className="col-slot" onMouseEnter={() => setHover(s.season)} onMouseLeave={() => setHover(null)}>
            <span className="col-val">{s.earnings ? shortMoney(s.earnings) : ''}</span>
            <div className={`col ${hover !== null && hover !== s.season ? 'dim' : ''}`} style={{ height: `${Math.max(s.earnings ? 3 : 0, (s.earnings / max) * 100)}%` }} />
            <span className="col-x">S{s.season}</span>
            {hover === s.season && (
              <span className="chart-tip">
                <b>Season {s.season}</b> {formatMoney(s.earnings)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Scorecard({ e }: { e: EventLine }) {
  return (
    <div className="scorecard-wrap">
      <table className="scorecard">
        <thead>
          <tr>
            <th scope="col">Rd</th>
            {e.pars.map((_, i) => <th key={i} scope="col">{i + 1}</th>)}
            <th scope="col">Tot</th>
          </tr>
        </thead>
        <tbody>
          <tr className="par-row">
            <th scope="row">Par</th>
            {e.pars.map((p, i) => <td key={i}>{p}</td>)}
            <td>{e.pars.reduce((a, b) => a + b, 0)}</td>
          </tr>
          {e.holes.map((round, r) => (
            <tr key={r} className="me">
              <th scope="row">R{r + 1}</th>
              {round.map((s, i) => (
                <td key={i} className={s < e.pars[i] ? 'won' : s > e.pars[i] + 1 ? 'dbl' : ''}>{s}</td>
              ))}
              <td>{round.reduce((a, b) => a + b, 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StatsPanel() {
  const { state, services } = useGame();
  const c = state.career;
  const [records, setRecords] = useState<TournamentRecord[] | null>(null);
  const [season, setSeason] = useState<'all' | number>('all');
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void services.career.listTournaments().then((r) => live && setRecords(r));
    return () => {
      live = false;
    };
  }, [services, c.totals.events]);

  const stats = useMemo(() => (records ? careerStats(records, c.playerId, c.rivalId) : null), [records, c.playerId, c.rivalId]);
  const jacketsWon = stats ? pinkJackets(stats.history, new Set(state.trophies.filter((t) => t.ownerId === c.playerId && isPinkJacket(t)).map((t) => t.sourceTournamentId))).length : 0;
  if (!stats) return <main className="stats"><p className="muted">Loading stats…</p></main>;

  const seasonsAll = Array.from({ length: c.season }, (_, i) => i + 1);
  const seasonLines = seasonsAll.map((s) => stats.bySeason.find((x) => x.season === s) ?? { season: s, tours: [], events: 0, wins: 0, top10s: 0, cutsMade: 0, cutsPlayed: 0, earnings: 0, bestFinish: null, rounds: 0, avgToPar: null });
  const log = (c.seasonLog ?? []).reduce<Record<number, (typeof c.seasonLog & object)[number]>>((m, s) => ({ ...m, [s.season]: s }), {});
  const shown = stats.history.filter((e) => season === 'all' || e.season === season);

  if (stats.events === 0) {
    return (
      <main className="stats">
        <section className="hub-card">
          <h2 className="hub-title">Career stats</h2>
          <p className="empty">No tournaments yet. Play your first event from the Career tab and your stats will appear here.</p>
        </section>
        <MoneyBoard c={c} />
      </main>
    );
  }

  return (
    <main className="stats">
      <section className="stat-tiles" aria-label="Career totals">
        <Tile label="Events" value={`${stats.events}`} sub={`${stats.rounds} rounds`} />
        <Tile label="Wins" value={`${stats.wins}`} sub={stats.playoffWins ? `${stats.playoffWins} in playoffs` : undefined} />
        <Tile label="Majors" value={`${stats.majors}`} sub={jacketsWon ? `${jacketsWon} Pink Jacket${jacketsWon > 1 ? 's' : ''}` : undefined} />
        <Tile label="Top 10s" value={`${stats.top10s}`} sub={pct(stats.top10s, stats.events)} />
        <Tile label="Cuts made" value={stats.cutsPlayed ? `${stats.cutsMade}/${stats.cutsPlayed}` : '—'} sub={stats.cutsPlayed ? pct(stats.cutsMade, stats.cutsPlayed) : 'No cuts yet'} />
        <Tile label="Best finish" value={stats.bestFinish ? ordinal(stats.bestFinish) : '—'} />
        <Tile label="Earnings" value={shortMoney(stats.earnings)} />
        <Tile label="Avg round (9 holes)" value={fmtAvg(stats.scoringAvg)} sub={`${fmtToPar(stats.avgToPar)} to par`} />
      </section>

      <MoneyBoard c={c} />

      <div className="stats-grid">
        <section className="hub-card">
          <h2 className="hub-title">Scoring</h2>
          <dl className="stat-list">
            <div><dt>Low round</dt><dd>{stats.lowRound ? `${stats.lowRound.strokes} (${toPar(stats.lowRound.toPar)})` : '—'}{stats.lowRound && <span className="muted"> · {stats.lowRound.event}, S{stats.lowRound.season}</span>}</dd></div>
            <div><dt>Rounds under par</dt><dd>{stats.subParRounds} <span className="muted">of {stats.rounds}</span></dd></div>
            <div><dt>Par 3 average</dt><dd>{fmtAvg(stats.parAverages[3])}</dd></div>
            <div><dt>Par 4 average</dt><dd>{fmtAvg(stats.parAverages[4])}</dd></div>
            <div><dt>Par 5 average</dt><dd>{fmtAvg(stats.parAverages[5])}</dd></div>
            <div><dt>Eagles · Aces</dt><dd>{stats.mix.eagles - stats.mix.albatrosses} · {stats.mix.aces}</dd></div>
            <div><dt>Albatrosses</dt><dd data-testid="stats-albatrosses">{stats.mix.albatrosses}</dd></div>
          </dl>
          <h3 className="sub-title">Every hole</h3>
          <HoleMixChart mix={stats.mix} />
        </section>

        <section className="hub-card">
          <h2 className="hub-title">Prize money by season</h2>
          <EarningsChart seasons={seasonLines} />
          {stats.rival && (
            <>
              <h3 className="sub-title">Rivalry: {RIVAL.name}</h3>
              <p className="rival-line">
                Same event <b>{stats.rival.events}</b>× · Ryan finished ahead <b>{stats.rival.ryanAhead}</b> · Kayla ahead <b>{stats.rival.rivalAhead}</b>
                {stats.rival.rivalWins ? ` · Kayla's wins: ${stats.rival.rivalWins}` : ''}
              </p>
            </>
          )}
          <h3 className="sub-title">By course</h3>
          <div className="table-wrap">
            <table className="data-table by-course" data-testid="stats-by-course">
              <thead>
                <tr><th className="l">Course</th><th>Events</th><th>Wins</th><th>Avg</th><th>Low</th></tr>
              </thead>
              <tbody>
                {stats.byCourse.map((k) => (
                  <tr key={k.courseId}>
                    <td className="l">{k.name}</td>
                    <td>{k.events}</td>
                    <td>{k.wins || '—'}</td>
                    <td className={k.avgToPar !== null && k.avgToPar < 0 ? 'under' : ''}>{fmtToPar(k.avgToPar)}</td>
                    <td>{k.lowRound === null ? '—' : toPar(k.lowRound)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="hub-card">
        <h2 className="hub-title">Season by season</h2>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Season</th><th>Age</th><th>Tour</th><th>Events</th><th>Wins</th><th>Top 10</th><th>Cuts</th><th>Best</th><th>Avg/rd</th><th>Earnings</th><th>Rank</th><th>All-time</th>
              </tr>
            </thead>
            <tbody>
              {seasonLines.map((s) => {
                const l = log[s.season];
                const current = s.season === c.season;
                return (
                  <tr key={s.season} className={current ? 'current' : ''}>
                    <td>{s.season}{current && <span className="muted"> (now)</span>}</td>
                    <td>{l?.age ?? (current ? c.age : '—')}</td>
                    <td className="tours">{s.tours.length ? s.tours.map((t) => <TourPill key={t} tour={t} season={s.season} week={99} />) : '—'}</td>
                    <td>{s.events}</td>
                    <td>{s.wins}</td>
                    <td>{s.top10s}</td>
                    <td>{s.cutsPlayed ? `${s.cutsMade}/${s.cutsPlayed}` : '—'}</td>
                    <td>{s.bestFinish ? ordinal(s.bestFinish) : '—'}</td>
                    <td>{fmtToPar(s.avgToPar)}</td>
                    <td>{s.earnings ? formatMoney(s.earnings) : '—'}</td>
                    <td>{l?.rank ? `#${l.rank} ${l.tour === 'amateur' ? 'pts' : tourShort(l.tour, ladderAt(c, s.season, 99))}` : current ? 'in progress' : '—'}</td>
                    <td>{l?.allTimeRank ? `#${l.allTimeRank}` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="hub-card">
        <h2 className="hub-title">
          Tournament log
          <label className="toggle">
            Season{' '}
            <select value={season} onChange={(e) => setSeason(e.target.value === 'all' ? 'all' : Number(e.target.value))} data-testid="stats-season">
              <option value="all">All</option>
              {seasonsAll.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        </h2>
        <div className="table-wrap">
          <table className="data-table log">
            <thead>
              <tr><th>When</th><th className="l">Event</th><th>Finish</th><th>Rounds</th><th>To par</th><th>Prize</th><th aria-label="Details" /></tr>
            </thead>
            <tbody>
              {shown.map((e) => (
                <Fragment key={e.tournamentId}>
                  <tr className={`${e.madeCut && e.position === 1 ? 'win' : ''} ${open === e.tournamentId ? 'open' : ''}`} onClick={() => setOpen(open === e.tournamentId ? null : e.tournamentId)}>
                    <td>S{e.season} W{e.week}</td>
                    <td className="l"><TourPill tour={e.tour} season={e.season} week={e.week} /> {e.name}{e.special && <span className="pill gold">{e.tour === 'lpga' ? 'Major' : '★'}</span>}<span className="log-course">{e.course}</span></td>
                    <td><b>{e.madeCut ? e.posLabel : 'MC'}</b>{e.playoff && <span className="muted"> (PO)</span>}<span className="muted"> /{e.fieldSize}</span></td>
                    <td>{e.rounds.join('-')}</td>
                    <td className={e.toPar < 0 ? 'under' : ''}>{toPar(e.toPar)}</td>
                    <td>{e.prize ? formatMoney(e.prize) : '—'}</td>
                    <td><button className="link" aria-expanded={open === e.tournamentId}>{open === e.tournamentId ? 'Hide' : 'Card'}</button></td>
                  </tr>
                  {open === e.tournamentId && (
                    <tr className="detail">
                      <td colSpan={7}><Scorecard e={e} /></td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <p className="fineprint">Click an event for Ryan&rsquo;s hole-by-hole scorecard. Highlighted holes are under par.</p>
      </section>
    </main>
  );
}
