import { ladderOf, ladderSay, tourName } from '../../career/ladder';
import { useState } from 'react';
import { entryBlocker, moneyList, moneyRank, pointsList } from '../../career/engine';
import { EPSON_GRADUATES, LPGA_KEEP_CARD, QSCHOOL, type TourId } from '../../career/config';
import { courseOf, eligibility, seasonSchedule, type TournamentDef } from '../../career/tournament';
import type { CareerState } from '../../career/types';
import { useGame } from '../GameContext';
import { shortMoney } from '../format';
import { TourPill } from './bits';

function roadSteps(c: CareerState) {
  const q = c.qschool;
  return [
    { label: 'Amateur Circuit', done: c.status === 'pro', now: c.status === 'amateur', note: 'Build skills and fame. Turn pro when ready.' },
    { label: 'Turn Pro', done: c.status === 'pro', now: false, note: 'Play the SoCal Pro Series for prize money.' },
    {
      label: 'Q-School',
      done: c.tourCard !== 'none' || q.result === 'lpga' || q.result === 'epson',
      now: c.status === 'pro' && c.tourCard === 'none',
      note: q.nextStage ? `Next: ${QSCHOOL[q.nextStage].name} (week ${QSCHOOL[q.nextStage].week})` : q.result === 'failed' ? 'Out this year. Try again next season.' : 'First Stage → Second Stage → Final Stage',
    },
    { label: tourName('epson', ladderOf(c)), done: c.tourCard === 'lpga', now: c.tourCard === 'epson', note: `Top ${EPSON_GRADUATES} on the money list graduate.` },
    { label: tourName('lpga', ladderOf(c)), done: false, now: c.tourCard === 'lpga', note: `Stay inside the top ${LPGA_KEEP_CARD} to keep your card.` },
  ];
}

export function SchedulePanel({ onEnter }: { onEnter: (def: TournamentDef) => void }) {
  const { state } = useGame();
  const c = state.career;
  const schedule = seasonSchedule(c.season);
  const [showAll, setShowAll] = useState(false);
  const relevant = schedule.filter((d) => showAll || eligibility(d, c).ok || c.entered.includes(d.id) || (d.tour === 'qschool' && c.status === 'pro' && c.tourCard !== 'lpga'));
  const listTour: TourId = c.tourCard === 'lpga' ? 'lpga' : c.tourCard === 'epson' ? 'epson' : 'mini';
  const rank = c.status === 'pro' ? moneyRank(c, listTour) : null;

  return (
    <main className="two-col">
      <section className="hub-card">
        <h2 className="hub-title">
          Season {c.season} schedule
          <label className="toggle">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> show all tours
          </label>
        </h2>
        <ul className="schedule">
          {relevant.map((d) => {
            const played = c.recent.find((r) => r.tournamentId === d.id);
            const block = entryBlocker(c, d, state.balance);
            const el = eligibility(d, c);
            return (
              <li key={d.id} className={`sched-row ${d.week === c.week ? 'now' : ''} ${d.week < c.week ? 'past' : ''}`}>
                <span className="wk">W{d.week}</span>
                <span className="sched-name">
                  <TourPill tour={d.tour} season={d.season} week={d.week} />
                  <span className="sched-title">
                    <span className="sched-event">{d.name} {d.special && <span className="pill gold">{d.tour === 'lpga' ? 'Major' : '★'}</span>}</span>
                    <span className="sched-course">{courseOf(d).name}</span>
                  </span>
                </span>
                <span className="purse">{d.prizeMoney ? shortMoney(d.purse) : '—'}</span>
                <span className="sched-status">
                  {played ? (
                    <b>{played.posLabel}</b>
                  ) : d.week === c.week && !block ? (
                    <button className="btn primary small" onClick={() => onEnter(d)}>Play</button>
                  ) : d.week < c.week || c.entered.includes(d.id) ? (
                    <span className="muted">—</span>
                  ) : !el.ok ? (
                    <span className="muted">{el.reason}</span>
                  ) : (
                    <span className="muted">{d.week === c.week ? block : 'Upcoming'}</span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="hub-col">
        <section className="hub-card">
          <h2 className="hub-title">{ladderSay(ladderOf(c), 'Road to the {Top}')}</h2>
          <ol className="road">
            {roadSteps(c).map((s) => (
              <li key={s.label} className={s.done ? 'done' : s.now ? 'now' : ''}>
                <strong>{s.label}</strong>
                <span className="muted">{s.note}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="hub-card">
          {c.status === 'amateur' ? (
            <>
              <h2 className="hub-title">Amateur rankings</h2>
              <Standings rows={pointsList(c, 12).map((p) => ({ id: p.id, name: p.name, value: `${p.points} pts` }))} me={c.playerId} rival={c.rivalId} />
            </>
          ) : (
            <>
              <h2 className="hub-title">
                {tourName(listTour, ladderOf(c))} money list {rank && <span className="pill gold">You: #{rank}</span>}
              </h2>
              <Standings rows={moneyList(c, listTour, 12).map((p) => ({ id: p.id, name: p.name, value: shortMoney(p.amount) }))} me={c.playerId} rival={c.rivalId} />
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function Standings({ rows, me, rival }: { rows: { id: string; name: string; value: string }[]; me: string; rival: string }) {
  if (!rows.length) return <p className="empty">No results yet this season.</p>;
  return (
    <ol className="standings">
      {rows.map((r) => (
        <li key={r.id} className={r.id === me ? 'me' : r.id === rival ? 'rival' : ''}>
          <span>{r.name}{r.id === rival && <span className="muted"> (rival)</span>}</span>
          <span>{r.value}</span>
        </li>
      ))}
    </ol>
  );
}
