/**
 * The casino's cocktail server, as an RPG portrait panel under the dealer and tip panels (never
 * a full-body sprite at the table). She comes by between completed rounds (and on request).
 * Every action goes through DrinkService / NpcService; refusals are enforced there, and the
 * buttons only mirror that state. Lines come from servers.json (draft).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { SERVER_CONFIG as C } from '../../casino/servers/config';
import { canOrderAlcohol, drinkLevel, type DrinkState } from '../../casino/servers/drinks';
import { pickServerLine, serverAt, serverFace, serverPortrait, type ServerEvent, type ServerLine } from '../../casino/servers/registry';
import { cryptoInt } from '../../casino/random';
import { newId } from '../../core/ids';
import { useGame } from '../GameContext';
import { formatMoney } from '../format';
import { ChipImg } from './Chips';
import { chipAsset } from '../../expansion/chipThemes';
import { DealerDialoguePanel } from './DealerPanel';
import { useCasinoLocation } from './casinoLocation';

// ── Round signal: each table calls signalRoundComplete(services) after a round settles. One
// service call per round (time passes once); every mounted panel hears the result, and only
// the panel on screen invites the server over. ──
type RoundResult = { state: DrinkState; serverDue: boolean };
const roundSubs = new Set<(r: RoundResult) => void>();
export function signalRoundComplete(services: { drinks: { round: () => Promise<RoundResult> } }) {
  void services.drinks
    .round()
    .then((r) => roundSubs.forEach((f) => f(r)))
    .catch(() => {});
}

const LEVEL_LABEL = { sober: 'Sober', buzzed: 'Buzzed', tipsy: 'Tipsy', impaired: 'Impaired' } as const;

export function ServerPanel({ busy }: { busy: boolean }) {
  const { services, run, state: game } = useGame();
  const loc = useCasinoLocation();
  const server = serverAt(loc);
  const [open, setOpen] = useState(false);
  const [line, setLine] = useState<{ line: ServerLine; event: ServerEvent } | null>(null);
  const [drink, setDrink] = useState<DrinkState | null>(null);
  const [effectNote, setEffectNote] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const recent = useRef<string[]>([]);
  const lock = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(open);
  openRef.current = open;

  const say = useCallback(
    (event: ServerEvent) => {
      const l = pickServerLine(server, event, recent.current, cryptoInt);
      recent.current = [...recent.current, l.id].slice(-4);
      setLine({ line: l, event });
    },
    [server],
  );

  useEffect(() => {
    void services.drinks.state().then(setDrink).catch(() => {});
  }, [services]);

  // Between rounds only: the table signals a finished round; she may come by.
  useEffect(() => {
    const onRound = (r: RoundResult) => {
      setDrink(r.state);
      const onScreen = !!rootRef.current && rootRef.current.offsetParent !== null;
      if (r.serverDue && onScreen && !openRef.current) {
        setOpen(true);
        say('intro');
      }
    };
    roundSubs.add(onRound);
    return () => void roundSubs.delete(onRound);
  }, [say]);

  const act = async (fn: () => Promise<{ event: ServerEvent; state: DrinkState; effect?: { label: string } | null } | undefined>) => {
    if (lock.current || busy) return;
    lock.current = true;
    setPending(true);
    const r = await run(fn);
    lock.current = false;
    setPending(false);
    if (!r) return;
    setDrink(r.state);
    say(r.event);
    setEffectNote(r.effect ? `${r.effect.label}` : null);
  };

  const price = C.drink.prices[loc];
  const refused = !!drink && !canOrderAlcohol(drink).ok && drink.refused;
  const level = drink ? drinkLevel(drink.buzz) : 'sober';
  const rude = !!drink && drink.rude.includes(server.id);
  const effects = drink?.effects ?? [];
  const effectLabels = effects.map((id) => C.effects.find((e) => e.id === id)?.label ?? id);
  const disabled = busy || pending;

  const status = (
    <span className="srv-status" data-testid="srv-status">
      <b className={`srv-level ${level}`}>{LEVEL_LABEL[level]}</b>
      {drink && drink.drinksThisVisit > 0 && <span>{drink.drinksThisVisit} × {C.drink.name}</span>}
      {refused && <span className="srv-refused" data-testid="srv-refused">No more alcohol until you recover</span>}
      {effectLabels.length > 0 && <span className="srv-effects" title="Temporary, this visit. Social and stamina only: never the games.">{effectLabels.join(' · ')}</span>}
    </span>
  );

  if (!open) {
    return (
      <div className="srv-bar" data-testid="server-bar" ref={rootRef}>
        <img className="srv-mini" src={serverPortrait(loc, 'friendly')} alt="" width={40} height={40} draggable={false} />
        <span className="srv-bar-name">{server.name}</span>
        {status}
        <button
          className="btn small"
          disabled={busy}
          title={busy ? 'Between rounds' : `Call ${server.short} over`}
          onClick={() => {
            setOpen(true);
            say('intro');
          }}
          data-testid="server-request"
        >
          Request service
        </button>
      </div>
    );
  }

  const shown = line ?? { line: server.dialogue.intro[0], event: 'intro' as ServerEvent };
  const face = serverFace(shown.line.expression, shown.event);
  const close = () => {
    setOpen(false);
    setLine(null);
    setEffectNote(null);
  };

  return (
    <div className="srv-panel" data-testid="server-panel" data-server={server.id} ref={rootRef}>
      <DealerDialoguePanel
        name={server.name}
        npcId={server.id}
        speaker="server"
        className="server"
        testId="server-line"
        text={shown.line.text}
        draft
        portrait={<img className="srv-portrait" src={serverPortrait(loc, face)} alt={`${server.name} (${face})`} width={256} height={256} draggable={false} data-face={face} />}
      >
        <p className="rpg-text" data-testid="server-text" data-line={shown.line.id}>{shown.line.text}</p>
      </DealerDialoguePanel>
      <div className="srv-actions" role="group" aria-label={`${server.name}: service`}>
        {status}
        {effectNote && <span className="srv-effect-note" data-testid="srv-effect">New effect: {effectNote}</span>}
        <div className="srv-row">
          <button
            className="btn small primary"
            disabled={disabled || refused}
            onClick={() => act(() => services.drinks.order(server.id, newId('drink')))}
            title={refused ? `${server.short} won't serve you alcohol until you recover` : `${C.drink.name}, ${formatMoney(price)}`}
            data-testid="server-order"
          >
            {C.drink.name} · {formatMoney(price)}
          </button>
          <button className="btn small" disabled={disabled} onClick={() => act(() => services.drinks.water(server.id, newId('water')))} data-testid="server-water">
            {C.water.name} · free
          </button>
          <button className="btn small" disabled={disabled} onClick={() => act(() => services.drinks.chat(server.id, newId('chat')))} data-testid="server-chat">
            Chat
          </button>
          {rude && (
            <button className="btn small" disabled={disabled} onClick={() => act(() => services.drinks.apologize(server.id, newId('sorry')))} data-testid="server-apologize">
              Apologize
            </button>
          )}
        </div>
        <div className="srv-row">
          <span className="srv-tip-label">Tip</span>
          {C.tipAmounts.map((a) => {
            const face2 = chipAsset(loc, a);
            return (
              <button
                key={a}
                className="srv-tip"
                disabled={disabled || game.balance < a}
                onClick={() =>
                  act(async () => {
                    const r = await services.npc.tip(server.id, a, newId('tip'));
                    const st = await services.drinks.state();
                    return r.replayed ? undefined : { event: 'tip' as ServerEvent, state: st };
                  })
                }
                aria-label={`Tip ${server.short} ${formatMoney(a)}`}
                data-testid={`server-tip-${a}`}
              >
                {face2 ? <ChipImg src={face2.url} source={face2.source} /> : formatMoney(a)}
                <b>{formatMoney(a)}</b>
              </button>
            );
          })}
          <span className="srv-spacer" />
          {level === 'tipsy' || level === 'impaired' ? (
            <button className="btn small ghost" disabled={disabled} onClick={() => act(() => services.drinks.rude(server.id, newId('rude')))} data-testid="server-rude" title="Not a great idea">
              Wave her off rudely
            </button>
          ) : null}
          <button
            className="btn small ghost"
            disabled={pending}
            onClick={() => {
              say(line ? 'farewell' : 'decline');
              window.setTimeout(close, 1400);
            }}
            data-testid="server-decline"
          >
            {line ? 'Leave' : 'No thanks'}
          </button>
        </div>
        <p className="fineprint srv-note">Drinks never change the games. {C.water.name} and leaving are always available.</p>
      </div>
    </div>
  );
}
