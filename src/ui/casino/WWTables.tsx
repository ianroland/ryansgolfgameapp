/**
 * Baccarat (dealer: Waifu) and Three Card Poker (dealer: Winston).
 *
 * Rendering layers, back to front: dealer pose → table felt → table props (chip
 * tray, shoe) → cards → bet chips → labels. Nothing is baked into another layer,
 * so a card or chip is only ever drawn once. Every rule, wager and payout lives
 * in src/casino/baccarat.ts, src/casino/threeCard.ts and CasinoService; this
 * file only draws them. Dealer lines are drafts (src/casino/wwDialogue.ts).
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  BACCARAT_LIMITS, beadRoad, betBlocker as baccaratBlocker, CUT_FROM_END, totalStaked,
  type BaccaratBets, type BaccaratSpot,
} from '../../casino/baccarat';
import { RANK3_NAMES, THREE_CARD_LIMITS, betBlocker as threeCardBlocker, type ThreeCardResult, type PendingThreeCard } from '../../casino/threeCard';
import {
  pickLine, WAIFU_FACE, WAIFU_POSE, WINSTON_FACE, WINSTON_POSE,
  type ChatLevel, type WaifuEvent, type WinstonEvent, type WWDealer, type WWEvent, type WWLine,
} from '../../casino/wwDialogue';
import { cryptoInt } from '../../casino/random';
import { baccaratHistory, baccaratShoe, pendingThreeCard, type BaccaratRound } from '../../services/casinoService';
import { sound } from '../../audio/sound';
import { useGame } from '../GameContext';
import { formatMoney } from '../format';
import { celebrateWin } from './BigWin';
import { BetChip, PlayingCard } from './TableBits';
import meta from '../../assets/casino/ww/ww_meta.json';
import { TierChip, TipTray, type TipReaction } from './Tipping';

const urls = import.meta.glob<string>('../../assets/casino/ww/*.png', { eager: true, query: '?url', import: 'default' });
export const wwArt = (name: string) => urls[`../../assets/casino/ww/${name}.png`];

type Size = [number, number];
const META = meta as unknown as Record<string, Size> & {
  anchors: Record<string, number>;
  waifu_faces: { cell: Size; faces: string[] };
  winston_faces: { cell: Size; faces: string[] };
};

const CHIPS = [5, 10, 25, 100, 500];
export const WW_NAMES: Record<WWDealer, string> = { waifu: 'Waifu', winston: 'Winston' };

// ───────────────────────── Shared stage ─────────────────────────

/** Room above the felt for the dealer, in felt pixels; how big the dealer is drawn; where the dealer's desk line meets the felt. */
const DEALER_ROOM = 172;
const DEALER_SCALE = 0.78;
const DESK_Y = 44;

const pct = (v: number, of: number) => `${(v / of) * 100}%`;
/** A box on a felt image, as CSS percentages of the felt. */
const onFelt = ([fw, fh]: Size, x: number, y: number, w?: number, h?: number) => ({
  left: pct(x, fw), top: pct(y, fh), ...(w !== undefined ? { width: pct(w, fw) } : {}), ...(h !== undefined ? { height: pct(h, fh) } : {}),
});

