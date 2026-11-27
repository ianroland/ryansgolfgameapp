import { useState } from 'react';
import { leagueById, teamById } from '../../sports/demo';
import { SPORT_AWARD, STAT_TITLE } from '../../sports/archive/board';
import { Empty, Player, Prov, SeasonLink, Team, theTrophy, useHb } from './common';
import { leaderValue } from './Seasons';

export function YearInReview({ year: fixed }: { year?: number }) {
  const { board } = useHb();
  const years = board.reviewYears();
  const [pick, setPick] = useState(years[0]);
  const year = fixed ?? pick;
  const r = board.review(year);
  return (
    <div data-testid="hb-review">
      {!fixed && (
        <div className="hb-toolbar">
          <label>Year <select value={year} onChange={(e) => setPick(Number(e.target.value))} data-testid="hb-review-year">{years.map((y) => <option key={y} value={y}>{y}</option>)}</select></label>
          <span className="hb-dim">Completed seasons only. Earlier years are in Seasons and Champions.</span>
        </div>
      )}
      {!r ? <Empty>No review for {year}: that season hasn&rsquo;t been completed in this save.</Empty> : (
        <article className="hb-paper">
          <header className="hb-paper-head">
            <span>Vol. {year - 1971}</span>
            <h2>The Sports Almanac</h2>
            <span><Prov p={r.source} /></span>
            <p className="hb-paper-sub">{year}: the year in review · four leagues, four champions</p>
          </header>
          {r.note && <p className="hb-note">{r.note}</p>}
          <div className="hb-paper-cols">
            {r.leagues.map((x) => {
              const L = leagueById(x.league);
              const award = (n: string) => x.awards.find((a) => a.award === n);
              const lore = board.league(x.league);
              return (
                <section key={x.league} className="hb-story">
                  <p className="hb-kicker">{L.name}</p>
                  <h3>{teamById(x.champion).name} win {theTrophy(lore.trophy)}</h3>
                  <p className="hb-lede"><Team id={x.champion} /> beat <Team id={x.runnerUp} />{x.final ? (L.sport === 'football' ? ' in the final.' : `, ${x.final[0]}–${x.final[1]} in the final series.`) : '.'} <SeasonLink league={x.league} year={year}>Full season</SeasonLink></p>
                  {x.awards.length ? (
                    <ul className="hb-list">
                      {['Most Valuable Player', 'Championship MVP', 'Rookie of the Year', SPORT_AWARD[L.sport]].map((n) => {
                        const a = award(n);
                        return <li key={n}><b>{n === 'Most Valuable Player' ? 'MVP' : n}:</b> {a ? <><Player id={a.playerId} /> ({teamById(a.teamId).short})</> : <span className="hb-dim">no qualifying winner</span>}</li>;
                      })}
                    </ul>
                  ) : <p className="hb-dim">No awards were held this year.</p>}
                  {x.leaders.length > 0 && <p className="hb-small"><b>Leaders:</b> {x.leaders.map((ld, k) => <span key={ld.stat}>{k ? '; ' : ''}{STAT_TITLE[ld.stat] ?? ld.stat} <Player id={ld.playerId} /> {leaderValue(ld.stat, ld.value)}</span>)}</p>}
                  {x.marks.filter((m) => m.verdict !== 'top 5').length > 0 && <p className="hb-small"><b>Records:</b> {x.marks.filter((m) => m.verdict !== 'top 5').map((m, k) => <span key={k}>{k ? '; ' : ''}{m.verdict === 'new record' ? 'new' : 'tied'} {m.label.toLowerCase()} ({m.value.toLocaleString('en-US')}, {board.name(m.who)})</span>)}</p>}
                  {x.comebacks.length > 0 && <p className="hb-small"><b>Comebacks:</b> {x.comebacks.map((c, k) => <span key={k}>{k ? '; ' : ''}{teamById(c.winner).short} from {c.deficit.split('-').reverse().join('–')} down{c.tags?.includes('legendary_comeback') ? ' (legendary)' : ''}</span>)}</p>}
                </section>
              );
            })}
          </div>
          {r.storylines && r.storylines.length > 0 && (
            <section className="hb-storylines" data-testid="hb-storylines">
              <h4>Storylines</h4>
              <ul className="hb-list">{r.storylines.map((x) => <li key={`${x.i}:${x.kind}`}>{x.note}</li>)}</ul>
            </section>
          )}
          <div className="hb-paper-cols hb-paper-foot">
            <section>
              <h4>Retirements{r.retiredTotal !== null && ` (${r.retiredTotal})`}</h4>
              {r.retired.length ? <ul className="hb-list">{r.retired.map((x) => <li key={x.i}><Player id={x.i} /> <span className="hb-dim">{leagueById(x.l).short}, {x.seasons} seasons</span></li>)}</ul> : <p className="hb-dim">None recorded.</p>}
            </section>
            <section>
              <h4>Hall of Fame class of {year + 1}</h4>
              {r.hof.length ? <ul className="hb-list">{r.hof.map((h) => <li key={h.i}><Player id={h.i} /> <span className="hb-dim">{leagueById(h.l).short}</span></li>)}</ul> : <p className="hb-dim">No inductees.</p>}
            </section>
            <section>
              <h4>Draft{r.draftTotal !== null && ` (${r.draftTotal} picks)`}</h4>
              {r.draft.length ? <ul className="hb-list">{r.draft.map((d) => <li key={d.i}>#1 {leagueById(d.l).short}: <Player id={d.i} /> <span className="hb-dim">{d.pos}, {teamById(d.t).short}</span></li>)}</ul> : <p className="hb-dim">No draft held.</p>}
            </section>
          </div>
        </article>
      )}
    </div>
  );
}
