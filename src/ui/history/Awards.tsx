import { useState } from 'react';
import { AWARD_ORDER, SPORT_AWARD } from '../../sports/archive/board';
import { decadeOf, Panel, Player, Prov, SeasonLink, Team, useHb } from './common';

export function AwardsArchive() {
  const { board, nav } = useHb();
  const l = nav.league;
  const L = board.league(l);
  const names = [...AWARD_ORDER, SPORT_AWARD[L.sport]];
  const seasons = board.seasons(l);
  const decades = [...new Set(seasons.map((s) => decadeOf(s.year)))];
  const [decade, setDecade] = useState<number>(decades.at(-1)!);
  const d = decades.includes(decade) ? decade : decades.at(-1)!;
  const shown = seasons.filter((s) => decadeOf(s.year) === d).reverse();
  return (
    <Panel className="hb-span2" title={`${L.name} awards`} aside={<span className="hb-dim">Coach of the Year isn&rsquo;t awarded: the league records have no coaches.</span>}>
      <div className="hb-toolbar" data-testid="hb-awards">
        <div className="hb-tabs2" role="tablist" aria-label="Decade">
          {decades.map((x) => <button key={x} type="button" role="tab" aria-selected={x === d} className={x === d ? 'on' : ''} onClick={() => setDecade(x)}>{x}s</button>)}
        </div>
      </div>
      <div className="hb-scroll">
        <table className="hb-table">
          <thead><tr><th>Year</th>{names.map((n) => <th key={n}>{n === 'Most Valuable Player' ? 'MVP' : n}</th>)}<th></th></tr></thead>
          <tbody>
            {shown.map((s) => (
              <tr key={s.year}>
                <td><SeasonLink league={l} year={s.year} /></td>
                {names.map((n) => {
                  const a = s.awards.find((x) => x.award === n);
                  return <td key={n}>{a ? <><Player id={a.playerId} /> <Team id={a.teamId} short /></> : <span className="hb-dim">{s.awardsRecorded ? 'No qualifying winner' : 'Not awarded'}</span>}</td>;
                })}
                <td><Prov p={s.source} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hb-foot">MVP weighs season value by team success; the Championship MVP is the champion&rsquo;s best performer in the final; the sport award needs a minimum workload (Phase D part 1 rules).</p>
    </Panel>
  );
}
