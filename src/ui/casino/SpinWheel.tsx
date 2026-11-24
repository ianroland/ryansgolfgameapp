/**
 * Spin to Win: the classic money wheel, on each casino's machine from the supplied concept sheet.
 * The cabinet art is used whole; the wheel, the odds, the bet total and the SPIN button are drawn
 * over the painted ones (whose labels and payouts were sample art), so every number on screen is a
 * real rule. Rules: src/casino/wheel.ts. Money: CasinoService.spinWheel, which decides and pays the
 * spin before the wheel moves; the animation only shows that result. Presentation only.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  betBlocker, slotsOf, WHEEL_CHIPS, WHEEL_LIMITS, WHEEL_PAYS, WHEEL_SLOTS, WHEEL_SYMBOLS, wheelStaked,
  type WheelBets, type WheelResult, type WheelSymbol,
} from '../../casino/wheel';
import { wheelHistory, wheelLast } from '../../services/casinoService';
import type { LocationId } from '../../expansion/unlocks';
import { locationById } from '../../expansion/locations';
import { sound } from '../../audio/sound';
import { useGame } from '../GameContext';
import { formatMoney } from '../format';
import { celebrateWin } from './BigWin';
import { useCasinoLocation } from './casinoLocation';
import { ServerPanel, signalRoundComplete } from './ServerPanel';
import { polar, rotationFor, SLOT_DEG } from './wheelGeometry';
import { freezeBalance, useShownBalance } from './balanceHold';
import ATLAS from '../../assets/casino/spin/atlas.json';

const files = import.meta.glob<string>('../../assets/casino/spin/*.webp', { eager: true, query: '?url', import: 'default' });
const url = (name: string) => files[`../../assets/casino/spin/${name}.webp`];
const piece = (name: string) => (ATLAS.pieces as Record<string, { w: number; h: number; window?: number[]; slice?: number[] }>)[name];
const pct = (v: number, of: number) => `${(v / of) * 100}%`;

/** Slot colours (the same on every machine; the emblem slot takes the casino's colour). */
const COLOUR: Record<WheelSymbol, string> = { '1': '#ece8f4', '2': '#d63384', '5': '#7d3cc8', '10': '#2f6fd6', '20': '#1f9b55', emblem: '#0e0b16', star: '#f2b632' };
const EMBLEM_COLOUR: Record<LocationId, string> = { desert_palms: '#0f4a2c', white_buffalo: '#5a3417', morongo_sky: '#3d1670' };
const EMBLEM_NAME: Record<LocationId, string> = { desert_palms: 'Palm', white_buffalo: 'Buffalo', morongo_sky: 'Mountain' };
const ink = (s: WheelSymbol) => (s === '1' || s === 'star' ? '#1b1300' : '#fff');
const symbolName = (s: WheelSymbol, loc: LocationId) => (s === 'emblem' ? EMBLEM_NAME[loc] : s === 'star' ? 'Star' : `$${s}`);
const SPIN_MS = 4600;
/** A beat after the wheel stops before the result is announced. */
const REVEAL_PAUSE_MS = 550;

