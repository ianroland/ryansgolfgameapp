import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createServices } from './services';
import { sound } from './audio/sound';

// Button clicks get a blip; primary buttons a brighter one. "M" mutes.
document.addEventListener(
  'click',
  (e) => {
    const b = (e.target as HTMLElement | null)?.closest?.('button');
    if (!b || b.disabled || b.closest('.touch-controls')) return;
    if (b.classList.contains('primary')) sound.play('ui_confirm');
    else if (b.classList.contains('ghost') || b.classList.contains('dialog-close')) sound.play('ui_back');
    else sound.play('ui_click');
  },
  true,
);
if (import.meta.env.DEV) (window as unknown as { wtgSound: typeof sound }).wtgSound = sound;
window.addEventListener('keydown', (e) => {
  const tag = (e.target as HTMLElement | null)?.tagName;
  if ((e.key === 'm' || e.key === 'M') && !e.metaKey && !e.ctrlKey && tag !== 'INPUT' && tag !== 'TEXTAREA') {
    sound.setSettings({ muted: !sound.getSettings().muted });
  }
});
import { GameProvider } from './ui/GameContext';
import { App } from './ui/App';
import '@fontsource/tiny5/400.css';
import '@fontsource/jersey-15/400.css';
import './ui/styles.css';

async function boot() {
  // Phaser draws text to canvas, so the pixel font must be ready first.
  try {
    await Promise.all(['16px Tiny5', '16px "Jersey 15"'].map((f) => document.fonts.load(f)));
  } catch {
    /* fall back to system fonts */
  }
  const root = createRoot(document.getElementById('root')!);
  try {
    let services: ReturnType<typeof createServices>;
    let ephemeral = false;
    try {
      services = createServices();
      await services.db.open();
    } catch {
      // Browser storage unavailable (e.g. a sandboxed embed): play with an in-memory save.
      const { indexedDB, IDBKeyRange } = await import('fake-indexeddb');
      for (const [k, v] of [['indexedDB', indexedDB], ['IDBKeyRange', IDBKeyRange]] as const) {
        try {
          Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
        } catch {
          /* keep going: Dexie also receives them explicitly */
        }
      }
      services = createServices(undefined, { indexedDB, IDBKeyRange });
      ephemeral = true;
    }
    await services.career.ensureCareer();
    // Record book: recover verified albatrosses from stored results (idempotent).
    await services.records.reconcile().catch((e) => console.warn('Record book check failed', e));
    // Career Legacy: recognize milestones already earned in the verified history (idempotent).
    await services.legacy.reconcile().catch((e) => console.warn('Career legacy check failed', e));
    // Casino unlocks: recognise ones the bankroll history already earned (idempotent, never removes).
    await services.expansion.reconcile().catch((e) => console.warn('Casino unlock check failed', e));
    await services.career.reconcileFields().catch((e) => console.warn('Tour field check failed', e));
    // Sports world v2: settle what's final, then mark the save for the history rosters (idempotent).
    await services.sportsbook.migrateWorld().catch((e) => console.warn('Sports world migration failed', e));
    const initial = await services.career.loadClubhouse();
    if (import.meta.env.DEV) (window as unknown as { wtg: unknown }).wtg = services; // debugging aid
    root.render(
      <StrictMode>
        <GameProvider services={services} initial={initial} ephemeral={ephemeral}>
          <App />
        </GameProvider>
      </StrictMode>,
    );
  } catch (e) {
    console.error('boot failed', (e as Error)?.stack ?? e);
    root.render(
      <div className="fatal" role="alert">
        <h1>Couldn&rsquo;t load your career</h1>
        <p>{String((e as Error)?.message ?? e)}</p>
        <p>Your save has not been modified.</p>
      </div>,
    );
  }
}

boot();