function WWStage({ who, pose, felt, shoe, children, testId }: { who: WWDealer; pose: string; felt: string; shoe: string; children: ReactNode; testId: string }) {
  const size = META[felt];
  const [fw, fh] = size;
  const total = DEALER_ROOM + fh;
  const name = `${who}_${pose}`;
  const [pw, ph] = META[name];
  const ax = META.anchors[name];
  const [tw] = META.chip_tray;
  const [sw] = META[shoe];
  return (
    <div className="ww-table" style={{ aspectRatio: `${fw} / ${total}` }} data-testid={testId}>
      <img
        className="ww-dealer"
        key={name}
        src={wwArt(name)}
        alt={`${WW_NAMES[who]}, the dealer`}
        draggable={false}
        data-pose={pose}
        style={{ left: pct(fw / 2 - ax * DEALER_SCALE, fw), top: pct(DEALER_ROOM + DESK_Y - ph * DEALER_SCALE, total), width: pct(pw * DEALER_SCALE, fw) }}
      />
      <div className="ww-felt felt" style={{ top: pct(DEALER_ROOM, total), height: pct(fh, total) }}>
        <img className="ww-felt-img" src={wwArt(felt)} alt="" draggable={false} />
        {/* Table props: their own layer, drawn once. */}
        <img className="ww-prop" src={wwArt('chip_tray')} alt="" draggable={false} style={onFelt(size, fw / 2 - tw * 0.36, 14, tw * 0.72)} />
        <img className="ww-prop" src={wwArt(shoe)} alt="" draggable={false} style={onFelt(size, fw - 50 - sw * 0.62, 34, sw * 0.62)} />
        {children}
      </div>
    </div>
  );
}

// ───────────────────────── Dealer chat (draft lines) ─────────────────────────

const CHAT_KEY = 'wtg.casino.dealerChat';
const readChat = (): ChatLevel => {
  try {
    return localStorage.getItem(CHAT_KEY) === 'quiet' ? 'quiet' : 'normal';
  } catch {
    return 'normal';
  }
};

const visitedThisSession = new Map<WWDealer, boolean>();
/** True the first time Ryan sits at this dealer's table (remembered in this browser). Stable within a page session. */
function firstVisit(who: WWDealer): boolean {
  const known = visitedThisSession.get(who);
  if (known !== undefined) return known;
  const first = readFirst(who);
  visitedThisSession.set(who, first);
  return first;
}

function readFirst(who: WWDealer): boolean {
  try {
    const k = `wtg.casino.seen.${who}`;
    const seen = localStorage.getItem(k);
    localStorage.setItem(k, '1');
    return !seen;
  } catch {
    return true;
  }
}

interface Chat<E extends WWEvent> {
  line: WWLine | null;
  face: string;
  pose: string;
  level: ChatLevel;
  setLevel: (l: ChatLevel) => void;
  say: (event: E) => void;
  /** Shows a specific line (tip reactions) with a face and pose. */
  sayLine: (line: WWLine, face: string, pose: string) => void;
  setPose: (p: string, holdMs?: number) => void;
}

function useDealerChat<E extends WWEvent>(who: WWDealer, faces: Record<E, string>, poses: Record<E, string>): Chat<E> {
  const [level, setLevelState] = useState<ChatLevel>(readChat);
  const [line, setLine] = useState<WWLine | null>(null);
  const [face, setFace] = useState(who === 'waifu' ? 'neutral' : 'grin');
  const [pose, setPoseState] = useState('idle');
  const recent = useRef<string[]>([]);
  const back = useRef<number | undefined>(undefined);
  const setPose = useCallback((p: string, holdMs = 2600) => {
    setPoseState(p);
    window.clearTimeout(back.current);
    if (p !== 'idle') back.current = window.setTimeout(() => setPoseState('idle'), holdMs);
  }, []);
  const say = useCallback(
    (event: E) => {
      setFace(faces[event]);
      setPose(poses[event]);
      const l = pickLine(who, event, recent.current, level);
      if (!l) return;
      recent.current = [...recent.current, l.id].slice(-8);
      setLine(l);
    },
    [who, faces, poses, level, setPose],
  );
  const setLevel = (l: ChatLevel) => {
    setLevelState(l);
    try {
      localStorage.setItem(CHAT_KEY, l);
    } catch {
      /* storage unavailable: setting lasts this session */
    }
  };
  useEffect(() => () => window.clearTimeout(back.current), []);
  const sayLine = useCallback(
    (l: WWLine, f: string, p: string) => {
      setFace(f);
      setPose(p);
      setLine(l);
    },
    [setPose],
  );
  return { line, face, pose, level, setLevel, say, sayLine, setPose };
}

