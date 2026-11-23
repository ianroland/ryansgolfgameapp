import { useState } from 'react';
import { Icon } from '../components/Icon';
import { getCatalogItem } from '../../catalog/items';
import { isDomainError } from '../../core/errors';
import { zoneAccepts } from '../../services/roomService';
import { useGame } from '../GameContext';

export interface EditSession {
  baseVersion: number;
  /** furnitureId → zoneId (placed) or null (back to storage). Unsaved. */
  draft: Record<string, string | null>;
  selectedFurnitureId: string | null;
  dirty: boolean;
}

interface Props {
  session: EditSession;
  setSession: (s: EditSession | null) => void;
  effectiveZone: (id: string, saved?: string) => string | undefined;
  onDone: () => void;
  onHint: (s: string) => void;
  onZoneClick: (zoneId: string) => void;
}

export function EditRoomPanel({ session, setSession, effectiveZone, onDone, onHint, onZoneClick }: Props) {
  const { state, services, playerId, notify, refresh } = useGame();
  const [saving, setSaving] = useState(false);
  const def = state.propertyDef;
  const zoneOf = (id: string) => effectiveZone(id, state.furniture.find((f) => f.id === id)?.placementZoneId);
  const selected = state.furniture.find((f) => f.id === session.selectedFurnitureId);
  const trophiesIn = (furnId: string) => state.placements.filter((p) => p.furnitureInstanceId === furnId).length;

  const save = async () => {
    setSaving(true);
    try {
      const res = await services.room.commitLayout(playerId, state.property.id, session.baseVersion, session.draft);
      notify({
        kind: 'info',
        title: 'Room layout saved',
        body: res.returnedTrophyIds.length ? `${res.returnedTrophyIds.length} trophy(ies) returned to your trophy inventory.` : undefined,
      });
      await refresh();
      onDone();
    } catch (e) {
      notify({ kind: 'error', title: isDomainError(e) ? e.message : 'Could not save layout' });
      if (isDomainError(e, 'STALE_LAYOUT')) {
        await refresh();
        onDone();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="panel-body">
      <h1 className="panel-title"><Icon name="sofa" size={30} /> Edit Room</h1>
      <p className="muted">Changes are a draft until you save. Cancel discards them.</p>

      <h2 className="section-title">Inventory</h2>
      {state.furniture.length === 0 ? (
        <p className="empty">You don&rsquo;t own any furniture yet. Buy a cabinet in the Store.</p>
      ) : (
        <ul className="list" aria-label="Owned furniture">
          {state.furniture.map((f) => {
            const z = zoneOf(f.id);
            const isSel = f.id === session.selectedFurnitureId;
            return (
              <li key={f.id} className={`list-row selectable ${isSel ? 'is-selected' : ''}`}>
                <button
                  className="row-btn"
                  aria-pressed={isSel}
                  onClick={() => {
                    setSession({ ...session, selectedFurnitureId: isSel ? null : f.id });
                    onHint('');
                  }}
                >
                  <span>{getCatalogItem(f.catalogItemId).name} <span className="muted">#{f.id.slice(-4)}</span></span>
                  <span className="pill">{def.zones.find((zz) => zz.id === z)?.label ?? 'In storage'}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {selected && (
        <>
          <h2 className="section-title">Place {getCatalogItem(selected.catalogItemId).name}</h2>
          <ul className="zone-grid" aria-label="Placement zones">
            {def.zones.map((z) => {
              const occupant = state.furniture.find((f) => f.id !== selected.id && zoneOf(f.id) === z.id);
              const compatible = zoneAccepts(def, z, selected.catalogItemId);
              const here = zoneOf(selected.id) === z.id;
              const status = here ? 'Here now' : occupant ? 'Occupied' : !compatible ? (z.reserved ? 'Reserved' : 'Incompatible') : 'Available';
              return (
                <li key={z.id}>
                  <button
                    className={`zone-btn ${status.toLowerCase().replace(' ', '-')}`}
                    disabled={here || !!occupant || !compatible}
                    onClick={() => onZoneClick(z.id)}
                    data-testid={`zone-${z.id}`}
                  >
                    <span className="zone-name">{z.label}</span>
                    <span className="zone-status">{status}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {zoneOf(selected.id) && (
            <div className="btn-row">
              <button
                className="btn ghost"
                onClick={() => {
                  setSession({ ...session, draft: { ...session.draft, [selected.id]: null }, dirty: true });
                  onHint('Returned to storage. Save to keep this layout.');
                }}
              >
                Return to storage
              </button>
            </div>
          )}
          {zoneOf(selected.id) === undefined && trophiesIn(selected.id) > 0 && (
            <p className="warn-text">
              On save, {trophiesIn(selected.id)} displayed trophy(ies) go back to your trophy inventory. Trophies are never deleted.
            </p>
          )}
        </>
      )}

      <div className="btn-row sticky-actions">
        <button className="btn primary" onClick={save} disabled={!session.dirty || saving} data-testid="save-layout">
          {saving ? 'Saving…' : 'Save layout'}
        </button>
        <button className="btn ghost" onClick={onDone} disabled={saving}>Cancel</button>
      </div>
    </div>
  );
}
