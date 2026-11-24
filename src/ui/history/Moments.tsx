import { useMemo, useState } from 'react';
import { LEAGUES, teamsOf, type LeagueId } from '../../sports/demo';
import type { Moment } from '../../sports/archive/board';
import { decadeOf, Empty, LeagueSwitch, Pager, Panel, SeasonLink, Team, useHb } from './common';

const PROV: Record<Moment['provenance'], [string, string]> = {
  'bible+games': ['League bible · in the game records', 'Written in the league bible and played out in the generated games'],
  bible: ['League bible', 'Known from the league bible only; not represented in the game records'],
  records: ['Game records', 'Read from the generated games and stats'],
  save: ['This save', "Happened in this save's own seasons"],
};
const PAGE = 20;

export function Moments() {
  const { board, nav } = useHb();
  const [league, setLeague] = useState<LeagueId | 'all'>('all');
  const [decade, setDecade] = useState<number | 'all'>('all');
  const [team, setTeam] = useState('all');
  const [type, setType] = useState('all');
  const [page, setPage] = useState(0);
  const all = useMemo(() => board.moments(), [board]);
  const list = all.filter((m) => (league === 'all' || m.league === league) && (decade === 'all' || decadeOf(m.year) === decade) && (team === 'all' || m.teams.includes(team)) && (type === 'all' || m.type === type));
  const types = [...new Set(all.map((m) => m.type))].sort();
  const decades = [...new Set(all.map((m) => decadeOf(m.year)))].sort();
  const pages = Math.ceil(list.length / PAGE);
  const p0 = Math.min(page, Math.max(0, pages - 1));
  const set = <T,>(f: (v: T) => void) => (v: T) => { f(v); setPage(0); };
  void nav;
  return (
    <Panel className="hb-span2" title="Historic moments" aside={<span className="hb-dim">{list.length} of {all.length}</span>}>
      <div className="hb-toolbar" data-testid="hb-moments">
        <LeagueSwitch value={league} onChange={set((v: LeagueId | 'all') => { setLeague(v); setTeam('all'); })} all />
        <label>Decade <select value={decade} onChange={(e) => set(setDecade)(e.target.value === 'all' ? 'all' : Number(e.target.value))}><option value="all">All</option>{decades.map((d) => <option key={d} value={d}>{d}s</option>)}</select></label>
        <label>Team <select value={team} onChange={(e) => set(setTeam)(e.target.value)}><option value="all">All</option>{LEAGUES.filter((L) => league === 'all' || L.id === league).flatMap((L) => teamsOf(L.id)).map((t) => <option key={t.id} value={t.id}>{t.displayName}</option>)}</select></label>
        <label>Type <select value={type} onChange={(e) => set(setType)(e.target.value)}><option value="all">All</option>{types.map((t) => <option key={t}>{t}</option>)}</select></label>
      </div>
      {!list.length ? <Empty>No moments match these filters.</Empty> : (
        <ol className="hb-timeline">
          {list.slice(p0 * PAGE, p0 * PAGE + PAGE).map((m) => (
            <li key={m.id}>
              <span className="hb-when"><SeasonLink league={m.league} year={m.year} /> <small>{board.league(m.league).short}</small></span>
              <div>
                <b>{m.title}</b> <span className="hb-type">{m.type}</span>
                <p>{m.text}</p>
                <p className="hb-foot">{m.teams.map((t) => <span key={t}><Team id={t} short /> </span>)}<span className={`hb-prov hb-prov-${m.provenance === 'save' ? 'save' : m.provenance === 'bible' ? 'bible' : 'canon'}`} title={PROV[m.provenance][1]}>{PROV[m.provenance][0]}</span></p>
              </div>
            </li>
          ))}
        </ol>
      )}
      <Pager page={p0} pages={pages} onPage={setPage} />
    </Panel>
  );
}
