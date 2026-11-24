/**
 * The video machine: Jacks or Better video poker and keno on one cabinet, picked with the switch
 * on top. No dealer; the floor's drink servers come round as at the tables. Rules live in
 * src/casino/videoPoker.ts and src/casino/keno.ts; every bet and payout goes through CasinoService.
 *
 * Art is per casino (machineThemes.ts), cut from the supplied sheets by tools/cut_machines.py.
 * Presentation only: nothing here changes a rule, a payout or the random draw.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Card } from '../../casino/blackjack';
import {
  betBlocker as vpBlocker, VP_HAND_NAMES, VP_LIMITS, VP_PAYTABLE, vpPays, vpStake, type VideoPokerResult, type VPHand, type PendingVideoPoker,
} from '../../casino/videoPoker';
import { betBlocker as kenoBlocker, KENO_BETS, KENO_MAX_SPOTS, KENO_NUMBERS, KENO_PAYS, quickPick, type KenoResult } from '../../casino/keno';
import { pendingVideoPoker } from '../../services/casinoService';
import { sound } from '../../audio/sound';
import { useGame } from '../GameContext';
import { formatMoney } from '../format';
import { celebrateWin } from './BigWin';
import { useCasinoLocation } from './casinoLocation';
import { ServerPanel, signalRoundComplete } from './ServerPanel';
import { ShownBalance } from './ShownBalance';
import { freezeBalance } from './balanceHold';
import { RANKS, SUITS } from './TableBits';
import { BALLS, MACHINE_THEMES, METER_BET, METER_WIN, PANEL_BG, pieceMeta, pieceUrl, type Piece } from './machineThemes';

const pct = (v: number, of: number) => `${(v / of) * 100}%`;

/** A 9-slice frame from a sheet, drawn with CSS border-image. */
const frame = (p: Piece, scale: number): CSSProperties => {
  const m = pieceMeta(p);
  const [t, r, b, l] = m.slice!;
  // --frame-scale (CSS) thins the borders on phones, where the board needs the width.
  const px = (v: number) => `calc(${v * scale}px * var(--frame-scale, 1))`;
  const widths = `${px(t)} ${px(r)} ${px(b)} ${px(l)}`;
  return {
    borderStyle: 'solid',
    borderWidth: widths,
    borderImage: `url(${pieceUrl(p)}) ${t} ${r} ${b} ${l} ${m.fill ? 'fill ' : ''}/ ${widths} stretch`,
    ...(m.fill ? {} : { backgroundColor: PANEL_BG[p] ?? '#0b1450', backgroundClip: 'padding-box' }),
  };
};

/** A button drawn from the sheet; the lit image shows on hover and press. */
const artButton = ([off, lit]: [Piece, Piece]): CSSProperties => {
  const m = pieceMeta(off);
  return { '--img': `url(${pieceUrl(off)})`, '--img-lit': `url(${pieceUrl(lit)})`, aspectRatio: `${m.w} / ${m.h}` } as CSSProperties;
};

/** A one-shot sparkle burst from a sheet strip. A new `play` value restarts it. */
function Sparkle({ strip, play, className }: { strip: Piece; play: number; className?: string }) {
  if (!play) return null;
  const m = pieceMeta(strip);
  return (
    <span
      key={play}
      className={`mach-sparkle ${className ?? ''}`}
      aria-hidden
      style={{ backgroundImage: `url(${pieceUrl(strip)})`, backgroundSize: `${(m.frames ?? 1) * 100}% 100%`, aspectRatio: `${m.frame_w} / ${m.h}`, '--frames': m.frames ?? 1 } as CSSProperties}
    />
  );
}

/** Meter (coins + window) with a live value in the window. */
function Meter({ kind, label, value, testId }: { kind: Piece; label: string; value: string; testId?: string }) {
  const m = pieceMeta(kind);
  const [x0, y0, x1, y1] = m.box!;
  return (
    <div className="mach-meter" style={{ aspectRatio: `${m.w} / ${m.h}`, backgroundImage: `url(${pieceUrl(kind)})` }} role="group" aria-label={`${label} ${value}`}>
      <span className="mach-meter-win" style={{ left: pct(x0, m.w), top: pct(y0, m.h), width: pct(x1 - x0, m.w), height: pct(y1 - y0, m.h) }}>
        <small>{label}</small>
        <b data-testid={testId}>{value}</b>
      </span>
    </div>
  );
}

