/**
 * A casino's card-table scene (one per game: Blackjack, Baccarat, Three Card Poker), with a felt
 * layer the game draws its cards, chips, zones and labels on. The scene image is never stretched:
 * the box has the scene's aspect ratio (minus the hidden room above the table) and the image fills
 * it at its own proportions. Presentation only.
 */
import type { CSSProperties, ReactNode } from 'react';
import { cardSceneFor, type CardGame, type CardScene, type FeltBox } from '../../expansion/tableThemes';
import { devLegacyTables, useCasinoLocation } from './casinoLocation';

/** The current casino's scene for a game, or null to use the previous table art. */
export function useCardScene<G extends CardGame>(game: G): CardScene<G> | null {
  const loc = useCasinoLocation();
  return devLegacyTables() ? null : cardSceneFor(loc, game);
}

/** Absolute placement of a felt box: [centre x, centre y, w, h] as fractions of the felt. */
export function feltAt([cx, cy, w, h]: FeltBox, sized = false): CSSProperties {
  return sized
    ? { left: `${(cx - w / 2) * 100}%`, top: `${(cy - h / 2) * 100}%`, width: `${w * 100}%`, height: `${h * 100}%` }
    : { left: `${cx * 100}%`, top: `${cy * 100}%` };
}

export function CardTableScene({ scene, game, testId, children }: { scene: CardScene; game: CardGame; testId: string; children: ReactNode }) {
  const [w, h] = scene.size;
  const viewH = h - scene.viewTop;
  const [fx, fy, fw, fh] = scene.felt;
  return (
    <div className={`card-scene loc-${scene.location} cs-${game}${scene.printedZones ? ' printed' : ''}`} style={{ aspectRatio: `${w} / ${viewH}` }} data-testid={testId} data-scene={scene.location}>
      <img
        className="card-scene-img"
        src={scene.url}
        width={w}
        height={h}
        alt=""
        draggable={false}
        style={{ top: `${(-scene.viewTop / viewH) * 100}%`, height: `${(h / viewH) * 100}%` }}
      />
      <div className="cs-felt" style={{ left: `${(fx / w) * 100}%`, top: `${((fy - scene.viewTop) / viewH) * 100}%`, width: `${(fw / w) * 100}%`, height: `${(fh / viewH) * 100}%` }}>
        {children}
      </div>
    </div>
  );
}
