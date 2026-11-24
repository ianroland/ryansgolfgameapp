import { Fragment, useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  BJ_LIMITS, canDouble, canSplit, deal, double, handValue, hit, newTable, split, stand, totalPayout,
  type BJState,
} from '../../casino/blackjack';
import { amountOn, betBlocker, canTakeDown, CRAPS_LIMITS, onTable, POINTS, type BetOutcome as CrapsOutcome, type CrapsAction, type CrapsTable, type PointNo } from '../../casino/craps';
import { PAYTABLE, REEL, SLOT_BETS, spin, SYMBOL_ART, type SlotSymbol } from '../../casino/slots';
import {
  betBlocker as rouletteBlocker, colorOf, resolveSpin, ROULETTE_LIMITS, spinWheel, spotLabel, totalOn, WHEEL, wins as rouletteWins,
  type RouletteBets, type RouletteSpot,
} from '../../casino/roulette';
import { cryptoInt } from '../../casino/random';
import { CASINO_ENERGY, casinoBlocker, casinoNet, casinoWeekKey } from '../../career/engine';
import { sound } from '../../audio/sound';
import { useGame } from '../GameContext';
import { formatMoney } from '../format';
import { boxStyle, casinoArt } from './casinoArt';
import { Greyhounds } from './Greyhounds';
import { Sportsbook } from '../sportsbook/Sportsbook';
import { VideoMachine } from './Machines';
import { SpinWheel } from './SpinWheel';
import { BetChip, PlayingCard } from './TableBits';
import { Baccarat, ThreeCard } from './WWTables';
import { DialogueBox, MoniqueRest, MoniqueSprite, REACH_MS, useMonique } from './Monique';
import { DealerSprite, useDealerAnim, type DealerAnim } from './DealerSprite';
import { BigWinOverlay, celebrateWin } from './BigWin';
import { DEALER_NAMES, DealerDialogue, type DealerLine } from './DealerDialogue';
import { TipTray } from './Tipping';
import { CardTableScene, feltAt, useCardScene } from './CardTableScene';
import { crapsSceneFor, rouletteSceneFor, type CrapsScene, type Pt, type Rect } from '../../expansion/tableThemes';
import { boardCell, RouletteBoard } from './RouletteBoard';
import { SHOW_TABLE_DEALER_SPRITES } from './DealerPanel';
import { ServerPanel, signalRoundComplete } from './ServerPanel';
import { ChipButton, ChipImg } from './Chips';
import { CasinoLocationContext, devChipPreview, devLegacyTables, useCasinoLocation } from './casinoLocation';
import { chipAsset } from '../../expansion/chipThemes';
import { CasinoLobby } from './CasinoLobby';
import { casinoAt, locationById, type CasinoGameId } from '../../expansion/locations';
import { ART as LOBBY_ART } from './CasinoLobby';
import { ALL_SPOTS, MONIQUE_AT, RT, spotBox, WHEEL_AT, ZERO_CLIP, type Box } from './rouletteLayout';
import { crapsLast, crapsTable, pendingRace } from '../../services/casinoService';

/*
 * Presentation only. Every rule, wager and settlement call below is the same
 * as before the art upgrade: the tables, cabinet and dealers are drawn around
 * the existing games.
 */

type Game = CasinoGameId;

const CHIPS = [5, 10, 25, 100, 500];
/** Wide scenes (craps, roulette) also put the dealer beside the table on wide screens (tested: fits one screen). */
const WIDE_SIDE = true;

/** True while the window is at most `px` wide (layout only). */
function useNarrow(px: number): boolean {
  const q = `(max-width: ${px}px)`;
  const [narrow, setNarrow] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(q).matches);
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return;
    const m = matchMedia(q);
    const on = () => setNarrow(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [q]);
  return narrow;
}

function ChipRack({ value, onAdd, onClear, min, disabled }: { value: number; onAdd: (n: number) => void; onClear: () => void; min: number; disabled?: boolean }) {
  return (
    <div className="chip-rack">
      {CHIPS.filter((c) => c >= Math.min(min, 5)).map((c) => (
        <ChipButton key={c} value={c} onClick={() => onAdd(c)} disabled={disabled} label={`Add $${c}`} />
      ))}
      <span className="chip-total">Bet <b>{formatMoney(value)}</b></span>
      <button className="btn ghost small" onClick={onClear} disabled={disabled || value === 0}>Clear</button>
    </div>
  );
}

/** A dealer behind the table (animated sprite). What they say goes in the dialogue box below the table. */
function Dealer({ who, anim }: { who: 'velvet' | 'craps'; anim: DealerAnim }) {
  return (
    <div className="table-dealer" data-anim={anim}>
      <DealerSprite who={who} anim={anim} height={150} name={DEALER_NAMES[who]} />
    </div>
  );
}

// ───────────────────────── Blackjack ─────────────────────────

const RESULT_TEXT = { blackjack: 'BLACKJACK!', win: 'WIN', push: 'PUSH', lose: 'LOSE', bust: 'BUST' } as const;

/** What Velvet says when a round ends (flavour only). */
function velvetLine(s: BJState): string {
  const results = s.hands.map((h) => h.result);
  const dealerTotal = handValue(s.dealer).total;
  if (results.includes('blackjack')) return "Blackjack. Don't let it go to your head.";
  if (results.includes('win')) return dealerTotal > 21 ? 'I busted. Enjoy it while it lasts.' : 'House pays. Reluctantly.';
  if (results.includes('push')) return 'A tie. How thrilling for both of us.';
  if (results.every((r) => r === 'bust')) return "Over twenty-one. The cards don't negotiate.";
  return 'House wins. It usually does.';
}

