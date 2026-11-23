import { useState } from 'react';
import { appearanceOf, HAIR_INFO, phaseHat, resolveLook, storyOf } from '../../story/appearance';
import { RYAN_ID } from '../../story/cast';
import { portraitKey } from '../../story/sprites';
import { EXPRESSIONS, HAIRS, type Appearance } from '../../story/types';
import { Dialog } from '../components/Dialog';
import { useGame } from '../GameContext';
import { SpriteFrame } from './Sprite';

/** Ryan's look: hair and hat, chosen independently. Looks unlock through the story. */
export function AppearanceDialog({ onClose }: { onClose: () => void }) {
  const { state, services, run } = useGame();
  const c = state.career;
  const story = storyOf(c);
  const saved = appearanceOf(c);
  const [a, setA] = useState<Appearance>({ hair: saved.hair, hat: phaseHat(saved.hair) });
  const look = resolveLook(a);
  const save = async () => {
    await run(() => services.career.setAppearance(a));
    onClose();
  };
  return (
    <Dialog title="Ryan's look" onClose={onClose} wide>
      <div className="look" data-testid="appearance">
        <div className="look-hairs" role="radiogroup" aria-label="Hair">
          {HAIRS.map((h) => {
            const open = story.hairUnlocked.includes(h);
            return (
              <button key={h} role="radio" aria-checked={a.hair === h} className={`look-card ${a.hair === h ? 'on' : ''}`} disabled={!open} onClick={() => setA({ hair: h, hat: phaseHat(h) })} data-testid={`look-${h}`}>
                <span className={open ? '' : 'locked'}>
                  <SpriteFrame who={RYAN_ID} frame={portraitKey(RYAN_ID, 'neutral', { hair: h, hat: phaseHat(h) })} height={110} />
                </span>
                <b>{HAIR_INFO[h].label}</b>
                <small>{open ? (a.hair === h ? 'Selected' : 'Unlocked') : `🔒 ${HAIR_INFO[h].unlock}`}</small>
              </button>
            );
          })}
        </div>
        <h3 className="sub-title">Expressions</h3>
        <div className="look-expr">
          {EXPRESSIONS.map((e) => (
            <figure key={e}>
              <SpriteFrame who={RYAN_ID} frame={portraitKey(RYAN_ID, e, a)} height={72} />
              <figcaption>{e}</figcaption>
            </figure>
          ))}
        </div>
        {look.missing.length > 0 && (
          <p className="fineprint" data-testid="look-missing">
            Not drawn yet: {look.missing.join('; ')}. {look.exact ? '' : 'Showing the closest look that is drawn. '}
            {look.gameplay ? '' : 'On the course Ryan uses the current golfer sprite until those frames exist.'}
          </p>
        )}
        <div className="look-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={save} data-testid="look-save">Save look</button>
        </div>
      </div>
    </Dialog>
  );
}