function Marquee({ main, sign, alt }: { main: Piece; sign?: Piece; alt: string }) {
  return (
    <div className="mach-top">
      <img className="mach-marquee" src={pieceUrl(main)} alt={sign ? '' : alt} width={pieceMeta(main).w} height={pieceMeta(main).h} draggable={false} />
      {sign && <img className="mach-sign" src={pieceUrl(sign)} alt={alt} width={pieceMeta(sign).w} height={pieceMeta(sign).h} draggable={false} />}
    </div>
  );
}

// ───────────────────────── The cabinet ─────────────────────────

type MachineGame = 'videopoker' | 'keno';
const machineSession = { game: 'videopoker' as MachineGame };

export function VideoMachine() {
  const { state } = useGame();
  const pendingHand = !!pendingVideoPoker(state.career);
  const [game, setGameState] = useState<MachineGame>(pendingHand ? 'videopoker' : machineSession.game);
  const [locked, setLocked] = useState(false);
  const setGame = (g: MachineGame) => { machineSession.game = g; setGameState(g); sound.play('ui_click', { volume: 0.5 }); };
  // A video poker hand on the screen (also after a reload) keeps the machine on video poker.
  useEffect(() => { if (pendingHand) setGameState('videopoker'); }, [pendingHand]);
  const busy = locked || pendingHand;

  return (
    <section className="hub-card casino-game machine-game" data-testid="video-machine">
      <h2 className="hub-title">
        Video Poker &amp; Keno <span className="muted">one machine, two games · no dealer, drinks still come round</span>
      </h2>
      <div className="mach-switch" role="tablist" aria-label="Game on this machine">
        {(['videopoker', 'keno'] as const).map((g) => (
          <button
            key={g}
            type="button"
            role="tab"
            aria-selected={game === g}
            className={game === g ? 'on' : ''}
            onClick={() => setGame(g)}
            disabled={busy && game !== g}
            title={busy && game !== g ? (pendingHand ? 'Finish the hand on the screen first' : 'Wait for the draw to finish') : undefined}
            data-testid={`mach-${g}`}
          >
            {g === 'videopoker' ? 'Video Poker' : 'Keno'}
          </button>
        ))}
      </div>
      {game === 'videopoker' ? <VideoPoker onBusy={setLocked} /> : <Keno onBusy={setLocked} />}
    </section>
  );
}

// ───────────────────────── Video poker ─────────────────────────

/** Sheet rows are hearts, diamonds, clubs, spades; the game's suits are spades, hearts, diamonds, clubs. */
const SUIT_ROW = [3, 0, 1, 2];
const SUIT_NAME = ['spades', 'hearts', 'diamonds', 'clubs'];

function VPCard({ card, hidden, delay, atlas, back }: { card: Card; hidden?: boolean; delay: number; atlas: Piece; back: Piece }) {
  if (hidden) return <span className="vp-face vp-back" style={{ backgroundImage: `url(${pieceUrl(back)})`, animationDelay: `${delay}s` }} role="img" aria-label="Face-down card" />;
  const m = pieceMeta(atlas);
  const cols = m.cols!;
  const rows = m.rows!;
  return (
    <span
      className="vp-face"
      style={{
        backgroundImage: `url(${pieceUrl(atlas)})`,
        backgroundSize: `${cols * 100}% ${rows * 100}%`,
        backgroundPosition: `${((card.rank - 1) / (cols - 1)) * 100}% ${(SUIT_ROW[card.suit] / (rows - 1)) * 100}%`,
        animationDelay: `${delay}s`,
      }}
      role="img"
      aria-label={`${RANKS[card.rank]} of ${SUIT_NAME[card.suit]}`}
      title={`${RANKS[card.rank]}${SUITS[card.suit]}`}
    />
  );
}

