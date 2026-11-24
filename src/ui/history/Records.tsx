import { useState } from 'react';
import { teamById } from '../../sports/demo';
import { fmtValue } from '../../sports/archive/records';
import { provenanceOfYear } from '../../sports/archive/shared';
import { Empty, Panel, Player, Prov, SeasonLink, Team, useHb } from './common';

type Kind = 'season' | 'career' | 'game' | 'team';
const KINDS: { id: Kind; label: string }[] = [{ id: 'season', label: 'Single season' }, { id: 'career', label: 'Career' }, { id: 'game', label: 'Single game' }, { id: 'team', label: 'Team' }];

export function RecordBooks() {
  const { board, nav } = useHb();
  const [kind, setKind] = useState<Kind>('season');
  const [depth, setDepth] = useState(5);
  const l = nav.league;
  const rec = board.records(l);
  return (
    <div data-testid="hb-records">
      <div className="hb-toolbar">
        <div className="hb-tabs2" role="tablist" aria-label="Record type">
          {KINDS.map((k) => <button key={k.id} type="button" role="tab" aria-selected={kind === k.id} className={kind === k.id ? 'on' : ''} onClick={() => setKind(k.id)} data-testid={`hb-rec-${k.id}`}>{k.label}</button>)}
        </div>
        {(kind === 'season' || kind === 'career') && <button type="button" onClick={() => setDepth(depth === 5 ? 10 : 5)}>Show top {depth === 5 ? 10 : 5}</button>}
        <span className="hb-dim">{board.league(l).name}. Rates need a qualifying amount of play.</span>
      </div>
      <div className="hb-grid hb-grid3">
        {(kind === 'season' || kind === 'career') && rec.cats.map((cat) => {
          const rows = (kind === 'season' ? rec.season : rec.career).get(cat.key)!.slice(0, depth);
          return (
            <Panel key={cat.key} title={cat.label} aside={cat.asc ? 'lowest' : undefined}>
              {!rows.length ? <Empty>No qualifying {kind === 'season' ? 'seasons' : 'careers'}.</Empty> : (
                <table className="hb-table">
                  <tbody>
                    {rows.map((x) => (
                      <tr key={x.playerId + (x.year ?? '')}>
                        <td>{x.rank}</td><td><Player id={x.playerId} /></td>
                        <td>{kind === 'season' ? <><Team id={x.team!} short /> <SeasonLink league={l} year={x.year!} /></> : <span className="hb-dim">{x.span![0]}–{x.span![1]}</span>}</td>
                        <td className="r"><b>{fmtValue(x.value, cat.fmt)}</b></td><td><Prov p={x.provenance} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>
          );
        })}
        {kind === 'game' && [...new Set(rec.game.map((g) => g.label))].map((label) => (
          <Panel key={label} title={label}>
            <table className="hb-table"><tbody>
              {rec.game.filter((g) => g.label === label).slice(0, 5).map((g, i) => (
                <tr key={i}><td>{i + 1}</td><td>{g.playerId ? <Player id={g.playerId} /> : '—'}</td><td>{g.teamId && <Team id={g.teamId} short />} <SeasonLink league={l} year={g.year!} /></td><td className="r"><b>{g.value.toLocaleString('en-US')}</b></td><td><Prov p={provenanceOfYear(g.year!)} /></td></tr>
              ))}
            </tbody></table>
          </Panel>
        ))}
        {kind === 'game' && !rec.game.length && <Empty>No single-game records on file.</Empty>}
        {kind === 'team' && (
          <>
            <Panel title="Most wins in a season">
              <table className="hb-table"><tbody>{rec.team.wins.map((w, i) => <tr key={`${w.team}${w.year}`}><td>{i + 1}</td><td><Team id={w.team} /></td><td><SeasonLink league={l} year={w.year} /></td><td className="r"><b>{w.w}–{w.l}</b></td><td><Prov p={w.source} /></td></tr>)}</tbody></table>
            </Panel>
            <Panel title="Longest winning streak">
              <table className="hb-table"><tbody>{rec.team.streaks.map((s, i) => <tr key={`${s.teamId}${s.year}`}><td>{i + 1}</td><td><Team id={s.teamId!} /></td><td><SeasonLink league={l} year={s.year!} /></td><td className="r"><b>{s.value}</b></td><td><Prov p={provenanceOfYear(s.year!)} /></td></tr>)}</tbody></table>
            </Panel>
            <Panel title="Most championships">
              <table className="hb-table"><tbody>{rec.team.titles.map((t, i) => <tr key={t.team}><td>{i + 1}</td><td><Team id={t.team} /></td><td className="r"><b>{t.count}</b></td><td className="hb-dim">{t.last ? `last ${t.last}` : 'none yet'}</td></tr>)}</tbody></table>
            </Panel>
            <Panel title="Consecutive championships">
              {!rec.team.consecutive.length ? <Empty>No repeat champions.</Empty> : <table className="hb-table"><tbody>{rec.team.consecutive.map((x) => <tr key={`${x.team}${x.span[0]}`}><td><Team id={x.team} /></td><td className="r"><b>{x.count}</b></td><td className="hb-dim">{x.span[0]}–{x.span[1]}</td></tr>)}</tbody></table>}
            </Panel>
            <Panel title="Longest title drought">
              <table className="hb-table"><tbody>{rec.team.droughts.map((d) => <tr key={d.team}><td><Team id={d.team} /></td><td className="r"><b>{d.seasons}</b></td><td className="hb-dim">{d.span[0]}–{d.ongoing ? 'present' : d.span[1]}</td></tr>)}</tbody></table>
            </Panel>
            <Panel title="Greatest playoff comebacks">
              {!rec.team.comebacks.length ? <Empty>No comebacks from two games down.</Empty> : <table className="hb-table"><tbody>{rec.team.comebacks.slice(0, 10).map((c) => <tr key={c.seriesId}><td><SeasonLink league={l} year={c.year} /></td><td><Team id={c.winner} short /> over {teamById(c.loser).short}</td><td>{c.round}</td><td className="r"><b>{c.deficit.split('-').reverse().join('–')}</b></td><td>{c.tags?.includes('legendary_comeback') && <span className="hb-badge">Legendary</span>}</td></tr>)}</tbody></table>}
            </Panel>
          </>
        )}
      </div>
    </div>
  );
}
