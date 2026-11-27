import { getCatalogItem } from '../../catalog/items';
import { Icon } from '../components/Icon';
import { trophyLook } from '../../catalog/trophies';
import { useGame } from '../GameContext';
import { formatGameDate } from '../format';
import type { Screen } from '../App';

interface Props {
  pickTrophyId: string | null;
  setPickTrophyId: (id: string | null) => void;
  displayInSlot: (furnitureId: string, slot: number) => Promise<void>;
  go: (s: Screen) => void;
}

export function TrophyPanel({ pickTrophyId, setPickTrophyId, displayInSlot, go }: Props) {
  const { state, services, playerId, run, setInspectTrophyId } = useGame();
  const placedCabinets = state.furniture.filter((f) => f.placementZoneId && getCatalogItem(f.catalogItemId).displayCapacity > 0);
  const placementOf = (trophyId: string) => state.placements.find((p) => p.trophyInstanceId === trophyId);
  const zoneLabel = (id?: string) => state.propertyDef.zones.find((z) => z.id === id)?.label ?? '';
  const trophyName = (id: string) => {
    const t = state.trophies.find((tr) => tr.id === id);
    return t ? trophyLook(t).name : '—';
  };
  const picking = state.trophies.find((t) => t.id === pickTrophyId);
  // The Pink Jacket has its own display case in the room (one case, however many are won).
  const isJacket = (t: (typeof state.trophies)[number]) => trophyLook(t).style === 'pink_jacket';
  const jackets = state.trophies.filter(isJacket);
  const undisplayed = state.trophies.filter((t) => !placementOf(t.id) && !isJacket(t));
  const displayed = state.trophies.filter((t) => placementOf(t.id));

  return (
    <div className="panel-body">
      <h1 className="panel-title"><Icon name="trophy" size={28} /> Trophy Inventory</h1>
      <p className="muted">Trophies are earned by winning tournaments, earning your tour card at Q-School, and making albatrosses (your first, and your fifth). They can&rsquo;t be bought.</p>

      {picking && (
        <div className="picker" role="region" aria-label="Choose a cabinet slot">
          <h2 className="section-title">Display &ldquo;{trophyLook(picking).name}&rdquo;</h2>
          {placedCabinets.length === 0 ? (
            <p className="empty">
              Place a trophy cabinet in your room first. <button className="link" onClick={() => go('edit')}>Edit Room</button>
            </p>
          ) : (
            placedCabinets.map((cab) => (
              <div key={cab.id} className="slot-group">
                <div className="muted">{getCatalogItem(cab.catalogItemId).name} · {zoneLabel(cab.placementZoneId)}</div>
                <div className={`slot-row ${getCatalogItem(cab.catalogItemId).displayCapacity > 6 ? 'many' : ''}`}>
                  {Array.from({ length: getCatalogItem(cab.catalogItemId).displayCapacity }, (_, i) => {
                    const occ = state.placements.find((p) => p.furnitureInstanceId === cab.id && p.slotIndex === i);
                    const isSelf = occ?.trophyInstanceId === picking.id;
                    const canSwap = !!occ && !!placementOf(picking.id) && !isSelf;
                    return (
                      <button
                        key={i}
                        className={`slot-btn ${occ ? 'occupied' : 'free'}`}
                        disabled={isSelf || (!!occ && !canSwap)}
                        onClick={() => displayInSlot(cab.id, i)}
                        data-testid={`slot-${i}`}
                      >
                        <span>Shelf {i + 1}</span>
                        <span className="slot-sub">{isSelf ? 'Here now' : occ ? (canSwap ? `Swap with ${trophyName(occ.trophyInstanceId)}` : trophyName(occ.trophyInstanceId)) : 'Empty'}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
          <button className="btn ghost small" onClick={() => setPickTrophyId(null)}>Cancel</button>
        </div>
      )}

      {state.trophies.length === 0 && (
        <p className="empty">
          No trophies yet. Win a tournament to earn your first.
        </p>
      )}

      {jackets.length > 0 && (
        <section>
          <h2 className="section-title">Display case</h2>
          <ul className="list">
            <li className="trophy-row" data-testid="pink-jacket-case-row">
              <div className="trophy-badge pink_jacket" aria-hidden />
              <div className="trophy-info">
                <div className="trophy-name">{trophyLook(jackets[0]).name}</div>
                <div className="muted">In its own case in the room · won {jackets.length}× (see Stats and Legacy)</div>
              </div>
              <div className="trophy-actions">
                <button className="btn small" onClick={() => setInspectTrophyId(jackets[jackets.length - 1].id)}>Inspect</button>
              </div>
            </li>
          </ul>
        </section>
      )}

      {[{ title: 'In inventory', items: undisplayed }, { title: 'On display', items: displayed }].map(
        (group) =>
          group.items.length > 0 && (
            <section key={group.title}>
              <h2 className="section-title">{group.title}</h2>
              <ul className="list">
                {group.items.map((t) => {
                  const def = trophyLook(t);
                  const p = placementOf(t.id);
                  const cab = p && state.furniture.find((f) => f.id === p.furnitureInstanceId);
                  return (
                    <li key={t.id} className="trophy-row" data-testid={`trophy-${t.trophyDefinitionId}`}>
                      <div className={`trophy-badge ${def.style}`} aria-hidden />
                      <div className="trophy-info">
                        <div className="trophy-name">{def.name}</div>
                        <div className="muted">{def.eventName} · {t.finish.posLabel} {t.finish.toPar === 0 ? 'E' : t.finish.toPar > 0 ? `+${t.finish.toPar}` : t.finish.toPar} · {formatGameDate(t.earnedAt)}</div>
                        {p && cab && <div className="muted">Shelf {p.slotIndex + 1} · {zoneLabel(cab.placementZoneId)}</div>}
                      </div>
                      <div className="trophy-actions">
                        <button className="btn small" onClick={() => setInspectTrophyId(t.id)}>Inspect</button>
                        <button className="btn small" onClick={() => setPickTrophyId(t.id)} data-testid={`display-${t.trophyDefinitionId}`}>
                          {p ? 'Move' : 'Display'}
                        </button>
                        {p && (
                          <button className="btn small ghost" onClick={() => run(() => services.trophyDisplay.remove(playerId, t.id))}>
                            Remove
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ),
      )}
    </div>
  );
}
