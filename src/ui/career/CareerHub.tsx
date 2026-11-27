import { useState } from 'react';
import { ACTIONS, actionBlocker, babaLoanStatus, advanceBlocker, entryBlocker, tournamentCosts, type ActionId } from '../../career/engine';
import { ACTIONS_PER_WEEK, fameLevel, FAME_LEVELS, gameDate, SEASON_WEEKS, TOURS } from '../../career/config';
import { effectiveStats, energyRegen, skillPointCost } from '../../career/stats';
import { courseOf, eligibility, seasonSchedule, type TournamentDef } from '../../career/tournament';
import { STAT_KEYS, STAT_LABELS, type CareerState, type StatKey } from '../../career/types';
import { appearanceOf, storyOf } from '../../story/appearance';
import { encounterById } from '../../story/encounters';
import { RYAN_ID } from '../../story/cast';
import { BABA_LOAN, BABA_LOAN_LINES, BABA_LOAN_STATUS } from '../../story/babaLoan';
import { phaseOf, ryanSay } from '../../story/phase';
import { portraitKey } from '../../story/sprites';
import { AppearanceDialog } from '../story/AppearanceDialog';
import { SpriteFrame } from '../story/Sprite';
import { Dialog } from '../components/Dialog';
import { sound } from '../../audio/sound';
import { useGame } from '../GameContext';
import { formatGameDate, formatMoney, shortMoney } from '../format';
import { Bar, FormMeter, TourPill } from './bits';

export function statusLabel(c: CareerState) {
  if (c.status === 'amateur') return 'Amateur';
  if (c.tourCard === 'lpga') return 'PGA Tour member';
  if (c.tourCard === 'epson') return 'Korn Ferry Tour member';
  return 'Professional';
}

export function ProfileCard() {
  const { state } = useGame();
  const c = state.career;
  const level = fameLevel(c.fame);
  const next = FAME_LEVELS.find((l) => l.min > c.fame);
  const [lookOpen, setLookOpen] = useState(false);
  return (
    <section className="hub-card profile" aria-label="Ryan">
      <div className="profile-top">
        <button className="portrait portrait-btn" onClick={() => setLookOpen(true)} title="Change Ryan's look" data-testid="hub-portrait">
          <SpriteFrame who={RYAN_ID} frame={portraitKey(RYAN_ID, 'neutral', appearanceOf(c))} height={78} />
        </button>
        {lookOpen && <AppearanceDialog onClose={() => setLookOpen(false)} />}
        <div>
          <h2 className="hub-name">Ryan</h2>
          <p className="hub-sub">
            Age {c.age} · {statusLabel(c)}
          </p>
          <p className="hub-sub">
            <span className="fame-level">{level.name}</span>
          </p>
        </div>
      </div>
      <dl className="vitals">
        <div>
          <dt>Fame</dt>
          <dd>
            <Bar value={c.fame} tone="pink" label="Fame">{Math.floor(c.fame)}{next ? ` / ${next.min}` : ''}</Bar>
          </dd>
        </div>
        <div>
          <dt>Energy</dt>
          <dd>
            <Bar value={c.energy} tone={c.energy < 30 ? 'red' : 'green'} label="Energy">{Math.round(c.energy)}</Bar>
          </dd>
        </div>
        <div>
          <dt>Form</dt>
          <dd><FormMeter form={c.form} /></dd>
        </div>
        <div>
          <dt>Bank</dt>
          <dd className="money" data-testid="hub-money">{formatMoney(state.balance)}</dd>
        </div>
      </dl>
      {c.sponsor && <p className="muted">Sponsor: {c.sponsor.name} · {formatMoney(c.sponsor.weekly)}/wk</p>}
    </section>
  );
}

