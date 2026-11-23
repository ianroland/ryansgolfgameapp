import { useRef, useState } from 'react';
import { useGame } from '../GameContext';
import { Dialog } from './Dialog';
import { Icon } from './Icon';
import { eraseCareer, exportSaveFile, importSaveFile } from '../saveActions';

/** Save management: export/import JSON saves and start a new career. */
export function SaveMenu() {
  const { services, run, notify } = useGame();
  const [open, setOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const exportSave = async () => {
    const how = await exportSaveFile(services);
    notify({ kind: 'info', title: 'Save exported', body: how === 'downloaded+copied' ? 'Downloaded, and copied to your clipboard.' : undefined });
  };

  const importSave = async (file: File) => {
    const ok = await run(async () => {
      await importSaveFile(services, file);
      return true;
    });
    if (ok) notify({ kind: 'info', title: 'Save imported' });
    setOpen(false);
  };

  const newCareer = () => eraseCareer(services, true);

  return (
    <>
      <button className="btn save" onClick={() => setOpen(true)} aria-haspopup="dialog"><Icon name="disk" size={18} /> Save</button>
      {open && (
        <Dialog title="Save data" onClose={() => setOpen(false)}>
          <p className="muted">Your career saves automatically in this browser after every week, purchase and tournament.</p>
          <div className="btn-col">
            <button className="btn" onClick={exportSave}>Export save file</button>
            <button className="btn" onClick={() => fileRef.current?.click()}>Import save file…</button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => e.target.files?.[0] && importSave(e.target.files[0])}
            />
            {confirmReset ? (
              <div className="btn-row">
                <span className="warn-text">Erase this career for good?</span>
                <button className="btn danger" onClick={newCareer}>Yes, erase it</button>
                <button className="btn ghost" onClick={() => setConfirmReset(false)}>Keep it</button>
              </div>
            ) : (
              <button className="btn danger" onClick={() => setConfirmReset(true)}>Start new career</button>
            )}
          </div>
        </Dialog>
      )}
    </>
  );
}