function Paytable({ theme, coins, hit }: { theme: (typeof MACHINE_THEMES)['desert_palms']['vp']; coins: number; hit: VPHand | null }) {
  if ('art' in theme.paytable) {
    const p = theme.paytable.art;
    const m = pieceMeta(p);
    const [vx0, vx1] = m.values_x!;
    const rows = m.rows_y!;
    const span = rows[rows.length - 1] - rows[0];
    return (
      <div className="vp-pays art" style={{ aspectRatio: `${m.w} / ${m.h}`, backgroundImage: `url(${pieceUrl(p)})` }} data-testid="vp-paytable" role="table" aria-label="Jacks or Better paytable, pays per coin">
        <div className="vp-pays-vals" style={{ left: pct(vx0, m.w), width: pct(vx1 - vx0, m.w), top: pct(rows[0], m.h), height: pct(span, m.h) }}>
          {VP_PAYTABLE.map((row, r) => (
            <div key={row.hand} role="row" className={`vp-pays-row${hit === row.hand ? ' hit' : ''}`} style={{ height: pct(rows[r + 1] - rows[r], span) }}>
              <span role="rowheader" className="sr-only">{VP_HAND_NAMES[row.hand]}</span>
              {[1, 2, 3, 4, 5].map((c) => <span key={c} role="cell" className={c === coins ? 'col' : ''}>{vpPays(row.hand, c)}</span>)}
            </div>
          ))}
        </div>
        {hit && hit !== 'nothing' && (() => {
          const r = VP_PAYTABLE.findIndex((x) => x.hand === hit);
          return <span className="vp-pays-hit" style={{ top: pct(rows[r], m.h), height: pct(rows[r + 1] - rows[r], m.h) }} aria-hidden />;
        })()}
      </div>
    );
  }
  return (
    <div className="vp-pays framed" style={frame(theme.paytable.frame, 0.55)} data-testid="vp-paytable">
      <table aria-label="Jacks or Better paytable, pays per coin">
        <tbody>
          {VP_PAYTABLE.map((row) => (
            <tr key={row.hand} className={hit === row.hand ? 'hit' : ''}>
              <th>{VP_HAND_NAMES[row.hand]}</th>
              {[1, 2, 3, 4, 5].map((c) => <td key={c} className={c === coins ? 'col' : ''}>{vpPays(row.hand, c)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The bet survives leaving the machine for the play session. */
const vpSession = { denom: 1, coins: 5 };

function VideoPoker({ onBusy }: { onBusy: (b: boolean) => void }) {
  const { state, services, run } = useGame();
  const theme = MACHINE_THEMES[useCasinoLocation()].vp;
  const pending = pendingVideoPoker(state.career);
  const [denom, setDenomState] = useState(vpSession.denom);
  const [coins, setCoinsState] = useState(vpSession.coins);
  const setDenom = (d: number) => { vpSession.denom = d; setDenomState(d); };
  const setCoins = (c: number) => { vpSession.coins = c; setCoinsState(c); };
  const [held, setHeld] = useState<boolean[]>([false, false, false, false, false]);
  const [done, setDone] = useState<{ pending: PendingVideoPoker; result: VideoPokerResult; staked: number } | null>(null);
  const [busy, setBusyState] = useState(false);
  const setBusy = (b: boolean) => { setBusyState(b); onBusy(b); };
  const [dealKey, setDealKey] = useState(0);
  const [burst, setBurst] = useState(0);
  const timers = useRef<number[]>([]);
  useEffect(() => () => { timers.current.forEach((t) => window.clearTimeout(t)); onBusy(false); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // A hand on the screen (also after a reload) shows its own bet.
  useEffect(() => {
    if (!pending) return;
    setDenom(pending.denom);
    setCoins(pending.coins);
    setHeld([false, false, false, false, false]);
  }, [pending?.roundId]); // eslint-disable-line react-hooks/exhaustive-deps

  const block = vpBlocker(denom, coins, state.balance);
  const shownCoins = pending ? pending.coins : coins;
  const cards: Card[] | null = done ? done.result.cards : pending ? pending.cards : null;
  const revealed = !busy && !pending && !!done;
  const hitHand: VPHand | null = revealed ? done!.result.hand : null;

  const deal = async () => {
    if (busy || pending || block) return;
    setBusy(true);
    setDone(null);
    setHeld([false, false, false, false, false]);
    sound.play('ui_confirm');
    const p = await run(() => services.casino.startVideoPoker(denom, coins));
    if (p) setDealKey((k) => k + 1);
    timers.current.push(window.setTimeout(() => setBusy(false), p ? 650 : 0));
  };

  const draw = async () => {
    if (busy || !pending) return;
    setBusy(true);
    sound.play('ui_click');
    const release = freezeBalance(state.balance);
    const out = await run(() => services.casino.finishVideoPoker(pending.roundId, held));
    if (!out) {
      release();
      return setBusy(false);
    }
    setDone(out);
    setDealKey((k) => k + 1);
    timers.current.push(window.setTimeout(() => {
      release();
      setBusy(false);
      signalRoundComplete(services);
      const net = out.result.payout - out.staked;
      if (out.result.payout > 0) setBurst((b) => b + 1);
      celebrateWin(net, out.staked, { jackpot: out.result.hand === 'royal' });
      sound.play(out.result.payout >= out.staked * 25 ? 'cheer' : out.result.payout > 0 ? 'cash' : 'ui_click', { volume: 0.6 });
    }, 650));
  };

  const toggle = (i: number) => {
    if (!pending || busy) return;
    setHeld((h) => h.map((x, j) => (j === i ? !x : x)));
    sound.play('ui_click', { volume: 0.4 });
  };

  // Keyboard: 1–5 hold, Enter or Space deals / draws (only while this machine is on screen).
  const root = useRef<HTMLDivElement>(null);
  const act = useRef({ toggle, deal, draw, pending });
  act.current = { toggle, deal, draw, pending };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!root.current?.getClientRects().length) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 5) return act.current.toggle(n - 1);
      if ((e.key === 'Enter' || e.key === ' ') && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        void (act.current.pending ? act.current.draw() : act.current.deal());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const win = revealed ? done!.result.payout : 0;
  const status = pending
    ? busy ? 'Good luck' : 'Hold the cards you want, then Draw'
    : busy ? 'Drawing…'
      : done
        ? done.result.payout > 0 ? `${VP_HAND_NAMES[done.result.hand]} · WIN ${formatMoney(done.result.payout)}` : 'No win · Deal again'
        : 'Choose a coin value and coins, then Deal';

  return (
    <div className="vp-game" ref={root} data-testid="videopoker">
      <div className="table-layout side">
        <div className="vp-cab">
          <Marquee main={theme.marquee} sign={theme.sign} alt="Video Poker" />
          <Paytable theme={theme} coins={shownCoins} hit={hitHand} />
          <div className="vp-screen" style={frame(theme.screen, 0.6)}>
            <div className="vp-cards" data-testid="vp-cards">
              {[0, 1, 2, 3, 4].map((i) => {
                const isHeld = !!pending && held[i];
                return (
                  <div key={i} className="vp-slot">
                    <button
                      type="button"
                      className={`vp-cardbtn ${isHeld ? 'held' : ''}`}
                      onClick={() => toggle(i)}
                      disabled={!pending || busy}
                      aria-pressed={isHeld}
                      data-testid={`vp-card-${i}`}
                      aria-label={cards ? `Card ${i + 1}${isHeld ? ', held' : ''}. Press ${i + 1} to ${isHeld ? 'release' : 'hold'}.` : `Card ${i + 1}`}
                    >
                      {cards ? (
                        <VPCard key={`${dealKey}-${i}-${cards[i].rank}-${cards[i].suit}`} card={cards[i]} atlas={theme.cards} back={theme.back} delay={done && done.result.held[i] ? 0 : i * 0.08} />
                      ) : (
                        <VPCard card={{ rank: 1, suit: 0 }} atlas={theme.cards} back={theme.back} hidden delay={0} />
                      )}
                      {revealed && done!.result.payout > 0 && <Sparkle strip={theme.sparkles} play={burst} className="on-card" />}
                    </button>
                    <button
                      type="button"
                      className="vp-hold"
                      style={{ backgroundImage: `url(${pieceUrl(isHeld ? theme.holdOn : theme.holdOff)})`, aspectRatio: `${pieceMeta(theme.holdOff).w} / ${pieceMeta(theme.holdOff).h}` }}
                      onClick={() => toggle(i)}
                      disabled={!pending || busy}
                      aria-hidden
                      tabIndex={-1}
                    />
                  </div>
                );
              })}
            </div>
            <p className={`vp-status ${win > 0 ? 'win' : ''}`} data-testid="vp-status" aria-live="polite">{status}</p>
          </div>
          <div className="mach-meters">
            <span className="mach-credit">Credit <b><ShownBalance real={state.balance} /></b></span>
            <Meter kind={METER_BET} label="Bet" value={formatMoney(vpStake(pending ? pending.denom : denom, shownCoins))} />
            <Meter kind={METER_WIN} label="Win" value={formatMoney(win)} testId="vp-win" />
          </div>
          <div className="vp-buttons">
            <div className="mach-pills" role="radiogroup" aria-label="Coin value">
              {VP_LIMITS.denominations.map((d) => (
                <button key={d} type="button" role="radio" aria-checked={denom === d} className={denom === d ? 'on' : ''} onClick={() => setDenom(d)} disabled={!!pending || busy} data-testid={`vp-denom-${d}`}>
                  {formatMoney(d)}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="mach-art-btn vp-btn-bet"
              style={artButton(theme.bet)}
              onClick={() => setCoins(coins >= VP_LIMITS.maxCoins ? 1 : coins + 1)}
              disabled={!!pending || busy}
              aria-label={`Bet one: ${coins} coin${coins > 1 ? 's' : ''} now`}
              data-testid="vp-bet-one"
            >
              <span className="mach-btn-note">{coins} coin{coins > 1 ? 's' : ''}</span>
            </button>
            <button type="button" className="mach-pill-btn" onClick={() => setCoins(VP_LIMITS.maxCoins)} disabled={!!pending || busy || coins === VP_LIMITS.maxCoins} data-testid="vp-bet-max">Bet max</button>
            <button
              type="button"
              className="mach-art-btn vp-btn-go"
              style={artButton(pending ? theme.draw : theme.deal)}
              onClick={() => void (pending ? draw() : deal())}
              disabled={busy || (!pending && !!block)}
              aria-label={pending ? 'Draw' : `Deal for ${formatMoney(vpStake(denom, coins))}`}
              data-testid="vp-deal"
            />
          </div>
          {!pending && block && block !== 'Pick a coin value' && <p className="warn-text">{block}</p>}
        </div>
        <div className="dealer-row">
          <ServerPanel busy={busy || !!pending} />
        </div>
      </div>
      <p className="fineprint">
        Jacks or Better, full-pay 9/6. Five cards are dealt from a fresh deck. Tap a card or its HOLD button (or press 1–5) to hold it, then Draw: every card not held
        is replaced from the rest of the deck. Pays per coin as shown; a Royal Flush pays 4,000 coins on a five-coin bet (1,250 otherwise), so bet max.
        Returns about 99.5% with perfect play.
      </p>
    </div>
  );
}

// ───────────────────────── Keno ─────────────────────────

/** Picks and bet stay for the play session, like a keno ticket you replay. */
const kenoSession = { picks: [] as number[], bet: 1 as number };
const BALL_MS = 110;

function Keno({ onBusy }: { onBusy: (b: boolean) => void }) {
  const { state, services, run } = useGame();
  const theme = MACHINE_THEMES[useCasinoLocation()].keno;
  const [picks, setPicksState] = useState<number[]>(kenoSession.picks);
  const [bet, setBetState] = useState<number>(kenoSession.bet);
  const setPicks = (p: number[]) => { kenoSession.picks = p; setPicksState(p); };
  const setBet = (b: number) => { kenoSession.bet = b; setBetState(b); };
  const [result, setResult] = useState<KenoResult | null>(null);
  const [shown, setShown] = useState(0);
  const [busy, setBusyState] = useState(false);
  const setBusy = (b: boolean) => { setBusyState(b); onBusy(b); };
  const timers = useRef<number[]>([]);
  useEffect(() => () => { timers.current.forEach((t) => window.clearTimeout(t)); onBusy(false); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const block = kenoBlocker(picks, bet, state.balance);
  const picked = useMemo(() => new Set(picks), [picks]);
  const drawnSoFar = useMemo(() => new Set(result ? result.drawn.slice(0, shown) : []), [result, shown]);
  const revealing = !!result && shown < result.drawn.length;
  const caughtSoFar = picks.filter((n) => drawnSoFar.has(n)).length;

  const toggle = (n: number) => {
    if (busy) return;
    if (result && !revealing) setResult(null);
    if (picked.has(n)) setPicks(picks.filter((x) => x !== n));
    else if (picks.length < KENO_MAX_SPOTS) setPicks([...picks, n].sort((a, b) => a - b));
    else return;
    sound.play('ui_click', { volume: 0.4 });
  };

  const play = async () => {
    if (busy || block) return;
    setBusy(true);
    setResult(null);
    setShown(0);
    sound.play('ui_confirm');
    // Paid at once; the bank on screen waits until the last ball is out.
    const release = freezeBalance(state.balance - bet);
    const out = await run(() => services.casino.playKeno(picks, bet));
    if (!out) {
      release();
      return setBusy(false);
    }
    const r = out.result;
    setResult(r);
    const ticket = new Set(r.picks);
    r.drawn.forEach((n, i) => timers.current.push(window.setTimeout(() => {
      setShown(i + 1);
      if (ticket.has(n)) sound.play('meter_set', { volume: 0.5 });
    }, (i + 1) * BALL_MS)));
    timers.current.push(window.setTimeout(() => {
      release();
      setBusy(false);
      signalRoundComplete(services);
      celebrateWin(r.payout - bet, bet);
      sound.play(r.pays >= 100 ? 'cheer' : r.payout > 0 ? 'cash' : 'ui_click', { volume: 0.6 });
    }, (r.drawn.length + 1) * BALL_MS + 150));
  };

  const spots = picks.length;
  const card = spots ? Object.entries(KENO_PAYS[spots]).map(([k, m]) => ({ catch: Number(k), pays: m })).sort((a, b) => b.catch - a.catch) : [];
  const finished = !!result && !revealing;
  const win = finished ? result!.payout : 0;
  const status = !result
    ? spots ? `${spots} spot${spots > 1 ? 's' : ''} picked · press Draw` : 'Pick 1 to 10 numbers'
    : revealing
      ? `Drawing… ${shown} of 20 · caught ${caughtSoFar}`
      : result.payout > 0 ? `Caught ${result.caught.length} of ${spots} · WIN ${formatMoney(result.payout)}` : `Caught ${result.caught.length} of ${spots} · no win`;
  const bm = pieceMeta(BALLS);
  const cols = bm.cols!;
  const rows = bm.rows!;

  return (
    <div className="keno-game" data-testid="keno">
      <div className="table-layout side">
        <div className="keno-board">
          <Marquee main={theme.marquee} sign={theme.sign} alt="Keno" />
          <div className={`keno-frame${theme.board ? ' framed' : ''}`} style={theme.board ? frame(theme.board, 0.55) : undefined}>
            <div className="keno-grid" role="group" aria-label="Keno numbers 1 to 80" data-testid="keno-grid">
              {Array.from({ length: KENO_NUMBERS }, (_, i) => i + 1).map((n) => {
                const isPick = picked.has(n);
                const isDrawn = drawnSoFar.has(n);
                const hit = isPick && isDrawn;
                return (
                  <button
                    key={n}
                    type="button"
                    className={`keno-n${isPick ? ' pick' : ''}${isDrawn ? ' drawn' : ''}${hit ? ' hit' : ''}`}
                    style={{
                      backgroundImage: `url(${pieceUrl(BALLS)})`,
                      backgroundSize: `${cols * 100}% ${rows * 100}%`,
                      backgroundPosition: `${(((n - 1) % cols) / (cols - 1)) * 100}% ${(Math.floor((n - 1) / cols) / (rows - 1)) * 100}%`,
                    }}
                    onClick={() => toggle(n)}
                    disabled={busy}
                    aria-pressed={isPick}
                    aria-label={`${n}${isPick ? ', picked' : ''}${isDrawn ? ', drawn' : ''}`}
                    data-testid={`keno-n-${n}`}
                  >
                    {hit && <Sparkle strip={theme.sparkles} play={1} className="on-ball" />}
                  </button>
                );
              })}
            </div>
          </div>
          <p
            className={`keno-status ${finished && result!.payout > 0 ? 'win' : ''}${theme.band ? ' banded' : ''}`}
            style={theme.band ? { backgroundImage: `url(${pieceUrl(theme.band)})` } : undefined}
            data-testid="keno-status"
            aria-live="polite"
          >
            <span>{status}</span>
          </p>
          <div className="keno-balls" aria-label="Balls drawn" data-testid="keno-balls">
            {result?.drawn.slice(0, shown).map((n, i) => (
              <span key={i} className={`keno-ball${picked.has(n) ? ' hit' : ''}`}>{n}</span>
            ))}
          </div>
          <div className="mach-meters">
            <span className="mach-credit">Credit <b><ShownBalance real={state.balance} /></b></span>
            <Meter kind={METER_BET} label="Bet" value={formatMoney(bet)} />
            <Meter kind={METER_WIN} label="Win" value={formatMoney(win)} testId="keno-win" />
          </div>
        </div>
        <div className="keno-side">
          <div className="keno-card" style={frame(theme.paycard, 0.6)} data-testid="keno-paycard">
            <p className="keno-card-title">{spots ? `${spots}-spot pay card` : 'Pay card'}</p>
            {spots ? (
              <table>
                <thead><tr><th>Catch</th><th>Pays</th></tr></thead>
                <tbody>
                  {card.map((r) => (
                    <tr key={r.catch} className={finished && result!.caught.length === r.catch ? 'hit' : ''}>
                      <td>{r.catch}</td>
                      <td>{formatMoney(r.pays * bet)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="keno-card-empty">Pick numbers to see what they pay.</p>}
          </div>
          <div className="mach-pills" role="radiogroup" aria-label="Bet per game">
            {KENO_BETS.map((b) => (
              <button key={b} type="button" role="radio" aria-checked={bet === b} className={bet === b ? 'on' : ''} onClick={() => setBet(b)} disabled={busy} data-testid={`keno-bet-${b}`}>{formatMoney(b)}</button>
            ))}
          </div>
          <div className="keno-actions">
            <button type="button" className="mach-art-btn keno-btn" style={artButton(theme.draw)} onClick={() => void play()} disabled={busy || !!block} aria-label={`Draw: play for ${formatMoney(bet)}`} data-testid="keno-play" />
            <button type="button" className="mach-art-btn keno-btn" style={artButton(theme.clear)} onClick={() => { setResult(null); setPicks([]); }} disabled={busy || !spots} aria-label="Clear the ticket" data-testid="keno-clear" />
          </div>
          <button type="button" className="mach-pill-btn keno-quick" onClick={() => { setResult(null); setPicks(quickPick(spots || 5)); sound.play('ui_click', { volume: 0.5 }); }} disabled={busy} data-testid="keno-quick">
            Quick pick {spots || 5}
          </button>
          {block && spots > 0 && <p className="warn-text">{block}</p>}
          <ServerPanel busy={busy} />
        </div>
      </div>
      <p className="fineprint">
        Pick 1 to 10 numbers and a bet, then Draw: twenty of the eighty balls come out and the pay card for your number of spots pays on how many you catch.
        Your ticket stays picked for the next game. A 10-spot also pays if you catch none.
      </p>
    </div>
  );
}
