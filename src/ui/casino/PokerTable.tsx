/**
 * The private poker table, played like a social poker app: opponents act one at a time,
 * pre-action boxes, quick bet sizes, squeeze-to-peek, a shot clock with Time Bank, Run It
 * Twice, straddles, rabbit hunting, hand history with share, and things to throw at the
 * regulars. Flick your cards up to fold, flick the chips up to bet, double-tap the felt to
 * check. Presentation only: every chip moves through PokerService.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import type { Card } from '../../casino/blackjack';
import { legal, pot, rabbit, variantOf, type HoldemState } from '../../casino/poker/holdem';
import type { PokerRoom as Room } from '../../casino/poker/rooms';
import { HERO, pokerTable, shareText, TIME_BANKS, type ChatLine, type Frame, type PokerTable } from '../../services/pokerService';
import { useGame } from '../GameContext';
import { formatMoney } from '../format';
import { BetChip, PlayingCard } from './TableBits';
import { SpriteFrame } from '../story/Sprite';
import { portraitKey } from '../../story/sprites';
import { RYAN_ID } from '../../story/cast';
import { appearanceOf } from '../../story/appearance';
import { sound, type Sfx } from '../../audio/sound';

/** The sound for a line of the table log. */
function sfxForLine(l: string): Sfx | null {
  if (/\(all in\)/.test(l)) return 'all_in';
  if (/ folds$/.test(l)) return 'fold';
  if (/ checks$/.test(l)) return 'knock';
  if (/ (calls|bets|raises to|completes to) /.test(l)) return 'chips_bet';
  if (/ (posts|brings it in|straddles)|^Antes/.test(l)) return 'chip';
  if (/^Running it twice/.test(l)) return 'shuffle';
  if (/ wins \$/.test(l) || /^7-2!/.test(l)) return 'chips_pot';
  return null;
}

const SEAT_POS = ['s-hero', 's-left', 's-topleft', 's-topright', 's-right'];

type Speed = 'fast' | 'normal' | 'slow';
interface Settings { speed: Speed; clock: 0 | 20 | 30; autoPeek: boolean }
const DEFAULTS: Settings = { speed: 'normal', clock: 20, autoPeek: false };
const STEP_MS: Record<Speed, number> = { fast: 260, normal: 560, slow: 950 };
const SETTINGS_KEY = 'wtg.poker.settings';

function useSettings(): [Settings, (s: Partial<Settings>) => void] {
  const [s, setS] = useState<Settings>(() => {
    try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') }; } catch { return DEFAULTS; }
  });
  const set = useCallback((p: Partial<Settings>) => setS((prev) => {
    const next = { ...prev, ...p };
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch { /* storage unavailable: settings last this visit */ }
    return next;
  }), []);
  return [s, set];
}

type PreAction = 'checkfold' | 'check' | 'callany' | null;

const THROWABLES = [
  { id: 'tomato', icon: '🍅', label: 'Tomato' },
  { id: 'rose', icon: '🌹', label: 'Rose' },
  { id: 'egg', icon: '🥚', label: 'Egg' },
  { id: 'chicken', icon: '🐔', label: 'Rubber chicken' },
] as const;
const REACTIONS: Record<(typeof THROWABLES)[number]['id'], string[]> = {
  tomato: ['Hey! This is linen!', 'I\'ll remember that.', 'Real mature.'],
  rose: ['Oh! For me?', 'Flattery won\'t save your stack.', 'Charming. Still raising.'],
  egg: ['Was that an EGG?', 'I\'m calling the floor.', 'You\'re lucky I like you.'],
  chicken: ['*squeak*', 'Is that a rubber chicken?', 'I respect the commitment.'],
};