function Blackjack() {
  const { state, services, run } = useGame();
  const [table, setTable] = useState<BJState>(() => newTable());
  const [bet, setBet] = useState(25);
  const [round, setRound] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [line, setLine] = useState<DealerLine | null>('Velvet Vega. I deal, you decide. Place a bet.');
  const settled = useRef<string | null>(null);
  const felt = casinoArt('blackjack_table');
  const velvet = useDealerAnim();

  const settleIfDone = async (s: BJState, roundId: string) => {
    setTable(s);
    if (s.phase !== 'done' || settled.current === roundId) return;
    settled.current = roundId;
    const pay = totalPayout(s);
    await run(() => services.casino.settle('blackjack', roundId, 'result', pay));
    {
      const staked = s.hands.reduce((a, h) => a + h.bet, 0);
      celebrateWin(pay - staked, staked);
    }
    const best = s.hands.map((h) => h.result).find((r) => r === 'blackjack') ?? s.hands.map((h) => h.result).find((r) => r === 'win');
    sound.play(best === 'blackjack' ? 'achievement' : best === 'win' ? 'cash' : s.hands.some((h) => h.result === 'push') ? 'ui_click' : 'groan', { volume: 0.6 });
    setLine(velvetLine(s));
    signalRoundComplete(services);
    // Presentation: Velvet reacts, then handles the chips (paying or collecting).
    // A push gets no reaction. No chip animation: the game draws its own chips.
    const reaction: DealerAnim | null = best === 'blackjack' ? 'special' : best === 'win' ? 'win' : s.hands.some((h) => h.result === 'push') ? null : 'loss';
    if (reaction) window.setTimeout(() => velvet.play(reaction), 650);
  };

  const onDeal = async () => {
    if (bet < BJ_LIMITS.min || bet > BJ_LIMITS.max) return;
    setBusy(true);
    const id = services.casino.newRoundId('blackjack');
    const ok = await run(() => services.casino.wager('blackjack', id, 'main', bet));
    if (ok !== undefined) {
      setRound(id);
      setLine('Cards are live.');
      sound.play('ui_confirm');
      velvet.play('deal');
      await settleIfDone(deal(table, bet), id);
    }
    setBusy(false);
  };

  const act = async (fn: (s: BJState) => BJState, extraStake?: { part: string; amount: number }) => {
    if (!round) return;
    setBusy(true);
    if (extraStake) {
      const ok = await run(() => services.casino.wager('blackjack', round, extraStake.part, extraStake.amount));
      if (ok === undefined) return setBusy(false);
    }
    sound.play('ui_click');
    velvet.play('deal');
    await settleIfDone(fn(table), round);
    setBusy(false);
  };

  const playing = table.phase === 'player';
  const h = table.hands[table.active];
  const dealerShown = table.holeHidden && playing ? [table.dealer[0]] : table.dealer;
  const scene = useCardScene('blackjack');
  const dealerTotal = table.dealer.length > 0 && <span className="felt-total">Dealer {handValue(dealerShown).total}</span>;
  const dealerCards = (
    <div className="cards">
      {table.dealer.map((c, i) => <PlayingCard key={`${round}-d${i}`} card={c} i={i} hidden={i === 1 && table.holeHidden && playing} />)}
    </div>
  );
  const hands = (
    <>
      {table.hands.map((hand, idx) => (
        <div key={idx} className={`felt-hand ${playing && idx === table.active ? 'active' : ''}`}>
          <div className="cards">{hand.cards.map((c, i) => <PlayingCard key={`${round}-${idx}-${i}`} card={c} i={i} />)}</div>
          <div className="felt-meta">
            <span className="felt-total">
              {table.hands.length > 1 ? `Hand ${idx + 1}` : 'Ryan'} {handValue(hand.cards).total}
            </span>
            <BetChip amount={hand.bet} />
            {hand.result && <span className={`bj-result ${hand.result}`} data-testid="bj-result">{RESULT_TEXT[hand.result]}{hand.payout ? ` +${formatMoney(hand.payout - hand.bet)}` : ''}</span>}
          </div>
        </div>
      ))}
      {table.hands.length === 0 && <BetChip amount={bet} className="pending" />}
    </>
  );

  return (
    <section className="hub-card casino-game bj-game">
      <h2 className="hub-title">Blackjack <span className="muted">Pays 3:2 · dealer stands on 17 · ${BJ_LIMITS.min}–${BJ_LIMITS.max}</span></h2>
      <div className="table-layout side">
      {scene ? (
        <CardTableScene scene={scene} game="blackjack" testId="bj-felt">
          <div className="cs-block cs-row" style={feltAt(scene.layout.dealer)}>
            {dealerTotal}
            {dealerCards}
          </div>
          {scene.ruleCover ? (
            // The felt prints "Dealer hits soft 17"; this game's dealer stands on all 17s, so that line is covered with the real rule.
            <p className="cs-rules cs-rule-cover" style={{ ...feltAt(scene.ruleCover.box, true), '--felt': scene.ruleCover.felt } as CSSProperties} data-testid="bj-rule">Dealer stands on all 17s</p>
          ) : (
            <p className="cs-rules" style={feltAt(scene.layout.rules)}>Blackjack pays 3 to 2 · Dealer stands on all 17s</p>
          )}
          <div className={`cs-block cs-row felt-hands n${Math.max(1, table.hands.length)}`} style={feltAt(scene.layout.hands)}>{hands}</div>
        </CardTableScene>
      ) : (
        <div className={`table-stage ${SHOW_TABLE_DEALER_SPRITES ? '' : 'no-dealer'}`}>
          {SHOW_TABLE_DEALER_SPRITES && <Dealer who="velvet" anim={velvet.anim} />}
          <div className="felt" style={{ backgroundImage: `url(${felt.url})`, aspectRatio: `${felt.w} / ${felt.h}` }} data-testid="bj-felt">
            <div className="felt-dealer">
              {dealerTotal}
              {dealerCards}
            </div>
            <div className={`felt-hands n${Math.max(1, table.hands.length)}`}>{hands}</div>
          </div>
        </div>
      )}
      <div className="dealer-row">
        <DealerDialogue who="velvet" line={line} anim={velvet.anim} />
        <TipTray
          npcId="velvet_vega"
          disabled={busy || playing}
          onTipped={(r) => {
            setLine({ text: r.line.text, draft: r.line.status !== 'approved' });
            velvet.play('win');
          }}
        />
        <ServerPanel busy={busy || playing} />
      </div>
      </div>

      {playing ? (
        <div className="btn-row casino-actions">
          <button className="btn primary" onClick={() => act((s) => hit(s))} disabled={busy} data-testid="bj-hit">Hit</button>
          <button className="btn" onClick={() => act((s) => stand(s))} disabled={busy} data-testid="bj-stand">Stand</button>
          <button className="btn" onClick={() => act((s) => double(s), { part: `double${table.active}`, amount: h.bet })} disabled={busy || !canDouble(table) || state.balance < h.bet}>Double</button>
          <button className="btn" onClick={() => act((s) => split(s), { part: 'split', amount: h.bet })} disabled={busy || !canSplit(table) || state.balance < h.bet}>Split</button>
        </div>
      ) : (
        <>
          <ChipRack value={bet} min={BJ_LIMITS.min} onAdd={(n) => setBet((b) => Math.min(BJ_LIMITS.max, b + n))} onClear={() => setBet(0)} disabled={busy} />
          <div className="btn-row casino-actions">
            <button className="btn primary" onClick={onDeal} disabled={busy || bet < BJ_LIMITS.min || bet > state.balance} data-testid="bj-deal">
              {table.phase === 'done' ? 'Deal again' : 'Deal'} · {formatMoney(bet)}
            </button>
          </div>
          {bet > state.balance && <p className="warn-text">Not enough in the bank for that bet.</p>}
        </>
      )}
    </section>
  );
}

