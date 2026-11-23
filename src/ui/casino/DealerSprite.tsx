/**
 * Animated casino dealers (presentation only): Velvet Vega at blackjack and the
 * craps dealer, Stick Lady. Each uses a head-aligned atlas cut from the supplied sprite
 * sheets (art/source_sheets/casino/), with a manifest of animations. One-shot
 * reactions play once and return to idle; nothing here touches game logic.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import velvetUrl from '../../assets/casino/dealer_velvet_anim.png';
import velvetMeta from '../../assets/casino/dealer_velvet_anim.json';
import crapsUrl from '../../assets/casino/dealer_craps_anim.png';
import crapsMeta from '../../assets/casino/dealer_craps_anim.json';

export type DealerAnim = 'idle' | 'deal' | 'call' | 'win' | 'loss' | 'special';
interface Manifest { cell: [number, number]; headX: number; frames: Partial<Record<DealerAnim, number[]>>; heldBack?: Record<string, number[]> }
/** Atlas slots, including held-back frames (baked-in cards or chips) that are never shown. */
export const atlasFrames = (m: Manifest) => new Set([...Object.values(m.frames), ...Object.values(m.heldBack ?? {})].flat()).size;
export const DEALERS: Record<'velvet' | 'craps', { url: string; meta: Manifest }> = {
  velvet: { url: velvetUrl, meta: velvetMeta as unknown as Manifest },
  craps: { url: crapsUrl, meta: crapsMeta as unknown as Manifest },
};

/** Frame for an animation at a tick: one-shots hold their last frame; idle holds, then blinks. */
export function dealerFrame(meta: Manifest, anim: DealerAnim, tick: number): number {
  const f = meta.frames[anim] ?? meta.frames.idle!;
  if (anim === 'idle') {
    const cycle = 26;
    const t = tick % cycle;
    return f[t < cycle - (f.length - 1) ? 0 : t - (cycle - f.length)];
  }
  return f[Math.min(tick, f.length - 1)];
}

/** How long a one-shot shows before returning to idle (ms). */
export const ONE_SHOT_MS: Record<DealerAnim, number> = { idle: 0, deal: 700, call: 1300, win: 1500, loss: 1500, special: 1900 };
const FRAME_MS = 150;

/** Mode control: `play` a one-shot (returns to idle), `hold` a looping mode while busy. */
export function useDealerAnim() {
  const [anim, setAnim] = useState<DealerAnim>('idle');
  const timer = useRef<number | null>(null);
  const play = useCallback((a: DealerAnim, then?: DealerAnim) => {
    if (timer.current) window.clearTimeout(timer.current);
    setAnim(a);
    timer.current = window.setTimeout(() => {
      if (then) {
        setAnim(then);
        timer.current = window.setTimeout(() => setAnim('idle'), ONE_SHOT_MS[then]);
      } else setAnim('idle');
    }, ONE_SHOT_MS[a]);
  }, []);
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);
  return { anim, play };
}

export function DealerSprite({ who, anim, height, name }: { who: 'velvet' | 'craps'; anim: DealerAnim; height: number; name: string }) {
  const { url, meta } = DEALERS[who];
  const [tick, setTick] = useState(0);
  useEffect(() => {
    setTick(0);
    const t = window.setInterval(() => setTick((n) => n + 1), anim === 'idle' ? 110 : FRAME_MS);
    return () => window.clearInterval(t);
  }, [anim]);
  const total = atlasFrames(meta);
  const frame = dealerFrame(meta, anim, tick);
  const [cw, ch] = meta.cell;
  const width = Math.round((cw / ch) * height);
  return (
    <span
      className="dealer-sprite"
      role="img"
      aria-label={name}
      data-testid={`dealer-${who}`}
      data-anim={anim}
      data-frame={frame}
      style={{
        width,
        height,
        // Centre the head (not the frame) over the table so wide poses don't shift her.
        marginLeft: Math.round(width / 2 - (meta.headX / cw) * width) * 2,
        backgroundImage: `url(${url})`,
        backgroundSize: `${total * 100}% 100%`,
        backgroundPosition: `${(frame / (total - 1)) * 100}% 0`,
      }}
    />
  );
}