function WWDialogue({ who, chat }: { who: WWDealer; chat: Chat<WWEvent> }) {
  const { line, face, level, setLevel } = chat;
  const [typed, setTyped] = useState(0);
  useEffect(() => setTyped(0), [line]);
  useEffect(() => {
    if (!line || typed >= line.text.length) return;
    const t = window.setTimeout(() => setTyped((k) => k + 1), 22);
    return () => window.clearTimeout(t);
  }, [typed, line]);
  const sheet = META[`${who}_faces`];
  const n = sheet.faces.length;
  const i = Math.max(0, sheet.faces.indexOf(face));
  return (
    <div className={`rpg-box dealer ww ${who}`} aria-live="polite" data-testid="dealer-line" onClick={() => line && setTyped(line.text.length)}>
      <span
        className="ww-face"
        role="img"
        aria-label={`${WW_NAMES[who]} (${face})`}
        data-face={face}
        style={{ backgroundImage: `url(${wwArt(`${who}_faces`)})`, backgroundSize: `${n * 100}% 100%`, backgroundPosition: `${(i / (n - 1)) * 100}% 0` }}
      />
      <div className="rpg-body">
        <p className="rpg-name">
          {WW_NAMES[who]}
          <TierChip npcId={who} />
          {line && line.status !== 'approved' && <span className="ww-draft" title="Draft dialogue, pending Script Room approval">Draft</span>}
          <button
            type="button"
            className="ww-chat"
            onClick={(e) => {
              e.stopPropagation();
              setLevel(level === 'quiet' ? 'normal' : 'quiet');
            }}
            aria-pressed={level === 'quiet'}
            title="Quiet keeps only results and notices"
          >
            Chat: {level === 'quiet' ? 'quiet' : 'on'}
          </button>
        </p>
        <p className="rpg-text">
          {line ? line.text.slice(0, typed) : ' '}
          <span className="rpg-caret" aria-hidden>{line && typed < line.text.length ? '▌' : ''}</span>
        </p>
      </div>
    </div>
  );
}

function ChipPicker({ chip, setChip, note }: { chip: number; setChip: (c: number) => void; note: ReactNode }) {
  return (
    <div className="chip-rack">
      {CHIPS.map((c) => (
        <button key={c} className={`chip chip-${c} ${chip === c ? 'on' : ''}`} onClick={() => setChip(c)} aria-pressed={chip === c} aria-label={`$${c} chip`}>
          {c}
        </button>
      ))}
      <span className="chip-total">{note}</span>
    </div>
  );
}

/** Seconds between cards coming out of the shoe. */
const CARD_GAP = 0.45;

// ───────────────────────── Baccarat ─────────────────────────

const BAC_FELT = META.baccarat_felt;
/** Betting zones on the felt image (felt pixels). */
const BAC_ZONES: Record<BaccaratSpot, { box: [number, number, number, number]; label: string; pays: string }> = {
  player: { box: [74, 80, 132, 60], label: 'Player', pays: '1 to 1' },
  tie: { box: [210, 80, 134, 62], label: 'Tie', pays: '8 to 1' },
  banker: { box: [348, 80, 134, 60], label: 'Banker', pays: '0.95 to 1' },
};
const OUTCOME_NAME = { P: 'Player', B: 'Banker', T: 'Tie' } as const;

/** Deal order: P1, B1, P2, B2, then the Player's third card, then the Banker's. */
function dealOrder(r: BaccaratRound) {
  const p = r.hand.player.map((_, i) => (i < 2 ? i * 2 : 4));
  const b = r.hand.banker.map((_, i) => (i < 2 ? i * 2 + 1 : r.hand.player.length === 3 ? 5 : 4));
  return { p, b, cards: r.hand.player.length + r.hand.banker.length };
}

