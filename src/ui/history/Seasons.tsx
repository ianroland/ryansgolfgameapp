import { useEffect, useMemo, useState } from 'react';
import { teamById, type LeagueId } from '../../sports/demo';
import { AWARD_ORDER, SPORT_AWARD, STAT_TITLE, type SeasonView } from '../../sports/archive/board';
import type { ArchiveSeries } from '../../sports/archive/shared';
import { Empty, Panel, Player, Prov, Team, theTrophy, useHb } from './common';

const LEADER_FMT: Record<string, (v: number) => string> = {
  avg: (v) => v.toFixed(3).replace(/^0/, ''), era: (v) => v.toFixed(2), sv_pct: (v) => v.toFixed(3).replace(/^0/, ''),
  ppg: (v) => v.toFixed(1), rpg: (v) => v.toFixed(1), apg: (v) => v.toFixed(1),
};
export const leaderValue = (stat: string, v: number) => (LEADER_FMT[stat] ?? ((x: number) => Math.round(x).toLocaleString('en-US')))(v);

/** The archive: pick a league and a year. */
export function SeasonArchive() {
  const { board, nav } = useHb();
  const seasons = board.seasons(nav.league);
  const [year, setYear] = useState(seasons.at(-1)!.year);
  useEffect(() => {
    if (!seasons.some((s) => s.year === year)) setYear(seasons.at(-1)!.year);
  }, [nav.league, seasons, year]);
  const i = seasons.findIndex((s) => s.year === year);
  const s = seasons[Math.max(0, i)];
  return (
    <div data-testid="hb-archive">
      <div className="hb-toolbar">
        <button type="button" disabled={i <= 0} onClick={() => setYear(seasons[i - 1].year)} aria-label="Previous season">◀</button>
        <label>Season <select value={s.year} onChange={(e) => setYear(Number(e.target.value))} data-testid="hb-year">
          {seasons.map((x) => <option key={x.year} value={x.year}>{x.year}{x.source === 'save' ? ' (this save)' : x.source === 'shared' ? ' (shared sim)' : x.source === 'replay' ? ' (rebuilt)' : ''}</option>)}
        </select></label>
        <button type="button" disabled={i >= seasons.length - 1} onClick={() => setYear(seasons[i + 1].year)} aria-label="Next season">▶</button>
        <span className="hb-dim">Seasons through {board.lastCompleted} are complete; {board.now} is in progress and isn&rsquo;t archived yet.</span>
      </div>
      <SeasonDetail league={nav.league} year={s.year} />
    </div>
  );
}

export function SeasonDetail({ league, year }: { league: LeagueId; year: number }) {
  const { board } = useHb();
  const s = board.season(league, year);
  const L = board.league(league);
  const moments = useMemo(() => board.moments().filter((m) => m.league === league && m.year === year), [board, league, year]);
  if (!s) return <Empty>No {L.short} season {year} on file{year >= board.now ? ' yet: it hasn’t been completed in this save' : ''}.</Empty>;
  return (
    <div className="hb-grid" data-testid="hb-season">
      <Panel className="hb-span2 hb-masthead" title={<>{year} {L.name}</>} aside={<Prov p={s.source} />}>
        <p className="hb-banner"><Team id={s.champion} /> win {theTrophy(L.trophy)}{s.finalWins && <> {L.sport === 'football' ? 'final' : `${s.finalWins[0]}–${s.finalWins[1]}`}</>} over <Team id={s.runnerUp} /></p>
        {s.adjusted && <p className="hb-note">This season&rsquo;s record was adjusted to fit the top-four playoff format (Phase B reconciliation).</p>}
      </Panel>
      <Panel title="Final standings">
        <Standings s={s} sport={L.sport} />
      </Panel>
      <Panel title="Playoffs">
        <Bracket s={s} />
      </Panel>
      <Panel title="Awards">
        <AwardsBox s={s} />
      </Panel>
      <Panel title="Statistical leaders">
        {s.leaders.length ? (
          <table className="hb-table"><tbody>
            {s.leaders.map((x) => <tr key={x.stat}><td>{STAT_TITLE[x.stat] ?? x.stat}</td><td><Player id={x.playerId} /></td><td><Team id={x.teamId} short /></td><td className="r">{leaderValue(x.stat, x.value)}</td></tr>)}
          </tbody></table>
        ) : <Empty>{s.awardsRecorded ? 'No leaders on file.' : 'Not recorded: this season was played before yearly off-seasons began.'}</Empty>}
      </Panel>
      <Panel title="Records and events" className="hb-span2">
        {!s.marks.length && !s.comebacks.length && !moments.length && <Empty>Nothing out of the ordinary on file for {year}.</Empty>}
        <ul className="hb-list">
          {moments.map((m) => <li key={m.id}><b>{m.title}</b> <span className="hb-dim">({m.provenance === 'bible' ? 'league bible' : m.provenance === 'bible+games' ? 'league bible, in the game records' : 'game records'})</span><br />{m.text}</li>)}
          {s.comebacks.map((c) => <li key={c.seriesId}><b>Comeback:</b> <Team id={c.winner} /> beat <Team id={c.loser} /> after trailing {c.deficit.split('-').reverse().join('–')}{c.tags?.includes('legendary_comeback') && <span className="hb-badge">Legendary</span>}</li>)}
          {s.marks.map((m, k) => <li key={k}><b>{m.verdict === 'new record' ? 'New record' : m.verdict === 'ties record' ? 'Tied record' : 'All-time top 5'}:</b> {m.label} {m.value.toLocaleString('en-US')} by {board.player(m.who) ? <Player id={m.who} /> : <Team id={m.who} />}</li>)}
        </ul>
      </Panel>
    </div>
  );
}

