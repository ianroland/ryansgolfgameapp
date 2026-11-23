import { useCallback, useEffect, useRef, useState } from 'react';
import { GAME_TITLE } from '../career/config';
import titleArt from '../assets/title_screen.webp';
import devnotes from '../../devnotes.json';
import { useGame } from './GameContext';
import { sound } from '../audio/sound';
import { formatMoney } from './format';
import { eraseCareer, exportSaveFile, importSaveFile, takeAutostart } from './saveActions';

type Choice = 'continue' | 'new' | 'load';

/**
 * Arcade-style title screen with a menu: Continue, New Career, Load Career.
 * Arrow keys / d-pad move, Enter / Space / A choose, or click and tap.
 */
export function TitleScreen({ onStart }: { onStart: () => void }) {
  const { state, services, refresh } = useGame();
  const c = state.career;
  const returning = c.season > 1 || c.week > 1 || c.totals.events > 0 || !!c.active;
  const choices: Choice[] = returning ? ['continue', 'new', 'load'] : ['new', 'load'];

  const [sel, setSel] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [modal, setModal] = useState<null | 'notes' | 'confirmNew'>(null);
  const [message, setMessage] = useState<{ text: string; bad?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const startedRef = useRef(false);
  const live = useRef({ sel, modal, choices, busy });
  live.current = { sel, modal, choices, busy };

  const start = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    sound.play('start');
    setLeaving(true);
    window.setTimeout(onStart, 380);
  }, [onStart]);

  const choose = useCallback(
    (choice: Choice) => {
      if (live.current.busy) return;
      setMessage(null);
      if (choice === 'continue') return start();
      if (choice === 'new') {
        // A fresh career is already waiting: just begin it.
        if (!returning) return start();
        sound.play('story');
        return setModal('confirmNew');
      }
      sound.play('ui_click');
      fileRef.current?.click();
    },
    [returning, start],
  );

  // Coming back from "new career": skip straight into the game.
  useEffect(() => {
    if (takeAutostart()) start();
  }, [start]);

  useEffect(() => {
    sound.playMusic('title');
    const move = (d: number) => {
      const n = live.current.choices.length;
      setSel((s) => (s + d + n) % n);
      sound.play('ui_click', { volume: 0.5 });
    };
    const onKey = (e: KeyboardEvent) => {
      if (live.current.modal) {
        if (e.key === 'Escape') setModal(null);
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') move(-1);
      else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') move(1);
      else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        choose(live.current.choices[live.current.sel]);
      }
    };
    window.addEventListener('keydown', onKey);
    // Gamepad: d-pad / stick to move, A or Start to choose.
    let raf = 0;
    let armed = false;
    let lastMove = 0;
    const poll = (t: number) => {
      const pad = [...(navigator.getGamepads?.() ?? [])].find(Boolean);
      if (pad && !live.current.modal) {
        const a = pad.buttons[0]?.pressed || pad.buttons[9]?.pressed;
        const x = (pad.axes[0] ?? 0) + (pad.buttons[15]?.pressed ? 1 : 0) - (pad.buttons[14]?.pressed ? 1 : 0);
        if (!a) armed = true;
        else if (armed) {
          armed = false;
          choose(live.current.choices[live.current.sel]);
        }
        if (Math.abs(x) > 0.5 && t - lastMove > 250) {
          lastMove = t;
          move(x > 0 ? 1 : -1);
        }
      }
      raf = requestAnimationFrame(poll);
    };
    raf = requestAnimationFrame(poll);
    return () => {
      window.removeEventListener('keydown', onKey);
      cancelAnimationFrame(raf);
    };
  }, [choose]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      await importSaveFile(services, file);
      await refresh();
      setMessage({ text: 'Career loaded!' });
      setBusy(false);
      start();
    } catch (e) {
      setBusy(false);
      sound.play('error');
      setMessage({ text: e instanceof Error ? e.message : "That save couldn't be loaded.", bad: true });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const label: Record<Choice, string> = { continue: c.active ? 'Resume' : 'Continue', new: 'New Career', load: 'Load Career' };
  const detail: Record<Choice, string> = {
    continue: c.active ? 'Back to your tournament' : `Season ${c.season} · Week ${c.week}`,
    new: returning ? 'Start over at 18' : 'Ryan is 18 with a dream',
    load: 'From a save file',
  };
  const latest = devnotes.notes[0];

  return (
    <div
      className={`title-screen ${leaving ? 'leaving' : ''}`}
      style={{ ['--title-art' as string]: `url(${titleArt})` }}
      aria-label={`${GAME_TITLE}: title screen`}
      data-testid="title-screen"
    >
      <div className="title-frame">
        <img className="title-art" src={titleArt} alt="" draggable={false} />
        <span className="title-press-glow" aria-hidden="true" />
        <span className="title-mute">M: sound on/off</span>
        <button className="title-notes-btn" onClick={() => setModal('notes')} data-testid="whats-new">
          v{latest.version} · What&rsquo;s new
        </button>
      </div>

      <nav className="title-menu" aria-label="Main menu">
        {choices.map((ch, i) => (
          <button
            key={ch}
            className={`title-item ${i === sel ? 'on' : ''}`}
            onMouseEnter={() => setSel(i)}
            onFocus={() => setSel(i)}
            onClick={() => choose(ch)}
            disabled={busy}
            autoFocus={i === 0}
            data-testid={`title-${ch}`}
          >
            <span className="ti-label">{label[ch]}</span>
            <span className="ti-detail">{detail[ch]}</span>
          </button>
        ))}
        {message && <p className={`title-message ${message.bad ? 'bad' : ''}`} role="status">{message.text}</p>}
      </nav>
      <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => onFile(e.target.files?.[0])} data-testid="title-file" />

      {modal === 'confirmNew' && (
        <div className="title-notes" role="dialog" aria-label="Start a new career?">
          <div className="title-notes-card">
            <h2>Start a new career?</h2>
            <p className="title-warn">
              This erases Ryan&rsquo;s current career: Season {c.season}, Week {c.week}, {formatMoney(state.balance)} in the bank and {state.trophies.length} troph{state.trophies.length === 1 ? 'y' : 'ies'}. It can&rsquo;t be undone.
            </p>
            <p className="muted">Want to keep it? Export a backup first. You can bring it back any time with Load Career.</p>
            <div className="btn-row">
              <button className="btn ghost" onClick={() => setModal(null)} autoFocus>Keep my career</button>
              <button
                className="btn"
                onClick={async () => {
                  const how = await exportSaveFile(services);
                  setMessage({ text: how === 'downloaded+copied' ? 'Backup downloaded (and copied).' : 'Backup downloaded.' });
                }}
                data-testid="title-backup"
              >
                Export backup
              </button>
              <button className="btn danger" onClick={() => eraseCareer(services, true)} data-testid="title-erase">
                Erase &amp; start over
              </button>
            </div>
            {message && <p className="title-message" role="status">{message.text}</p>}
          </div>
        </div>
      )}

      {modal === 'notes' && (
        <div className="title-notes" role="dialog" aria-label="What's new">
          <div className="title-notes-card">
            <h2>What&rsquo;s new</h2>
            {devnotes.notes.slice(0, 3).map((n) => (
              <section key={n.version}>
                <h3>
                  <span className="nv">v{n.version}</span> {n.title}
                </h3>
                <ul>
                  {n.items.map((it, i) => (
                    <li key={i}>
                      <span className={`tag ${it.tag}`}>{it.tag}</span> {it.text}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            <div className="btn-row">
              <a className="btn ghost" href="https://ryansgolf.app/#notes" target="_blank" rel="noreferrer">All dev notes</a>
              <button className="btn primary" autoFocus onClick={() => setModal(null)}>Back</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
