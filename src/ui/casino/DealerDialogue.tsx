/**
 * The casino dealers' dialogue box, in Madame Monique's style: portrait, gold name,
 * typed-out line. Velvet Vega (blackjack) and Stick Lady (craps) use it for their
 * calls and reactions, so every table speaks the same way. Presentation only.
 */
import { useEffect, useState } from 'react';
import { sound } from '../../audio/sound';
import velvetPortrait from '../../assets/casino/velvet_portrait.png';
import stickPortraits from '../../assets/casino/stick_portraits.png';
import stickMeta from '../../assets/casino/stick_portraits.json';
import type { DealerAnim } from './DealerSprite';
import { TierChip } from './Tipping';

export const DEALER_NAMES = { velvet: 'Velvet Vega', craps: 'Stick Lady' } as const;

const STICK = stickMeta as { cell: [number, number]; portraits: string[] };
/** Stick Lady's face for what she's doing. */
const STICK_FACE: Record<DealerAnim, string> = { idle: 'neutral', deal: 'neutral', call: 'smile', win: 'laugh', loss: 'wink', special: 'facepalm' };

function Portrait({ who, anim }: { who: 'velvet' | 'craps'; anim: DealerAnim }) {
  if (who === 'velvet') return <span className="monique-portrait dealer-portrait" role="img" aria-label="Velvet Vega" style={{ backgroundImage: `url(${velvetPortrait})`, backgroundSize: 'cover', backgroundPosition: 'center top' }} />;
  const i = Math.max(0, STICK.portraits.indexOf(STICK_FACE[anim]));
  const n = STICK.portraits.length;
  return (
    <span
      className="monique-portrait dealer-portrait"
      role="img"
      aria-label={`Stick Lady (${STICK_FACE[anim]})`}
      data-face={STICK_FACE[anim]}
      style={{ backgroundImage: `url(${stickPortraits})`, backgroundSize: `${n * 100}% 100%`, backgroundPosition: `${(i / (n - 1)) * 100}% 0` }}
    />
  );
}

/** A dealer line: plain text (existing lines) or a draft line awaiting approval. */
export type DealerLine = string | { text: string; draft: boolean };

const NPC_OF = { velvet: 'velvet_vega', craps: 'stick_lady' } as const;

export function DealerDialogue({ who, line: raw, anim }: { who: 'velvet' | 'craps'; line: DealerLine | null; anim: DealerAnim }) {
  const line = raw === null ? null : typeof raw === 'string' ? raw : raw.text;
  const draft = raw !== null && typeof raw !== 'string' && raw.draft;
  const [typed, setTyped] = useState(0);
  useEffect(() => setTyped(0), [line]);
  useEffect(() => {
    if (!line || typed >= line.length) return;
    const t = window.setTimeout(() => {
      setTyped((k) => k + 1);
      if (typed % 3 === 0) sound.play('ui_click', { volume: 0.1 });
    }, 22);
    return () => window.clearTimeout(t);
  }, [typed, line]);
  if (!line) return null;
  const done = typed >= line.length;
  return (
    <div className={`rpg-box dealer ${who}`} aria-live="polite" data-testid="dealer-line" onClick={() => setTyped(line.length)}>
      <Portrait who={who} anim={anim} />
      <div className="rpg-body">
        <p className="rpg-name">
          {DEALER_NAMES[who]}
          <TierChip npcId={NPC_OF[who]} />
          {draft && <span className="rpg-draft" title="Dialogue awaiting Script Room approval">Draft line</span>}
        </p>
        <p className="rpg-text">{line.slice(0, typed)}<span className="rpg-caret" aria-hidden>{done ? '' : '▌'}</span></p>
      </div>
    </div>
  );
}
