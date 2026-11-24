import { useDeferredValue, useMemo, useState } from 'react';
import { leagueById, teamById, teamsOf, type LeagueId, type Sport } from '../../sports/demo';
import type { StatLine } from '../../sports/history/stats';
import { fmtValue, RECORD_CATS, type Fmt } from '../../sports/archive/records';
import { Empty, LeagueSwitch, Pager, Panel, Player, Prov, SeasonLink, Team, useHb } from './common';

const PAGE = 30;
const STATUS: Record<string, string> = { active: 'Active', reserve: 'Reserve', retired: 'Retired', unplayed: 'No seasons on file' };

export function Encyclopedia() {
  const { board, go, nav } = useHb();
  const [q, setQ] = useState('');
  const [league, setLeague] = useState<LeagueId | 'all'>(nav.league);
  const [team, setTeam] = useState('all');
  const [era, setEra] = useState<number | 'all'>('all');
  const [pos, setPos] = useState('all');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(0);
  const query = useDeferredValue(q.trim().toLowerCase());
  const all = board.players();
  const list = useMemo(() => all.filter((p) =>
    (league === 'all' || p.l === league)
    && (team === 'all' || p.teams.includes(team))
    && (pos === 'all' || p.pos === pos)
    && (status === 'all' || p.status === status)
    && (era === 'all' || (p.first !== null && p.first <= era + 9 && (p.last ?? p.first) >= era))
    && (!query || p.n.toLowerCase().includes(query) || p.i.toLowerCase() === query)), [all, league, team, pos, status, era, query]);
  const positions = [...new Set(all.filter((p) => league === 'all' || p.l === league).map((p) => p.pos))].sort();
  const pages = Math.ceil(list.length / PAGE);
  const p0 = Math.min(page, Math.max(0, pages - 1));
  const set = <T,>(f: (v: T) => void) => (v: T) => { f(v); setPage(0); };
  return (
    <Panel className="hb-span2" title="Player encyclopedia" aside={<span className="hb-dim">{all.length.toLocaleString('en-US')} players on file</span>}>
      <div className="hb-toolbar" data-testid="hb-players">
        <input type="search" placeholder="Search by name" value={q} onChange={(e) => set(setQ)(e.target.value)} aria-label="Search players" data-testid="hb-search" />
        <LeagueSwitch value={league} onChange={set((v: LeagueId | 'all') => { setLeague(v); setTeam('all'); setPos('all'); })} all />
      </div>
      <div className="hb-toolbar">
        <label>Team <select value={team} onChange={(e) => set(setTeam)(e.target.value)}><option value="all">All</option>{(league === 'all' ? [] : teamsOf(league)).map((t) => <option key={t.id} value={t.id}>{t.displayName}</option>)}</select></label>
        <label>Era <select value={era} onChange={(e) => set(setEra)(e.target.value === 'all' ? 'all' : Number(e.target.value))}><option value="all">All</option>{[1970, 1980, 1990, 2000, 2010, 2020, 2030, 2040, 2050].filter((d) => d <= board.now).map((d) => <option key={d} value={d}>{d}s</option>)}</select></label>
        <label>Position <select value={pos} onChange={(e) => set(setPos)(e.target.value)}><option value="all">All</option>{positions.map((x) => <option key={x}>{x}</option>)}</select></label>
        <label>Status <select value={status} onChange={(e) => set(setStatus)(e.target.value)}><option value="all">All</option><option value="active">Active</option><option value="reserve">Reserve</option><option value="retired">Retired</option></select></label>
        <span className="hb-dim">{list.length.toLocaleString('en-US')} found</span>
      </div>
      {!list.length ? <Empty>No players match. Try a shorter name or clear a filter.</Empty> : (
        <table className="hb-table hb-click">
          <thead><tr><th>Name</th><th>League</th><th>Pos</th><th>Team(s)</th><th>Seasons</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {list.slice(p0 * PAGE, p0 * PAGE + PAGE).map((p) => (
              <tr key={p.i} onClick={() => go({ type: 'open', detail: { kind: 'player', id: p.i } })}>
                <td><Player id={p.i} />{p.legend && <span className="hb-badge">Legend</span>}</td>
                <td>{leagueById(p.l).short}</td><td>{p.pos}</td>
                <td>{p.teams.slice(0, 2).map((t) => teamById(t).short).join(', ')}{p.teams.length > 2 ? '…' : ''}</td>
                <td>{p.first ? `${p.first}–${p.status === 'retired' ? p.last : ''}` : '—'}</td>
                <td>{STATUS[p.status]}</td><td><Prov p={p.source} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Pager page={p0} pages={pages} onPage={setPage} />
    </Panel>
  );
}

// ── Profile ──
interface Col { key: string; label: string; v: (l: StatLine) => number; fmt?: Fmt }
const c = (key: string, label: string, fmt?: Fmt, v?: (l: StatLine) => number): Col => ({ key, label, fmt, v: v ?? ((l) => l[key] ?? 0) });
const r = (a: string, b: string, k = 1) => (l: StatLine) => ((l[b] ?? 0) ? (k * (l[a] ?? 0)) / (l[b] ?? 0) : 0);
const COLS: Record<Sport, Col[]> = {
  baseball: [c('g', 'G'), c('ab', 'AB'), c('h', 'H'), c('hr', 'HR'), c('rbi', 'RBI'), c('sb', 'SB'), c('avg', 'AVG', 'avg', r('h', 'ab')),
    c('p_g', 'GP'), c('w', 'W'), c('l', 'L'), c('sv', 'SV'), c('ip', 'IP', 'dec1', (l) => (l.p_outs ?? 0) / 3), c('p_k', 'K'), c('nohit', 'NH'), c('era', 'ERA', 'dec2', r('p_er', 'p_outs', 27))],
  basketball: [c('gp', 'GP'), c('pts', 'PTS'), c('reb', 'REB'), c('ast', 'AST'), c('stl', 'STL'), c('blk', 'BLK'), c('ppg', 'PPG', 'dec1', r('pts', 'gp')), c('fg', 'FG%', 'pct', r('fgm', 'fga'))],
  football: [c('g', 'G'), c('pass_yds', 'Pass yds'), c('pass_td', 'Pass TD'), c('int_thrown', 'INT'), c('rush_yds', 'Rush yds'), c('rush_td', 'Rush TD'), c('rec', 'Rec'), c('rec_yds', 'Rec yds'), c('rec_td', 'Rec TD'), c('tackles', 'Tkl'), c('sacks', 'Sacks'), c('def_int', 'Def INT'), c('ff', 'FF')],
  hockey: [c('gp', 'GP'), c('g', 'G'), c('a', 'A'), c('pts', 'PTS'), c('pim', 'PIM'), c('g_gp', 'GP (G)'), c('w', 'W'), c('sv', 'SV'), c('so', 'SO'), c('svp', 'SV%', 'avg', r('sv', 'sa')), c('gaa', 'GAA', 'dec2', r('ga', 'min', 60))],
};

export function PlayerProfile({ id }: { id: string }) {
  const { board } = useHb();
  const p = board.player(id);
  const data = useMemo(() => {
    if (!p) return null;
    const lines = board.linesOf(id);
    const t = board.totals().get(id);
    const sport = leagueById(p.l).sport;
    const cols = COLS[sport].filter((col) => t && col.v(t.r) !== 0);
    const champs = lines.filter((x) => board.season(x.league, x.year)?.champion === x.team).map((x) => x.year);
    const hof = board.hallOfFame().find((h) => h.i === id);
    const cand = !hof ? board.candidates().find((x) => x.i === id) : undefined;
    const rec = board.records(p.l);
    const held: { label: string; kind: string; rank: number; value: string; year?: number }[] = [];
    for (const cat of RECORD_CATS[sport]) {
      for (const row of rec.season.get(cat.key) ?? []) if (row.playerId === id && row.rank <= 5) held.push({ label: cat.label, kind: 'Season', rank: row.rank, value: fmtValue(row.value, cat.fmt), year: row.year });
      for (const row of rec.career.get(cat.key) ?? []) if (row.playerId === id && row.rank <= 5) held.push({ label: cat.label, kind: 'Career', rank: row.rank, value: fmtValue(row.value, cat.fmt) });
    }
    for (const g of rec.game) if (g.playerId === id) held.push({ label: g.label, kind: 'Game', rank: 0, value: g.value.toLocaleString('en-US'), year: g.year });
    return { lines, t, cols, champs, hof, cand, held, awards: board.awardsOf(id).sort((a, b) => a.year - b.year) };
  }, [board, id, p]);
  if (!p || !data) return <Empty>That player isn&rsquo;t in this archive.</Empty>;
  const { lines, t, cols, champs, hof, cand, held, awards } = data;
  const teamYears = new Map<string, number[]>();
  for (const x of lines) teamYears.set(x.team, [...(teamYears.get(x.team) ?? []), x.year]);
  const notes = board.coverage(id);
  return (
    <div className="hb-grid" data-testid="hb-profile">
      <Panel className="hb-span2 hb-card">
        <p className="hb-kicker">{board.league(p.l).name} · {p.pos}</p>
        <h2 className="hb-title">{p.n}{p.legend && <span className="hb-badge">Legend</span>}{hof && <span className="hb-badge hb-gold">Hall of Fame {hof.year}</span>}</h2>
        <dl className="hb-facts">
          <div><dt>Born</dt><dd>{p.born}</dd></div>
          <div><dt>Career</dt><dd>{p.first ? `${p.first}–${p.status === 'retired' ? p.last : 'present'}` : 'No seasons on file'}</dd></div>
          <div><dt>Status</dt><dd>{STATUS[p.status]}</dd></div>
          <div><dt>Drafted</dt><dd>{p.draft ? <>{p.draft.year}, round {p.draft.round}, pick {p.draft.pick} (#{p.draft.overall}) by <Team id={p.draft.team} short /></> : p.source === 'canon' ? 'Founding signing or not on file' : '—'}</dd></div>
          <div><dt>Championships</dt><dd>{champs.length ? champs.map((y, k) => <span key={y}>{k ? ', ' : ''}<SeasonLink league={p.l} year={y} /></span>) : 'None'}</dd></div>
          <div><dt>Source</dt><dd><Prov p={p.source} /></dd></div>
        </dl>
        <p className="hb-teams">{[...teamYears].map(([team, ys]) => <span key={team}><Team id={team} /> <span className="hb-dim">{ys[0]}{ys.length > 1 ? `–${ys.at(-1)}` : ''}</span></span>)}
          {!teamYears.size && p.teams[0] && <span><Team id={p.teams[0]} /> <span className="hb-dim">(rostered)</span></span>}</p>
        {notes.map((n) => <p key={n} className="hb-note">{n}</p>)}
      </Panel>

      <Panel title="Season by season" className="hb-span2">
        {!lines.length ? <Empty>No seasons on file{p.status === 'active' ? ' yet' : ''}.</Empty> : (
          <div className="hb-scroll">
            <table className="hb-table hb-stats">
              <thead><tr><th>Year</th><th>Team</th>{cols.map((col) => <th key={col.key} className="r">{col.label}</th>)}<th></th></tr></thead>
              <tbody>
                {lines.map((x) => (
                  <tr key={x.year}><td><SeasonLink league={x.league} year={x.year} /></td><td><Team id={x.team} short /></td>
                    {Object.values(x.r).some((v) => v > 0) ? cols.map((col) => <td key={col.key} className="r">{fmtValue(col.v(x.r), col.fmt)}</td>) : <td colSpan={Math.max(1, cols.length)} className="hb-dim">On the roster; did not appear</td>}
                    <td><Prov p={x.source} /></td></tr>
                ))}
              </tbody>
              {t && (
                <tfoot>
                  <tr><td>Career</td><td>{t.years.length} season{t.years.length === 1 ? '' : 's'}</td>{cols.map((col) => <td key={col.key} className="r">{fmtValue(col.v(t.r), col.fmt)}</td>)}<td /></tr>
                  {Object.keys(t.p).length > 0 && <tr><td>Playoffs</td><td />{cols.map((col) => <td key={col.key} className="r">{fmtValue(col.v(t.p), col.fmt)}</td>)}<td /></tr>}
                </tfoot>
              )}
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Awards">
        {!awards.length ? <Empty>No awards.</Empty> : <ul className="hb-list">{awards.map((a) => <li key={`${a.year}${a.award}`}><SeasonLink league={a.league} year={a.year} /> {a.award} <Team id={a.teamId} short /></li>)}</ul>}
      </Panel>
      <Panel title="Records and Hall of Fame">
        {held.length > 0 && <ul className="hb-list">{held.map((h, k) => <li key={k}>{h.kind === 'Game' ? 'Single-game mark' : `#${h.rank} all-time, ${h.kind.toLowerCase()}`}: {h.label} {h.value}{h.year ? ` (${h.year})` : ''}</li>)}</ul>}
        {hof && <p>Inducted {hof.year} · {hof.pathway === 'legends' ? `Historical Legends pathway${hof.basis ? `: ${hof.basis}` : ''}` : 'Statistical pathway'}</p>}
        {cand && <p>Eligible for the Hall of Fame in {cand.eligible} (five years after {cand.f}).</p>}
        {!held.length && !hof && !cand && <Empty>No league records or Hall of Fame status.</Empty>}
      </Panel>
    </div>
  );
}
