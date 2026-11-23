/**
 * Desert Palms greyhound racing. Pick a dog, bet to win, watch the race, collect.
 *
 * Today's card (six dogs, traps, form and odds) is dealt and locked by the casino
 * service, so leaving or reloading never rerolls it. The race is decided by the
 * service when the bet is placed (the seed is saved with the bet); this screen
 * replays exactly that race from the model's frames and never picks a winner.
 *
 * Dogs: lane sprite strips cut from the Desert Palms concept sheet (8-frame run
 * cycles, one per lane colour). The lane number is drawn on each jacket here, over
 * the painted digit, so it is always right whichever dog is in the lane.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  betBlocker, cardForPending, drawCard, GREYHOUND_LIMITS, oddsLabel, priceCard, raceForPending, STYLE_LABEL, TICK, TRACK_YARDS, TRAP_COLORS, TRAP_INK, winReturn,
  type PendingRace, type RaceCard, type RaceResult,
} from '../../casino/greyhounds';
import atlasUrl from '../../assets/casino/greyhounds/greyhounds_run.png';
import atlasMeta from '../../assets/casino/greyhounds/greyhounds_run.json';
import { sound } from '../../audio/sound';
import { greyhoundHistory, pendingRace } from '../../services/casinoService';
import { useGame } from '../GameContext';
import { formatMoney } from '../format';

type Phase = 'loading' | 'card' | 'countdown' | 'racing' | 'result';
/** Race playback speed: a ~28 s race plays in about 11 s. */
const SPEED = 2.5;
const CHIPS = [5, 10, 25, 100, 500];

const GH = atlasMeta as unknown as { cell: [number, number]; framesPerLane: number; jacket: Record<string, [number, number][]>; patch: [number, number] };
/** Run-cycle frame time in real milliseconds (independent of where the dog is on the track). */
export const RUN_FRAME_MS = 65;
/** Which run frame a dog shows `ms` into the race: by time only; lanes start out of step. */
export const runFrame = (ms: number, lane: number) => (Math.floor(ms / RUN_FRAME_MS) + lane * 3) % GH.framesPerLane;

/** A greyhound in a lane's jacket: one frame of that lane's run cycle, with the lane number on the jacket. */
export function DogSprite({ lane, frame }: { lane: number; frame: number }) {
  const [cw, ch] = GH.cell;
  const [ax, ay] = GH.jacket[String(lane + 1)][frame];
  const [pw, ph] = GH.patch;
  return (
    <svg className="gh-dog" viewBox={`0 0 ${cw} ${ch}`} aria-hidden data-lane={lane + 1} data-frame={frame}>
      <image href={atlasUrl} x={-frame * cw} y={-lane * ch} width={cw * GH.framesPerLane} height={ch * 6} preserveAspectRatio="none" style={{ imageRendering: 'pixelated' }} />
      <rect x={ax - pw / 2} y={ay - ph / 2} width={pw} height={ph} rx={1.5} fill={TRAP_COLORS[lane]} stroke="rgba(0,0,0,0.55)" strokeWidth={0.8} />
      <text x={ax} y={ay + 4.4} textAnchor="middle" fontSize={12.5} fontWeight={700} fontFamily="var(--head), monospace" fill={TRAP_INK[lane]}>{lane + 1}</text>
    </svg>
  );
}

const laneNo = (trap: number) => ({ background: TRAP_COLORS[trap], color: TRAP_INK[trap] });

