import { useEffect, useRef, useState } from 'react';
import {
  BJ_LIMITS, canDouble, canSplit, deal, double, handValue, hit, newTable, split, stand, totalPayout,
  type BJState,
} from '../../casino/blackjack';
import { betBlocker, betsOnTable, CRAPS_LIMITS, newCraps, resolveRoll, rollDice, type BetKey, type CrapsState } from '../../casino/craps';
import { PAYTABLE, REEL, SLOT_BETS, spin, SYMBOL_ART, type SlotSymbol } from '../../casino/slots';
import {
  betBlocker as rouletteBlocker, colorOf, resolveSpin, ROULETTE_LIMITS, spinWheel, spotLabel, totalOn, WHEEL,
  type RouletteBets, type RouletteSpot,
} from '../../casino/roulette';
import { cryptoInt } from '../../casino/random';
import { CASINO_ENERGY, casinoBlocker, casinoNet, casinoWeekKey } from '../../career/engine';
import { sound } from '../../audio/sound';
import { useGame } from '../GameContext';
import { formatMoney } from '../format';
import { boxStyle, casinoArt } from './casinoArt';
import { Greyhounds } from './Greyhounds';
import { BetChip, PlayingCard } from './TableBits';
import { Baccarat, ThreeCard } from './WWTables';
import { DialogueBox, MoniqueSprite, REACH_MS, useMonique } from './Monique';
import { DealerSprite, useDealerAnim, type DealerAnim } from './DealerSprite';
import { BigWinOverlay, celebrateWin } from './BigWin';
import { DEALER_NAMES, DealerDialogue, type DealerLine } from './DealerDialogue';
import { TipTray } from './Tipping';
import { CardTableScene, feltAt, useCardScene } from './CardTableScene';
import { CARD_LAYOUTS, crapsSceneFor, type CrapsScene, type Pt, type Rect } from '../../expansion/tableThemes';
import { SHOW_TABLE_DEALER_SPRITES } from './DealerPanel';
import { ChipButton, ChipImg } from './Chips';
import { CasinoLocationContext, devChipPreview, devLegacyTables, useCasinoLocation } from './casinoLocation';
import { chipAsset } from '../../expansion/chipThemes';
import { CasinoLobby } from './CasinoLobby';
import { LOCATIONS, type CasinoGameId } from '../../expansion/locations';
import { ALL_SPOTS, MONIQUE_AT, RT, spotBox, WHEEL_AT, ZERO_CLIP, type Box } from './rouletteLayout';
import { pendingRace } from '../../services/casinoService';

/*
 * Presentation only. Every rule, wager and settlement call below is the same
 * as before the art upgrade: the tables, cabinet and dealers are drawn around
 * the existing games.
 */

type Game = CasinoGameId;

