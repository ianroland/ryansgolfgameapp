import { useState } from 'react';
import { GEAR, LIFESTYLE, type GearSlot } from '../../career/shop';
import { STAT_LABELS, type StatKey } from '../../career/types';
import { HOMES } from '../../catalog/properties';
import { Dialog } from '../components/Dialog';
import { useGame } from '../GameContext';
import { formatMoney } from '../format';

const SLOT_NAMES: Record<GearSlot, string> = { driver: 'Driver', irons: 'Irons', wedges: 'Wedges', putter: 'Putter' };

const bonusText = (b: Partial<Record<StatKey, number>>) =>
  Object.entries(b)
    .map(([k, v]) => `+${v} ${STAT_LABELS[k as StatKey]}`)
    .join(', ');

type Pending = { kind: 'gear' | 'life' | 'home'; id: string; name: string; price: number };

export function ShopPanel() {
  const { state, services, run, notify } = useGame();
  const c = state.career;
  const [pending, setPending] = useState<Pending | null>(null);
  const [tab, setTab] = useState<'gear' | 'life' | 'homes'>('gear');

  const confirm = async () => {
    const p = pending!;
    setPending(null);
    const o = await run(() =>
      p.kind === 'gear' ? services.career.buyGear(p.id) : p.kind === 'life' ? services.career.buyLifestyle(p.id) : services.career.buyHome(p.id),
    );
    if (o?.message) notify({ kind: 'purchase', title: o.message, body: p.price ? formatMoney(-p.price, true) : undefined });
  };

  const priceBtn = (p: Pending, lock: string | null) =>
    lock ? (
      <span className="pill warn">{lock}</span>
    ) : (
      <button className="btn small primary" disabled={state.balance < p.price} onClick={() => setPending(p)} data-testid={`buy-${p.id}`}>
        {formatMoney(p.price)}
      </button>
    );

  return (
    <main className="shop">
      <nav className="subtabs" aria-label="Shop sections">
        <button className={tab === 'gear' ? 'on' : ''} onClick={() => setTab('gear')}>Equipment</button>
        <button className={tab === 'life' ? 'on' : ''} onClick={() => setTab('life')}>Lifestyle</button>
        <button className={tab === 'homes' ? 'on' : ''} onClick={() => setTab('homes')}>Homes</button>
        <span className="subtab-bank">Bank: <b>{formatMoney(state.balance)}</b></span>
      </nav>

      {tab === 'gear' && (
        <div className="shop-grid">
          {(Object.keys(SLOT_NAMES) as GearSlot[]).map((slot) => (
            <section key={slot} className="hub-card">
              <h2 className="hub-title">{SLOT_NAMES[slot]}</h2>
              <ul className="list">
                {GEAR.filter((g) => g.slot === slot).map((g) => {
                  const owned = g.price === 0 || c.owned.includes(g.id);
                  const equipped = c.equipment[slot] === g.id;
                  return (
                    <li key={g.id} className={`list-row column shop-row ${equipped ? 'is-selected' : ''}`}>
                      <span className="shop-info">
                        <b>{g.name}</b>
                        <span className="muted">{g.description}</span>
                      </span>
                      {equipped ? (
                        <span className="pill gold">Equipped</span>
                      ) : owned ? (
                        <button className="btn small" onClick={() => run(() => services.career.buyGear(g.id))}>Equip</button>
                      ) : (
                        priceBtn({ kind: 'gear', id: g.id, name: g.name, price: g.price }, c.fame < g.minFame ? `Fame ${g.minFame}` : null)
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {tab === 'life' && (
        <section className="hub-card">
          <h2 className="hub-title">Lifestyle &amp; team</h2>
          <ul className="list">
            {LIFESTYLE.map((l) => {
              const owned = c.owned.includes(l.id);
              const lock = c.fame < l.minFame ? `Fame ${l.minFame}` : l.requiresPro && c.status !== 'pro' ? 'Pros only' : null;
              return (
                <li key={l.id} className="list-row column shop-row">
                  <span className="shop-info">
                    <b>{l.name}</b>
                    <span className="muted">{l.description}{l.tournamentBonus ? ` (${bonusText(l.tournamentBonus)})` : ''}</span>
                  </span>
                  {owned ? <span className="pill gold">Owned</span> : priceBtn({ kind: 'life', id: l.id, name: l.name, price: l.price }, lock)}
                </li>
              );
            })}
          </ul>
          <p className="fineprint">Cars and caddies replace the one you have. Coaching upgrades stack.</p>
        </section>
      )}

      {tab === 'homes' && (
        <section className="hub-card">
          <h2 className="hub-title">Homes &amp; clubhouse levels</h2>
          <p className="muted">A better home means a bigger clubhouse: more places for furniture, fancier cabinets, and more energy each week. Rent goes up too.</p>
          <ul className="list">
            {HOMES.map((h) => {
              const current = h.id === state.propertyDef.id;
              const below = h.tier < state.propertyDef.tier;
              return (
                <li key={h.id} className={`list-row column shop-row ${current ? 'is-selected' : ''}`}>
                  <span className="shop-info">
                    <b>Lv {h.tier} · {h.name}</b>
                    <span className="muted">{h.theme}</span>
                    <span className="muted">Rent {formatMoney(h.livingCost)}/wk · +{h.energyBonus} energy/wk · {h.zones.filter((z) => !z.reserved).length} furniture spots</span>
                  </span>
                  {current ? (
                    <span className="pill gold">Home</span>
                  ) : below ? (
                    <span className="pill">Moved on</span>
                  ) : (
                    priceBtn({ kind: 'home', id: h.id, name: h.name, price: h.price }, c.fame < h.minFame ? `Fame ${h.minFame}` : null)
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {pending && (
        <Dialog title={`Buy ${pending.name}?`} onClose={() => setPending(null)}>
          <p>
            {formatMoney(pending.price)} leaves you with <b>{formatMoney(state.balance - pending.price)}</b>.
          </p>
          {state.balance - pending.price < state.propertyDef.livingCost * 4 && <p className="warn-text">That&rsquo;s less than a month of rent.</p>}
          <div className="btn-row">
            <button className="btn ghost" onClick={() => setPending(null)}>Cancel</button>
            <button className="btn primary" onClick={confirm} autoFocus data-testid="confirm-buy">Buy</button>
          </div>
        </Dialog>
      )}
    </main>
  );
}