export function Baccarat() {
  const { state, services, run } = useGame();
  const chat = useDealerChat<WaifuEvent>('waifu', WAIFU_FACE, WAIFU_POSE);
  const [chip, setChip] = useState(25);
  const [bets, setBets] = useState<BaccaratBets>({});
  const [last, setLast] = useState<BaccaratBets>({});
  const [round, setRound] = useState<BaccaratRound | null>(null);
  const [revealed, setRevealed] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const timers = useRef<number[]>([]);
  const history = baccaratHistory(state.career);
  const shoe = baccaratShoe(state.career);
  const staked = totalStaked(bets);
  const block = baccaratBlocker(bets, state.balance);

  useEffect(() => {
    chat.say(firstVisit('waifu') ? 'welcome' : 'return_visit');
    return () => timers.current.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const later = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));

  const add = (spot: BaccaratSpot) => {
    if (busy || !revealed) return;
    const next = Math.min(BACCARAT_LIMITS.max, (bets[spot] ?? 0) + chip);
    if (staked - (bets[spot] ?? 0) + next > state.balance) return chat.say('insufficient_funds');
    if (staked === 0) chat.say('bet');
    sound.play('ui_click', { volume: 0.5 });
    setBets({ ...bets, [spot]: next });
  };

  const deal = async (b: BaccaratBets) => {
    const why = baccaratBlocker(b, state.balance);
    if (why) {
      if (/balance/.test(why)) chat.say('insufficient_funds');
      return;
    }
    setBusy(true);
    setNotice(null);
    chat.say('deal');
    chat.setPose('deal', 60_000);
    sound.play('ui_confirm');
    const r = await run(() => services.casino.playBaccarat(b));
    if (!r) {
      chat.setPose('idle');
      return setBusy(false);
    }
    setLast(b);
    setBets({});
    setRound(r);
    setRevealed(false);
    if (r.shuffled) setNotice(`New shoe: ${8} decks shuffled, cut card placed ${CUT_FROM_END} cards from the end.`);
    const { cards } = dealOrder(r);
    const doneMs = (cards * CARD_GAP + 0.5) * 1000;
    // The line waits until every card is down (no talking over the deal).
    later(doneMs, () => {
      setRevealed(true);
      setBusy(false);
      const net = r.payout - r.staked;
      const tier = celebrateWin(net, r.staked);
      sound.play(net > 0 ? 'cash' : net === 0 ? 'ui_click' : 'groan', { volume: 0.55 });
      const ev: WaifuEvent = tier
        ? 'big_win'
        : r.hand.natural
          ? 'natural'
          : net < 0 && cryptoInt(2) === 0
            ? 'loss'
            : r.hand.outcome === 'P' ? 'player_win' : r.hand.outcome === 'B' ? 'banker_win' : 'push';
      chat.say(ev);
      if (r.cutCardOut) {
        later(2600, () => {
          chat.say('shuffle');
          setNotice('The cut card is out: the shoe will be shuffled before the next hand.');
        });
      }
    });
  };

  const order = round ? dealOrder(round) : null;
  const tallies = history.reduce((a, h) => ({ ...a, [h.o]: a[h.o] + 1 }), { P: 0, B: 0, T: 0 });

  return (
    <section className="hub-card casino-game ww-game baccarat-game">
      <h2 className="hub-title">
        Baccarat <span className="muted">Punto Banco · 8 decks · ${BACCARAT_LIMITS.min}–${BACCARAT_LIMITS.max} a spot (proposed)</span>
      </h2>
      <WWStage who="waifu" pose={chat.pose} felt="baccarat_felt" shoe="shoe_red" testId="baccarat-table">
        {(['player', 'tie', 'banker'] as const).map((spot) => {
          const z = BAC_ZONES[spot];
          const shown = round && !revealed ? round.bets[spot] ?? 0 : revealed && round && staked === 0 ? round.bets[spot] ?? 0 : bets[spot] ?? 0;
          const won = revealed && round && ((spot === 'tie' && round.hand.outcome === 'T') || (spot === 'player' && round.hand.outcome === 'P') || (spot === 'banker' && round.hand.outcome === 'B'));
          return (
            <button
              key={spot}
              className={`ww-zone ${spot} ${won ? 'won' : ''}`}
              style={onFelt(BAC_FELT, ...z.box)}
              onClick={() => add(spot)}
              onContextMenu={(e) => {
                e.preventDefault();
                if (!busy) setBets({ ...bets, [spot]: 0 });
              }}
              disabled={busy}
              data-testid={`bac-${spot}`}
              aria-label={`Bet ${z.label}, pays ${z.pays}`}
            >
              <span className="ww-zone-label">{z.label}</span>
              <span className="ww-zone-pays">{z.pays}</span>
              <BetChip amount={shown} />
            </button>
          );
        })}
        {round && order && (
          <>
            <div className="ww-hand bac-player" style={onFelt(BAC_FELT, 92, 14)} data-testid="bac-player-cards">
              <span className={`felt-total ${revealed && round.hand.outcome === 'P' ? 'win' : ''}`}>Player {revealed ? round.hand.playerTotal : ''}</span>
              <div className="cards">{round.hand.player.map((c, i) => <PlayingCard key={`${round.roundId}p${i}`} card={c} i={i} delay={order.p[i] * CARD_GAP} />)}</div>
            </div>
            <div className="ww-hand bac-banker" style={onFelt(BAC_FELT, 352, 14)} data-testid="bac-banker-cards">
              <div className="cards">{round.hand.banker.map((c, i) => <PlayingCard key={`${round.roundId}b${i}`} card={c} i={i} delay={order.b[i] * CARD_GAP} />)}</div>
              <span className={`felt-total ${revealed && round.hand.outcome === 'B' ? 'win' : ''}`}>Banker {revealed ? round.hand.bankerTotal : ''}</span>
            </div>
            {revealed && (
              <span className={`ww-result o-${round.hand.outcome}`} style={onFelt(BAC_FELT, 275, 150)} data-testid="bac-result">
                {OUTCOME_NAME[round.hand.outcome]}{round.hand.outcome === 'T' ? '' : ' wins'}{round.hand.natural ? ' · natural' : ''}
                {round.payout > 0 ? ` · paid ${formatMoney(round.payout)}` : ''}
              </span>
            )}
          </>
        )}
      </WWStage>
      <WWDialogue who="waifu" chat={chat as unknown as Chat<WWEvent>} />
      <TipTray npcId="waifu" disabled={busy || !revealed} onTipped={(r: TipReaction) => chat.sayLine(r.line, r.event === 'tip_huge' ? 'surprised' : r.event === 'tier_up' ? 'delighted' : 'smile', 'present')} />
      {notice && <p className="ww-notice" data-testid="bac-notice">{notice}</p>}
      <ChipPicker chip={chip} setChip={setChip} note={<>Tap Player, Banker or Tie to place <b>{formatMoney(chip)}</b> · on the table <b>{formatMoney(staked)}</b></>} />
      <div className="btn-row casino-actions">
        <button className="btn ghost" onClick={() => setBets({})} disabled={busy || staked === 0}>Clear</button>
        <button className="btn ghost" onClick={() => deal(last)} disabled={busy || staked > 0 || totalStaked(last) === 0} data-testid="bac-rebet">
          Same bets again{totalStaked(last) ? ` · ${formatMoney(totalStaked(last))}` : ''}
        </button>
        <button className="btn primary" onClick={() => deal(bets)} disabled={busy || staked === 0 || !!block} data-testid="bac-deal">Deal · {formatMoney(staked)}</button>
      </div>
      {block && staked > 0 && <p className="warn-text">{block}</p>}
      <div className="ww-board">
        <div>
          <p className="ww-board-title">Last {history.length || 20} hands <span className="muted">(newest at the end)</span></p>
          <div className="bead-road" data-testid="bead-road" aria-label="Bead road of recent outcomes">
            {beadRoad(history).map((col, c) => (
              <div key={c} className="bead-col">
                {col.map((h, r) => (
                  <span key={r} className={`bead ${h ? `o-${h.o}` : 'empty'}`} title={h ? `${OUTCOME_NAME[h.o]} ${h.p}–${h.b}${h.nat ? ' (natural)' : ''}` : undefined}>
                    {h ? h.o : ''}
                    {h?.nat && <i aria-hidden />}
                  </span>
                ))}
              </div>
            ))}
          </div>
          <p className="fineprint">
            Banker {tallies.B} · Player {tallies.P} · Tie {tallies.T}. Every hand is dealt fresh from the shoe: past results don&rsquo;t predict the next one.
          </p>
        </div>
        <div className="ww-shoe-info" data-testid="bac-shoe">
          <p className="ww-board-title">Shoe {shoe ? `#${shoe.n}` : ''}</p>
          <p>{shoe ? <>{shoe.cards.length} cards left · cut card {CUT_FROM_END} from the end</> : 'A fresh 8-deck shoe is shuffled for the first hand.'}</p>
          <p className="fineprint">
            Player draws on 0–5 and stands on 6–7; the Banker draws by the standard table. Eight or nine on the first two cards is a natural and nobody draws.
            Banker pays 0.95 to 1 (whole dollars, rounded down). Player and Banker bets push on a tie.
          </p>
        </div>
      </div>
    </section>
  );
}