function Standings({ s, sport }: { s: SeasonView; sport: string }) {
  const showT = s.otlSeparate && sport === 'football';
  const showOtl = s.otlSeparate && sport === 'hockey';
  return (
    <>
      <table className="hb-table">
        <thead><tr><th>#</th><th>Team</th><th className="r">W</th><th className="r">L</th>{showT && <th className="r">T</th>}{showOtl && <th className="r">OTL</th>}<th className="r">Pct</th></tr></thead>
        <tbody>
          {s.standings.map((r, i) => {
            const gp = r.w + r.l + r.t + r.otl;
            return (
              <tr key={r.team} className={s.seeds.includes(r.team) ? 'hb-seed' : ''}>
                <td>{s.seeds.includes(r.team) ? s.seeds.indexOf(r.team) + 1 : i + 1}</td><td><Team id={r.team} />{r.team === s.champion && <span className="hb-badge">Champion</span>}</td>
                <td className="r">{r.w}</td><td className="r">{r.l}</td>{showT && <td className="r">{r.t}</td>}{showOtl && <td className="r">{r.otl}</td>}
                <td className="r">{gp ? (r.w / gp).toFixed(3).replace(/^0/, '') : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!s.otlSeparate && sport === 'hockey' && <p className="hb-foot">Ledger records count overtime losses as losses.</p>}
    </>
  );
}

export function seriesResult(x: ArchiveSeries, sport: string): string {
  if (sport === 'football') {
    const [hh, hs, as] = x.games[0];
    const hi = hh ? hs : as;
    const lo = hh ? as : hs;
    return x.winner === x.high ? `${hi}–${lo}` : `${lo}–${hi}`;
  }
  return x.winner === x.high ? `${x.wins[0]}–${x.wins[1]}` : `${x.wins[1]}–${x.wins[0]}`;
}

function Bracket({ s }: { s: SeasonView }) {
  const { board } = useHb();
  const sport = board.league(s.league).sport;
  const seed = (t: string) => s.seeds.indexOf(t) + 1;
  if (!s.series) {
    const [a, b] = [[s.seeds[0], s.seeds[3]], [s.seeds[1], s.seeds[2]]];
    const fin = (x: string[]) => x.find((t) => t === s.champion || t === s.runnerUp)!;
    return (
      <div className="hb-bracket">
        {[a, b].map((p) => <div key={p.join()} className="hb-series"><span className="hb-round">Semifinal</span><span>({seed(p[0])}) {teamById(p[0]).short} v ({seed(p[1])}) {teamById(p[1]).short}: <b>{teamById(fin(p)).short}</b> advance</span><span className="hb-dim">series score not recorded</span></div>)}
        <div className="hb-series hb-final"><span className="hb-round">Final</span><span><Team id={s.champion} /> {s.finalWins && `${s.finalWins[0]}–${s.finalWins[1]}`} over <Team id={s.runnerUp} /></span></div>
      </div>
    );
  }
  return (
    <div className="hb-bracket">
      {s.series.map((x) => (
        <div key={x.round + x.high} className={`hb-series ${x.round === 'final' ? 'hb-final' : ''}`}>
          <span className="hb-round">{x.round === 'final' ? 'Final' : 'Semifinal'}</span>
          <span>({seed(x.high)}) <Team id={x.high} short /> v ({seed(x.low)}) <Team id={x.low} short /> · <b>{teamById(x.winner).short} {seriesResult(x, sport)}</b></span>
          <span className="hb-games">
            {x.games.map(([hh, hs, as, ot], k) => {
              const home = hh ? x.high : x.low;
              const away = hh ? x.low : x.high;
              return <span key={k} title={`Game ${k + 1}: ${teamById(away).short} at ${teamById(home).short}`}>G{k + 1} {teamById(away).short} {as}–{hs} {teamById(home).short}{ot ? ` (${sport === 'hockey' && ot > 1 ? `${ot}OT` : 'OT'})` : ''}</span>;
            })}
          </span>
        </div>
      ))}
    </div>
  );
}

function AwardsBox({ s }: { s: SeasonView }) {
  const sport = useHb().board.league(s.league).sport;
  const names = [...AWARD_ORDER, SPORT_AWARD[sport]];
  if (!s.awardsRecorded) return <Empty>Not awarded: this season was played before yearly off-seasons began.</Empty>;
  return (
    <table className="hb-table"><tbody>
      {names.map((n) => {
        const a = s.awards.find((x) => x.award === n);
        return <tr key={n}><td>{n}</td><td>{a ? <><Player id={a.playerId} /> <Team id={a.teamId} short /></> : <span className="hb-dim">No qualifying winner</span>}</td></tr>;
      })}
    </tbody></table>
  );
}
