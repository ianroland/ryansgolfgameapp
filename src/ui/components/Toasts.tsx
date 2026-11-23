import { useGame } from '../GameContext';

export function Toasts() {
  const { notifications, dismiss, setInspectTrophyId } = useGame();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {notifications.map((n) => (
        <div key={n.id} className={`toast ${n.kind}`}>
          <div className="toast-text">
            <strong>{n.title}</strong>
            {n.body && <span>{n.body}</span>}
          </div>
          {n.kind === 'trophy' && n.refId && (
            <button className="btn small" onClick={() => { setInspectTrophyId(n.refId!); dismiss(n.id); }}>View</button>
          )}
          <button className="icon-btn" aria-label="Dismiss" onClick={() => dismiss(n.id)}>✕</button>
        </div>
      ))}
    </div>
  );
}
