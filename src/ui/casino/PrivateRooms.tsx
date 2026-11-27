/**
 * The casino's private rooms tab: greyed out until a dealer who works this floor invites Ryan,
 * then the poker room and the private course, open for good. Presentation only: every chip
 * and dollar moves through PokerService.
 */
import { useEffect, useState } from 'react';
import { legal, pot, variantOf } from '../../casino/poker/holdem';
import type { PokerRoom as Room } from '../../casino/poker/rooms';
import { dealerById } from '../../npc/registry';
import { INVITE_LINES, INVITE_NIGHTS } from '../../npc/vip';
import { HERO, pokerTable, skinsBlocker, skinsMatch, SKINS_ENERGY, type VipStatus } from '../../services/pokerService';
import { buyIn as skinsBuyIn, courseAt, holesPlayed, inPlayoff, nameOf, parOf, SKINS_HOLES, skinValue, STYLE_HINTS, type SkinsMatch, type SkinsStyle } from '../../expansion/skins';
import type { LocationId } from '../../expansion/unlocks';
import { useGame } from '../GameContext';
import { formatMoney } from '../format';
import { BetChip, PlayingCard } from './TableBits';
import { SpriteFrame } from '../story/Sprite';
import { portraitKey } from '../../story/sprites';
import { RYAN_ID } from '../../story/cast';
import { appearanceOf } from '../../story/appearance';

/** `refresh` re-reads when it changes (the floor passes the open game, so moving tables re-checks). */
export function useVipStatus(at: LocationId, refresh?: unknown): VipStatus | null {
  const { state, services } = useGame();
  const [v, setV] = useState<VipStatus | null>(null);
  useEffect(() => {
    let live = true;
    void services.poker.vipStatus(at).then((s) => live && setV(s)).catch(() => {});
    return () => { live = false; };
  }, [at, services, state, refresh]);
  return v;
}