export function Greyhounds({ onLeave }: { onLeave: () => void }) {
  const { state, services, run, refresh } = useGame();
  const [card, setCard] = useState<RaceCard | null>(null);
  const [pick, setPick] = useState<number | null>(null);
  const [stake, setStake] = useState(0);
  const [phase, setPhase] = useState<Phase>('loading');
  const [raceMs, setRaceMs] = useState(0);
  const [count, setCount] = useState(3);
  const [bet, setBet] = useState<PendingRace | null>(null);
  const [race, setRace] = useState<RaceResult | null>(null);
  const [simT, setSimT] = useState(0);
  const [settled, setSettled] = useState<{ payout: number; order: number[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const raf = useRef<number | null>(null);

  // Opening the screen: a race bet on before a reload replays and settles; otherwise today's
  // locked card is fetched (dealt once by the service, never rerolled by coming back).
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    const p = pendingRace(state.career);
    if (p) {
      const c = p.v === 2 ? priceCard(drawCard(p.cardSeed)) : { ...cardForPending(p), odds: new Array(6).fill(p.odds) as [number, number][] };
      setCard(c);
      setPick(p.trap);
      setStake(p.stake);
      startRace(p);
      return;
    }
    void loadCard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadCard() {
    setPhase('loading');
    const held = await run(() => services.casino.dealGreyhoundCard());
    if (!held) return;
    setCard(priceCard(drawCard(held.seed)));
    setPhase('card');
    await refresh();
  }

  function startRace(p: PendingRace) {
    setBet(p);
    setRace(raceForPending(p));
    setRaceMs(0);
    setSettled(null);
    setSimT(0);
    setCount(3);
    setPhase('countdown');
  }

  // Countdown 3-2-1, then the boxes open.
  useEffect(() => {
    if (phase !== 'countdown') return;
    sound.play('ui_click');
    if (count === 0) {
      setPhase('racing');
      sound.play('start', { volume: 0.7 });
      return;
    }
    const t = window.setTimeout(() => setCount((n) => n - 1), 700);
    return () => window.clearTimeout(t);
  }, [phase, count]);

  // The race: replay the model's frames.
  useEffect(() => {
    if (phase !== 'racing' || !race) return;
    const end = (race.frames.length - 1) * TICK;
    let start: number | null = null;
    const step = (now: number) => {
      start ??= now;
      const t = Math.min(end, ((now - start) / 1000) * SPEED);
      setSimT(t);
      setRaceMs(now - start);
      if (t < end) raf.current = requestAnimationFrame(step);
      else void finish();
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, race]);

  async function finish() {
    if (!bet || !race) return;
    const out = await run(() => services.casino.finishGreyhoundRace(bet.roundId));
    // The service runs the same seed; null means it was already settled (e.g. another tab).
    const order = out?.result.order ?? race.order;
    const payout = out?.payout ?? (race.order[0] === bet.trap ? winReturn(bet.stake, bet.odds) : 0);
    setSettled({ payout, order });
    setPhase('result');
    if (payout > 0) sound.play(payout - bet.stake >= 500 ? 'cheer' : 'cash', { volume: 0.8 });
    else sound.play('groan', { volume: 0.4 });
    await refresh();
  }

  async function placeBet() {
    if (pick === null || !card) return;
    const block = betBlocker(stake, state.balance);
    if (block) return;
    setBusy(true);
    const p = await run(() => services.casino.startGreyhoundRace(card.seed, pick, stake));
    setBusy(false);
    if (p) startRace(p);
  }

  function raceAgain() {
    setCard(null);
    setPick(null);
    setBet(null);
    setRace(null);
    setSettled(null);
    void loadCard();
  }

  // Positions at the current playback time (interpolated between model frames).
  const positions = useMemo(() => {
    if (!race) return new Array(6).fill(0);
    const k = simT / TICK;
    const i = Math.min(race.frames.length - 1, Math.floor(k));
    const j = Math.min(race.frames.length - 1, i + 1);
    const f = k - i;
    return race.frames[i].map((p, n) => p + (race.frames[j][n] - p) * f);
  }, [race, simT]);
  const leader = positions.indexOf(Math.max(...positions));
  const block = pick === null ? 'Pick a dog' : betBlocker(stake, state.balance);
  const showTrack = phase !== 'card' && phase !== 'loading';
  const history = greyhoundHistory(state.career);
  if (!card) {
    return (
      <section className="hub-card casino-game greyhound-game" data-testid="greyhounds">
        <h2 className="hub-title">Greyhound Racing</h2>
        <p className="muted">The race card is being posted…</p>
      </section>
    );
  }

  return (
    <section className="hub-card casino-game greyhound-game" data-testid="greyhounds">
      <h2 className="hub-title">
        Greyhound Racing <span className="muted">Win bets ${GREYHOUND_LIMITS.min}–${GREYHOUND_LIMITS.max} · 500 yards · six dogs</span>
      </h2>

      {showTrack && race && (
        <div className="gh-track" data-testid="gh-track" data-phase={phase}>
          <div className="gh-start" aria-hidden><span>START</span></div>
          <div className="gh-finish" aria-hidden><span>FINISH</span></div>
          {card.dogs.map((d, trap) => {
            const x = positions[trap] / TRACK_YARDS;
            const running = phase === 'racing' && positions[trap] < TRACK_YARDS;
            const place = settled ? settled.order.indexOf(trap) + 1 : null;
            return (
              <div key={trap} className={`gh-lane ${bet?.trap === trap ? 'mine' : ''}`} data-testid={`gh-lane-${trap + 1}`}>
                <span className="gh-lane-no" style={laneNo(trap)}>{trap + 1}</span>
                <div className="gh-runner" style={{ left: `calc(${x * 100}% * 0.86 + 4%)` }} data-testid={`gh-dog-${trap + 1}`} data-yards={positions[trap].toFixed(1)} title={d.name}>
                  <DogSprite lane={trap} frame={running ? runFrame(raceMs, trap) : 0} />
                </div>
                {place !== null && <span className={`gh-place p${place}`}>{place === 1 ? '1st' : place === 2 ? '2nd' : place === 3 ? '3rd' : `${place}th`}</span>}
              </div>
            );
          })}
          {phase === 'countdown' && <div className="gh-countdown" data-testid="gh-countdown">{count > 0 ? count : 'GO!'}</div>}
          {phase === 'racing' && (
            <div className="gh-hud">
              <span>Leader: <b>{leader + 1} {card.dogs[leader].name}</b></span>
              <span>{simT.toFixed(1)} s</span>
            </div>
          )}
        </div>
      )}

      {phase === 'card' && (
        <>
          <p className="muted gh-help">Pick a dog, choose your bet, and you&rsquo;re paid at the odds shown if your dog wins. A new field and new odds every race; the card stays the same until its race is run.</p>
          <ol className="gh-card" data-testid="gh-card">
            {card.dogs.map((d, trap) => (
              <li key={trap}>
                <button className={`gh-entry ${pick === trap ? 'on' : ''}`} onClick={() => setPick(trap)} aria-pressed={pick === trap} data-testid={`gh-pick-${trap + 1}`}>
                  <span className="gh-lane-no" style={laneNo(trap)}>{trap + 1}</span>
                  <DogSprite lane={trap} frame={0} />
                  <span className="gh-name">{d.name}<small className="gh-style">{STYLE_LABEL[d.style]}</small></span>
                  <span className="gh-odds" data-testid={`gh-odds-${trap + 1}`}>{oddsLabel(card.odds[trap])}</span>
                  <span className="gh-pays">{stake > 0 ? `pays ${formatMoney(winReturn(stake, card.odds[trap]))}` : ''}</span>
                </button>
              </li>
            ))}
          </ol>
          <div className="chip-rack">
            {CHIPS.map((c) => (
              <button key={c} className={`chip chip-${c}`} onClick={() => setStake((s) => Math.min(GREYHOUND_LIMITS.max, s + c))} aria-label={`Add $${c}`} data-testid={`gh-chip-${c}`}>{c}</button>
            ))}
            <span className="chip-total">Bet <b data-testid="gh-stake">{formatMoney(stake)}</b></span>
            <button className="btn ghost small" onClick={() => setStake(0)} disabled={stake === 0}>Clear</button>
          </div>
          <p className="gh-explain" data-testid="gh-explain">
            {pick === null
              ? 'Tap a dog to back it to win.'
              : stake < GREYHOUND_LIMITS.min
                ? `Add chips: the minimum bet is ${formatMoney(GREYHOUND_LIMITS.min)}.`
                : `Win bet: ${formatMoney(stake)} on ${pick + 1} ${card.dogs[pick].name} at ${oddsLabel(card.odds[pick])}. If it wins you get ${formatMoney(winReturn(stake, card.odds[pick]))} back (your ${formatMoney(stake)} plus ${formatMoney(winReturn(stake, card.odds[pick]) - stake)}). If not, the bet is lost.`}
          </p>
          <div className="btn-row casino-actions">
            <button className="btn ghost" onClick={onLeave}>Back to the tables</button>
            <button className="btn primary" onClick={placeBet} disabled={busy || !!block} title={block ?? undefined} data-testid="gh-place-bet">
              {block && pick !== null && stake >= GREYHOUND_LIMITS.min ? block : 'Place bet & race'}
            </button>
          </div>
          {history.length > 0 && (
            <div className="gh-history" data-testid="gh-history">
              <h3>Recent races</h3>
              <ol>
                {history.map((h) => (
                  <li key={h.roundId}>
                    <span className="gh-lane-no small" style={laneNo(h.order[0].trap)}>{h.order[0].trap + 1}</span>
                    <span className="gh-name">{h.order[0].name}</span>
                    <span className="muted">S{h.season} W{h.week} · your {formatMoney(h.stake)} on {h.pick.name} at {oddsLabel(h.odds)}</span>
                    <span className={h.payout > 0 ? 'pos' : 'neg'}>{h.payout > 0 ? `+${formatMoney(h.payout - h.stake)}` : `−${formatMoney(h.stake)}`}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </>
      )}

      {phase === 'result' && settled && bet && (
        <div className="gh-result" data-testid="gh-result">
          <p className="gh-winner" data-testid="gh-winner">
            <span className="gh-lane-no big" style={laneNo(settled.order[0])}>{settled.order[0] + 1}</span>
            {card.dogs[settled.order[0]].name} wins from trap {settled.order[0] + 1}!
          </p>
          <p className={`gh-payout ${settled.payout > 0 ? 'won' : 'lost'}`} data-testid="gh-payout">
            {settled.payout > 0
              ? `Your ${formatMoney(bet.stake)} on ${bet.trap + 1} ${card.dogs[bet.trap].name} at ${oddsLabel(bet.odds)} returns ${formatMoney(settled.payout)}: you won ${formatMoney(settled.payout - bet.stake)}.`
              : `Your ${formatMoney(bet.stake)} on ${bet.trap + 1} ${card.dogs[bet.trap].name} at ${oddsLabel(bet.odds)} is lost (finished ${ordinalOf(settled.order.indexOf(bet.trap) + 1)}).`}
          </p>
          <ol className="gh-order" data-testid="gh-order">
            {settled.order.map((trap, i) => (
              <li key={trap} className={trap === bet.trap ? 'mine' : ''}>
                <span className="gh-pos">{ordinalOf(i + 1)}</span>
                <span className="gh-lane-no" style={laneNo(trap)}>{trap + 1}</span>
                <span className="gh-name">{card.dogs[trap].name}</span>
                <span className="gh-time">{race ? `${race.times[trap].toFixed(2)} s` : ''}</span>
              </li>
            ))}
          </ol>
          <div className="btn-row casino-actions">
            <button className="btn ghost" onClick={onLeave} data-testid="gh-leave">Back to the tables</button>
            <button className="btn primary" onClick={raceAgain} data-testid="gh-race-again">Race again</button>
          </div>
        </div>
      )}
      <p className="fineprint">Greyhound sprites are provisional (cut from the concept sheet). In-game money only.</p>
    </section>
  );
}

function ordinalOf(n: number) {
  return n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;
}
