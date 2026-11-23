import { useEffect, useState } from 'react';
import { trophyLook } from '../../catalog/trophies';
import type { TrophyHistory } from '../../services/careerService';
import { Dialog } from '../components/Dialog';
import { useGame } from '../GameContext';
import { formatGameDate, formatMoney, ordinal, toPar } from '../format';

const UNAVAILABLE = <span className="unavailable">Unavailable</span>;

/** Historical details for a trophy, read from the stored tournament record. */
export function TrophyDetails({ trophyId, onClose }: { trophyId: string; onClose: () => void }) {
  const { services } = useGame();
  const [history, setHistory] = useState<TrophyHistory | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    services.career.getTrophyHistory(trophyId).then(setHistory, (e) => setError(String(e?.message ?? e)));
  }, [services, trophyId]);

  const def = history ? trophyLook(history.trophy) : null;
  const t = history?.trophy;
  const rec = history?.tournament;
  const mine = rec?.scores[rec.playerId];

  return (
    <Dialog title={def ? def.name : 'Trophy'} onClose={onClose} wide>
      {error && <p className="warn-text">{error}</p>}
      {!history && !error && <p className="muted">Loading career history…</p>}
      {history && def && t && (
        <div className="details" data-testid="trophy-details">
          <div className="details-hero">
            <div className={`trophy-badge big ${def.style}`} aria-hidden />
            <div>
              <p className="milestone">{def.style === 'pink_jacket' ? def.milestone : t.metadata.milestone || def.milestone}</p>
              <p className="muted">Earned {formatGameDate(t.earnedAt)}</p>
            </div>
          </div>

          <dl className="facts">
            <div><dt>Event</dt><dd>{def.eventName}{rec?.def.special && <span className="pill gold">{rec.def.tour === 'lpga' ? 'Major' : 'Championship'}</span>}</dd></div>
            <div><dt>Tour</dt><dd>{t.tourName}</dd></div>
            <div><dt>Course</dt><dd>{def.venue}</dd></div>
            <div><dt>Finish</dt><dd>{ordinal(t.finish.position)} of {t.finish.fieldSize} · {toPar(t.finish.toPar)} ({t.finish.rounds.join('-')} = {t.finish.total})</dd></div>
            <div><dt>Runner-up</dt><dd>{t.runnerUp ?? UNAVAILABLE}</dd></div>
            <div><dt>Prize</dt><dd>{t.prize > 0 ? formatMoney(t.prize) : 'Amateur: no prize money'}</dd></div>
          </dl>

          <h3 className="section-title">Ryan&rsquo;s scorecard</h3>
          {rec && mine ? (
            <div className="scorecard-wrap">
              <table className="scorecard">
                <caption className="sr-only">Hole-by-hole scores for {t.eventName}</caption>
                <thead>
                  <tr>
                    <th scope="col">Round</th>
                    {rec.pars.map((_, i) => <th key={i} scope="col">{i + 1}</th>)}
                    <th scope="col">Tot</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="par-row">
                    <th scope="row">Par</th>
                    {rec.pars.map((p, i) => <td key={i}>{p}</td>)}
                    <td>{rec.pars.reduce((a, b) => a + b, 0)}</td>
                  </tr>
                  {mine.map((holes, r) => (
                    <tr key={r} className="me">
                      <th scope="row">R{r + 1}</th>
                      {holes.map((s, i) => (
                        <td key={i} className={s < rec.pars[i] ? 'won' : ''}>{s}</td>
                      ))}
                      <td>{holes.reduce((a, b) => a + b, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="fineprint">Highlighted holes are under par.</p>
            </div>
          ) : (
            <p className="empty">Scorecard unavailable — the stored tournament record could not be found.</p>
          )}
          <p className="fineprint">
            Source: tournament {t.sourceTournamentId} · career event {t.sourceCareerEventId}
          </p>
        </div>
      )}
    </Dialog>
  );
}
