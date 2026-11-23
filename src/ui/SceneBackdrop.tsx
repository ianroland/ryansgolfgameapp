/**
 * Rotating scenery behind the game shell (not the title screen): four 32-bit
 * scenes, each a full-page background and a matching wide header strip. Pure
 * presentation: nothing here touches gameplay or the save.
 *
 * - The page scene is a fixed viewport layer (cover, centred, never tiled or
 *   stretched to the document height) under a dark green tint for panel contrast.
 * - The header strip sits behind the header contents (logo, bank, buttons).
 * - Every ROTATE_MS the scene moves on, page and header together: the next
 *   images are preloaded first, then crossfade over FADE_MS. Reduced motion:
 *   no crossfade (an instant swap). Hidden tab: the timer stops and restarts on
 *   return. One timer per mounted shell, cleaned up on unmount.
 */
import { useEffect, useRef, useState } from 'react';
import bgCity from '../assets/backgrounds/bg_city_sunset.webp';
import bgDesert from '../assets/backgrounds/bg_desert_palms.webp';
import bgCoast from '../assets/backgrounds/bg_coastal_classic.webp';
import bgCasino from '../assets/backgrounds/bg_casino_night.webp';
import hdCity from '../assets/backgrounds/header_city_sunset.webp';
import hdDesert from '../assets/backgrounds/header_desert_palms.webp';
import hdCoast from '../assets/backgrounds/header_coastal_classic.webp';
import hdCasino from '../assets/backgrounds/header_casino_night.webp';

export const SCENES = [
  { id: 'city_sunset', page: bgCity, header: hdCity },
  { id: 'desert_palms', page: bgDesert, header: hdDesert },
  { id: 'coastal_classic', page: bgCoast, header: hdCoast },
  { id: 'casino_night', page: bgCasino, header: hdCasino },
] as const;
export const ROTATE_MS = 90_000;
export const FADE_MS = 1000;

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function preload(urls: string[]): Promise<void> {
  return Promise.all(
    urls.map(
      (src) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = img.onerror = () => resolve();
          img.src = src;
        }),
    ),
  ).then(() => undefined);
}

/** The current scene and the one fading out (if a crossfade is running). */
export function useSceneRotation(): { scene: number; leaving: number | null } {
  const [state, setState] = useState<{ scene: number; leaving: number | null }>({ scene: 0, leaving: null });
  const sceneRef = useRef(0);
  useEffect(() => {
    let timer: number | null = null;
    let fade: number | null = null;
    let alive = true;
    const advance = async () => {
      const next = (sceneRef.current + 1) % SCENES.length;
      await preload([SCENES[next].page, SCENES[next].header]);
      if (!alive || document.hidden) return;
      const prev = sceneRef.current;
      sceneRef.current = next;
      if (reducedMotion()) setState({ scene: next, leaving: null });
      else {
        setState({ scene: next, leaving: prev });
        if (fade) window.clearTimeout(fade);
        fade = window.setTimeout(() => setState((s) => ({ ...s, leaving: null })), FADE_MS + 50);
      }
    };
    const start = () => {
      if (timer === null) timer = window.setInterval(() => void advance(), ROTATE_MS);
    };
    const stop = () => {
      if (timer !== null) window.clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => (document.hidden ? stop() : start());
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      alive = false;
      stop();
      if (fade) window.clearTimeout(fade);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
  return state;
}

/** Two stacked layers: the leaving scene underneath, the current one on top (fading in). */
function Layers({ kind, scene, leaving }: { kind: 'page' | 'header'; scene: number; leaving: number | null }) {
  return (
    <>
      {leaving !== null && <div className={`scene-layer ${kind}`} style={{ backgroundImage: `url(${SCENES[leaving][kind]})` }} />}
      <div
        key={scene}
        className={`scene-layer ${kind} ${leaving !== null ? 'fading-in' : ''}`}
        style={{ backgroundImage: `url(${SCENES[scene][kind]})` }}
        data-scene={SCENES[scene].id}
        data-testid={`scene-${kind}`}
      />
    </>
  );
}

export function PageBackdrop({ scene, leaving }: { scene: number; leaving: number | null }) {
  return (
    <div className="scene-backdrop page" aria-hidden>
      <Layers kind="page" scene={scene} leaving={leaving} />
      <div className="scene-tint page" />
    </div>
  );
}

export function HeaderBackdrop({ scene, leaving }: { scene: number; leaving: number | null }) {
  return (
    <div className="scene-backdrop header" aria-hidden>
      <Layers kind="header" scene={scene} leaving={leaving} />
      <div className="scene-tint header" />
    </div>
  );
}
