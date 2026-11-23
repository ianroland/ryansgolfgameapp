/**
 * Ryan (phase 3) celebrating in the Pink Jacket: the author-supplied 8-frame
 * sheet ("Pixel_Ryan_Celebrates_Pink_Jacket_Victory.png"), played once and
 * held on the last frame. Frames are equal cells, bottom-aligned.
 */
import stripUrl from '../../assets/legacy/ryan_jacket_celebrate.png';

const FRAMES = 8;
const CELL_W = 129;
const CELL_H = 300;
const FRAME_MS = 260;
export const CELEBRATE_MS = (FRAMES - 1) * FRAME_MS;

export function RyanJacketCelebration({ height = 260 }: { height?: number }) {
  const k = height / CELL_H;
  const w = Math.round(CELL_W * k);
  return (
    <span
      className="ryan-jacket-celebrate"
      role="img"
      aria-label="Ryan celebrating in the Pink Jacket"
      style={{
        width: w,
        height,
        backgroundImage: `url(${stripUrl})`,
        backgroundSize: `${w * FRAMES}px ${height}px`,
        ['--rjc-end' as string]: `-${w * (FRAMES - 1)}px`,
        animationDuration: `${CELEBRATE_MS}ms`,
      }}
    />
  );
}