const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function WheelFace({ loc, rot, spinning, instant, winSlot }: { loc: LocationId; rot: number; spinning: boolean; instant: boolean; winSlot: number | null }) {
  const emblem = url(`${loc}_emblem`);
  const slots = useMemo(() => WHEEL_SLOTS.map((s, i) => {
    const a0 = i * SLOT_DEG;
    const a1 = (i + 1) * SLOT_DEG;
    const [x0, y0] = polar(a0, 100);
    const [x1, y1] = polar(a1, 100);
    return { s, i, d: `M0 0 L${x0.toFixed(3)} ${y0.toFixed(3)} A100 100 0 0 1 ${x1.toFixed(3)} ${y1.toFixed(3)} Z`, mid: a0 + SLOT_DEG / 2 };
  }), []);
  return (
    <svg className="spin-svg" viewBox="-100 -100 200 200" aria-hidden>
      <g
        className={`spin-rotor ${spinning ? 'spinning' : ''}`}
        style={{ transform: `rotate(${rot}deg)`, transition: instant ? 'none' : `transform ${SPIN_MS}ms cubic-bezier(0.12, 0.7, 0.1, 1)` }}
      >
        {slots.map(({ s, i, d, mid }) => (
          <g key={i}>
            <path d={d} fill={s === 'emblem' ? EMBLEM_COLOUR[loc] : COLOUR[s]} stroke="#e8c15a" strokeWidth={0.6} className={winSlot === i ? 'spin-won' : ''} />
            {/* Labels stand upright facing out, near the rim where the slot is widest. */}
            <g transform={`rotate(${mid}) translate(0 -85)`}>
              {s === 'emblem' ? (
                <image href={emblem} x={-4.8} y={-4.8} width={9.6} height={9.6} />
              ) : s === 'star' ? (
                <text className="spin-label" fill="#1b1300" fontSize={10.5}>★</text>
              ) : (
                <text className="spin-label" fill={ink(s)} fontSize={s.length > 1 ? 8.4 : 10.5}>{s}</text>
              )}
            </g>
          </g>
        ))}
        <circle r={99.4} fill="none" stroke="#f6d77a" strokeWidth={1.2} />
      </g>
      {/* The hub stays still; only the wheel turns. */}
      <circle r={31} fill="#0b0810" stroke="#e8c15a" strokeWidth={2.2} />
      <image href={emblem} x={-29} y={-29} width={58} height={58} />
    </svg>
  );
}

/** Bets stay on the board for the next spin (the session), like a re-bet. */
const session = { bets: {} as WheelBets, chip: 5 as number };