/** Baba's one-time $500 loan. Shows only when the bank is nearly empty, or when the loan can be paid back. */
export function BabaLoanCard() {
  const { state, services, run, notify } = useGame();
  const status = babaLoanStatus(state.career, state.balance);
  const [open, setOpen] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  if (status !== 'available' && status !== 'repayable' && !open) return null;
  const repay = status === 'repayable' || (open && state.career.flags.babaLoan === 'repaid' && said === BABA_LOAN_LINES.repaid);
  const ask = async () => {
    const o = await run(() => services.career.askBabaLoan());
    if (o) { sound.play('cash'); setSaid(BABA_LOAN_LINES.received); notify({ kind: 'info', title: o.message ?? 'Baba sent $500' }); }
  };
  const payBack = async () => {
    const o = await run(() => services.career.repayBabaLoan());
    if (o) { setSaid(BABA_LOAN_LINES.repaid); notify({ kind: 'info', title: o.message ?? 'You paid Baba back' }); }
  };
  const close = () => { setOpen(false); setSaid(null); };
  return (
    <section className="hub-card baba-card" aria-label={repay ? BABA_LOAN_LINES.repayTitle : BABA_LOAN_LINES.cardTitle} data-testid="baba-loan-card">
      <h2 className="hub-title">{repay ? BABA_LOAN_LINES.repayTitle : BABA_LOAN_LINES.cardTitle}</h2>
      <p>{repay ? BABA_LOAN_LINES.repayBody : BABA_LOAN_LINES.cardBody}</p>
      <button className="btn" data-testid="baba-loan-open" onClick={() => setOpen(true)}>
        {repay ? BABA_LOAN_LINES.repay : 'Ask Baba for $500'}
      </button>
      {open && (
        <Dialog title={repay ? BABA_LOAN_LINES.repayTitle : 'Calling Baba'} onClose={close}>
          <div className="baba-call" data-testid="baba-call">
            {BABA_LOAN_STATUS === 'draft' && <span className="rpg-draft">Draft lines</span>}
            {said ? (
              <p className="baba-line">{said}</p>
            ) : repay ? (
              <p className="baba-line">{BABA_LOAN_LINES.repayBody}</p>
            ) : (
              BABA_LOAN_LINES.call.map((l) => <p key={l} className="baba-line">{ryanSay(phaseOf(state.career), l)}</p>)
            )}
            <div className="baba-actions">
              {said ? (
                <button className="btn primary" autoFocus onClick={close}>Done</button>
              ) : repay ? (
                <>
                  <button className="btn primary" data-testid="baba-repay" disabled={state.balance < BABA_LOAN.amount} onClick={payBack}>{BABA_LOAN_LINES.repay}</button>
                  <button className="btn" onClick={close}>Not yet</button>
                </>
              ) : (
                <>
                  <button className="btn primary" data-testid="baba-accept" onClick={ask}>{BABA_LOAN_LINES.accept}</button>
                  <button className="btn" data-testid="baba-decline" onClick={() => setSaid(BABA_LOAN_LINES.declined)}>{BABA_LOAN_LINES.decline}</button>
                </>
              )}
            </div>
          </div>
        </Dialog>
      )}
    </section>
  );
}

