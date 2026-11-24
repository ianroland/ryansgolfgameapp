import type { GameServices } from '../services';

const AUTOSTART_KEY = 'ryans-road-autostart';

/** Downloads the save as JSON (and copies it to the clipboard where allowed). */
export async function exportSaveFile(services: GameServices): Promise<'downloaded+copied' | 'downloaded'> {
  const save = await services.saves.exportSave();
  const blob = new Blob([JSON.stringify(save, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ryans-road-save-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  try {
    await navigator.clipboard.writeText(JSON.stringify(save));
    return 'downloaded+copied';
  } catch {
    return 'downloaded';
  }
}

/** Reads and imports a save file chosen by the player. Throws on bad files. */
export async function importSaveFile(services: GameServices, file: File) {
  let data: unknown;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error("That file isn't a Ryan's Road save.");
  }
  await services.saves.importSave(data);
  await services.records.reconcile();
  await services.legacy.reconcile();
  await services.expansion.reconcile();
  await services.career.reconcileFields();
  await services.sportsbook.migrateWorld();
}

/** Erases the career and reloads. `autostart` skips the title screen once. */
export async function eraseCareer(services: GameServices, autostart = false) {
  try {
    if (autostart) sessionStorage.setItem(AUTOSTART_KEY, '1');
  } catch {
    /* storage may be blocked */
  }
  await services.db.delete();
  window.location.reload();
}

/** True once after a "new career" reload. */
export function takeAutostart(): boolean {
  try {
    const v = sessionStorage.getItem(AUTOSTART_KEY);
    sessionStorage.removeItem(AUTOSTART_KEY);
    return v === '1';
  } catch {
    return false;
  }
}
