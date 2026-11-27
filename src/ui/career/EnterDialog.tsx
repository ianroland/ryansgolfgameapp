import { ladderOf, ladderSay } from '../../career/ladder';
import { useState } from 'react';
import { tournamentCosts } from '../../career/engine';
import { QSERIES_EPSON_CARDS, QSERIES_LPGA_CARDS, QSCHOOL, TOURS } from '../../career/config';
import { courseOf, type TournamentDef } from '../../career/tournament';
import { courseTraits, courseYards } from '../../golf/courses';
import { coursePar } from '../../golf/course';
import type { RoundMode } from '../../career/types';
import { Dialog } from '../components/Dialog';
import { useGame } from '../GameContext';
import { formatMoney, shortMoney } from '../format';
import { TourPill } from './bits';

const MODES: { id: RoundMode; name: string; blurb: string }[] = [
  { id: 'sim', name: 'Quick Sim', blurb: 'Your skills, form and nerve play every hole. Results in seconds.' },
  { id: 'key', name: 'Key Holes', blurb: 'You play four holes a round (a par 3, a par 4, a par 5 and the finisher). The rest are simmed.' },
  { id: 'full', name: 'Full Round', blurb: 'You play all 9 holes of every round yourself.' },
];

export function EnterDialog({ def, onClose, onEntered }: { def: TournamentDef; onClose: () => void; onEntered: () => void }) {
  const { state, services, run } = useGame();
  const [mode, setMode] = useState<RoundMode>('key');
  const cost = tournamentCosts(def, state.career);
  const cfg = TOURS[def.tour];
  const course = courseOf(def);
  const enter = async () => {
    const o = await run(() => services.career.enterTournament(def.id, mode));
    if (o) onEntered();
  };
  return (
    <Dialog title={def.name} onClose={onClose} wide>
      <p>
        <TourPill tour={def.tour} /> {def.special && <span className="pill gold">{def.tour === 'lpga' ? 'Major championship' : 'Big event'}</span>}
      </p>
      <dl className="specs">
        <div><dt>Format</dt><dd>{def.rounds} rounds · {def.fieldSize} players{def.cut ? ` · cut after R${def.cut.afterRound} (top ${def.cut.top} & ties)` : ''}</dd></div>
        <div style={{ gridColumn: '1 / -1' }}>
          <dt>Course</dt>
          <dd data-testid="enter-course">
            <strong>{course.name}</strong> · {course.location} · par {coursePar(course)} · {courseYards(course).toLocaleString()} yds
            {courseTraits(course).map((t) => <span key={t} className="pill course-trait">{t}</span>)}
            {course.blurb && <span className="course-blurb">{course.blurb}</span>}
          </dd>
        </div>
        <div><dt>Purse</dt><dd>{def.prizeMoney ? `${formatMoney(def.purse)} · top ${def.paidPlaces} paid` : def.tour === 'amateur' ? 'Amateur: ranking points, no money' : 'No prize money'}</dd></div>
        <div><dt>Costs</dt><dd>{cost.entry ? `${formatMoney(cost.entry)} entry` : 'No entry fee'}{cost.travel ? ` + ${formatMoney(cost.travel)} travel` : ''}</dd></div>
        {def.qStage && (
          <div style={{ gridColumn: '1 / -1' }}>
            <dt>What&rsquo;s at stake</dt>
            <dd>
              {def.qStage < 3
                ? `Top ${Math.round(QSCHOOL[def.qStage].advanceFraction * 100)}% advance to ${QSCHOOL[(def.qStage + 1) as 2 | 3].name}.`
                : ladderSay(ladderOf(state.career), `Top ${QSERIES_LPGA_CARDS} earn a {Top} card. ${QSERIES_LPGA_CARDS + 1}–${QSERIES_EPSON_CARDS} earn {Dev} status.`)}
            </dd>
          </div>
        )}
        <div><dt>Field strength</dt><dd>{cfg.ratingMin + def.ratingShift}–{cfg.ratingMax + def.ratingShift} rated</dd></div>
        <div><dt>Bank after costs</dt><dd>{formatMoney(state.balance - cost.total)}</dd></div>
      </dl>

      <h3 className="sub-title">How do you want to play it?</h3>
      <div className="modes" role="radiogroup" aria-label="Round format">
        {MODES.map((m) => (
          <button key={m.id} role="radio" aria-checked={mode === m.id} className={`mode ${mode === m.id ? 'on' : ''}`} onClick={() => setMode(m.id)} data-testid={`mode-${m.id}`}>
            <span className="mode-name">{m.name}</span>
            <span className="mode-blurb">{m.blurb}</span>
          </button>
        ))}
      </div>
      <p className="fineprint">You can switch to Quick Sim at any point during the tournament. Entering costs 15 energy.</p>
      <div className="btn-row">
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={enter} autoFocus data-testid="confirm-enter">
          Tee it up{cost.total ? ` · ${shortMoney(cost.total)}` : ''}
        </button>
      </div>
    </Dialog>
  );
}
