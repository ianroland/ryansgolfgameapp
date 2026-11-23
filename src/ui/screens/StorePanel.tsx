import { useState } from 'react';
import { Icon } from '../components/Icon';
import { listStoreItems, type CatalogItem } from '../../catalog/items';
import { newId } from '../../core/ids';
import { useGame } from '../GameContext';
import { formatMoney } from '../format';
import { HOMES } from '../../catalog/properties';
import { DECOR_SPRITES } from '../decorSprites';
import { Dialog } from '../components/Dialog';
import type { Screen } from '../App';

export function StorePanel({ go }: { go: (s: Screen) => void }) {
  const { state, services, playerId, run, notify } = useGame();
  // One requestId per purchase intent: repeated clicks/retries reuse it.
  const [pending, setPending] = useState<{ item: CatalogItem; requestId: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const owned = (id: string) => state.furniture.filter((f) => f.catalogItemId === id).length;

  const confirm = async () => {
    if (!pending || busy) return;
    setBusy(true);
    const res = await run(() => services.store.purchase(playerId, pending.item.id, pending.requestId));
    setBusy(false);
    setPending(null);
    if (res?.status === 'purchased') {
      notify({ kind: 'purchase', title: `Purchased ${pending.item.name}`, body: `${formatMoney(-pending.item.cost, true)} · Ready to place in Edit Room.` });
    }
  };

  return (
    <div className="panel-body">
      <h1 className="panel-title"><Icon name="cart" size={28} /> Furniture</h1>
      <p className="muted">Cabinets for your trophies and decor for your {state.propertyDef.name}. Better homes unlock grander pieces.</p>
      <ul className="cards">
        {listStoreItems().map((item) => {
          const short = item.cost - state.balance;
          const locked = item.minPropertyTier > state.propertyDef.tier;
          const needHome = HOMES.find((h) => h.tier === item.minPropertyTier)?.name;
          return (
            <li key={item.id} className="card" data-testid={`store-item-${item.id}`}>
              <div className="card-art" aria-hidden>{item.sprite ? <img src={DECOR_SPRITES[item.sprite]} alt="" className="decor-art" /> : <CabinetIcon finish={item.finish} />}</div>
              <div className="card-main">
                <h2 className="card-title">{item.name}</h2>
                <p className="card-desc">{item.description}</p>
                <dl className="specs">
                  <div><dt>Category</dt><dd>{item.category === 'cabinet' ? 'Trophy cabinet' : 'Decor'}</dd></div>
                  {item.displayCapacity > 0 && <div><dt>Displays</dt><dd>{item.displayCapacity} trophies</dd></div>}
                  <div><dt>Needs</dt><dd>{needHome} or better</dd></div>
                </dl>
                <div className="card-foot">
                  <span className="price">{formatMoney(item.cost)}</span>
                  <span className="pill">{owned(item.id) ? `Owned ×${owned(item.id)}` : 'Not owned'}</span>
                </div>
                {locked ? <p className="warn-text">🔒 Move to the {needHome} to unlock.</p> : short > 0 && <p className="warn-text">You need {formatMoney(short)} more.</p>}
                <div className="btn-row">
                  <button
                    className="btn primary"
                    disabled={short > 0 || busy || locked}
                    onClick={() => setPending({ item, requestId: newId('purchase_req') })}
                  >
                    Buy for {formatMoney(item.cost)}
                  </button>
                  {owned(item.id) > 0 && <button className="btn ghost" onClick={() => go('edit')}>Place it</button>}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {pending && (
        <Dialog title={`Buy ${pending.item.name}?`} onClose={() => !busy && setPending(null)}>
          <p>
            {formatMoney(pending.item.cost)} will be deducted from your balance of {formatMoney(state.balance)}.
            You&rsquo;ll have <strong>{formatMoney(state.balance - pending.item.cost)}</strong> left.
          </p>
          <div className="btn-row">
            <button className="btn primary" onClick={confirm} disabled={busy} data-testid="confirm-purchase" autoFocus>
              {busy ? 'Purchasing…' : 'Confirm purchase'}
            </button>
            <button className="btn ghost" onClick={() => setPending(null)} disabled={busy}>Cancel</button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

const FINISH: Record<string, [string, string]> = { oak: ['#9a6a3a', '#6b4522'], walnut: ['#5a3a24', '#3a2414'], glass: ['#9fb4c0', '#5d6e78'], gold: ['#c9a227', '#7a5f10'] };

function CabinetIcon({ finish = 'oak' }: { finish?: string }) {
  const [body, dark] = FINISH[finish] ?? FINISH.oak;
  return (
    <svg viewBox="0 0 64 96" width="56" height="84">
      <rect x="4" y="2" width="56" height="8" fill={dark} />
      <rect x="7" y="8" width="50" height="86" fill={body} />
      <rect x="12" y="14" width="40" height="62" fill="#2a1a0d" />
      {[34, 54, 74].map((y) => <rect key={y} x="12" y={y} width="40" height="2" fill="#b98551" />)}
      <circle cx="32" cy="26" r="5" fill="#e8b931" />
      <path d="M26 40h12l-6 10z" fill="#cfd6dd" />
      <path d="M24 60h16l-8 12z" fill="#e8b931" />
      <rect x="7" y="80" width="50" height="14" fill={dark} />
      <rect x="12" y="14" width="40" height="62" fill="#d8eef3" opacity=".15" />
    </svg>
  );
}