// ───────────────────────── Slots ─────────────────────────

/** Reel content: the existing animated reel, now showing the drawn symbols. */
function Reel({ symbol, spinning }: { symbol: SlotSymbol; spinning: boolean }) {
  const [shown, setShown] = useState(symbol);
  useEffect(() => {
    if (!spinning) return setShown(symbol);
    const t = window.setInterval(() => setShown(REEL[cryptoInt(REEL.length)]), 70);
    return () => window.clearInterval(t);
  }, [spinning, symbol]);
  return (
    <div className={`reel ${spinning ? 'spinning' : 'stopped'} sym-${shown}`} key={spinning ? 'spin' : `stop-${symbol}`} data-symbol={shown}>
      <img src={casinoArt(`sym_${shown}`).url} alt={SYMBOL_ART[shown].label} draggable={false} />
    </div>
  );
}

function Slots() {
  const { state, services, run } = useGame();
  const casinoLoc = useCasinoLocation();
  const [bet, setBet] = useState(25);
  const [reels, setReels] = useState<SlotSymbol[]>(['trophy', 'seven', 'flag']);
  const [stopped, setStopped] = useState(3);
  const [msg, setMsg] = useState<string>('Three 🏆 pays 400×');
  const [busy, setBusy] = useState(false);
  const [lights, setLights] = useState<'off' | 'win' | 'jackpot'>('off');
  const [pull, setPull] = useState(0);
  const cab = casinoArt('cabinet');
  const lever = casinoArt('cabinet_lever');

  const onSpin = async () => {
    if (busy || state.balance < bet) return;
    setBusy(true);
    setLights('off');
    setPull((n) => n + 1);
    const id = services.casino.newRoundId('slots');
    const ok = await run(() => services.casino.wager('slots', id, 'spin', bet));
    if (ok === undefined) return setBusy(false);
    const r = spin(bet);
    setReels(r.reels);
    setStopped(0);
    setMsg('');
    sound.play('meter_start');
    for (let i = 1; i <= 3; i++) {
      await new Promise((res) => window.setTimeout(res, i === 1 ? 650 : 380));
      setStopped(i);
      sound.play('meter_set');
    }
    if (r.payout > 0) await run(() => services.casino.settle('slots', id, 'spin', r.payout, { jackpot: r.jackpot }));
    setMsg(r.payout > 0 ? `${r.line} · WIN ${formatMoney(r.payout)}` : 'No win');
    setLights(r.jackpot ? 'jackpot' : r.payout > 0 ? 'win' : 'off');
    if (r.payout > 0) celebrateWin(r.payout - bet, bet, { jackpot: r.jackpot });
    if (r.jackpot) sound.play('win');
    else if (r.payout >= bet * 10) sound.play('cheer');
    else if (r.payout > 0) sound.play('cash');
    setBusy(false);
  };

  const step = (dir: -1 | 1) => {
    const i = SLOT_BETS.indexOf(bet);
    setBet(SLOT_BETS[Math.max(0, Math.min(SLOT_BETS.length - 1, i + dir))]);
    sound.play('ui_click', { volume: 0.5 });
  };
  const [bDown, bSpin, bUp] = cab.buttons!;

  return (
    <section className="hub-card casino-game slots-game">
      <h2 className="hub-title">Fairway Fortune <span className="muted">3-reel slots · pull the lever or press the yellow button</span></h2>
      <div className="cabinet-wrap">
        <div className={`cabinet lights-${lights}`} style={{ aspectRatio: `${cab.w} / ${cab.h}` }} data-testid="slot-cabinet">
          {/* Layer 1: the live reels, behind the glass. */}
          <div className="cab-reels" aria-live="polite" aria-label={stopped === 3 ? reels.map((s) => SYMBOL_ART[s].label).join(', ') : 'Spinning'}>
            {cab.windows!.map((w, i) => (
              <div className="cab-window" style={boxStyle(cab, w)} key={i} data-testid={`slot-window-${i}`}>
                <Reel symbol={reels[i]} spinning={i >= stopped} />
              </div>
            ))}
          </div>
          {/* Layer 2: the cabinet face; its reel windows are real transparent holes. */}
          <img className="cab-face" src={cab.url} alt="" draggable={false} />
          <span className="cab-glow" aria-hidden />
          {/* Layer 3: controls. */}
          <button
            className="cab-lever"
            key={pull}
            style={{ ...boxStyle(cab, [lever.at![0], lever.at![1], lever.w, lever.h]), backgroundImage: `url(${lever.url})` }}
            onClick={onSpin}
            disabled={busy || state.balance < bet}
            aria-label={`Pull the lever: spin for ${formatMoney(bet)}`}
            data-testid="slot-lever"
          />
          <button className="cab-btn" style={boxStyle(cab, bDown)} onClick={() => step(-1)} disabled={busy || bet === SLOT_BETS[0]} aria-label="Lower the bet" title="Lower the bet" />
          <button className="cab-btn" style={boxStyle(cab, bSpin)} onClick={onSpin} disabled={busy || state.balance < bet} aria-label={`Spin for ${formatMoney(bet)}`} title="Spin" />
          <button className="cab-btn" style={boxStyle(cab, bUp)} onClick={() => step(1)} disabled={busy || bet === SLOT_BETS[SLOT_BETS.length - 1]} aria-label="Raise the bet" title="Raise the bet" />
        </div>
        <div className={`slot-msg ${msg.includes('WIN') ? 'win' : ''}`} data-testid="slot-msg">{msg || ' '}</div>
      </div>
      <div className="slot-bets" role="radiogroup" aria-label="Bet per spin">
        {SLOT_BETS.map((b) => (
          <button key={b} role="radio" aria-checked={bet === b} className={`chip-token ${bet === b ? 'on' : ''}`} onClick={() => setBet(b)} disabled={busy} aria-label={`Bet $${b}`}>
            {(() => {
              const face = chipAsset(casinoLoc, b);
              return face ? <ChipImg src={face.url} source={face.source} /> : <img src={casinoArt(`chip_${b}`).url} alt="" draggable={false} />;
            })()}
          </button>
        ))}
        <button className="btn primary spin-btn" onClick={onSpin} disabled={busy || state.balance < bet} data-testid="slot-spin">
          {busy ? 'Spinning…' : `Spin · ${formatMoney(bet)}`}
        </button>
      </div>
      <table className="paytable">
        <tbody>
          {PAYTABLE.map((p) => (
            <tr key={p.name}><td>{p.name}</td><td>{p.pays}×</td></tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// ───────────────────────── Craps ─────────────────────────

const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

function Die({ n, rolling, i }: { n: number; rolling: boolean; i: number }) {
  return (
    <div className={`die ${rolling ? 'rolling' : 'landed'}`} style={{ animationDelay: `${i * 0.06}s` }} aria-label={`${n}`}>
      {Array.from({ length: 9 }, (_, k) => <span key={k} className={PIPS[n].includes(k) ? 'pip' : ''} />)}
    </div>
  );
}

/** Bets in the line row, in table order. Descriptions are the rules, not flavour. */
const LINE_BETS: { a: CrapsAction; name: string; desc: string }[] = [
  { a: { kind: 'pass' }, name: 'Pass Line', desc: 'Come-out: 7/11 win, 2/3/12 lose; then the point before a 7. Pays 1:1' },
  { a: { kind: 'passOdds' }, name: 'Pass Odds', desc: 'Behind your Pass bet once a point is on: true odds, up to 2×. No house edge' },
  { a: { kind: 'dontPass' }, name: "Don't Pass", desc: 'Come-out: 2/3 win, 12 pushes, 7/11 lose; then a 7 before the point. Pays 1:1' },
  { a: { kind: 'dontOdds' }, name: 'Lay Odds', desc: 'Behind Don’t Pass once a point is on: wins on the 7 at true odds (1:2, 2:3, 5:6). No house edge' },
  { a: { kind: 'come' }, name: 'Come', desc: 'Once a point is on: like a new Pass bet; travels to its own number. Pays 1:1' },
  { a: { kind: 'dontCome' }, name: "Don't Come", desc: 'Once a point is on: like a new Don’t Pass bet; travels to its own number. Pays 1:1' },
  { a: { kind: 'field' }, name: 'Field', desc: 'One roll: 3, 4, 9, 10, 11 pay 1:1 · 2 pays 2:1 · 12 pays 3:1' },
];
const PLACE_PAY: Record<PointNo, string> = { 4: '9:5', 5: '7:5', 6: '7:6', 8: '7:6', 9: '7:5', 10: '9:5' };
const NUMBER_WORD: Record<PointNo, string> = { 4: 'four', 5: 'five', 6: 'six', 8: 'eight', 9: 'nine', 10: 'ten' };
const actionKey = (a: CrapsAction) => ('n' in a ? `${a.kind}-${a.n}` : a.kind);

/** Where each point box sits on the drawn table (percent across, measured from the gold box lines on craps_table_v2). */
const POINT_X: Record<number, number> = { 4: 31.9, 5: 39.2, 6: 46.5, 8: 53.9, 9: 61.2, 10: 68.8 };

const scenePt = (sc: CrapsScene, [x, y]: Pt) => ({ left: `${(x / sc.size[0]) * 100}%`, top: `${(y / sc.size[1]) * 100}%` });
const sceneRect = (sc: CrapsScene, [x, y, w, h]: Rect) => ({ left: `${(x / sc.size[0]) * 100}%`, top: `${(y / sc.size[1]) * 100}%`, width: `${(w / sc.size[0]) * 100}%`, height: `${(h / sc.size[1]) * 100}%` });
/** A spot inside a number box, at fractions of the box from its centre. */
const boxPt = (sc: CrapsScene, n: PointNo, fx: number, fy: number) => scenePt(sc, [sc.point[n][0] + fx * sc.box[0], sc.point[n][1] + fy * sc.box[1]]);

/** Stick Lady's call for a roll (flavour only; the result comes from the craps rules). New lines (Come, Place) are drafts. */
function stickCall(before: number | null, after: number | null, sum: number, outcomes: CrapsOutcome[]): DealerLine {
  const moved = outcomes.find((o) => o.result === 'move');
  if (before === null) {
    if (sum === 7 || sum === 11) return sum === 11 ? 'Yo-leven! Front line winner!' : 'Seven! Front line winner!';
    if (sum === 2 || sum === 3 || sum === 12) return `Craps, ${sum}! Line away.`;
    return `The point is ${sum}. Mark it!`;
  }
  if (sum === before) return `${sum}, the hard way or easy, winner! Pay the line.`;
  if (sum === 7 && after === null) return 'Seven out. Line away.';
  if (moved) return { text: `${sum}! Come bet goes to the ${NUMBER_WORD[sum as PointNo]}. Shooter rolls again.`, draft: true };
  if (outcomes.some((o) => o.bet.startsWith('place ') && o.result === 'win')) return { text: `${sum}! Pay the place bet. Same shooter.`, draft: true };
  return `${sum}. No decision. Shooter rolls again.`;
}

function Craps() {
  const { state, services, run } = useGame();
  const live = crapsTable(state.career);
  const last = crapsLast(state.career);
  // While the dice are in the air the table shows the bets as they were.
  const [frozen, setFrozen] = useState<CrapsTable | null>(null);
  const table = frozen ?? live;
  const [chip, setChip] = useState(10);
  const [dice, setDice] = useState<[number, number]>(last?.dice ?? [3, 4]);
  const [rolling, setRolling] = useState(false);
  const [rolls, setRolls] = useState(0);
  const [log, setLog] = useState<string[]>([last ? `Last roll ${last.dice[0]} + ${last.dice[1]} = ${last.message}` : 'Place a Pass or Don’t Pass bet and roll.']);
  const [call, setCall] = useState<DealerLine | null>(onTable(live) > 0 ? 'Bets are down. Shooter, your dice.' : 'New shooter coming out. Get your bets down.');
  const [busy, setBusy] = useState(false);
  const felt = casinoArt('craps_table');
  const stick = useDealerAnim();
  const casinoLoc = useCasinoLocation();
  const crapsScene = devLegacyTables() ? null : crapsSceneFor(casinoLoc);
  const note = (m: string) => setLog((l) => [m, ...l].slice(0, 8));

  const place = async (a: CrapsAction) => {
    const block = betBlocker(table, a, chip);
    if (block) return note(block);
    setBusy(true);
    const ok = await run(() => services.casino.crapsBet(a, chip));
    if (ok) sound.play('ui_click');
    setBusy(false);
  };
  const down = async (a: CrapsAction) => {
    setBusy(true);
    const ok = await run(() => services.casino.crapsTakeDown(a));
    if (ok) sound.play('ui_click', { volume: 0.5 });
    setBusy(false);
  };

  const roll = async () => {
    if (onTable(table) === 0 || busy) return;
    setBusy(true);
    setFrozen(live);
    setRolling(true);
    setCall('Dice are out!');
    stick.play('call');
    sound.play('swing', { volume: 0.5 });
    const r = await run(() => services.casino.crapsRoll());
    await new Promise((res) => window.setTimeout(res, 700));
    setRolling(false);
    setFrozen(null);
    if (!r) return setBusy(false);
    setDice(r.dice);
    setRolls((n) => n + 1);
    sound.play('bounce_hard');
    const sum = r.dice[0] + r.dice[1];
    const won = r.paid - r.outcomes.filter((o) => o.payout > 0).reduce((a, o) => a + o.stake, 0);
    const lost = r.outcomes.filter((o) => o.result === 'lose').reduce((a, o) => a + o.stake, 0);
    note(`${r.dice[0]} + ${r.dice[1]} = ${r.message}${won > 0 ? ` · won ${formatMoney(won)}` : ''}${lost > 0 ? ` · lost ${formatMoney(lost)}` : ''}`);
    setCall(stickCall(table.point, r.table.point, sum, r.outcomes));
    if (table.point !== null && sum === 7) stick.play('special');
    else if (won > 0) stick.play('win');
    else if (lost > 0) stick.play('loss');
    if (won > 0) {
      sound.play(won >= 500 ? 'cheer' : 'cash', { volume: 0.7 });
      celebrateWin(won, r.outcomes.filter((o) => o.payout > 0).reduce((a, o) => a + Math.max(o.stake, 1), 0));
    } else if (lost > 0) sound.play('groan', { volume: 0.4 });
    signalRoundComplete(services);
    setBusy(false);
  };

  const chipAt = (key: string, amount: number, style: CSSProperties, cls = '') =>
    amount > 0 ? (
      <span key={key} className={`craps-felt-chip ${cls}`} style={style} data-testid={`craps-chip-${key}`}>
        <BetChip amount={amount} />
      </span>
    ) : null;

  const actionBtn = (a: CrapsAction, label: string, desc: string, cls = '') => {
    const on = amountOn(table, a);
    const block = betBlocker(table, a, chip);
    return (
      <span key={actionKey(a)} className={`craps-spot-wrap ${cls}`}>
        <button className={`craps-spot ${a.kind} ${on ? 'has' : ''}`} onClick={() => place(a)} disabled={busy || rolling || !!block || chip > state.balance} title={block ?? desc} aria-label={`${label}: ${block ?? desc}${on ? `. On it: ${formatMoney(on)}` : ''}`} data-testid={`craps-${actionKey(a)}`}>
          <span className="spot-name">{label}</span>
          {on > 0 ? <BetChip amount={on} className="on-spot" /> : <span className="spot-desc">{block && !on ? block : desc}</span>}
        </button>
        {on > 0 && canTakeDown(a) && (
          <button className="craps-down" onClick={() => down(a)} disabled={busy || rolling} aria-label={`Take down ${label}`} title="Take it down" data-testid={`craps-down-${actionKey(a)}`}>×</button>
        )}
      </span>
    );
  };

  return (
    <section className="hub-card casino-game craps-game">
      <h2 className="hub-title">
        Craps <span className="muted">${CRAPS_LIMITS.min}–${CRAPS_LIMITS.max} · line, come, place, odds and field</span>
        <span className={`puck ${table.point ? 'on' : ''}`}>{table.point ? `ON ${table.point}` : 'OFF'}</span>
      </h2>
      <div className={`table-layout ${WIDE_SIDE ? 'side' : ''}`}>
      {crapsScene ? (
        <div className={`craps-scene craps-felt loc-${crapsScene.location}`} style={{ aspectRatio: `${crapsScene.size[0]} / ${crapsScene.size[1]}` }} data-testid="craps-felt" data-scene={crapsScene.location}>
          <img className="craps-scene-img" src={crapsScene.url} width={crapsScene.size[0]} height={crapsScene.size[1]} alt="" draggable={false} />
          {crapsScene.veils.map((r, i) => (
            <span key={i} className={`craps-veil ${i === crapsScene.veils.length - 1 ? 'main' : ''}`} style={sceneRect(crapsScene, r)} aria-hidden>
              {i === crapsScene.veils.length - 1 && <em>Hardways and one-roll bets: not at this table yet</em>}
            </span>
          ))}
          {table.point && <span className="felt-puck" style={boxPt(crapsScene, table.point, 0, -0.3)} data-testid="craps-puck">ON</span>}
          {chipAt('pass', table.pass, scenePt(crapsScene, crapsScene.spots.pass))}
          {chipAt('passOdds', table.passOdds, scenePt(crapsScene, crapsScene.spots.odds))}
          {chipAt('dontPass', table.dontPass, scenePt(crapsScene, crapsScene.spots.dontPass))}
          {chipAt('dontOdds', table.dontOdds, scenePt(crapsScene, crapsScene.spots.dontOdds), 'small')}
          {chipAt('field', table.field, scenePt(crapsScene, crapsScene.spots.field))}
          {chipAt('come', table.come, scenePt(crapsScene, crapsScene.spots.come))}
          {chipAt('dontCome', table.dontCome, scenePt(crapsScene, crapsScene.spots.dontCome))}
          {POINTS.map((n) => (
            <Fragment key={n}>
              {chipAt(`come-${n}`, (table.comePoints[n]?.bet ?? 0) + (table.comePoints[n]?.odds ?? 0), boxPt(crapsScene, n, -0.27, 0.08), 'num')}
              {chipAt(`dc-${n}`, (table.dontComePoints[n]?.bet ?? 0) + (table.dontComePoints[n]?.odds ?? 0), boxPt(crapsScene, n, 0.27, 0.08), 'num dc')}
              {chipAt(`place-${n}`, table.place[n] ?? 0, boxPt(crapsScene, n, 0, 0.36), 'num')}
            </Fragment>
          ))}
          <div className={`dice-area ${rolling ? 'rolling' : ''}`} key={rolls} data-testid="craps-dice" style={scenePt(crapsScene, crapsScene.dice)}>
            <Die n={dice[0]} rolling={rolling} i={0} />
            <Die n={dice[1]} rolling={rolling} i={1} />
          </div>
          {!rolling && rolls > 0 && <span className="felt-sum" key={`s${rolls}`} style={scenePt(crapsScene, [crapsScene.dice[0], crapsScene.dice[1] + 70])}>{dice[0] + dice[1]}</span>}
        </div>
      ) : (
        <div className={`table-stage ${SHOW_TABLE_DEALER_SPRITES ? '' : 'no-dealer'}`}>
          {SHOW_TABLE_DEALER_SPRITES && <Dealer who="craps" anim={stick.anim} />}
          <div className="felt craps-felt" style={{ backgroundImage: `url(${felt.url})`, aspectRatio: `${felt.w} / ${felt.h}` }} data-testid="craps-felt">
            {table.point && <span className="felt-puck" style={{ left: `${POINT_X[table.point]}%` }} data-testid="craps-puck">ON</span>}
            <div className={`dice-area ${rolling ? 'rolling' : ''}`} key={rolls} data-testid="craps-dice">
              <Die n={dice[0]} rolling={rolling} i={0} />
              <Die n={dice[1]} rolling={rolling} i={1} />
            </div>
            {!rolling && rolls > 0 && <span className="felt-sum" key={`s${rolls}`}>{dice[0] + dice[1]}</span>}
          </div>
        </div>
      )}
      <div className="dealer-row">
        <DealerDialogue who="craps" line={call} anim={stick.anim} />
        <TipTray
          npcId="stick_lady"
          disabled={busy || rolling}
          onTipped={(r) => {
            setCall({ text: r.line.text, draft: r.line.status !== 'approved' });
            stick.play('call');
          }}
        />
        <ServerPanel busy={busy || rolling} />
      </div>
      </div>
      <div className="craps-bets">{LINE_BETS.map((b) => actionBtn(b.a, b.name, b.desc))}</div>
      <div className="craps-numbers" role="group" aria-label="The numbers: place bets, and odds on come points">
        {POINTS.map((n) => {
          const cp = table.comePoints[n];
          const dc = table.dontComePoints[n];
          return (
            <div key={n} className={`craps-num ${table.point === n ? 'is-point' : ''}`} data-testid={`craps-num-${n}`}>
              <p className="craps-num-head"><b>{n}</b>{table.point === n && <span className="mini-puck">ON</span>}</p>
              {actionBtn({ kind: 'place', n }, `Place ${n}`, `Pays ${PLACE_PAY[n]}; stays up after a win; loses on a 7`, 'mini')}
              {cp && <p className="craps-num-line">Come {formatMoney(cp.bet)}{cp.odds ? ` + odds ${formatMoney(cp.odds)}` : ''}</p>}
              {cp && actionBtn({ kind: 'comeOdds', n }, 'Odds', 'True odds on your Come bet, up to 2×', 'mini')}
              {dc && <p className="craps-num-line">Don&rsquo;t Come {formatMoney(dc.bet)}{dc.odds ? ` + lay ${formatMoney(dc.odds)}` : ''}</p>}
              {dc && actionBtn({ kind: 'dontComeOdds', n }, 'Lay', 'Lay odds on your Don’t Come bet', 'mini')}
            </div>
          );
        })}
      </div>
      <label className="craps-toggle">
        <input type="checkbox" checked={table.placeOn} disabled={busy || rolling} onChange={(e) => void run(() => services.casino.crapsPlaceOn(e.target.checked))} data-testid="craps-place-on" />
        Place bets work on the come-out roll too <span className="muted">(normally off)</span>
      </label>
      <div className="chip-rack">
        {CHIPS.map((c) => (
          <ChipButton key={c} value={c} on={chip === c} onClick={() => setChip(c)} label={`$${c} chip`} />
        ))}
        <span className="chip-total">Tap a bet to add <b>{formatMoney(chip)}</b> · on the table <b>{formatMoney(onTable(table))}</b></span>
      </div>
      <div className="btn-row casino-actions">
        <button className="btn primary" onClick={roll} disabled={busy || rolling || onTable(table) === 0} data-testid="craps-roll">Roll the dice</button>
      </div>
      <ul className="craps-log" aria-live="polite">
        {log.map((l, i) => <li key={i} className={i === 0 ? 'latest' : ''}>{l}</li>)}
      </ul>
      <p className="fineprint">
        Bets ride from roll to roll and stay on the table if you leave or reload. Place bets and any odds can be taken down (×); line and Come bets stay until decided.
        Odds on Come bets are off on the come-out roll. Hardways and the one-roll bets come in a later update.
      </p>
    </section>
  );
}

// ───────────────────────── Roulette ─────────────────────────

function Roulette({ active, onLeave }: { active: boolean; onLeave: () => void }) {
  const { state, services, run } = useGame();
  const monique = useMonique(active);
  const [moniqueLast, setMoniqueLast] = useState<string | null>(null);
  useEffect(() => {
    if (monique.item?.who === 'monique') setMoniqueLast(monique.item.text);
  }, [monique.item]);
  const [bets, setBets] = useState<RouletteBets>({});
  const [last, setLast] = useState<RouletteBets>({});
  const [chip, setChip] = useState(10);
  const [spinning, setSpinning] = useState(false);
  const [reaching, setReaching] = useState(false);
  const [result, setResult] = useState<number | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const [spins, setSpins] = useState(0);
  const [log, setLog] = useState<string[]>(['Place your chips on the layout, then spin.']);
  const [busy, setBusy] = useState(false);
  const roundRef = useRef<string | null>(null);
  const partRef = useRef(0);
  const felt = casinoArt('roulette_table');
  const roundId = () => (roundRef.current ??= services.casino.newRoundId('roulette'));

  const place = async (spot: RouletteSpot, amount = chip) => {
    if (amount > state.balance) {
      setLog((l) => ['Not enough in the bank for that chip', ...l].slice(0, 6));
      if (!spinning) monique.insufficient();
      return;
    }
    const block = rouletteBlocker(bets, spot, amount);
    if (block) return setLog((l) => [block, ...l].slice(0, 6));
    setBusy(true);
    const ok = await run(() => services.casino.wager('roulette', roundId(), `${spot}-${++partRef.current}`, amount));
    if (ok !== undefined) {
      setBets((b) => ({ ...b, [spot]: (b[spot] ?? 0) + amount }));
      sound.play('ui_click');
    }
    setBusy(false);
  };

  const rebet = async () => {
    for (const [spot, amount] of Object.entries(last) as [RouletteSpot, number][]) await place(spot, amount);
  };

  const spinIt = async () => {
    if (totalOn(bets) === 0) return;
    const bankBefore = state.balance + totalOn(bets);
    setBusy(true);
    setResult(null);
    // Monique reaches for the wheel; it starts turning as her hand meets the rim.
    monique.spinStart();
    setReaching(true);
    await new Promise((r) => window.setTimeout(r, REACH_MS));
    setReaching(false);
    setSpinning(true);
    sound.play('swing', { volume: 0.4 });
    await new Promise((r) => window.setTimeout(r, 2200));
    const n = spinWheel();
    const { outcomes, payout } = resolveSpin(bets, n);
    const id = roundRef.current!;
    if (payout > 0) await run(() => services.casino.settle('roulette', id, 'spin', payout));
    const staked = totalOn(bets);
    setSpinning(false);
    setResult(n);
    setHistory((h) => [n, ...h].slice(0, 12));
    setSpins((k) => k + 1);
    const winners = outcomes.filter((o) => o.payout > 0).map((o) => spotLabel(o.spot));
    const net = payout - staked;
    setLog((l) => [`${n} ${colorOf(n)}${winners.length ? ` · ${winners.join(', ')} ${winners.length > 1 ? 'win' : 'wins'}` : ''} · ${net > 0 ? `won ${formatMoney(net)}` : net === 0 ? 'broke even' : `lost ${formatMoney(-net)}`}`, ...l].slice(0, 6));
    if (payout > staked) sound.play(payout - staked >= 500 ? 'cheer' : 'cash', { volume: 0.7 });
    if (payout > staked) celebrateWin(payout - staked, staked);
    else sound.play('groan', { volume: 0.4 });
    setLast(bets);
    setBets({});
    roundRef.current = null;
    partRef.current = 0;
    setBusy(false);
    monique.spinEnd({ staked, paid: payout, straightHit: outcomes.some((o) => o.spot.startsWith('n') && o.payout > 0), bankBefore });
    signalRoundComplete(services);
  };

  const pct = (b: Box) => boxStyle(RT, b);
  const casinoLoc = useCasinoLocation();
  const rScene = devLegacyTables() ? null : rouletteSceneFor(casinoLoc);
  const boardBelow = useNarrow(700);
  const sceneBox = ([x, y, w, h]: Rect) => (rScene ? { left: `${(x / rScene.size[0]) * 100}%`, top: `${(y / rScene.size[1]) * 100}%`, width: `${(w / rScene.size[0]) * 100}%`, height: `${(h / rScene.size[1]) * 100}%` } : {});
  /** One betting spot: the same button on the old art and on the game's board. */
  const spotButton = (spot: RouletteSpot, style: CSSProperties, onBoard = false) => {
    const hit = result !== null && !spinning && (spot === `n${result}` || (!spot.startsWith('n') && rouletteWins(spot, result)));
    const cell = onBoard ? boardCell(spot) : null;
    return (
      <button
        key={spot}
        className={`roulette-spot ${hit ? 'hit' : ''} ${cell ? `rb-cell tone-${cell.tone}` : ''}`}
        style={style}
        onClick={() => place(spot)}
        disabled={busy || spinning || reaching}
        title={`${spotLabel(spot)}${rouletteBlocker(bets, spot, chip) ? ` · ${rouletteBlocker(bets, spot, chip)}` : ''}`}
        aria-label={`Bet on ${spotLabel(spot)}`}
        data-testid={`roulette-${spot}`}
      >
        {cell && <span className="rb-label">{cell.label}</span>}
        {(bets[spot] ?? 0) > 0 && <BetChip amount={bets[spot]!} className="on-spot" />}
      </button>
    );
  };
  const moniqueBox = { left: `${(MONIQUE_AT.left / RT.w) * 100}%`, top: `${(MONIQUE_AT.top / RT.h) * 100}%`, width: `${(MONIQUE_AT.w / RT.w) * 100}%`, height: `${(MONIQUE_AT.h / RT.h) * 100}%` };
  const ball = WHEEL.indexOf(result ?? 0) * (360 / WHEEL.length);

  return (
    <section className="hub-card casino-game roulette-game">
      <h2 className="hub-title">
        Roulette <span className="muted">${ROULETTE_LIMITS.min}–${ROULETTE_LIMITS.maxSpot} a spot · single zero</span>
      </h2>
      <div className={`table-layout ${WIDE_SIDE ? 'side' : ''}`}>
      <div className="table-col">
      {rScene ? (
        <>
          <div className={`roulette-scene loc-${rScene.location}`} style={{ aspectRatio: `${rScene.size[0]} / ${rScene.size[1]}` }} data-testid="roulette-felt" data-scene={rScene.location}>
            <img className="roulette-scene-img" src={rScene.url} width={rScene.size[0]} height={rScene.size[1]} alt="" draggable={false} />
            <div
              className="roulette-wheel-plane"
              style={{ left: `${(rScene.wheel.x / rScene.size[0]) * 100}%`, top: `${(rScene.wheel.y / rScene.size[1]) * 100}%`, width: `${((rScene.wheel.rx * 2) / rScene.size[0]) * 100}%`, ['--wheel-tilt' as string]: `${rScene.wheel.ry / rScene.wheel.rx}` }}
              aria-hidden
            >
              <div className={`roulette-ball-track ${spinning ? 'spinning' : ''}`} key={spins} style={{ ['--ball-end' as string]: `${ball}deg` }} data-testid="roulette-ball-track">
                {(spinning || result !== null) && <i className="roulette-ball" />}
              </div>
            </div>
            {result !== null && !spinning && <span className={`roulette-result ${colorOf(result)}`} data-testid="roulette-result">{result}</span>}
            {/* The painted grid is decorative: covered by the game's board (or a plain felt panel when the board sits below on phones). */}
            <div className="rb-cover" style={sceneBox(rScene.board)}>
              {!boardBelow && <RouletteBoard>{ALL_SPOTS.map((spot) => spotButton(spot, boardCell(spot).style, true))}</RouletteBoard>}
            </div>
          </div>
          {boardBelow && <RouletteBoard className="below">{ALL_SPOTS.map((spot) => spotButton(spot, boardCell(spot).style, true))}</RouletteBoard>}
        </>
      ) : (
        <div className="table-stage roulette-stage">
          <div className="felt roulette-felt" style={{ aspectRatio: `${felt.w} / ${felt.h}` }} data-testid="roulette-felt">
            {SHOW_TABLE_DEALER_SPRITES && <MoniqueSprite mode={monique.mode} since={monique.modeSince} style={moniqueBox} />}
            <img className="roulette-table-img" src={felt.url} alt="" draggable={false} />
            {SHOW_TABLE_DEALER_SPRITES && <MoniqueSprite mode={monique.mode} since={monique.modeSince} style={moniqueBox} layer="arm" />}
            <div
              className="roulette-wheel-plane"
              style={{ left: `${(WHEEL_AT.x / RT.w) * 100}%`, top: `${(WHEEL_AT.y / RT.h) * 100}%`, width: `${((WHEEL_AT.rx * 2) / RT.w) * 100}%`, ['--wheel-tilt' as string]: `${WHEEL_AT.ry / WHEEL_AT.rx}` }}
              aria-hidden
            >
              <div className={`roulette-ball-track ${spinning ? 'spinning' : ''}`} key={spins} style={{ ['--ball-end' as string]: `${ball}deg` }} data-testid="roulette-ball-track">
                {(spinning || result !== null) && <i className="roulette-ball" />}
              </div>
            </div>
            {result !== null && !spinning && (
              <span className={`roulette-result ${colorOf(result)}`} data-testid="roulette-result">{result}</span>
            )}
            {ALL_SPOTS.map((spot) => spotButton(spot, spot === 'n0' ? { ...pct(spotBox(spot)), clipPath: ZERO_CLIP } : pct(spotBox(spot))))}
          </div>
        </div>
      )}
      {history.length > 0 && (
        <div className="roulette-history" aria-label="Recent winning numbers (newest first)" data-testid="roulette-history">
          <span>Last numbers</span>
          {history.map((n, i) => <b key={i} className={colorOf(n)}>{n}</b>)}
        </div>
      )}
      </div>
      <div className="dealer-row">
        {monique.item && !spinning && !reaching ? (
          <DialogueBox item={monique.item} more={monique.more} onNext={monique.next} />
        ) : (
          <MoniqueRest lastLine={moniqueLast} status={spinning || reaching ? 'The wheel is spinning…' : undefined} />
        )}
        <TipTray npcId="madame_monique" disabled={busy || spinning || reaching} onTipped={(r) => monique.tipReaction(r.line.text, r.line.status === 'approved', r.event === 'tip_huge' ? 'surprised' : 'smirk')} />
        <ServerPanel busy={busy || spinning || reaching} />
      </div>
      </div>
      <div className="chip-rack">
        {CHIPS.map((c) => (
          <ChipButton key={c} value={c} on={chip === c} onClick={() => setChip(c)} label={`$${c} chip`} />
        ))}
        <span className="chip-total">Tap the layout to place <b>{formatMoney(chip)}</b> · on table <b>{formatMoney(totalOn(bets))}</b></span>
      </div>
      <div className="btn-row casino-actions">
        <button className="btn ghost" onClick={() => monique.leave(state.balance, onLeave)} disabled={busy || spinning || totalOn(bets) > 0} title={totalOn(bets) > 0 ? 'Spin or finish your bets first' : undefined} data-testid="roulette-leave">Leave the table</button>
        <button className="btn ghost" onClick={rebet} disabled={busy || spinning || totalOn(bets) > 0 || totalOn(last) === 0} data-testid="roulette-rebet">Same bets again</button>
        <button className="btn primary" onClick={spinIt} disabled={busy || spinning || totalOn(bets) === 0} data-testid="roulette-spin">Spin the wheel</button>
      </div>
      <ul className="craps-log" aria-live="polite" data-testid="roulette-log">
        {log.map((l, i) => <li key={i} className={i === 0 ? 'latest' : ''}>{l}</li>)}
      </ul>
      <p className="fineprint">Pays: a number 35 to 1 · dozens and columns 2 to 1 · red/black, odd/even, 1–18/19–36 even money. Zero loses every outside bet.</p>
    </section>
  );
}

// ───────────────────────── Casino floor ─────────────────────────

export function CasinoPanel() {
  const { state, services, run, notify } = useGame();
  const c = state.career;
  const [game, setGame] = useState<Game>('blackjack');
  const inside = c.flags.casinoVisit === casinoWeekKey(c);
  const pending = pendingRace(c);
  useEffect(() => {
    if (!pending || inside) return;
    void run(async () => {
      const out = await services.casino.finishGreyhoundRace(pending.roundId);
      if (out) notify({ kind: 'info', title: out.payout > 0 ? `Your greyhound won: ${formatMoney(out.payout)} paid` : 'Your greyhound bet from last visit lost' });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending?.roundId, inside]);
  const block = casinoBlocker(c);
  const net = casinoNet(c);
  // The casino Ryan is in (or, in development, a previewed one). Everything on the floor follows it.
  const at = devChipPreview() ?? casinoAt(c);
  const here = locationById(at);
  const exterior = at === 'desert_palms' ? casinoArt('casino_exterior').url : LOBBY_ART[at].art;
  const logo = casinoArt('casino_logo');

  return (
    <CasinoLocationContext.Provider value={at}>
    <main className="casino">
      <BigWinOverlay />
      <section className={`hub-card casino-head loc-${at}`} style={{ backgroundImage: `linear-gradient(90deg, rgba(20,8,30,0.92) 0%, rgba(20,8,30,0.55) 45%, rgba(20,8,30,0.1) 100%), url(${exterior})` }}>
        <div className="casino-brand">
          {at === 'desert_palms' ? (
            <img className="casino-logo" src={logo.url} alt="Desert Palms Casino" draggable={false} />
          ) : (
            <p className="casino-name" data-testid="casino-name">{here.name}</p>
          )}
          <p className="muted">Blackjack, slots, video poker, keno, Spin to Win, craps, roulette, baccarat, Three Card Poker and greyhound racing. In-game money only.</p>
        </div>
        <dl className="casino-stats">
          <div><dt>Bank</dt><dd>{formatMoney(state.balance)}</dd></div>
          <div><dt>Casino all-time</dt><dd className={net >= 0 ? 'pos' : 'neg'}>{formatMoney(net, true)}</dd></div>
          <div><dt>Biggest win</dt><dd>{formatMoney(Number(c.flags.casinoBiggestWin ?? 0))}</dd></div>
        </dl>
      </section>

      <CasinoLobby onPlayHere={() => document.getElementById('casino-games')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />

      {!inside ? (
        <section className="hub-card casino-door">
          <img className="door-art" src={exterior} alt={`The ${here.name.replace(/^The /, '')} entrance at night`} draggable={false} />
          <div>
            <h2 className="hub-title">A night out?</h2>
            <p>Spending the evening at the casino uses <b>one of this week&rsquo;s activities</b> and {CASINO_ENERGY} energy. Once you&rsquo;re in, play as much as you like until next week.</p>
            <button
              className="btn primary"
              disabled={!!block}
              onClick={async () => {
                // The real casino (a development preview only changes the pictures).
                const real = casinoAt(c);
                const o = await run(() => services.casino.visit(real));
                if (o) notify({ kind: 'info', title: `Welcome to ${locationById(real).name}` });
              }}
              data-testid="casino-enter"
            >
              Head to the casino
            </button>
            {block && <p className="warn-text">{block}</p>}
          </div>
        </section>
      ) : (
        <>
          <nav className="subtabs casino-tabs" id="casino-games" aria-label="Casino games">
            {here.games.map((g) => (
              <button key={g.id} className={game === g.id ? 'on' : ''} onClick={() => setGame(g.id)} data-testid={`casino-${g.id}`}>{g.label}</button>
            ))}
          </nav>
          {/* Games stay mounted so a hand in progress survives switching. */}
          <div hidden={game !== 'blackjack'}><Blackjack /></div>
          <div hidden={game !== 'slots'}><Slots /></div>
          <div hidden={game !== 'craps'}><Craps /></div>
          <div hidden={game !== 'roulette'}><Roulette active={game === 'roulette'} onLeave={() => setGame('blackjack')} /></div>
          {game === 'baccarat' && <Baccarat />}
          {game === 'threecard' && <ThreeCard />}
          {game === 'greyhounds' && <Greyhounds onLeave={() => setGame('blackjack')} />}
          {game === 'sportsbook' && <Sportsbook />}
          {game === 'machines' && <VideoMachine />}
          {game === 'wheel' && <SpinWheel />}
        </>
      )}
    </main>
    </CasinoLocationContext.Provider>
  );
}
