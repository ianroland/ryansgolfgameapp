import { useState } from 'react';
import type { LeagueId } from '../../sports/demo';
import { HOF_RULE } from '../../sports/history/honors';
import { Empty, LeagueSwitch, Panel, Player, Prov, useHb } from './common';

export function HallOfFame() {
  const { board, nav } = useHb();
  const [league, setLeague] = useState<LeagueId | 'all'>(nav.league);
  const all = board.hallOfFame().filter((h) => league === 'all' || h.l === league);
  const years = [...new Set(all.map((h) => h.year))].sort((a, b) => b - a);
  const cands = board.candidates().filter((c) => league === 'all' || c.l === league);
  const t = board.totals();
  return (
    <div className="hb-grid" data-testid="hb-hof">
      <Panel className="hb-span2" title="Hall of Fame" aside={<span className="hb-dim">{all.length} members</span>}>
        <div className="hb-toolbar"><LeagueSwitch value={league} onChange={setLeague} all /></div>
        <div className="hb-rules">
          <p><b>Statistical pathway.</b> At least {HOF_RULE.minSeasons} seasons, {HOF_RULE.waitYears} years after the final season, and a career score at the league&rsquo;s bar (the top {HOF_RULE.topShare * 100}% of its 1972–2025 careers).</p>
          <p><b>Historical Legends pathway.</b> Owner-approved exceptions only. Currently: Elias Voss.</p>
          <p className="hb-dim">Future classes are announced at each off-season; they&rsquo;re never shown in advance.</p>
        </div>
      </Panel>
      <Panel className="hb-span2" title="Members by class">
        {!years.length && <Empty>No members yet.</Empty>}
        {years.map((y) => (
          <div key={y} className="hb-class">
            <h4 className="hb-sub">Class of {y}</h4>
            <table className="hb-table"><tbody>
              {all.filter((h) => h.year === y).map((h) => {
                const c = t.get(h.i);
                return (
                  <tr key={h.i}>
                    <td><Player id={h.i} /></td><td>{board.league(h.l).short}</td>
                    <td className="hb-dim">{c ? `${c.years[0]}–${c.years.at(-1)} · ${c.years.length} seasons` : ''}</td>
                    <td>{h.pathway === 'legends' ? <span className="hb-badge hb-gold" title={h.basis}>Historical Legend</span> : 'Statistical'}</td>
                    <td><Prov p={h.source} /></td>
                  </tr>
                );
              })}
            </tbody></table>
          </div>
        ))}
      </Panel>
      <Panel className="hb-span2" title="Eligible soon" aside={<span className="hb-dim">retired, {HOF_RULE.minSeasons}+ seasons, waiting out the {HOF_RULE.waitYears}-year period; not a prediction</span>}>
        {!cands.length ? <Empty>No retired players are waiting out the five-year period.</Empty> : (
          <table className="hb-table"><thead><tr><th>Player</th><th>League</th><th>Final season</th><th>Seasons</th><th>Eligible</th></tr></thead><tbody>
            {cands.slice(0, 40).map((c) => <tr key={c.i}><td><Player id={c.i} /></td><td>{board.league(c.l).short}</td><td>{c.f}</td><td>{c.seasons}</td><td>{c.eligible}</td></tr>)}
          </tbody></table>
        )}
      </Panel>
    </div>
  );
}
