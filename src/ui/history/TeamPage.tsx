import { useMemo } from 'react';
import { teamById, type LeagueId } from '../../sports/demo';
import { fmtValue, RECORD_CATS } from '../../sports/archive/records';
import { Empty, Panel, Player, Prov, SeasonLink, useHb } from './common';

export function TeamPage({ id }: { id: string }) {
  const { board } = useHb();
  const t = teamById(id);
  const l = t.league as LeagueId;
  const L = board.league(l);
  const data = useMemo(() => {
    const seasons = board.seasons(l).map((s) => {
      const row = s.standings.find((r) => r.team === id)!;
      const finish = s.champion === id ? 'Champion' : s.runnerUp === id ? 'Runner-up' : s.seeds.includes(id) ? 'Semifinal' : '—';
      return { s, row, finish };
    });
    const w = seasons.reduce((a, x) => a + x.row.w, 0);
    const lo = seasons.reduce((a, x) => a + x.row.l + x.row.otl + x.row.t, 0);
    // Franchise leaders: totals while playing for this team (shared history and this save).
    const tot = new Map<string, Record<string, number>>();
    for (const line of board.allLines()) {
      if (line.team !== id) continue;
      const x = tot.get(line.playerId) ?? {};
      for (const [k, v] of Object.entries(line.r)) x[k] = (x[k] ?? 0) + v;
      tot.set(line.playerId, x);
    }
    const cats = RECORD_CATS[L.sport].filter((c) => !c.qualify).slice(0, 4);
    const leaders = cats.map((c) => ({ c, rows: [...tot].map(([pid, x]) => ({ pid, v: c.value(x) })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 3) }));
    const hof = board.hallOfFame().filter((h) => board.player(h.i)?.teams.includes(id));
    const moments = board.moments().filter((m) => m.teams.includes(id));
    return { seasons, w, lo, leaders, hof, moments };
  }, [board, id, l, L.sport]);
  const titles = data.seasons.filter((x) => x.finish === 'Champion').map((x) => x.s.year);
  return (
    <div className="hb-grid" data-testid="hb-team">
      <Panel className="hb-span2 hb-card">
        <p className="hb-kicker">{L.name}</p>
        <h2 className="hb-title"><i className="hb-sq hb-sq-lg" style={{ background: t.colors[0], borderColor: t.colors[1] }} aria-hidden="true" />{t.displayName}</h2>
        <dl className="hb-facts">
          <div><dt>{L.trophy}s</dt><dd>{titles.length}</dd></div>
          <div><dt>All-time</dt><dd>{data.w}–{data.lo}</dd></div>
          <div><dt>Titles</dt><dd>{titles.length ? titles.map((y, k) => <span key={y}>{k ? ', ' : ''}<SeasonLink league={l} year={y} /></span>) : 'None yet'}</dd></div>
        </dl>
      </Panel>
      <Panel title="Season by season">
        <div className="hb-scroll hb-tall">
          <table className="hb-table"><thead><tr><th>Year</th><th className="r">W</th><th className="r">L</th><th>Finish</th><th></th></tr></thead><tbody>
            {[...data.seasons].reverse().map(({ s, row, finish }) => <tr key={s.year} className={finish === 'Champion' ? 'hb-seed' : ''}><td><SeasonLink league={l} year={s.year} /></td><td className="r">{row.w}</td><td className="r">{row.l + row.otl + row.t}</td><td>{finish}</td><td><Prov p={s.source} /></td></tr>)}
          </tbody></table>
        </div>
      </Panel>
      <Panel title="Franchise leaders">
        {data.leaders.map(({ c, rows }) => (
          <div key={c.key}>
            <h4 className="hb-sub">{c.label}</h4>
            {!rows.length ? <Empty>None.</Empty> : <ol className="hb-rank">{rows.map((x) => <li key={x.pid}><Player id={x.pid} /><b>{fmtValue(x.v, c.fmt)}</b></li>)}</ol>}
          </div>
        ))}
        <h4 className="hb-sub">Hall of Famers</h4>
        {!data.hof.length ? <Empty>None yet.</Empty> : <ul className="hb-list">{data.hof.map((h) => <li key={h.i}><Player id={h.i} /> <span className="hb-dim">{h.year}</span></li>)}</ul>}
        {data.moments.length > 0 && (<><h4 className="hb-sub">Moments</h4><ul className="hb-list">{data.moments.map((m) => <li key={m.id}><SeasonLink league={l} year={m.year} /> {m.title}</li>)}</ul></>)}
      </Panel>
    </div>
  );
}