const CHIPS = [5, 10, 25, 100, 500];
const BJ_L = CARD_LAYOUTS.blackjack;

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
  const scene = useCardScene();
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
      {scene ? (
        <CardTableScene scene={scene} game="blackjack" testId="bj-felt">
          <div className="cs-block cs-row" style={feltAt(BJ_L.dealer)}>
            {dealerTotal}
            {dealerCards}
          </div>
          <p className="cs-rules" style={feltAt(BJ_L.rules)}>Blackjack pays 3 to 2 · Dealer stands on all 17s</p>
          <div className={`cs-block cs-row felt-hands n${Math.max(1, table.hands.length)}`} style={feltAt(BJ_L.hands)}>{hands}</div>
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

const BET_LABELS: Record<BetKey, { name: string; desc: string }> = {
  pass: { name: 'Pass Line', desc: '7/11 win on come-out; then hit the point before a 7' },
  dontPass: { name: "Don't Pass", desc: '2/3 win on come-out (12 pushes); then 7 before the point' },
  odds: { name: 'Pass Odds', desc: 'True odds behind your Pass bet, up to 2×. No house edge.' },
  field: { name: 'Field', desc: 'One roll: 3,4,9,10,11 pay 1:1 · 2 pays 2:1 · 12 pays 3:1' },
};

/** Where each point box sits on the drawn table (percent across, measured from the gold box lines on craps_table_v2). */
const POINT_X: Record<number, number> = { 4: 31.9, 5: 39.2, 6: 46.5, 8: 53.9, 9: 61.2, 10: 68.8 };

const scenePt = (sc: CrapsScene, [x, y]: Pt) => ({ left: `${(x / sc.size[0]) * 100}%`, top: `${(y / sc.size[1]) * 100}%` });
const sceneRect = (sc: CrapsScene, [x, y, w, h]: Rect) => ({ left: `${(x / sc.size[0]) * 100}%`, top: `${(y / sc.size[1]) * 100}%`, width: `${(w / sc.size[0]) * 100}%`, height: `${(h / sc.size[1]) * 100}%` });

/** Stick Lady's call for a roll (flavour only; the result comes from the craps rules). */
function stickCall(before: number | null, after: number | null, sum: number): string {
  if (before === null) {
    if (sum === 7 || sum === 11) return sum === 11 ? 'Yo-leven! Front line winner!' : 'Seven! Front line winner!';
    if (sum === 2 || sum === 3 || sum === 12) return `Craps, ${sum}! Line away.`;
    return `The point is ${sum}. Mark it!`;
  }
  if (sum === before) return `${sum}, the hard way or easy, winner! Pay the line.`;
  if (sum === 7 && after === null) return 'Seven out. Line away.';
  return `${sum}. No decision. Shooter rolls again.`;
}

function Craps() {
  const { state, services, run } = useGame();
  const [table, setTable] = useState<CrapsState>(newCraps());
  const [chip, setChip] = useState(10);
  const [dice, setDice] = useState<[number, number]>([3, 4]);
  const [rolling, setRolling] = useState(false);
  const [rolls, setRolls] = useState(0);
  const [log, setLog] = useState<string[]>(['Place a Pass or Don\'t Pass bet and roll.']);
  const [call, setCall] = useState<DealerLine | null>('New shooter coming out. Get your bets down.');
  const roundRef = useRef<string | null>(null);
  const partRef = useRef(0);
  const [busy, setBusy] = useState(false);
  const felt = casinoArt('craps_table');
  const stick = useDealerAnim();
  const casinoLoc = useCasinoLocation();
  const crapsScene = devLegacyTables() ? null : crapsSceneFor(casinoLoc);

  const roundId = () => (roundRef.current ??= services.casino.newRoundId('craps'));

  const place = async (bet: BetKey) => {
    const block = betBlocker(table, bet, chip);
    if (block) return setLog((l) => [block, ...l].slice(0, 6));
    setBusy(true);
    const ok = await run(() => services.casino.wager('craps', roundId(), `${bet}${++partRef.current}`, chip));
    if (ok !== undefined) {
      setTable((t) => ({ ...t, bets: { ...t.bets, [bet]: t.bets[bet] + chip } }));
      sound.play('ui_click');
    }
    setBusy(false);
  };

  const roll = async () => {
    if (betsOnTable(table) === 0) return;
    setBusy(true);
    setRolling(true);
    setCall('Dice are out!');
    stick.play('call');
    sound.play('swing', { volume: 0.5 });
    await new Promise((r) => window.setTimeout(r, 700));
    const d = rollDice();
    setDice(d);
    setRolling(false);
    setRolls((n) => n + 1);
    sound.play('bounce_hard');
    const { state: next, outcomes, message } = resolveRoll(table, d);
    const pay = outcomes.reduce((a, o) => a + o.payout, 0);
    const id = roundRef.current!;
    if (pay > 0) await run(() => services.casino.settle('craps', id, `roll${++partRef.current}`, pay));
    const won = outcomes.filter((o) => o.result === 'win').reduce((a, o) => a + o.payout - table.bets[o.bet], 0);
    setLog((l) => [`${d[0]} + ${d[1]} = ${message}${won ? ` · won ${formatMoney(won)}` : outcomes.some((o) => o.result === 'lose') ? ' · bets lost' : ''}`, ...l].slice(0, 6));
    setCall(stickCall(table.point, next.point, d[0] + d[1]));
    {
      const sevenOut = table.point !== null && d[0] + d[1] === 7;
      const anyWin = outcomes.some((o) => o.result === 'win');
      const anyLose = outcomes.some((o) => o.result === 'lose');
      if (sevenOut) stick.play('special');
      else if (anyWin) stick.play('win');
      else if (anyLose) stick.play('loss');
    }
    if (won) sound.play(won >= 500 ? 'cheer' : 'cash', { volume: 0.7 });
    if (won > 0) celebrateWin(won, outcomes.filter((o) => o.result === 'win').reduce((a, o) => a + table.bets[o.bet], 0));
    else if (outcomes.some((o) => o.result === 'lose')) sound.play('groan', { volume: 0.4 });
    setTable(next);
    if (betsOnTable(next) === 0) {
      roundRef.current = null;
      partRef.current = 0;
    }
    setBusy(false);
  };

  return (
    <section className="hub-card casino-game craps-game">
      <h2 className="hub-title">
        Craps <span className="muted">${CRAPS_LIMITS.min}–${CRAPS_LIMITS.max}</span>
        <span className={`puck ${table.point ? 'on' : ''}`}>{table.point ? `ON ${table.point}` : 'OFF'}</span>
      </h2>
      {crapsScene ? (
        <div className={`craps-scene craps-felt loc-${crapsScene.location}`} style={{ aspectRatio: `${crapsScene.size[0]} / ${crapsScene.size[1]}` }} data-testid="craps-felt" data-scene={crapsScene.location}>
          <img className="craps-scene-img" src={crapsScene.url} width={crapsScene.size[0]} height={crapsScene.size[1]} alt="" draggable={false} />
          {crapsScene.veils.map((r, i) => (
            <span key={i} className={`craps-veil ${i === crapsScene.veils.length - 1 ? 'main' : ''}`} style={sceneRect(crapsScene, r)} aria-hidden>
              {i === crapsScene.veils.length - 1 && <em>This table: Pass · Don&rsquo;t Pass · Odds · Field</em>}
            </span>
          ))}
          {table.point && <span className="felt-puck" style={scenePt(crapsScene, crapsScene.point[table.point as 4])} data-testid="craps-puck">ON</span>}
          {(Object.keys(crapsScene.spots) as BetKey[]).map((k) =>
            table.bets[k] > 0 ? (
              <span key={k} className="craps-felt-chip" style={scenePt(crapsScene, crapsScene.spots[k])} data-testid={`craps-chip-${k}`}>
                <BetChip amount={table.bets[k]} />
              </span>
            ) : null,
          )}
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
      </div>
      <div className="craps-bets">
        {(Object.keys(BET_LABELS) as BetKey[]).map((k) => {
          const block = betBlocker(table, k, chip);
          return (
            <button key={k} className={`craps-spot ${k}`} onClick={() => place(k)} disabled={busy || chip > state.balance} title={block ?? BET_LABELS[k].desc} data-testid={`craps-${k}`}>
              <span className="spot-name">{BET_LABELS[k].name}</span>
              <span className="spot-desc">{BET_LABELS[k].desc}</span>
              {table.bets[k] > 0 && <BetChip amount={table.bets[k]} className="on-spot" />}
            </button>
          );
        })}
      </div>
      <div className="chip-rack">
        {CHIPS.map((c) => (
          <ChipButton key={c} value={c} on={chip === c} onClick={() => setChip(c)} label={`$${c} chip`} />
        ))}
        <span className="chip-total">Tap a bet to place <b>{formatMoney(chip)}</b> · on table <b>{formatMoney(betsOnTable(table))}</b></span>
      </div>
      <div className="btn-row casino-actions">
        <button className="btn primary" onClick={roll} disabled={busy || betsOnTable(table) === 0} data-testid="craps-roll">Roll the dice</button>
      </div>
      <ul className="craps-log" aria-live="polite">
        {log.map((l, i) => <li key={i} className={i === 0 ? 'latest' : ''}>{l}</li>)}
      </ul>
    </section>
  );
}


// ───────────────────────── Roulette ─────────────────────────

function Roulette({ active, onLeave }: { active: boolean; onLeave: () => void }) {
  const { state, services, run } = useGame();
  const monique = useMonique(active);
  const [bets, setBets] = useState<RouletteBets>({});
  const [last, setLast] = useState<RouletteBets>({});
  const [chip, setChip] = useState(10);
  const [spinning, setSpinning] = useState(false);
  const [reaching, setReaching] = useState(false);
  const [result, setResult] = useState<number | null>(null);
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
  };

  const pct = (b: Box) => boxStyle(RT, b);
  const moniqueBox = { left: `${(MONIQUE_AT.left / RT.w) * 100}%`, top: `${(MONIQUE_AT.top / RT.h) * 100}%`, width: `${(MONIQUE_AT.w / RT.w) * 100}%`, height: `${(MONIQUE_AT.h / RT.h) * 100}%` };
  const ball = WHEEL.indexOf(result ?? 0) * (360 / WHEEL.length);

  return (
    <section className="hub-card casino-game roulette-game">
      <h2 className="hub-title">
        Roulette <span className="muted">${ROULETTE_LIMITS.min}–${ROULETTE_LIMITS.maxSpot} a spot · single zero</span>
      </h2>
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
          {ALL_SPOTS.map((spot) => {
            const hit = result !== null && !spinning && spot === `n${result}`;
            return (
              <button
                key={spot}
                className={`roulette-spot ${hit ? 'hit' : ''}`}
                style={spot === 'n0' ? { ...pct(spotBox(spot)), clipPath: ZERO_CLIP } : pct(spotBox(spot))}
                onClick={() => place(spot)}
                disabled={busy || spinning || reaching}
                title={`${spotLabel(spot)}${rouletteBlocker(bets, spot, chip) ? ` · ${rouletteBlocker(bets, spot, chip)}` : ''}`}
                aria-label={`Bet on ${spotLabel(spot)}`}
                data-testid={`roulette-${spot}`}
              >
                {(bets[spot] ?? 0) > 0 && <BetChip amount={bets[spot]!} className="on-spot" />}
              </button>
            );
          })}
        </div>
      </div>
      <div className="dealer-row">
        {monique.item && !spinning && !reaching && <DialogueBox item={monique.item} more={monique.more} onNext={monique.next} />}
        <TipTray npcId="madame_monique" disabled={busy || spinning || reaching} onTipped={(r) => monique.tipReaction(r.line.text, r.line.status === 'approved', r.event === 'tip_huge' ? 'surprised' : 'smirk')} />
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

const DESERT_PALMS = LOCATIONS.find((l) => l.id === 'desert_palms')!;

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
  const exterior = casinoArt('casino_exterior');
  const logo = casinoArt('casino_logo');

  return (
    <CasinoLocationContext.Provider value={devChipPreview() ?? 'desert_palms'}>
    <main className="casino">
      <BigWinOverlay />
      <section className="hub-card casino-head" style={{ backgroundImage: `linear-gradient(90deg, rgba(20,8,30,0.92) 0%, rgba(20,8,30,0.55) 45%, rgba(20,8,30,0.1) 100%), url(${exterior.url})` }}>
        <div className="casino-brand">
          <img className="casino-logo" src={logo.url} alt="Desert Palms Casino" draggable={false} />
          <p className="muted">Blackjack, slots, craps, roulette, baccarat, Three Card Poker and greyhound racing. In-game money only.</p>
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
          <img className="door-art" src={exterior.url} alt="The Desert Palms entrance, palms and fountains lit up at night" draggable={false} />
          <div>
            <h2 className="hub-title">A night out?</h2>
            <p>Spending the evening at the casino uses <b>one of this week&rsquo;s activities</b> and {CASINO_ENERGY} energy. Once you&rsquo;re in, play as much as you like until next week.</p>
            <button
              className="btn primary"
              disabled={!!block}
              onClick={async () => {
                const o = await run(() => services.casino.visit());
                if (o) notify({ kind: 'info', title: 'Welcome to Desert Palms' });
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
            {DESERT_PALMS.games.map((g) => (
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
        </>
      )}
    </main>
    </CasinoLocationContext.Provider>
  );
}