/** Plays back the regulars' frames one at a time, then settles on the saved state. */
function usePlayback(saved: HoldemState | undefined, speed: Speed) {
  const [queue, setQueue] = useState<Frame[]>([]);
  const [shown, setShown] = useState<Frame | null>(null);
  useEffect(() => {
    if (!queue.length) { setShown(null); return; }
    setShown(queue[0]);
    const t = window.setTimeout(() => setQueue((q) => q.slice(1)), STEP_MS[speed]);
    return () => window.clearTimeout(t);
  }, [queue, speed]);
  const play = useCallback((frames: Frame[]) => setQueue(frames), []);
  const skip = useCallback(() => setQueue([]), []);
  return { view: shown?.state ?? saved, bubble: shown?.chat, playing: queue.length > 0, play, skip };
}

export function PokerTableView({ room }: { room: Room }) {
  const { state, services, run, notify } = useGame();
  const t = pokerTable(state.career);
  const [settings, setSettings] = useSettings();
  const { view, bubble, playing, play, skip } = usePlayback(t?.state, settings.speed);
  const [buyIn, setBuyIn] = useState(Math.min(room.buyIn.max, Math.max(room.buyIn.min, room.buyIn.min * 2)));
  const [rules, setRules] = useState({ runTwice: true, doubleBoard: false, sevenDeuce: room.variant === 'holdem' });
  const [raise, setRaise] = useState(0);
  const [pre, setPre] = useState<PreAction>(null);
  const [peeked, setPeeked] = useState<number>(-1);
  const [rabbitCards, setRabbitCards] = useState<Card[] | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [throwAt, setThrowAt] = useState<number | null>(null);
  const [flying, setFlying] = useState<{ seat: number; icon: string; key: number } | null>(null);
  const [reaction, setReaction] = useState<ChatLine | null>(null);
  const [clock, setClock] = useState<number | null>(null);
  const lastTap = useRef(0);

  const s = view;
  const myTurn = !!s && !playing && !s.result && s.toAct === HERO && !s.awaitRunout;
  const L = s && myTurn ? legal(s, HERO) : null;
  const hero = s?.seats[HERO];
  const heroLive = !!hero && hero.inHand && !hero.folded;
  const stud = !!s && variantOf(s) === 'stud';
  const handNo = s?.handNo ?? 0;
  const peekOn = settings.autoPeek || peeked === handNo;

  useEffect(() => { if (L?.maxTo) setRaise(L.minTo); }, [L?.minTo, L?.maxTo, handNo]);

  // Table sounds: whatever changed since the last thing shown.
  const heard = useRef<{ hand: number; log: number; board: number; board2: number } | null>(null);
  useEffect(() => {
    if (!s) return;
    const prev = heard.current;
    heard.current = { hand: s.handNo, log: s.log.length, board: s.board.length, board2: s.board2?.length ?? 0 };
    if (!prev) return;
    if (prev.hand !== s.handNo) {
      sound.play('shuffle', { volume: 0.6 });
      for (let k = 0; k < 4; k++) window.setTimeout(() => sound.play('card_deal', { volume: 0.5 }), 260 + k * 90);
      return;
    }
    const fresh = s.log.slice(prev.log);
    const played = new Set<Sfx>();
    for (const l of fresh) { const fx = sfxForLine(l); if (fx && !played.has(fx)) { played.add(fx); sound.play(fx, { volume: 0.7 }); } }
    if (s.board.length > prev.board || (s.board2?.length ?? 0) > prev.board2) sound.play('card_flip', { volume: 0.6 });
    if (s.result && fresh.some((l) => / wins \$/.test(l))) {
      const mine = s.result.wins.some((w) => w.seat === HERO && w.amount > 0);
      window.setTimeout(() => sound.play(mine ? 'cash' : 'ui_back', { volume: 0.6 }), 350);
    }
  }, [s]);
  useEffect(() => { setRabbitCards(null); setPre(null); }, [handNo]);

  // Every response from the table comes back with frames to replay.
  const after = useCallback(<T extends { frames?: Frame[] }>(o: T | undefined) => { if (o?.frames?.length) play(o.frames); return o; }, [play]);
  const doAct = useCallback(async (a: Parameters<typeof services.poker.act>[0]) => { setClock(null); after(await run(() => services.poker.act(a))); }, [after, run, services]);

  // Pre-actions fire as soon as it's Ryan's turn.
  useEffect(() => {
    if (!myTurn || !L || !pre) return;
    const p = pre;
    setPre(null);
    if (p === 'checkfold') void doAct(L.check ? { type: 'check' } : { type: 'fold' });
    else if (p === 'check' && L.check) void doAct({ type: 'check' });
    else if (p === 'callany') void doAct(L.toCall > 0 ? { type: 'call' } : { type: 'check' });
  }, [myTurn, L, pre, doAct]);

  // Shot clock.
  useEffect(() => {
    if (!myTurn || !settings.clock) { setClock(null); return; }
    setClock(settings.clock);
  }, [myTurn, settings.clock, handNo, s?.street, s?.currentBet]);
  useEffect(() => {
    if (clock === null) return;
    if (clock <= 0) {
      setClock(null);
      if (L) void doAct(L.check ? { type: 'check' } : { type: 'fold' });
      return;
    }
    if (clock === 5) sound.play('clock_warn', { volume: 0.6 });
    else if (clock < 5) sound.play('clock_tick', { volume: 0.6 });
    const id = window.setTimeout(() => setClock((c) => (c === null ? null : c - 1)), 1000);
    return () => window.clearTimeout(id);
  }, [clock, L, doAct]);

  const raiseTo = L?.maxTo ? Math.min(Math.max(raise, L.minTo), L.maxTo) : 0;
  const presets = useMemo(() => {
    if (!s || !L?.maxTo || L.minTo === L.maxTo) return [];
    const p = pot(s) + L.toCall;
    const at = (frac: number) => Math.min(L.maxTo, Math.max(L.minTo, s.currentBet + Math.round(p * frac)));
    return [
      { label: 'Min', to: L.minTo }, { label: '½ Pot', to: at(0.5) }, { label: '¾ Pot', to: at(0.75) },
      { label: 'Pot', to: at(1) }, { label: 'All-in', to: L.maxTo },
    ];
  }, [s, L]);

  // Gestures: flick cards up to fold; flick chips up to bet; double-tap the felt to check.
  const flick = useRef<{ y: number; t: number } | null>(null);
  const down = (e: RPointerEvent) => { flick.current = { y: e.clientY, t: performance.now() }; };
  const flicked = (e: RPointerEvent) => {
    const f = flick.current;
    flick.current = null;
    return !!f && f.y - e.clientY > 50 && performance.now() - f.t < 450;
  };
  const onCardsUp = (e: RPointerEvent) => {
    if (flicked(e)) { if (L?.fold) void doAct({ type: 'fold' }); else if (L?.check) void doAct({ type: 'check' }); return; }
    if (!peekOn) sound.play('card_flip', { volume: 0.5 });
    setPeeked(peekOn ? -1 : handNo);
  };
  const onChipsUp = (e: RPointerEvent) => {
    if (!L) return;
    if (flicked(e)) void doAct(L.maxTo ? { type: 'raise', to: raiseTo } : L.toCall ? { type: 'call' } : { type: 'check' });
  };
  const onFeltTap = () => {
    const now = performance.now();
    if (now - lastTap.current < 320 && L?.check) void doAct({ type: 'check' });
    lastTap.current = now;
  };

  const throwThing = (seat: number, item: (typeof THROWABLES)[number]) => {
    setThrowAt(null);
    setFlying({ seat, icon: item.icon, key: Date.now() });
    sound.play('throw', { volume: 0.6 });
    window.setTimeout(() => {
      setFlying(null);
      sound.play(item.id === 'chicken' ? 'squeak' : item.id === 'rose' ? 'ui_confirm' : 'splat', { volume: 0.7 });
      const lines = REACTIONS[item.id];
      setReaction({ seat, text: lines[(Date.now() >> 4) % lines.length] });
      window.setTimeout(() => setReaction(null), 2600);
    }, 650);
  };

  if (!room.open) return null;

  if (!t || !s || !hero) {
    return (
      <section className="hub-card poker-room" data-testid="poker-lobby">
        <h2 className="hub-title">{room.name} · {room.variantName}</h2>
        <p className="muted">{room.variant === 'stud' ? `Antes ${formatMoney(Math.max(1, Math.round(room.bb / 5)))}, bring-in ${formatMoney(room.sb)}, bets ${formatMoney(room.bb)}/${formatMoney(room.bb * 2)}` : `Blinds ${formatMoney(room.sb)}/${formatMoney(room.bb)}${room.variant === 'omaha8' ? ', pot limit, high and low split the pot' : ''}`} · buy in {formatMoney(room.buyIn.min)}–{formatMoney(room.buyIn.max)}. Same four regulars every night.</p>
        <ul className="poker-regulars">{room.regulars.map((r) => <li key={r.id}><span className="poker-av" style={{ background: r.color }}>{r.short[0]}</span><b>{r.name}</b>: {r.bio}</li>)}</ul>
        <fieldset className="poker-rules">
          <legend>Table rules</legend>
          {room.variant !== 'stud' && <label><input type="checkbox" checked={rules.runTwice} onChange={(e) => setRules({ ...rules, runTwice: e.target.checked })} data-testid="rule-rit" /> Run It Twice</label>}
          {room.variant !== 'stud' && <label><input type="checkbox" checked={rules.doubleBoard} onChange={(e) => setRules({ ...rules, doubleBoard: e.target.checked })} data-testid="rule-double" /> Double Board</label>}
          {room.variant === 'holdem' && <label><input type="checkbox" checked={rules.sevenDeuce} onChange={(e) => setRules({ ...rules, sevenDeuce: e.target.checked })} data-testid="rule-72" /> 7-2 Game ({formatMoney(room.bb)} bounty)</label>}
        </fieldset>
        <SettingsRow settings={settings} set={setSettings} />
        <div className="row">
          <label>Buy in <input type="range" min={room.buyIn.min} max={room.buyIn.max} step={50} value={buyIn} onChange={(e) => setBuyIn(Number(e.target.value))} data-testid="poker-buyin" /> <b>{formatMoney(buyIn)}</b></label>
          <button className="btn primary" onClick={async () => after(await run(() => services.poker.sit(buyIn, { runTwice: rules.runTwice, doubleBoard: rules.doubleBoard, sevenDeuce: rules.sevenDeuce ? room.bb : 0 })))} data-testid="poker-sit">Take a seat</button>
        </div>
      </section>
    );
  }

  const over = !!s.result && !playing;
  const shown = !!s.result && s.result.shown;
  const winners = new Set(over ? s.result?.wins.map((w) => w.seat) : []);
  const latest = bubble ?? null;
  const lastChat = !playing ? t.chat : [];
  const canRabbit = over && !shown && !stud && s.board.length < 5 && !rabbitCards;
  const history = t.history ?? [];

  return (
    <section className="hub-card poker-room" data-testid="poker-table">
      <div className="poker-top">
        <span className="pill">{room.variantName}</span>
        {t.rules?.runTwice && <span className="pill">Run It Twice</span>}
        {t.rules?.doubleBoard && <span className="pill">Double Board</span>}
        {!!t.rules?.sevenDeuce && <span className="pill">7-2 Game</span>}
        <span className="poker-top-r">
          {playing && <button className="btn small ghost" onClick={skip} data-testid="poker-skip">Skip ▸▸</button>}
          <button className="btn small ghost" onClick={() => setShowHistory(!showHistory)} data-testid="poker-history-btn">History ({history.length})</button>
        </span>
      </div>
      <div className="poker-felt" onClick={onFeltTap}>
        <div className="poker-center">
          <div className={`poker-board ${stud ? 'stud' : ''}`}>
            {s.board.map((c, i) => <PlayingCard key={`${handNo}-b${i}`} card={c} i={i} />)}
            {rabbitCards?.map((c, i) => <span key={`r${i}`} className="pk-rabbit"><PlayingCard card={c} i={i} /></span>)}
          </div>
          {s.board2 && s.board2.length > 0 && <div className="poker-board b2">{s.board2.map((c, i) => <PlayingCard key={`${handNo}-c${i}`} card={c} i={i} />)}</div>}
          <p className="poker-pot" data-testid="poker-pot">{over ? s.log.filter((l) => / wins /.test(l)).slice(-1)[0] ?? s.log[s.log.length - 1] : `Pot ${formatMoney(pot(s))}`}</p>
          {over && s.bounty && <p className="poker-bounty">7-2! {s.seats[s.bounty.seat].name} collects {formatMoney(s.bounty.amount)}</p>}
        </div>
        {s.seats.map((x, i) => {
          const reg = i === HERO ? null : room.regulars[i - 1];
          const reveal = i === HERO ? peekOn || !!s.result : shown && over && !x.folded && x.inHand;
          const said = reaction?.seat === i ? reaction : latest?.seat === i ? latest : lastChat.filter((m) => m.seat === i).slice(-1)[0];
          return (
            <div key={x.id} className={`poker-seat ${SEAT_POS[i]} ${x.folded ? 'folded' : ''} ${s.toAct === i && !over ? 'acting' : ''} ${winners.has(i) ? 'won' : ''}`} data-testid={`poker-seat-${i}`}>
              {reg ? (
                <button type="button" className="poker-av" style={{ background: reg.color }} onClick={(e) => { e.stopPropagation(); setThrowAt(throwAt === i ? null : i); }} title={`Throw something at ${reg.short}`}>{reg.short[0]}</button>
              ) : (
                <span className={`poker-av hero-av ${clock !== null ? 'timed' : ''}`} style={clock !== null && settings.clock ? { ['--clock' as string]: `${(clock / settings.clock) * 360}deg` } : undefined}>
                  <SpriteFrame who={RYAN_ID} frame={portraitKey(RYAN_ID, 'neutral', appearanceOf(state.career))} height={40} />
                </span>
              )}
              <div className="poker-name">{reg?.short ?? 'You'}{s.button === i && <span className="poker-btn" title="Dealer button">D</span>}{i === HERO && clock !== null && <span className="poker-clock" data-testid="poker-clock">{clock}s</span>}</div>
              <div className="poker-stack">{formatMoney(x.stack)}{x.allIn && !s.result ? ' · all in' : ''}</div>
              <div
                className={`poker-hole n${x.hole.length} ${i === HERO ? 'mine' : ''} ${i === HERO && !peekOn ? 'squeeze' : ''}`}
                onPointerDown={i === HERO ? down : undefined}
                onPointerUp={i === HERO ? onCardsUp : undefined}
                onClick={(e) => i === HERO && e.stopPropagation()}
                data-testid={i === HERO ? 'poker-mycards' : undefined}
                title={i === HERO ? (peekOn ? 'Flick up to fold' : 'Tap to peek · flick up to fold') : undefined}
              >
                {x.inHand && x.hole.map((c, k) => (
                  <span key={`${handNo}-${k}`} className={stud && x.up?.[k] ? 'pk-up' : stud ? 'pk-down' : ''}>
                    <PlayingCard card={c} i={k} hidden={!reveal && !(stud && x.up?.[k])} />
                  </span>
                ))}
              </div>
              {x.bet > 0 && <BetChip amount={x.bet} className={`poker-bet from-${SEAT_POS[i]}`} />}
              {said && <p className="poker-bubble" key={said.text}>{said.text}</p>}
              {throwAt === i && (
                <div className="poker-throw" onClick={(e) => e.stopPropagation()}>
                  {THROWABLES.map((it) => <button key={it.id} type="button" onClick={() => throwThing(i, it)} title={it.label} data-testid={`throw-${it.id}`}>{it.icon}</button>)}
                </div>
              )}
              {flying?.seat === i && <span key={flying.key} className={`poker-fly to-${SEAT_POS[i]}`}>{flying.icon}</span>}
            </div>
          );
        })}
      </div>

      {s.awaitRunout && heroLive && !playing && (
        <div className="poker-rit" role="dialog" data-testid="poker-rit">
          <b>Everyone's all in.</b> Run it twice? Each board takes half of every pot. Everyone has to agree.
          <div className="row">
            <button className="btn" onClick={async () => { const o = await run(() => services.poker.runout(false)); if (o) play(o.frames); }} data-testid="rit-once">Run it once</button>
            <button className="btn primary" onClick={async () => { const o = await run(() => services.poker.runout(true)); if (o) { play(o.frames); if (!o.agreed) notify({ kind: 'info', title: 'Somebody wanted it once. Running it once.' }); } }} data-testid="rit-twice">Run it twice</button>
          </div>
        </div>
      )}

      <div className="row poker-actions">
        {myTurn && L && (
          <>
            {L.fold && <button className="btn" onClick={() => doAct({ type: 'fold' })} data-testid="poker-fold">Fold</button>}
            {L.check && <button className="btn" onClick={() => doAct({ type: 'check' })} data-testid="poker-check">Check</button>}
            {L.toCall > 0 && <button className="btn primary" onClick={() => doAct({ type: 'call' })} data-testid="poker-call">Call {formatMoney(L.toCall)}</button>}
            {L.maxTo > 0 && (
              <span className="poker-raise">
                {presets.length > 0 && <span className="poker-presets">{presets.map((p) => <button key={p.label} className={`btn small ${raiseTo === p.to ? 'on' : ''}`} onClick={() => setRaise(p.to)} data-testid={`preset-${p.label}`}>{p.label}</button>)}</span>}
                {L.maxTo > L.minTo && <input type="range" min={L.minTo} max={L.maxTo} step={1} value={raiseTo} onChange={(e) => setRaise(Number(e.target.value))} aria-label="Raise to" />}
                <button className="btn primary" onClick={() => doAct({ type: 'raise', to: raiseTo })} data-testid="poker-raise">
                  {raiseTo >= hero.bet + hero.stack ? 'All in' : s.currentBet === 0 ? 'Bet' : 'Raise to'} {formatMoney(raiseTo)}
                </button>
                <span className="poker-flickchips" onPointerDown={down} onPointerUp={onChipsUp} onClick={(e) => e.stopPropagation()} title="Flick up to bet" data-testid="poker-flick">🪙</span>
              </span>
            )}
            {settings.clock > 0 && (
              <button className="btn small ghost" disabled={(t.timeBank ?? TIME_BANKS) <= 0} onClick={async () => { const o = await run(() => services.poker.useTimeBank()); if (o) setClock((c) => (c ?? 0) + 10); }} data-testid="poker-timebank">
                ⏱ +10s ({t.timeBank ?? TIME_BANKS})
              </button>
            )}
          </>
        )}
        {!myTurn && !s.result && heroLive && !hero.allIn && !s.awaitRunout && (
          <span className="poker-pre" data-testid="poker-pre">
            {([['checkfold', 'Check/Fold'], ['check', 'Check'], ['callany', 'Call Any']] as const).map(([id, label]) => (
              <label key={id}><input type="checkbox" checked={pre === id} onChange={(e) => setPre(e.target.checked ? id : null)} data-testid={`pre-${id}`} /> {label}</label>
            ))}
          </span>
        )}
        {over && hero.stack > 0 && <button className="btn primary" onClick={async () => after(await run(() => services.poker.nextHand()))} data-testid="poker-next">Next hand</button>}
        {canRabbit && <button className="btn ghost" onClick={() => setRabbitCards(rabbit(s))} data-testid="poker-rabbit">🐇 Rabbit hunt</button>}
        {over && hero.stack < room.buyIn.max && (
          <button className="btn" onClick={() => run(() => services.poker.rebuy(room.buyIn.max - hero.stack))} data-testid="poker-rebuy">Top up to {formatMoney(room.buyIn.max)}</button>
        )}
        {room.variant !== 'stud' && (
          <label className="poker-straddle"><input type="checkbox" checked={!!t.straddle} onChange={(e) => run(() => services.poker.setStraddle(e.target.checked))} data-testid="poker-straddle" /> Straddle when under the gun</label>
        )}
        <button className="btn ghost" onClick={() => run(() => services.poker.leave())} data-testid="poker-leave">{s.result ? 'Cash out' : 'Fold and cash out'}</button>
      </div>
      <SettingsRow settings={settings} set={setSettings} compact />

      {showHistory && (
        <div className="poker-history" data-testid="poker-history">
          {history.length === 0 && <p className="muted">No hands yet.</p>}
          {[...history].reverse().map((h) => (
            <div key={h.handNo} className="ph-row">
              <span className="ph-no">#{h.handNo}</span>
              <span className="ph-cards">{h.hole.map((c, k) => <MiniCard key={k} c={c} />)}</span>
              <span className="ph-board">{h.board.map((c, k) => <MiniCard key={k} c={c} />)}</span>
              <b className={h.net >= 0 ? 'pos' : 'neg'}>{h.net >= 0 ? '+' : ''}{formatMoney(h.net)}</b>
              <button className="btn small ghost" onClick={() => { try { void navigator.clipboard.writeText(shareText(h, room.name)); notify({ kind: 'info', title: 'Hand copied' }); } catch { notify({ kind: 'info', title: "Couldn't copy here" }); } }}>Share</button>
            </div>
          ))}
        </div>
      )}
      <ul className="craps-log poker-log" aria-live="polite">{[...s.log].reverse().slice(0, 5).map((l, i) => <li key={i} className={i === 0 ? 'latest' : ''}>{l}</li>)}</ul>
      <p className="fineprint">Tap your cards to peek, flick them up to fold. Flick 🪙 up to bet. Double-tap the felt to check. Tap a regular to throw something. Bought in: {formatMoney(t.bought)}. In-game money only.</p>
    </section>
  );
}

function MiniCard({ c }: { c: Card }) {
  const red = c.suit === 1 || c.suit === 2;
  return <span className={`mini-card ${red ? 'red' : ''}`}>{['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'][c.rank]}{['♠', '♥', '♦', '♣'][c.suit]}</span>;
}

function SettingsRow({ settings, set, compact }: { settings: Settings; set: (s: Partial<Settings>) => void; compact?: boolean }) {
  return (
    <div className={`poker-settings ${compact ? 'compact' : ''}`}>
      <label>Speed <select value={settings.speed} onChange={(e) => set({ speed: e.target.value as Speed })} data-testid="poker-speed"><option value="fast">Fast</option><option value="normal">Normal</option><option value="slow">Slow</option></select></label>
      <label>Shot clock <select value={settings.clock} onChange={(e) => set({ clock: Number(e.target.value) as Settings['clock'] })} data-testid="poker-clock-setting"><option value={0}>Off</option><option value={20}>20s</option><option value={30}>30s</option></select></label>
      <label><input type="checkbox" checked={settings.autoPeek} onChange={(e) => set({ autoPeek: e.target.checked })} /> Show my cards automatically</label>
    </div>
  );
}

export type { PokerTable };
