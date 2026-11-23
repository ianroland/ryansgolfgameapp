import { ACHIEVEMENTS } from '../../career/achievements';
import { fameLevel } from '../../career/config';
import { getCatalogItem } from '../../catalog/items';
import { HOMES } from '../../catalog/properties';
import { useGame } from '../GameContext';
import { formatGameDate, formatMoney, shortMoney, TX_LABELS } from '../format';
import type { Screen } from '../App';
import { Icon } from '../components/Icon';
import { Bar } from '../career/bits';

export function HomePanel({ go }: { go: (s: Screen) => void }) {
  const { state } = useGame();
  const c = state.career;
  const t = c.totals;
  const zoneLabel = (id?: string) => state.propertyDef.zones.find((z) => z.id === id)?.label;
  const nextHome = HOMES.find((h) => h.tier === state.propertyDef.tier + 1);
  const unlocked = ACHIEVEMENTS.filter((a) => c.achievements[a.id]).length;

  return (
    <div className="panel-body">
      <h1 className="panel-title">Lv {state.propertyDef.tier} · {state.propertyDef.name}</h1>
      <p className="muted">{state.propertyDef.theme}</p>
      {nextHome ? (
        <div className="next-home">
          <span className="muted">
            Next level: <b>{nextHome.name}</b> · needs {nextHome.minFame} fame ({fameLevel(nextHome.minFame).name}) and {shortMoney(nextHome.price)}
          </span>
          <Bar value={Math.min(c.fame, nextHome.minFame)} max={nextHome.minFame} tone="pink" label="Fame toward next home">
            Fame {Math.floor(c.fame)} / {nextHome.minFame}
          </Bar>
        </div>
      ) : (
        <p className="muted">You live in the finest home in golf.</p>
      )}

      <div className="stat-row">
        <div className="stat"><span className="stat-n">{t.events}</span><span className="stat-l">Events</span></div>
        <div className="stat"><span className="stat-n">{t.wins}</span><span className="stat-l">Wins</span></div>
        <div className="stat"><span className="stat-n">{t.majors}</span><span className="stat-l">Majors</span></div>
        <div className="stat"><span className="stat-n">{shortMoney(t.earnings)}</span><span className="stat-l">Earnings</span></div>
      </div>

      <div className="btn-row">
        <button className="btn" onClick={() => go('edit')}><Icon name="sofa" size={26} /> Edit Room</button>
        <button className="btn" onClick={() => go('store')}><Icon name="cart" size={24} /> Furniture</button>
        <button className="btn" onClick={() => go('trophies')}><Icon name="trophy" size={24} /> Trophies</button>
      </div>

      <h2 className="section-title"><Icon name="check" /> Achievements {unlocked}/{ACHIEVEMENTS.length}</h2>
      <ul className="achievements">
        {ACHIEVEMENTS.map((a) => {
          const at = c.achievements[a.id];
          return (
            <li key={a.id} className={at ? 'got' : ''} title={at ? `Unlocked ${formatGameDate(at)}` : 'Locked'}>
              <span className="ach-icon" aria-hidden>{at ? '★' : '☆'}</span>
              <span>
                <b>{a.name}</b>
                <span className="muted">{a.description}</span>
              </span>
            </li>
          );
        })}
      </ul>

      <h2 className="section-title"><Icon name="sofa" /> Furniture</h2>
      {state.furniture.length === 0 ? (
        <p className="empty">
          Nothing here yet. <button className="link" onClick={() => go('store')}>Buy a trophy cabinet</button>
        </p>
      ) : (
        <ul className="list">
          {state.furniture.map((f) => (
            <li key={f.id} className="list-row">
              <span>{getCatalogItem(f.catalogItemId).name}</span>
              <span className="pill">{zoneLabel(f.placementZoneId) ?? 'In storage'}</span>
            </li>
          ))}
        </ul>
      )}

      <h2 className="section-title"><Icon name="coins" /> Bank statement</h2>
      <ul className="list ledger" data-testid="ledger">
        {[...state.transactions].reverse().slice(0, 8).map((tx) => (
          <li key={tx.id} className="list-row">
            <span>
              {TX_LABELS[tx.type] ?? tx.type}
              <span className="muted"> · {formatGameDate(tx.timestamp)}</span>
            </span>
            <span className={tx.amount < 0 ? 'neg' : 'pos'}>{formatMoney(tx.amount, true)}</span>
          </li>
        ))}
      </ul>
      <p className="fineprint">All money is fictional in-game currency.</p>
    </div>
  );
}
