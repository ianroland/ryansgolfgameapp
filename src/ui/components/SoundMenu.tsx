import { useEffect, useState } from 'react';
import { sound, type SoundSettings } from '../../audio/sound';
import { Dialog } from './Dialog';

export function useSoundSettings(): SoundSettings {
  const [s, setS] = useState(sound.getSettings());
  useEffect(() => {
    const off = sound.subscribe(setS);
    return () => {
      off();
    };
  }, []);
  return s;
}

/** Topbar speaker button + volume panel. "M" toggles mute anywhere. */
export function SoundMenu() {
  const s = useSoundSettings();
  const [open, setOpen] = useState(false);
  const custom = sound.customFiles();
  return (
    <>
      <button className="btn sound-btn" onClick={() => setOpen(true)} aria-label={s.muted ? 'Sound (muted)' : 'Sound'} title="Sound (M to mute)" data-testid="sound-btn">
        <span aria-hidden="true">{s.muted || (s.sfx === 0 && s.music === 0) ? '🔇' : '🔊'}</span>
      </button>
      {open && (
        <Dialog title="Sound" onClose={() => setOpen(false)}>
          <div className="sound-panel">
            <label className="sound-row">
              <span>Music</span>
              <input type="range" min={0} max={1} step={0.05} value={s.music} onChange={(e) => sound.setSettings({ music: Number(e.target.value), muted: false })} />
              <span className="sound-val">{Math.round(s.music * 100)}</span>
            </label>
            <label className="sound-row">
              <span>Effects</span>
              <input
                type="range" min={0} max={1} step={0.05} value={s.sfx}
                onChange={(e) => sound.setSettings({ sfx: Number(e.target.value), muted: false })}
                onPointerUp={() => sound.play('cup')}
              />
              <span className="sound-val">{Math.round(s.sfx * 100)}</span>
            </label>
            <label className="sound-row check">
              <input type="checkbox" checked={s.muted} onChange={(e) => sound.setSettings({ muted: e.target.checked })} />
              <span>Mute everything (press M)</span>
            </label>
            <p className="fineprint">
              {custom.sfx.length + custom.music.length > 0
                ? `Using your files for: ${[...custom.music.map((m) => `${m} music`), ...custom.sfx].join(', ')}. Everything else uses the built-in retro sounds.`
                : 'Built-in retro sounds. Add your own files to src/assets/audio (see the README) to replace any of them.'}
            </p>
          </div>
        </Dialog>
      )}
    </>
  );
}
