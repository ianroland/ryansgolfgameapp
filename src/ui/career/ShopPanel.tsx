import { useState } from 'react';
import { GEAR, LIFESTYLE, MUNI_LINES, MUNI_PROJECTS, SNACKS, SNACKS_PER_WEEK, snackWeekKey, type GearSlot } from '../../career/shop';
import { ClubIcon, ItemIcon } from './ProShopIcons';
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

/** 0 starter … 3 top of the line, by price within the slot. */
const clubTier = (id: string) => {
  const g = GEAR.find((x) => x.id === id)!;
  const prices = GEAR.filter((x) => x.slot === g.slot).map((x) => x.price).sort((a, b) => a - b);
  return Math.round((prices.indexOf(g.price) / Math.max(1, prices.length - 1)) * 3);
};

export function ShopPanel() {
  const { state, services, run, notify } = useGame();
  const c = state.career;
  const [pending, setPending] = useState<Pending | null>(null);
  const [tab, setTab] = useState<'gear' | 'acc' | 'snacks' | 'life'>('gear');
  const snacksUsed = Number(c.flags[snackWeekKey(c.season, c.week)] ?? 0);

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
    <main className="shop pro-shop">
      <header className="hub-card ps-head">
        <div>
          <h1 className="ps-title">Pro Shop</h1>
          <p className="muted">Clubs, kit and snacks. The guy behind the counter has opinions about your grip. (Homes are under Real Estate.)</p>
        </div>
        <span className="subtab-bank">Bank: <b>{formatMoney(state.balance)}</b></span>
      </header>
      <nav className="subtabs" aria-label="Pro Shop sections">
        <button className={tab === 'gear' ? 'on' : ''} onClick={() => setTab('gear')} data-testid="ps-clubs">Clubs</button>
        <button className={tab === 'acc' ? 'on' : ''} onClick={() => setTab('acc')} data-testid="ps-acc">Accessories</button>
        <button className={tab === 'snacks' ? 'on' : ''} onClick={() => setTab('snacks')} data-testid="ps-snacks">Snacks &amp; Energy</button>
        <button className={tab === 'life' ? 'on' : ''} onClick={() => setTab('life')}>Lifestyle</button>
      </nav>

      {tab === 'gear' && (
        <div className="shop-grid">
          {(Object.keys(SLOT_NAMES) as GearSlot[]).map((slot) => (
            <section key={slot} className="hub-card">
              <h2 className="hub-title">{SLOT_NAMES[slot]}</h2>
              <ul className="list">
                {GEAR.filter((g) => g.slot === slot).sort((a, b) => a.price - b.price).map((g) => {
                  const owned = g.price === 0 || c.owned.includes(g.id);
                  const equipped = c.equipment[slot] === g.id;
                  return (
                    <li key={g.id} className={`list-row column shop-row ${equipped ? 'is-selected' : ''}`}>
                      <ClubIcon slot={slot} tier={clubTier(g.id)} />
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
            {LIFESTYLE.filter((l) => l.kind !== 'accessory').map((l) => {
              const owned = c.owned.includes(l.id);
              const lock = c.fame < l.minFame ? `Fame ${l.minFame}` : l.requiresPro && c.status !== 'pro' ? 'Pros only' : null;
              return (
                <li key={l.id} className="list-row column shop-row">
                  <ItemIcon id={l.id} kind={l.kind} />
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

      {tab === 'acc' && (
        <section className="hub-card">
          <h2 className="hub-title">Accessories</h2>
          <ul className="list ps-grid">
            {LIFESTYLE.filter((l) => l.kind === 'accessory').map((l) => {
              const owned = c.owned.includes(l.id);
              const lock = c.fame < l.minFame ? `Fame ${l.minFame}` : null;
              return (
                <li key={l.id} className={`list-row column shop-row ${owned ? 'is-selected' : ''}`} data-testid={`ps-item-${l.id}`}>
                  <ItemIcon id={l.id} />
                  <span className="shop-info"><b>{l.name}</b><span className="muted">{l.description}</span></span>
                  {owned ? <span className="pill gold">Owned</span> : priceBtn({ kind: 'life', id: l.id, name: l.name, price: l.price }, lock)}
                </li>
              );
            })}
          </ul>
          <p className="fineprint">Accessories stack with everything else you own.</p>
        </section>
      )}

      {tab === 'snacks' && (
        <section className="hub-card">
          <h2 className="hub-title">Snacks &amp; Energy</h2>
          <p className="muted">Energy <b>{c.energy}</b>/100 · {SNACKS_PER_WEEK - snacksUsed} of {SNACKS_PER_WEEK} snacks left this week. Eaten on the spot.</p>
          <ul className="list ps-grid">
            {SNACKS.map((x) => (
              <li key={x.id} className="list-row column shop-row" data-testid={`ps-item-${x.id}`}>
                <ItemIcon id={x.id} />
                <span className="shop-info"><b>{x.name}</b><span className="muted">{x.description}</span></span>
                <button
                  className="btn small primary"
                  disabled={state.balance < x.price || snacksUsed >= SNACKS_PER_WEEK || c.energy >= 100}
                  onClick={async () => {
                    const o = await run(() => services.career.buySnack(x.id));
                    if (o?.message) notify({ kind: 'purchase', title: o.message, body: formatMoney(-x.price, true) });
                  }}
                  data-testid={`buy-${x.id}`}
                >
                  {formatMoney(x.price)}
                </button>
              </li>
            ))}
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

/** Real Estate → Listings: homes for sale (moved here from the Pro Shop). */
export function ListingsPanel() {
  const { state, services, run, notify } = useGame();
  const c = state.career;
  const [pending, setPending] = useState<Pending | null>(null);
  const confirm = async () => {
    const p = pending!;
    setPending(null);
    const o = await run(() => services.career.buyHome(p.id));
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
    <main className="shop pro-shop listings" data-testid="listings">
      <header className="hub-card ps-head re-head">
        <div>
          <h1 className="ps-title">Real Estate</h1>
          <p className="muted">Every listing comes with a realtor who says "cozy" about the small ones.</p>
        </div>
        <span className="subtab-bank">Bank: <b>{formatMoney(state.balance)}</b></span>
      </header>
        <section className="hub-card">
          <h2 className="hub-title">Homes</h2>
          <p className="muted">A better home means more room: more places for furniture, fancier cabinets, and more energy each week. Rent goes up too.</p>
          <ul className="list">
            {HOMES.map((h) => {
              const current = h.id === state.propertyDef.id;
              const below = h.tier < state.propertyDef.tier;
              return (
                <li key={h.id} className={`list-row column shop-row ${current ? 'is-selected' : ''}`}>
                  <ItemIcon id="home" />
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
      {pending && (
        <Dialog title={`Buy ${pending.name}?`} onClose={() => setPending(null)}>
          <p>{formatMoney(pending.price)} leaves you with <b>{formatMoney(state.balance - pending.price)}</b>.</p>
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

/** Real Estate → Muni Fund: late-game projects at Dry Creek Muni, each with a perk and a word from Baba. */
export function MuniFundPanel() {
  const { state, services, run, notify } = useGame();
  const c = state.career;
  const done = MUNI_PROJECTS.filter((p) => c.owned.includes(p.id)).length;
  return (
    <main className="shop pro-shop muni-fund" data-testid="muni-fund">
      <header className="hub-card ps-head muni-head">
        <div>
          <h1 className="ps-title">Dry Creek Muni Fund</h1>
          <p className="muted">Where it all started. {done} of {MUNI_PROJECTS.length} projects done. Baba has opinions about every one.</p>
        </div>
        <span className="subtab-bank">Bank: <b>{formatMoney(state.balance)}</b></span>
      </header>
      <section className="hub-card">
        <ul className="list ps-grid">
          {MUNI_PROJECTS.map((p) => {
            const owned = c.owned.includes(p.id);
            const lock = c.fame < p.minFame ? `Fame ${p.minFame}` : null;
            return (
              <li key={p.id} className={`list-row column shop-row ${owned ? 'is-selected' : ''}`} data-testid={`muni-${p.id}`}>
                <ItemIcon id="home" />
                <span className="shop-info">
                  <b>{p.name}</b>
                  <span className="muted">{p.description}</span>
                  {owned && <span className="muni-baba">Baba: “{MUNI_LINES[p.id]}”</span>}
                </span>
                {owned ? <span className="pill gold">Done</span> : lock ? <span className="pill warn">{lock}</span> : (
                  <button
                    className="btn small primary"
                    disabled={state.balance < p.price}
                    onClick={async () => {
                      const o = await run(() => services.career.buyLifestyle(p.id));
                      if (o) notify({ kind: 'purchase', title: p.name, body: `Baba: “${MUNI_LINES[p.id]}”` });
                    }}
                    data-testid={`fund-${p.id}`}
                  >
                    Fund {formatMoney(p.price)}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
