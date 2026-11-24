import { useMemo } from 'react';
import { sportsWorldOf } from '../../career/sportsbook';
import { standingsToDate } from '../../sports/book';
import { teamsOf } from '../../sports/demo';
import { useGame } from '../GameContext';
import { Empty, Panel, Player, Prov, SeasonLink, Team, useHb } from './common';

export function Overview() {
  const { board, nav } = useHb();
  const { state } = useGame();
  const l = nav.league;
  const L = board.league(l);
  const seasons = board.seasons(l);
  const latest = seasons.at(-1)!;
  const titles = board.titles(l);
  const leaders = [...titles].map(([team, ys]) => ({ team, ys })).sort((a, b) => b.ys.length - a.ys.length || (b.ys.at(-1) ?? 0) - (a.ys.at(-1) ?? 0));
  const most = leaders[0];
  const c = state.career;
  const current = useMemo(() => {
    try {
      const rows = standingsToDate(sportsWorldOf(c), c.season, c.week, l);
      return rows.some((r) => r.w + r.l + r.t + r.otl > 0) ? rows : null;
    } catch {
      return undefined;
    }
  }, [c, l]);
  const hof = board.hallOfFame().filter((h) => h.l === l);
  const legends = board.players().filter((p) => p.l === l && p.legend);
  const topHof = [...hof].filter((h) => !legends.some((p) => p.i === h.i)).sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 4);
  return (
    <div className="hb-grid hb-overview" data-testid="hb-overview">
      <Panel className="hb-span2 hb-masthead">
        <p className="hb-kicker">{L.nickname}</p>
        <h2 className="hb-title">{L.name}</h2>
        <dl className="hb-facts">
          <div><dt>Founded</dt><dd>{L.founded}</dd></div>
          <div><dt>Trophy</dt><dd>{L.trophy}</dd></div>
          <div><dt>Seasons on file</dt><dd>{seasons[0].year}–{latest.year}</dd></div>
          <div><dt>Current champion</dt><dd><Team id={latest.champion} /> <span className="hb-dim">({latest.year})</span></dd></div>
          <div><dt>Most titles</dt><dd><Team id={most.team} /> <span className="hb-dim">({most.ys.length})</span></dd></div>
        </dl>
      </Panel>

      <Panel title="Franchises">
        <table className="hb-table">
          <thead><tr><th>Team</th><th className="r">Titles</th><th className="r">Last</th></tr></thead>
          <tbody>
            {teamsOf(l).map((t) => {
              const ys = titles.get(t.id) ?? [];
              return <tr key={t.id}><td><Team id={t.id} /></td><td className="r">{ys.length}</td><td className="r">{ys.length ? <SeasonLink league={l} year={ys.at(-1)!} /> : '—'}</td></tr>;
            })}
          </tbody>
        </table>
      </Panel>

      <Panel title="All-time title leaders">
        <ol className="hb-rank">
          {leaders.filter((x) => x.ys.length).slice(0, 5).map((x) => (
            <li key={x.team}><Team id={x.team} /><b>{x.ys.length}</b></li>
          ))}
        </ol>
        <h4 className="hb-sub">Recent champions</h4>
        <table className="hb-table">
          <tbody>
            {seasons.slice(-10).reverse().map((s) => (
              <tr key={s.year}><td><SeasonLink league={l} year={s.year} /></td><td><Team id={s.champion} /></td><td className="r"><Prov p={s.source} /></td></tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel title={`Season ${c.season} standings`} aside={<span className="hb-dim">sports year {board.now}, in progress</span>}>
        {current === undefined && <Empty>Standings aren&rsquo;t available right now.</Empty>}
        {current === null && <Empty>No {L.short} games played yet this season.</Empty>}
        {current && (
          <table className="hb-table">
            <thead><tr><th>#</th><th>Team</th><th className="r">W</th><th className="r">L</th>{L.sport === 'football' && <th className="r">T</th>}{L.sport === 'hockey' && <th className="r">OTL</th>}</tr></thead>
            <tbody>
              {current.map((r, i) => (
                <tr key={r.team} className={i < 4 ? 'hb-seed' : ''}><td>{i + 1}</td><td><Team id={r.team} /></td><td className="r">{r.w}</td><td className="r">{r.l}</td>{L.sport === 'football' && <td className="r">{r.t}</td>}{L.sport === 'hockey' && <td className="r">{r.otl}</td>}</tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel title="Featured legends">
        <ul className="hb-list">
          {legends.map((p) => <li key={p.i}><Player id={p.i} /> <span className="hb-dim">{p.pos} · {p.first ?? '—'}–{p.last ?? ''}</span>{hof.some((h) => h.i === p.i) && <span className="hb-badge">Hall of Fame</span>}</li>)}
          {topHof.map((h) => <li key={h.i}><Player id={h.i} /> <span className="hb-dim">inducted {h.year}</span><span className="hb-badge">Hall of Fame</span></li>)}
        </ul>
        {!legends.length && !topHof.length && <Empty>No legends on file yet.</Empty>}
      </Panel>
    </div>
  );
}