export function SkillsCard() {
  const { state, services, run, notify } = useGame();
  const c = state.career;
  const eff = effectiveStats(c, true);
  const spend = async (k: StatKey) => {
    const o = await run(() => services.career.spendSkillPoint(k));
    if (o?.message) notify({ kind: 'info', title: o.message });
  };
  return (
    <section className="hub-card" aria-label="Skills">
      <h2 className="hub-title">
        Skills <span className="sp-badge" data-testid="skill-points">{c.skillPoints} SP</span>
      </h2>
      <ul className="skills">
        {STAT_KEYS.map((k) => {
          const bonus = Math.round(eff[k] - c.stats[k]);
          const cost = skillPointCost(c.stats[k]);
          return (
            <li key={k} className="skill">
              <span className="skill-name">{STAT_LABELS[k]}</span>
              <Bar value={c.stats[k]} tone={k === 'nerve' ? 'blue' : k === 'fitness' ? 'green' : 'gold'} label={STAT_LABELS[k]}>
                {c.stats[k].toFixed(1)}
                {bonus > 0 && <span className="bonus"> +{bonus}</span>}
              </Bar>
              <button
                className="btn small sp-btn"
                disabled={c.skillPoints < cost || c.stats[k] >= 100}
                onClick={() => spend(k)}
                title={`Spend ${cost} skill point${cost > 1 ? 's' : ''} for +1`}
                aria-label={`Raise ${STAT_LABELS[k]} by 1 for ${cost} skill points`}
              >
                +1<span className="sp-cost">{cost}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="fineprint">Earn skill points from tournaments. Train each week for steady gains. Gear bonuses show in green.</p>
    </section>
  );
}

function WeekCard({ onEnter }: { onEnter: (def: TournamentDef) => void }) {
  const { state, services, run, notify } = useGame();
  const c = state.career;
  const [confirmPro, setConfirmPro] = useState(false);
  const [confirmSkip, setConfirmSkip] = useState(false);
  const schedule = seasonSchedule(c.season);
  const thisWeek = schedule.filter((d) => d.week === c.week && (eligibility(d, c).ok || c.entered.includes(d.id)));
  const playable = thisWeek.filter((d) => !entryBlocker(c, d, state.balance));
  const upcoming = schedule.filter((d) => d.week > c.week && eligibility(d, c).ok).slice(0, 3);
  const left = ACTIONS_PER_WEEK - c.actionsUsed;

  const act = async (id: ActionId) => {
    const o = await run(() => services.career.doAction(id));
    if (o?.message) notify({ kind: 'info', title: o.message });
  };
  const advance = async () => {
    setConfirmSkip(false);
    const o = await run(async () => {
      const out = await services.career.advanceWeek();
      // A new season: run the sports off-season that just became due (once; stored).
      if (out.career.week === 1) await services.sportsUniverse.processDue().catch((e) => console.warn('Sports off-season failed', e));
      return out;
    });
    if (o) sound.play('week');
    if (o) notify({ kind: 'info', title: o.career.week === 1 ? `Season ${o.career.season} begins!` : `Week ${o.career.week}` });
  };

  return (
    <section className="hub-card week" aria-label="This week">
      <h2 className="hub-title">
        Season {c.season} · Week {c.week}<span className="muted"> of {SEASON_WEEKS}</span>
        <span className="date">{formatGameDate(gameDate(c.season, c.week))}</span>
      </h2>

      <h3 className="sub-title">This week&rsquo;s golf</h3>
      {thisWeek.length === 0 ? (
        <p className="empty">No events this week. Train up!</p>
      ) : (
        <ul className="event-list">
          {thisWeek.map((d) => {
            const block = entryBlocker(c, d, state.balance);
            const played = c.recent.find((r) => r.tournamentId === d.id);
            const cost = tournamentCosts(d, c);
            return (
              <li key={d.id} className={`event-card ${!block && !played ? 'go' : ''}`}>
                <div className="event-main">
                  <div className="event-title">
                    <TourPill tour={d.tour} />
                    <span className="event-name">{d.name}</span>
                    {d.special && <span className="pill gold">{d.tour === 'lpga' ? 'Major' : 'Big event'}</span>}
                  </div>
                  <div className="event-meta">
                    <span className="event-course" data-testid={`course-${d.id}`}>⛳ {courseOf(d).name}</span>
                    <span>{d.prizeMoney ? `${shortMoney(d.purse)} purse` : 'No prize money'}</span>
                    <span>{d.rounds} rounds</span>
                    <span>{cost.total ? `Costs ${formatMoney(cost.total)}` : 'Free entry'}</span>
                  </div>
                </div>
                <div className="event-action">
                  {played ? (
                    <span className="pill">{played.posLabel}</span>
                  ) : block ? (
                    <span className="pill warn">{block}</span>
                  ) : (
                    <button className="btn primary" onClick={() => onEnter(d)} data-testid={`enter-${d.id}`}>Play ▶</button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {upcoming.length > 0 && (
        <div className="next-up">
          <span className="next-up-label">Coming up</span>
          <ul>
            {upcoming.map((d) => (
              <li key={d.id}>
                <span className="wk">Wk {d.week}</span> {d.name} <span className="next-course">· {courseOf(d).name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <h3 className="sub-title">
        Activities <span className="dots" aria-label={`${left} of ${ACTIONS_PER_WEEK} left`}>{Array.from({ length: ACTIONS_PER_WEEK }, (_, i) => <span key={i} className={i < left ? 'on' : ''} />)}</span>
      </h3>
      <div className="actions">
        {(['Train', 'Life', 'Work'] as const).map((group) => (
          <div key={group} className="action-group">
            <h4>{group}</h4>
            {ACTIONS.filter((a) => a.group === group).map((a) => {
              const block = actionBlocker(c, a.id);
              return (
                <button key={a.id} className="action" disabled={!!block} onClick={() => act(a.id)} title={block ?? a.describe(c)} data-testid={`action-${a.id}`}>
                  <span className="action-top">
                    <span className="action-label">{a.label}</span>
                    <span className={`action-energy ${a.energy < 0 ? 'cost' : 'gain'}`}>{a.energy > 0 ? '+' : ''}{a.energy}⚡</span>
                  </span>
                  <span className="action-desc">{block && block !== 'No time left this week' ? block : a.describe(c)}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="btn-row week-actions">
        {c.status === 'amateur' && (
          <button className="btn" onClick={() => setConfirmPro(true)} data-testid="turn-pro">Turn Pro</button>
        )}
        <button
          className="btn primary"
          disabled={!!advanceBlocker(c)}
          title={advanceBlocker(c) ?? undefined}
          onClick={() => (playable.length && !c.entered.some((id) => playable.some((p) => p.id === id)) ? setConfirmSkip(true) : advance())}
          data-testid="advance-week"
        >
          {c.week === SEASON_WEEKS ? 'End season ▶' : 'Next week ▶'}
        </button>
      </div>
      <p className="fineprint">
        Next week: −{formatMoney(state.propertyDef.livingCost)} rent{c.sponsor ? `, +${formatMoney(c.sponsor.weekly)} sponsor` : ''}, +{energyRegen(c, state.propertyDef.energyBonus)} energy.
      </p>

      {confirmPro && (
        <Dialog title="Turn professional?" onClose={() => setConfirmPro(false)}>
          <p>
            Pros play for prize money on the <b>{TOURS.mini.name}</b> and can enter <b>{TOURS.qschool.name}</b> (First Stage in week 20, $3,500 entry). You can&rsquo;t play amateur events again.
          </p>
          <p className="muted">Most players turn pro once their skills are in the high 40s and they have some money saved.</p>
          <div className="btn-row">
            <button className="btn ghost" onClick={() => setConfirmPro(false)}>Not yet</button>
            <button
              className="btn primary"
              autoFocus
              onClick={async () => {
                setConfirmPro(false);
                const o = await run(() => services.career.turnPro());
                if (o) notify({ kind: 'trophy', title: "You're a professional!", body: 'Pro Series events and Q-School are open.' });
              }}
              data-testid="confirm-pro"
            >
              Turn pro
            </button>
          </div>
        </Dialog>
      )}
      {confirmSkip && (
        <Dialog title="Skip this week's event?" onClose={() => setConfirmSkip(false)}>
          <p>You haven&rsquo;t played {playable.map((p) => p.name).join(' or ')} this week.</p>
          <div className="btn-row">
            <button className="btn ghost" onClick={() => setConfirmSkip(false)} autoFocus>Go back</button>
            <button className="btn primary" onClick={advance}>Skip it</button>
          </div>
        </Dialog>
      )}
    </section>
  );
}

function NewsCard() {
  const { state } = useGame();
  const c = state.career;
  return (
    <section className="hub-card news" aria-label="News">
      <h2 className="hub-title">Inbox</h2>
      <ul className="inbox">
        {c.inbox.slice(0, 8).map((m) => (
          <li key={m.id} className={`msg ${m.tone}`}>
            <strong>{m.title}</strong>
            <span>{m.body}</span>
            <time className="muted">{formatGameDate(m.at)}</time>
          </li>
        ))}
      </ul>
      {c.recent.length > 0 && (
        <>
          <h3 className="sub-title">Recent results</h3>
          <ul className="list compact">
            {c.recent.slice(0, 5).map((r) => (
              <li key={r.tournamentId} className="list-row recent-row">
                <span className="recent-event">
                  <TourPill tour={r.tour} />
                  <span className="recent-name">{r.name}</span>
                </span>
                <span className="recent-score">
                  <b>{r.posLabel}</b> <span className="muted">{r.toPar === 0 ? 'E' : r.toPar > 0 ? `+${r.toPar}` : r.toPar}</span>
                  {r.prize > 0 && <span className="pos"> {shortMoney(r.prize)}</span>}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** A story encounter waiting to be played. */
function EncounterCard({ onPlay }: { onPlay: (id: string) => void }) {
  const { state } = useGame();
  const id = storyOf(state.career).available;
  const def = id ? encounterById(id) : null;
  if (!def) return null;
  const who = def.cast[0];
  return (
    <section className="hub-card encounter-card" aria-label="Encounter" data-testid="encounter-card">
      <div className="enc-card-portrait">
        <SpriteFrame who={who} frame={portraitKey(who, 'confident')} height={84} />
      </div>
      <div>
        <p className="enc-kicker">Encounter</p>
        <h2 className="hub-title">{def.title}</h2>
        <p className="muted">{def.teaser}</p>
        <button className="btn primary" onClick={() => onPlay(def.id)} data-testid="encounter-play">Play scene ▸</button>
      </div>
    </section>
  );
}

export function CareerHub({ onEnter, onEncounter }: { onEnter: (def: TournamentDef) => void; onEncounter: (id: string) => void }) {
  return (
    <main className="hub">
      <div className="hub-col">
        <ProfileCard />
        <BabaLoanCard />
        <SkillsCard />
      </div>
      <WeekCard onEnter={onEnter} />
      <div className="hub-col">
        <EncounterCard onPlay={onEncounter} />
        <NewsCard />
      </div>
    </main>
  );
}
