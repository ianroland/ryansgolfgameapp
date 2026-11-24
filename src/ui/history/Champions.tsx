import { useMemo, useState } from 'react';
import { LEAGUES, teamsOf, type LeagueId } from '../../sports/demo';
import { decadeOf, Empty, LeagueSwitch, Pager, Panel, Player, Prov, SeasonLink, Team, useHb } from './common';
import { seriesResult } from './Seasons';

const PAGE = 25;

export function Championships() {
  const { board, nav } = useHb();
  const [league, setLeague] = useState<LeagueId | 'all'>(nav.league);
  const [decade, setDecade] = useState<number | 'all'>('all');
  const [team, setTeam] = useState<string>('all');
  const [page, setPage] = useState(0);
  const rows = useMemo(() => {
    const out = [];
    for (const L of LEAGUES) {
      if (league !== 'all' && L.id !== league) continue;
      const ss = board.seasons(L.id);
      const count = new Map<string, number>();
      let streak = 0;
      for (let i = 0; i < ss.length; i++) {
        const s = ss[i];
        count.set(s.champion, (count.get(s.champion) ?? 0) + 1);
        streak = i > 0 && ss[i - 1].champion === s.champion && ss[i - 1].year === s.year - 1 ? streak + 1 : 1;
        out.push({ s, nth: count.get(s.champion)!, streak, cmvp: s.awards.find((a) => a.award === 'Championship MVP'), trophy: board.league(L.id).trophy });
      }
    }
    return out
      .filter((r) => (decade === 'all' || decadeOf(r.s.year) === decade) && (team === 'all' || r.s.champion === team || r.s.runnerUp === team))
      .sort((a, b) => b.s.year - a.s.year || a.s.league.localeCompare(b.s.league));
  }, [board, league, decade, team]);
  const decades = [...new Set(LEAGUES.flatMap((L) => board.seasons(L.id).map((s) => decadeOf(s.year))))].sort();
  const teams = league === 'all' ? LEAGUES.flatMap((L) => teamsOf(L.id)) : teamsOf(league);
  const pages = Math.ceil(rows.length / PAGE);
  const shown = rows.slice(page * PAGE, page * PAGE + PAGE);
  const comebacks = LEAGUES.filter((L) => league === 'all' || L.id === league).flatMap((L) => board.records(L.id).team.comebacks.filter((c) => c.round === 'Final' || c.tags?.includes('legendary_comeback')).map((c) => ({ ...c, l: L.id })));
  const reset = <T,>(f: (v: T) => void) => (v: T) => { f(v); setPage(0); };
  return (
    <div className="hb-grid" data-testid="hb-champions">
      <Panel className="hb-span2">
        <div className="hb-toolbar">
          <LeagueSwitch value={league} onChange={reset((v: LeagueId | 'all') => { setLeague(v); setTeam('all'); })} all />
          <label>Decade <select value={decade} onChange={(e) => reset(setDecade)(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
            <option value="all">All</option>{decades.map((d) => <option key={d} value={d}>{d}s</option>)}
          </select></label>
          <label>Franchise <select value={team} onChange={(e) => reset(setTeam)(e.target.value)}>
            <option value="all">All</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.displayName}</option>)}
          </select></label>
          <span className="hb-dim">{rows.length} championships</span>
        </div>
        {!rows.length ? <Empty>No championships match these filters.</Empty> : (
          <table className="hb-table">
            <thead><tr><th>Year</th>{league === 'all' && <th>League</th>}<th>Champion</th><th>Result</th><th>Runner-up</th><th>Championship MVP</th><th className="r">Title</th><th></th></tr></thead>
            <tbody>
              {shown.map(({ s, nth, streak, cmvp, trophy }) => {
                const final = s.series?.[2];
                const sport = board.league(s.league).sport;
                return (
                  <tr key={s.id}>
                    <td><SeasonLink league={s.league} year={s.year} /></td>
                    {league === 'all' && <td title={trophy}>{board.league(s.league).short}</td>}
                    <td><Team id={s.champion} />{streak > 1 && <span className="hb-badge">{streak} in a row</span>}</td>
                    <td>{final ? seriesResult(final, sport) : s.finalWins ? `${s.finalWins[0]}–${s.finalWins[1]}` : '—'}</td>
                    <td><Team id={s.runnerUp} /></td>
                    <td>{cmvp ? <Player id={cmvp.playerId} /> : <span className="hb-dim">{s.awardsRecorded ? 'No qualifying winner' : 'Not awarded'}</span>}</td>
                    <td className="r">#{nth}</td>
                    <td><Prov p={s.source} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <Pager page={page} pages={pages} onPage={setPage} />
      </Panel>
      <Panel title="Historic championship comebacks" className="hb-span2">
        {!comebacks.length ? <Empty>No comebacks from two or more games down in these leagues.</Empty> : (
          <table className="hb-table">
            <thead><tr><th>Year</th><th>League</th><th>Round</th><th>Winner</th><th>Trailed</th><th>Opponent</th><th></th></tr></thead>
            <tbody>
              {comebacks.sort((a, b) => a.year - b.year).map((c) => (
                <tr key={c.seriesId}>
                  <td><SeasonLink league={c.l} year={c.year} /></td><td>{board.league(c.l).short}</td><td>{c.round}</td>
                  <td><Team id={c.winner} /></td><td>{c.deficit.split('-').reverse().join('–')}</td><td><Team id={c.loser} /></td>
                  <td>{c.tags?.includes('legendary_comeback') && <span className="hb-badge">Legendary</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