// ───────────────────────── Three Card Poker ─────────────────────────

const TC_FELT = META.threecard_felt;
const TC_BOXES: [number, number, number, number][] = [[171, 64, 57, 34], [245, 64, 50, 34], [313, 63, 57, 35]];
const TC_SPOTS = { ante: [112, 113, 87, 46], play: [226, 115, 85, 44], pairplus: [339, 113, 86, 46] } as const;

export function ThreeCard() {
  const { state, services, run } = useGame();
  const chat = useDealerChat<WinstonEvent>('winston', WINSTON_FACE, WINSTON_POSE);
  const pending = pendingThreeCard(state.career);
  const [chip, setChip] = useState(10);
  const [ante, setAnte] = useState(10);
  const [pairPlus, setPairPlus] = useState(0);
  const [done, setDone] = useState<{ pending: PendingThreeCard; result: ThreeCardResult; staked: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const timers = useRef<number[]>([]);
  const later = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));
  const block = threeCardBlocker(ante, pairPlus, state.balance);
  // The bets on the table are the hand's own (also after a reload); the next deal repeats them.
  useEffect(() => {
    if (!pending) return;
    setAnte(pending.ante);
    setPairPlus(pending.pairPlus);
  }, [pending?.roundId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (pending) chat.say('decision');
    else chat.say(firstVisit('winston') ? 'welcome' : 'return_visit');
    return () => timers.current.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addTo = (spot: 'ante' | 'pairplus') => {
    if (pending || busy) return;
    setDone(null);
    const L = THREE_CARD_LIMITS;
    if (spot === 'ante') setAnte((a) => Math.min(L.anteMax, a + chip));
    else setPairPlus((p) => Math.min(L.pairPlusMax, p + chip));
    sound.play('ui_click', { volume: 0.5 });
  };

  const deal = async () => {
    if (block) {
      if (/chips|balance/i.test(block)) chat.say('insufficient_funds');
      return;
    }
    setBusy(true);
    setDone(null);
    chat.say('bet');
    sound.play('ui_confirm');
    const p = await run(() => services.casino.startThreeCard(ante, pairPlus));
    if (!p) return setBusy(false);
    chat.setPose('idle');
    // Cards out first; Winston asks for the decision once they're down.
    later((6 * 0.3 + 0.4) * 1000, () => {
      chat.say('decision');
      setBusy(false);
    });
  };

  const finish = async (play: boolean) => {
    if (!pending) return;
    setBusy(true);
    const out = await run(() => services.casino.finishThreeCard(pending.roundId, play));
    if (!out) return setBusy(false);
    setDone(out);
    sound.play('ui_click');
    later(900, () => {
      setBusy(false);
      const r = out.result;
      const net = r.total - out.staked;
      const tier = celebrateWin(net, out.staked);
      sound.play(net > 0 ? 'cash' : net === 0 ? 'ui_click' : 'groan', { volume: 0.55 });
      const ev: WinstonEvent = tier
        ? 'big_win'
        : r.bonusReturn > 0
          ? 'ante_bonus'
          : r.pairPlusReturn > 0
            ? 'pair_plus_win'
            : r.outcome === 'fold'
              ? 'fold'
              : r.outcome === 'noqualify'
                ? 'dealer_no_qualify'
                : r.outcome === 'win'
                  ? 'player_win'
                  : r.outcome === 'push'
                    ? 'push'
                    : cryptoInt(2) ? 'dealer_win' : 'loss';
      chat.say(ev);
    });
  };

  const hand = pending ?? done?.pending ?? null;
  const showDealer = !pending && !!done;
  const r = done?.result;
  const bet = { ante: pending ? pending.ante : ante, pairplus: pending ? pending.pairPlus : pairPlus, play: done && !pending && r?.played ? done.pending.ante : 0 };

  return (
    <section className="hub-card casino-game ww-game threecard-game">
      <h2 className="hub-title">
        Three Card Poker <span className="muted">Ante ${THREE_CARD_LIMITS.anteMin}–${THREE_CARD_LIMITS.anteMax} · Pair Plus ${THREE_CARD_LIMITS.pairPlusMin}–${THREE_CARD_LIMITS.pairPlusMax} (proposed)</span>
      </h2>
      <WWStage who="winston" pose={chat.pose} felt="threecard_felt" shoe="shoe_blue" testId="threecard-table">
        {hand && (
          <>
            {hand.dealer.map((c, i) => (
              <div key={`${hand.roundId}d${i}`} className="ww-hand tc-box" style={onFelt(TC_FELT, TC_BOXES[i][0] + TC_BOXES[i][2] / 2, TC_BOXES[i][1] + TC_BOXES[i][3] / 2)}>
                <div className="cards">
                  <PlayingCard key={showDealer ? 'up' : 'down'} card={c} i={i} hidden={!showDealer} delay={showDealer ? i * 0.18 : (i * 2 + 1) * 0.3} />
                </div>
              </div>
            ))}
            {showDealer && r && (
              <span className="felt-total tc-dealer-rank" style={onFelt(TC_FELT, 100, 68)} data-testid="tc-dealer-rank">
                Winston: {RANK3_NAMES[r.dealer.rank]}{r.qualifies ? '' : ' (no qualify)'}
              </span>
            )}
            <div className="ww-hand tc-player" style={onFelt(TC_FELT, TC_FELT[0] / 2, 186)} data-testid="tc-player-cards">
              <div className="cards">{hand.player.map((c, i) => <PlayingCard key={`${hand.roundId}p${i}`} card={c} i={i} delay={pending ? i * 2 * 0.3 : 0} />)}</div>
            </div>
            {r && showDealer && (
              <span className="felt-total tc-player-rank" style={onFelt(TC_FELT, 100, 178)} data-testid="tc-player-rank">Ryan: {RANK3_NAMES[r.player.rank]}</span>
            )}
          </>
        )}
        {(['ante', 'play', 'pairplus'] as const).map((spot) => {
          const [x, y, w, h] = TC_SPOTS[spot];
          const label = spot === 'ante' ? 'Ante' : spot === 'play' ? 'Play' : 'Pair Plus';
          const clickable = spot !== 'play' && !pending && !busy;
          return (
            <button
              key={spot}
              className={`ww-zone oval ${spot}`}
              style={onFelt(TC_FELT, x, y, w, h)}
              onClick={() => spot !== 'play' && addTo(spot)}
              onContextMenu={(e) => {
                e.preventDefault();
                if (!clickable) return;
                if (spot === 'ante') setAnte(0);
                if (spot === 'pairplus') setPairPlus(0);
              }}
              disabled={!clickable}
              data-testid={`tc-spot-${spot}`}
              aria-label={spot === 'play' ? 'Play bet (equal to the Ante)' : `Add to ${label}`}
            >
              <span className="ww-zone-label">{label}</span>
              {spot === 'play' && !bet.play && <span className="ww-zone-pays">= Ante</span>}
              <BetChip amount={bet[spot]} />
            </button>
          );
        })}
        {r && showDealer && (
          <span className={`ww-result o-${r.outcome}`} style={onFelt(TC_FELT, 430, 174)} data-testid="tc-result">
            {r.outcome === 'fold' ? 'Folded' : r.outcome === 'noqualify' ? 'Dealer doesn’t qualify' : r.outcome === 'win' ? 'Ryan wins' : r.outcome === 'push' ? 'Push' : 'Winston wins'}
            {r.total > 0 ? ` · paid ${formatMoney(r.total)}` : ''}
          </span>
        )}
      </WWStage>
      <WWDialogue who="winston" chat={chat as unknown as Chat<WWEvent>} />
      <TipTray npcId="winston" disabled={busy || !!pending} onTipped={(r: TipReaction) => chat.sayLine(r.line, r.event === 'tip_huge' ? 'surprised' : r.event === 'tier_up' ? 'laugh' : 'grin', 'present')} />
      {r && showDealer && (
        <ul className="tc-breakdown" data-testid="tc-breakdown">
          <li>Ante {r.outcome === 'fold' ? 'lost (folded)' : r.anteReturn ? `returns ${formatMoney(r.anteReturn)}` : 'lost'}</li>
          {r.played && <li>Play {r.outcome === 'noqualify' ? 'pushes' : r.playReturn ? `returns ${formatMoney(r.playReturn)}` : 'lost'}</li>}
          {r.played && r.bonusReturn > 0 && <li>Ante Bonus pays {formatMoney(r.bonusReturn)}</li>}
          {done!.pending.pairPlus > 0 && <li>Pair Plus {r.pairPlusReturn ? `returns ${formatMoney(r.pairPlusReturn)}` : 'lost'}</li>}
        </ul>
      )}
      {pending ? (
        <div className="btn-row casino-actions">
          <button className="btn ghost" onClick={() => finish(false)} disabled={busy} data-testid="tc-fold">Fold</button>
          <button className="btn primary" onClick={() => finish(true)} disabled={busy || state.balance < pending.ante} data-testid="tc-play">
            Play · {formatMoney(pending.ante)}
          </button>
        </div>
      ) : (
        <>
          <ChipPicker chip={chip} setChip={setChip} note={<>Tap Ante or Pair Plus to add <b>{formatMoney(chip)}</b> · right-click to clear a spot</>} />
          <div className="btn-row casino-actions">
            <button className="btn ghost" onClick={() => { setAnte(0); setPairPlus(0); setDone(null); }} disabled={busy || ante + pairPlus === 0}>Clear</button>
            <button className="btn primary" onClick={deal} disabled={busy || !!block} data-testid="tc-deal">
              Deal · {formatMoney(ante + pairPlus)}
            </button>
          </div>
          {block && <p className="warn-text">{block}</p>}
        </>
      )}
      <p className="fineprint">
        Winston qualifies with queen-high or better. Fold and the Ante is lost; Play (equal to the Ante) and if he doesn&rsquo;t qualify the Ante pays 1 to 1 and Play pushes;
        if he does, the better hand wins Ante and Play at 1 to 1. Ante Bonus when you play: straight flush 5, three of a kind 4, straight 1 to 1.
        Pair Plus pays on your hand alone, even if you fold: straight flush 40, three of a kind 30, straight 6, flush 4, pair 1 to 1. A straight beats a flush.
      </p>
    </section>
  );
}