/** The invitation, shown on the floor once a dealer is ready to make it. */
export function VipInvite({ at, onOpen, refresh }: { at: LocationId; onOpen: () => void; refresh?: unknown }) {
  const { services, run, notify } = useGame();
  const v = useVipStatus(at, refresh);
  const [line, setLine] = useState(0);
  if (!v || v.unlocked || !v.inviter) return null;
  const d = dealerById(v.inviter)!;
  const lines = INVITE_LINES[v.inviter](v.room.name, v.room.course.name);
  const last = line >= lines.length - 1;
  return (
    <section className="hub-card vip-invite" data-testid="vip-invite">
      <div className="avatar portrait vip-face" aria-hidden="true">{d.short[0]}</div>
      <div className="vip-body">
        <p className="rpg-name">{d.name} <span className="vip-tag">Invitation</span></p>
        <p className="rpg-text">{lines[line]}</p>
        <div className="row">
          {!last ? (
            <button className="btn" onClick={() => setLine(line + 1)} data-testid="vip-next">Go on…</button>
          ) : (
            <button
              className="btn primary"
              data-testid="vip-accept"
              onClick={async () => {
                const o = await run(() => services.poker.acceptInvite(at));
                if (o) { notify({ kind: 'info', title: `${v.room.name} and ${v.room.course.name} are open to you` }); onOpen(); }
              }}
            >
              "I'm in."
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

export function PrivateRooms({ at }: { at: LocationId }) {
  const v = useVipStatus(at);
  const [part, setPart] = useState<'poker' | 'course'>('poker');
  if (!v) return null;
  const room = v.room;
  if (!v.unlocked) {
    return (
      <section className="hub-card vip-locked" data-testid="vip-locked">
        <h2 className="hub-title">🔒 Invitation only</h2>
        <p>Somewhere past the cage there&rsquo;s a poker room, <b>{room.name}</b>, and out back a private course, <b>{room.course.name}</b>. Nobody gets in without a dealer vouching for them.</p>
        <p className="muted">Become a <b>Friend</b> of one of the dealers working this floor. Tips get you to Regular; after that it&rsquo;s nights at their table that count. Spend at least {INVITE_NIGHTS} nights at their table here, and they&rsquo;ll bring it up.</p>
        {v.inviter && <p className="pos">Someone wants a word with you. Check the casino floor.</p>}
      </section>
    );
  }
  return (
    <div className="vip-rooms">
      <nav className="subtabs vip-sub" aria-label="Private rooms">
        <button className={part === 'poker' ? 'on' : ''} onClick={() => setPart('poker')} data-testid="vip-poker">{room.name} · {room.variantName}</button>
        <button className={part === 'course' ? 'on' : ''} onClick={() => setPart('course')} data-testid="vip-course">{room.course.name}</button>
      </nav>
      {part === 'poker' ? <PokerRoomView room={room} /> : <SkinsView at={room.location} blurb={room.course.blurb} />}
    </div>
  );
}

const SEAT_POS = ['s-hero', 's-left', 's-topleft', 's-topright', 's-right'];

function PokerRoomView({ room }: { room: Room }) {
  const { state, services, run } = useGame();
  const t = pokerTable(state.career);
  const [buyIn, setBuyIn] = useState(Math.min(room.buyIn.max, Math.max(room.buyIn.min, 500)));
  const [raise, setRaise] = useState(0);
  const s = t?.state;
  const myTurn = !!s && !s.result && s.toAct === HERO;
  const L = s && myTurn ? legal(s, HERO) : null;
  useEffect(() => { if (L?.maxTo) setRaise(L.minTo); }, [L?.minTo, L?.maxTo]);

  if (!room.open) {
    return (
      <section className="hub-card poker-room" data-testid="poker-soon">
        <h2 className="hub-title">{room.name}</h2>
        <p>The {room.variantName} table is still being set up. The regulars are already arguing about the seating chart.</p>
        <ul className="poker-regulars">{room.regulars.map((r) => <li key={r.id}><b style={{ color: r.color }}>{r.name}</b>: {r.bio}</li>)}</ul>
      </section>
    );
  }

  if (!t || !s) {
    return (
      <section className="hub-card poker-room" data-testid="poker-lobby">
        <h2 className="hub-title">{room.name} · {room.variantName}</h2>
        <p className="muted">{room.variant === 'stud' ? `Antes ${formatMoney(Math.max(1, Math.round(room.bb / 5)))}, bring-in ${formatMoney(room.sb)}, bets ${formatMoney(room.bb)}/${formatMoney(room.bb * 2)}` : `Blinds ${formatMoney(room.sb)}/${formatMoney(room.bb)}${room.variant === 'omaha8' ? ', pot limit, high and low split the pot' : ''}`} · buy in {formatMoney(room.buyIn.min)}–{formatMoney(room.buyIn.max)}. Same four regulars every night.</p>
        <ul className="poker-regulars">{room.regulars.map((r) => <li key={r.id}><span className="poker-av" style={{ background: r.color }}>{r.short[0]}</span><b>{r.name}</b>: {r.bio}</li>)}</ul>
        <div className="row">
          <label>Buy in <input type="range" min={room.buyIn.min} max={room.buyIn.max} step={50} value={buyIn} onChange={(e) => setBuyIn(Number(e.target.value))} data-testid="poker-buyin" /> <b>{formatMoney(buyIn)}</b></label>
          <button className="btn primary" onClick={() => run(() => services.poker.sit(buyIn))} data-testid="poker-sit">Take a seat</button>
        </div>
      </section>
    );
  }

  const over = !!s.result;
  const shown = over && s.result!.shown;
  const winners = new Set(s.result?.wins.map((w) => w.seat));
  const hero = s.seats[HERO];
  return (
    <section className="hub-card poker-room" data-testid="poker-table">
      <div className="poker-felt">
        <div className="poker-center">
          <div className={`poker-board ${variantOf(s) === 'stud' ? 'stud' : ''}`}>{s.board.map((c, i) => <PlayingCard key={`${s.handNo}-${i}`} card={c} i={i} />)}</div>
          <p className="poker-pot" data-testid="poker-pot">{over ? s.log[s.log.length - 1] : `Pot ${formatMoney(pot(s))}`}</p>
        </div>
        {s.seats.map((x, i) => {
          const reg = i === HERO ? null : room.regulars[i - 1];
          const reveal = i === HERO || (shown && !x.folded && x.inHand);
          const stud = variantOf(s) === 'stud';
          return (
            <div key={x.id} className={`poker-seat ${SEAT_POS[i]} ${x.folded ? 'folded' : ''} ${s.toAct === i ? 'acting' : ''} ${winners.has(i) ? 'won' : ''}`} data-testid={`poker-seat-${i}`}>
              {reg ? <span className="poker-av" style={{ background: reg.color }}>{reg.short[0]}</span> : <span className="poker-av hero-av"><SpriteFrame who={RYAN_ID} frame={portraitKey(RYAN_ID, 'neutral', appearanceOf(state.career))} height={40} /></span>}
              <div className="poker-name">{reg?.short ?? 'You'}{s.button === i && <span className="poker-btn" title="Dealer button">D</span>}</div>
              <div className="poker-stack">{formatMoney(x.stack)}{x.allIn && !over ? ' · all in' : ''}</div>
              <div className={`poker-hole n${x.hole.length}`}>
                {x.inHand && x.hole.map((c, k) => (
                  <span key={`${s.handNo}-${k}`} className={stud && x.up?.[k] ? 'pk-up' : stud ? 'pk-down' : ''}>
                    <PlayingCard card={c} i={k} hidden={!reveal && !(stud && x.up?.[k])} />
                  </span>
                ))}
              </div>
              {x.bet > 0 && <BetChip amount={x.bet} className="poker-bet" />}
              {t.chat.filter((m) => m.seat === i).slice(-1).map((m, k) => <p key={k} className="poker-bubble">{m.text}</p>)}
            </div>
          );
        })}
      </div>
      <div className="row poker-actions">
        {myTurn && L && (
          <>
            {L.fold && <button className="btn" onClick={() => run(() => services.poker.act({ type: 'fold' }))} data-testid="poker-fold">Fold</button>}
            {L.check && <button className="btn" onClick={() => run(() => services.poker.act({ type: 'check' }))} data-testid="poker-check">Check</button>}
            {L.toCall > 0 && <button className="btn primary" onClick={() => run(() => services.poker.act({ type: 'call' }))} data-testid="poker-call">Call {formatMoney(L.toCall)}</button>}
            {L.maxTo > 0 && (
              <span className="poker-raise">
                {L.maxTo > L.minTo && <input type="range" min={L.minTo} max={L.maxTo} step={1} value={Math.min(Math.max(raise, L.minTo), L.maxTo)} onChange={(e) => setRaise(Number(e.target.value))} aria-label="Raise to" />}
                <button className="btn primary" onClick={() => run(() => services.poker.act({ type: 'raise', to: Math.min(Math.max(raise, L.minTo), L.maxTo) }))} data-testid="poker-raise">
                  {Math.max(raise, L.minTo) >= hero.bet + hero.stack ? 'All in' : s.currentBet === 0 ? 'Bet' : 'Raise to'} {formatMoney(Math.min(Math.max(raise, L.minTo), L.maxTo))}
                </button>
              </span>
            )}
          </>
        )}
        {over && hero.stack > 0 && <button className="btn primary" onClick={() => run(() => services.poker.nextHand())} data-testid="poker-next">Next hand</button>}
        {over && hero.stack < room.buyIn.max && (
          <button className="btn" onClick={() => run(() => services.poker.rebuy(Math.min(room.buyIn.max - hero.stack, Math.max(room.buyIn.min, room.buyIn.max - hero.stack))))} data-testid="poker-rebuy">
            Top up to {formatMoney(room.buyIn.max)}
          </button>
        )}
        <button className="btn ghost" onClick={() => run(() => services.poker.leave())} data-testid="poker-leave">{over ? 'Cash out' : 'Fold and cash out'}</button>
      </div>
      <ul className="craps-log poker-log" aria-live="polite">{[...s.log].reverse().slice(0, 6).map((l, i) => <li key={i} className={i === 0 ? 'latest' : ''}>{l}</li>)}</ul>
      <p className="fineprint">Bought in: {formatMoney(t.bought)} · regulars reload when they bust; only your own chips are yours. In-game money only.</p>
    </section>
  );
}

function Scorecard({ m }: { m: SkinsMatch }) {
  const n = Math.max(SKINS_HOLES, holesPlayed(m));
  const course = courseAt(m.location);
  return (
    <div className="skins-card-wrap">
      <table className="skins-card" data-testid="skins-card">
        <thead>
          <tr><th>Hole</th>{Array.from({ length: n }, (_, i) => <th key={i} className={i >= SKINS_HOLES ? 'po' : ''}>{i < SKINS_HOLES ? i + 1 : `P${i - SKINS_HOLES + 1}`}</th>)}<th>Skins</th></tr>
          <tr className="par"><td>Par</td>{Array.from({ length: n }, (_, i) => <td key={i}>{parOf(m, i)}</td>)}<td /></tr>
        </thead>
        <tbody>
          {m.players.map((_, w) => (
            <tr key={w} className={w === 0 ? 'me' : ''}>
              <td><span className="poker-av sm" style={{ background: w === 0 ? '#1e8449' : course.rivals[w - 1].color }}>{nameOf(m, w)[0]}</span> {nameOf(m, w)}</td>
              {Array.from({ length: n }, (_, i) => {
                const sc = m.scores[w][i];
                const par = parOf(m, i);
                const best = sc !== undefined && Math.min(...m.scores.map((r) => r[i])) === sc && m.scores.filter((r) => r[i] === sc).length === 1;
                return <td key={i} className={`${sc === undefined ? '' : sc < par ? 'under' : sc > par ? 'over' : ''} ${best ? 'skin' : ''}`}>{sc ?? ''}</td>;
              })}
              <td><b>{m.skins[w]}</b></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SkinsView({ at, blurb }: { at: LocationId; blurb: string }) {
  const { state, services, run, notify } = useGame();
  const c = state.career;
  const course = courseAt(at);
  const live = skinsMatch(c);
  const [last, setLast] = useState<{ m: SkinsMatch; payout: number } | null>(null);
  const block = skinsBlocker(c, at, state.balance);
  const m = live ?? last?.m ?? null;
  const play = async (style: SkinsStyle) => {
    const o = await run(() => services.poker.skinsPlay(style));
    if (o?.payout !== null && o?.payout !== undefined) {
      setLast({ m: o.match, payout: o.payout });
      const net = o.payout - skinsBuyIn(o.match);
      notify({ kind: net >= 0 ? 'purchase' : 'info', title: `${course.name}: ${o.match.skins[0]} skin${o.match.skins[0] === 1 ? '' : 's'}`, body: `${net >= 0 ? '+' : ''}${formatMoney(net)}` });
    }
  };
  const banter = (() => {
    if (!m || !m.log.length) return null;
    const i = holesPlayed(m) - 1;
    const best = Math.min(...m.scores.map((r) => r[i]));
    const winners = m.scores.map((r, w) => (r[i] === best ? w : -1)).filter((w) => w >= 0);
    const pickLine = (xs: string[]) => xs[(m.seed + i) % xs.length];
    if (inPlayoff(m) && holesPlayed(m) === SKINS_HOLES) return { w: 1 + (m.seed % 3), text: pickLine(course.rivals[m.seed % 3].lines.playoff) };
    if (winners.length !== 1) return null;
    const w = winners[0];
    if (w > 0) return { w, text: pickLine(course.rivals[w - 1].lines.win) };
    const loser = 1 + ((m.seed + i) % 3);
    return { w: loser, text: pickLine(course.rivals[loser - 1].lines.lose) };
  })();
  return (
    <section className="hub-card vip-course" data-testid="skins">
      <h2 className="hub-title">⛳ {course.name} · Skins</h2>
      {!m ? (
        <>
          <p>{blurb}</p>
          <p className="muted">Nine holes, four players, {formatMoney(course.stake)} a skin from everyone ({formatMoney(course.stake * 4)} a hole). Ties carry. Anything still riding after the ninth goes to sudden death. Buy-in {formatMoney(skinsBuyIn(course))}, {SKINS_ENERGY} energy, one tee time a week.</p>
          <ul className="poker-regulars">{course.rivals.map((r) => <li key={r.id}><span className="poker-av" style={{ background: r.color }}>{r.short[0]}</span><b>{r.name}</b></li>)}</ul>
          <div className="row">
            <button className="btn primary" disabled={!!block} onClick={() => run(() => services.poker.skinsStart())} data-testid="skins-start">Tee off ({formatMoney(skinsBuyIn(course))})</button>
            {block && <span className="warn-text">{block}</span>}
          </div>
        </>
      ) : (
        <>
          <Scorecard m={m} />
          {banter && <p className="skins-banter"><b style={{ color: course.rivals[banter.w - 1]?.color }}>{nameOf(m, banter.w)}:</b> {banter.text}</p>}
          <ul className="craps-log">{[...m.log].reverse().slice(0, 4).map((l, i) => <li key={i} className={i === 0 ? 'latest' : ''}>{l}</li>)}</ul>
          {live ? (
            <>
              <p className="skins-next" data-testid="skins-next">
                {inPlayoff(live) ? <b className="neg">Sudden death · </b> : null}
                {inPlayoff(live) ? `Playoff hole ${holesPlayed(live) - SKINS_HOLES + 1}` : `Hole ${holesPlayed(live) + 1}`}, par {parOf(live)} · riding: <b>{live.carry} skin{live.carry > 1 ? 's' : ''}</b> ({formatMoney(live.carry * skinValue(live))})
              </p>
              <div className="row skins-styles">
                {(['safe', 'normal', 'aggressive'] as SkinsStyle[]).map((st) => (
                  <button key={st} className={`btn ${st === 'normal' ? 'primary' : ''}`} onClick={() => play(st)} title={STYLE_HINTS[st]} data-testid={`skins-${st}`}>
                    {st === 'safe' ? 'Play it safe' : st === 'normal' ? 'Play your game' : 'Go for it'}
                    <small>{STYLE_HINTS[st]}</small>
                  </button>
                ))}
              </div>
            </>
          ) : last && (
            <div className="skins-done" data-testid="skins-done">
              <p>You won <b>{last.m.skins[0]}</b> of 9 skins: {formatMoney(last.payout)} back on a {formatMoney(skinsBuyIn(last.m))} buy-in (<b className={last.payout >= skinsBuyIn(last.m) ? 'pos' : 'neg'}>{last.payout >= skinsBuyIn(last.m) ? '+' : ''}{formatMoney(last.payout - skinsBuyIn(last.m))}</b>).</p>
              <button className="btn" onClick={() => setLast(null)}>Back to the clubhouse</button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