export function SpinWheel() {
  const { state, services, run } = useGame();
  const loc = useCasinoLocation();
  const cab = ATLAS.cabinets[loc];
  const last = wheelLast(state.career);
  const history = wheelHistory(state.career);
  const [bets, setBetsState] = useState<WheelBets>(session.bets);
  const [chip, setChipState] = useState<number>(session.chip);
  const setBets = (b: WheelBets) => { session.bets = b; setBetsState(b); };
  const setChip = (c: number) => { session.chip = c; setChipState(c); };
  const [rot, setRot] = useState(() => (last ? rotationFor(last.slot) : rotationFor(0) + SLOT_DEG / 2));
  const [instant, setInstant] = useState(true);
  const [spinning, setSpinning] = useState(false);
  const [shown, setShown] = useState<WheelResult | null>(null);
  const [pending, setPending] = useState<WheelResult | null>(null);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const staked = wheelStaked(bets);
  const block = betBlocker(bets, state.balance);
  // The spin is paid before the wheel turns: every bank display holds the after-bet figure until it stops.
  const credit = useShownBalance(state.balance);
  // Likewise the history only gains this spin once the wheel has stopped.
  const shownHistory = pending ? history.slice(1) : history;

  const add = (s: WheelSymbol) => {
    if (spinning) return;
    const v = Math.min(WHEEL_LIMITS.maxPerSymbol, (bets[s] ?? 0) + chip);
    setBets({ ...bets, [s]: v });
    setShown(null);
    sound.play('ui_click', { volume: 0.5 });
  };
  const clearOne = (s: WheelSymbol) => {
    if (spinning) return;
    const next = { ...bets };
    delete next[s];
    setBets(next);
  };

  const spin = async () => {
    if (spinning || block) return;
    setSpinning(true);
    setShown(null);
    sound.play('ui_confirm');
    const release = freezeBalance(state.balance - staked);
    const r = await run(() => services.casino.spinWheel(bets));
    if (!r) {
      release();
      return setSpinning(false);
    }
    setPending(r);
    const reduce = reducedMotion();
    setInstant(reduce);
    // Small random stop inside the slot so it doesn't always land dead centre (looks only).
    const jitter = (Math.random() * 2 - 1) * 0.9;
    setRot((from) => rotationFor(r.slot, from, reduce ? 0 : 5, jitter));
    if (!reduce) sound.play('meter_start', { volume: 0.5 });
    timers.current.push(window.setTimeout(() => {
      release();
      setSpinning(false);
      setPending(null);
      setShown(r);
      setInstant(true);
      signalRoundComplete(services);
      const net = r.payout - r.staked;
      celebrateWin(net, r.staked, { jackpot: WHEEL_PAYS[r.symbol] === 40 && r.payout > 0 });
      sound.play(r.payout >= r.staked * 10 && r.payout > 0 ? 'cheer' : r.payout > 0 ? 'cash' : 'ui_click', { volume: 0.6 });
    }, reduce ? 250 : SPIN_MS + REVEAL_PAUSE_MS));
  };

  // Keyboard: Space or Enter spins (only while this game is on screen and focus isn't on a control).
  const root = useRef<HTMLElement>(null);
  const live = useRef(spin);
  live.current = spin;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!root.current?.getClientRects().length) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLButtonElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        void live.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const [wx, wy, wr] = cab.wheel;
  const pointer = piece(`${loc}_pointer`);
  const pointerW = 42;
  const pointerH = (pointer.h / pointer.w) * pointerW;
  const box = (b: number[]): CSSProperties => ({ left: pct(b[0], cab.w), top: pct(b[1], cab.h), width: pct(b[2], cab.w), height: pct(b[3], cab.h) });
  const winSym = shown?.symbol ?? null;
  const status = spinning
    ? 'Round and round…'
    : shown
      ? shown.payout > 0 ? `${symbolName(shown.symbol, loc)}! You win ${formatMoney(shown.payout)}` : `${symbolName(shown.symbol, loc)}. No win this time`
      : staked ? `${formatMoney(staked)} on the board · press SPIN` : 'Put chips on the symbols below, then SPIN';

  const meter = (kind: 'credits' | 'bet' | 'win', value: string, testId: string) => {
    const m = piece(`meter_${kind}`);
    const [x, y, w, h] = m.window!;
    return (
      <div className="spin-meter" style={{ aspectRatio: `${m.w} / ${m.h}`, backgroundImage: `url(${url(`meter_${kind}`)})` }} role="group" aria-label={`${kind} ${value}`}>
        <b data-testid={testId} style={{ left: pct(x, m.w), top: pct(y, m.h), width: pct(w, m.w), height: pct(h, m.h) }}>{value}</b>
      </div>
    );
  };
  const panel = piece(`${loc}_panel`);

  return (
    <section className="hub-card casino-game spin-game" ref={root} data-testid="spin-wheel">
      <h2 className="hub-title">Spin to Win <span className="muted">the money wheel · 54 equal slots · pays 1 to 40 to 1</span></h2>
      <div className="table-layout side">
        <div className="spin-cab" style={{ aspectRatio: `${cab.w} / ${cab.h}`, backgroundImage: `url(${url(`${loc}_cabinet`)})` }} data-testid="spin-cabinet" data-loc={loc}>
          <div className="spin-wheel" style={{ left: pct(wx - wr, cab.w), top: pct(wy - wr, cab.h), width: pct(wr * 2, cab.w), height: pct(wr * 2, cab.h) }} data-testid="spin-disc" data-slot={shown?.slot ?? last?.slot ?? ''}>
            <WheelFace loc={loc} rot={rot} spinning={spinning} instant={instant} winSlot={shown && shown.payout >= 0 ? shown.slot : null} />
          </div>
          <img
            className="spin-pointer"
            src={url(`${loc}_pointer`)}
            alt=""
            draggable={false}
            style={{ left: pct(wx - pointerW / 2, cab.w), top: pct(wy - wr - pointerH * 0.62, cab.h), width: pct(pointerW, cab.w) }}
          />
          <div className="spin-pays" style={box(cab.pays)} data-testid="spin-pays">
            <p className="spin-pays-title">Pays</p>
            <table>
              <tbody>
                {WHEEL_SYMBOLS.map((s) => (
                  <tr key={s} className={winSym === s && !spinning ? 'hit' : ''}>
                    <th><span className="spin-sym" style={{ background: s === 'emblem' ? EMBLEM_COLOUR[loc] : COLOUR[s], color: ink(s) }}>{s === 'emblem' ? <img src={url(`${loc}_emblem`)} alt="" /> : s === 'star' ? '★' : s}</span></th>
                    <td>{WHEEL_PAYS[s]} to 1</td>
                    <td className="spin-slots">{slotsOf(s)}/54</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="spin-betplate" style={box(cab.bet)} aria-live="polite">
            <span>Bet</span> <b>{formatMoney(staked)}</b>
          </div>
          <button
            type="button"
            className="wheel-spin-btn"
            style={{ ...box(cab.spin), backgroundImage: `url(${url(spinning || !!block ? `${loc}_spin_dim` : `${loc}_spin`)})` }}
            onClick={() => void spin()}
            disabled={spinning || !!block}
            aria-label={block ? `Spin (${block})` : `Spin for ${formatMoney(staked)}`}
            data-testid="spin-go"
          />
        </div>
        <div className="dealer-row">
          <ServerPanel busy={spinning} />
        </div>
      </div>
      <p className={`spin-status ${shown && shown.payout > 0 ? 'win' : ''}`} data-testid="spin-status" aria-live="polite">{status}</p>
      <div className="spin-board" style={{ borderImage: `url(${url(`${loc}_panel`)}) ${panel.slice!.join(' ')} fill / ${panel.slice!.map((v) => `${v}px`).join(' ')} stretch` }}>
        <div className="spin-spots" role="group" aria-label="Bets: tap a symbol to add the chip; right-click to clear it">
          {WHEEL_SYMBOLS.map((s) => (
            <button
              key={s}
              type="button"
              className={`spin-spot ${winSym === s && !spinning && shown?.payout ? 'won' : ''}`}
              style={{ '--sym': s === 'emblem' ? EMBLEM_COLOUR[loc] : COLOUR[s], '--ink': ink(s) } as CSSProperties}
              onClick={() => add(s)}
              onContextMenu={(e) => { e.preventDefault(); clearOne(s); }}
              disabled={spinning}
              aria-label={`Bet on ${symbolName(s, loc)}, pays ${WHEEL_PAYS[s]} to 1, ${slotsOf(s)} slots of 54${bets[s] ? `. On it: ${formatMoney(bets[s]!)}` : ''}`}
              data-testid={`spin-bet-${s}`}
            >
              <span className="spin-spot-sym">{s === 'emblem' ? <img src={url(`${loc}_emblem`)} alt="" /> : s === 'star' ? '★' : s}</span>
              <span className="spin-spot-pays">{WHEEL_PAYS[s]} to 1</span>
              <span className="spin-spot-on">{bets[s] ? formatMoney(bets[s]!) : ' '}</span>
            </button>
          ))}
        </div>
        <div className="spin-chips" role="radiogroup" aria-label="Chip">
          {WHEEL_CHIPS.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={chip === c} className={`spin-chip ${chip === c ? 'on' : ''}`} onClick={() => setChip(c)} disabled={spinning} aria-label={`$${c} chip`} data-testid={`spin-chip-${c}`}>
              <img src={url(`chip_${c}`)} alt="" draggable={false} />
            </button>
          ))}
          <button type="button" className="mach-pill-btn" onClick={() => { setBets({}); setShown(null); }} disabled={spinning || staked === 0} data-testid="spin-clear">Clear</button>
        </div>
        <div className="spin-meters">
          {meter('credits', formatMoney(credit), 'spin-credits')}
          {meter('bet', formatMoney(staked), 'spin-bet')}
          {meter('win', formatMoney(shown?.payout ?? 0), 'spin-win')}
        </div>
      </div>
      {shownHistory.length > 0 && (
        <div className="spin-history" aria-label="Last spins, newest first" data-testid="spin-history">
          {shownHistory.map((h, i) => {
            const s = h.symbol as WheelSymbol;
            return <span key={i} className="spin-sym" style={{ background: s === 'emblem' ? EMBLEM_COLOUR[loc] : COLOUR[s], color: ink(s) }} title={symbolName(s, loc)}>{s === 'emblem' ? <img src={url(`${loc}_emblem`)} alt={symbolName(s, loc)} /> : s === 'star' ? '★' : s}</span>;
          })}
        </div>
      )}
      <p className="fineprint">
        At {locationById(loc).name}: 54 equal slots, so the odds are what you can count on the wheel. Bet on any symbols (up to {formatMoney(WHEEL_LIMITS.maxPerSymbol)} each); the symbol at the pointer
        pays its number to 1, the {EMBLEM_NAME[loc].toLowerCase()} and the star 40 to 1, and you get that bet back too. Every other bet loses. The spin is decided before the wheel turns.
        Space or Enter spins. Returns: $1 88.9% · $2 83.3% · $5 77.8% · $10 81.5% · $20 77.8% · {EMBLEM_NAME[loc]} and Star 75.9%.
      </p>
    </section>
  );
}
