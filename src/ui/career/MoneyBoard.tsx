import { useMemo, useState } from 'react';
import { rankMoney } from '../../career/moneyList';
import type { CareerState } from '../../career/types';
import { formatMoney, shortMoney } from '../format';
import { TourPill } from './bits';

const MEDALS = ['🥇', '🥈', '🥉'];

/** All-time career money list, Game Dev Story style. */
export function MoneyBoard({ c }: { c: CareerState }) {
  const rows = useMemo(() => rankMoney(c), [c]);
  const [showAll, setShowAll] = useState(false);
  const me = rows.find((r) => r.id === c.playerId);
  const log = (c.seasonLog ?? []).filter((l) => l.allTimeRank);
  const last = log[log.length - 1]?.allTimeRank ?? null;
  const move = me && last ? last - me.rank : null;
  const next = me && me.rank > 1 ? rows[me.rank - 2] : null;

  // Top 10, then a window around Ryan (and Kayla if she's close).
  const show = new Set<number>();
  rows.forEach((_r, i) => {
    if (showAll ? i < 100 : i < 10) show.add(i);
  });
  if (me) for (let i = me.rank - 4; i <= me.rank + 2; i++) if (i >= 0 && i < rows.length) show.add(i);
  const visible = [...show].sort((a, b) => a - b);

  return (
    <section className="hub-card money-board" aria-label="All-time career money list">
      <h2 className="hub-title">All-time money list <span className="muted">{rows.length} golfers</span></h2>
      <div className="mb-grid">
        <div className="mb-ryan">
          {me ? (
            <>
              <span className="mb-label">Ryan is</span>
              <span className="mb-rank" data-testid="alltime-rank">#{me.rank}</span>
              <span className="mb-amount">{formatMoney(me.amount)}</span>
              {move !== null && (
                <span className={`mb-move ${move > 0 ? 'up' : move < 0 ? 'down' : ''}`}>
                  {move > 0 ? `▲ ${move}` : move < 0 ? `▼ ${-move}` : '— no change'} since last season
                </span>
              )}
              {next && (
                <span className="mb-next">
                  {shortMoney(next.amount - me.amount + 1)} to pass {next.name} for #{next.rank}
                </span>
              )}
              {me.rank === 1 && <span className="mb-next gold">The greatest money winner in history!</span>}
            </>
          ) : (
            <>
              <span className="mb-label">Ryan</span>
              <span className="mb-rank off">—</span>
              <span className="mb-next">Win prize money as a pro to get on the list. #{rows.length} needs just {shortMoney(rows[rows.length - 1]?.amount ?? 0)}.</span>
            </>
          )}
          {log.length > 0 && (
            <ol className="mb-history" aria-label="All-time rank by season">
              {log.map((l) => (
                <li key={l.season}>
                  <span>S{l.season}</span>
                  <b>#{l.allTimeRank}</b>
                </li>
              ))}
            </ol>
          )}
        </div>
        <ol className={`mb-list ${showAll ? 'all' : ''}`}>
          {visible.map((i, k) => {
            const r = rows[i];
            const gap = k > 0 && visible[k - 1] !== i - 1;
            return (
              <li key={r.id} className={`${r.id === c.playerId ? 'me' : ''} ${r.id === c.rivalId ? 'rival' : ''} ${gap ? 'gap' : ''}`}>
                <span className="mb-pos">{i < 3 ? MEDALS[i] : r.rank}</span>
                <span className="mb-name">
                  {r.id === c.playerId ? 'Ryan' : r.name}
                  {r.id === c.rivalId && <span className="muted"> (rival)</span>}
                </span>
                <TourPill tour={r.tour} />
                <span className="mb-amt">{shortMoney(r.amount)}</span>
              </li>
            );
          })}
        </ol>
      </div>
      <button className="link" onClick={() => setShowAll((v) => !v)}>{showAll ? 'Show top 10' : 'Show top 100'}</button>
    </section>
  );
}
