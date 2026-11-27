/**
 * The casino's private rooms tab: greyed out until a dealer who works this floor invites Ryan,
 * then the poker room and the private course, open for good. Presentation only: every chip
 * and dollar moves through PokerService.
 */
import { useEffect, useState } from 'react';
import { dealerById } from '../../npc/registry';
import { INVITE_LINES, INVITE_NIGHTS } from '../../npc/vip';
import { skinsBlocker, skinsMatch, SKINS_ENERGY, type VipStatus } from '../../services/pokerService';
import { buyIn as skinsBuyIn, courseAt, holesPlayed, inPlayoff, nameOf, parOf, SKINS_HOLES, skinValue, STYLE_HINTS, type SkinsMatch, type SkinsStyle } from '../../expansion/skins';
import type { LocationId } from '../../expansion/unlocks';
import { useGame } from '../GameContext';
import { sound } from '../../audio/sound';
import { formatMoney } from '../format';
import { PokerTableView } from './PokerTable';

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
      {part === 'poker' ? <PokerTableView room={room} /> : <SkinsView at={room.location} blurb={room.course.blurb} />}
    </div>
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
    sound.play(style === 'aggressive' ? 'hit_driver' : 'hit_iron', { volume: 0.6 });
    const o = await run(() => services.poker.skinsPlay(style));
    if (o) {
      const m2 = o.match;
      const i = m2.scores[0].length - 1;
      const best = Math.min(...m2.scores.map((r) => r[i]));
      const solo = m2.scores.filter((r) => r[i] === best).length === 1;
      window.setTimeout(() => sound.play(solo && m2.scores[0][i] === best ? 'cup' : solo ? 'groan' : 'clap', { volume: 0.55 }), 450);
    }
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
