/**
 * The Pink Jacket: the author-supplied sprite (rose-pink blazer, gold crest with
 * a rose and crossed irons), cut out of its white background unchanged.
 * Source: "Pixel-Art_Pink_Blazer_Crest.png" (author, 2026-11-22).
 */
import jacketUrl from '../../assets/legacy/pink_jacket.png';

export { jacketUrl };

/** Native aspect of the art (width / height). */
const ASPECT = 425 / 480;

export function PinkJacket({ size = 96, title, className }: { size?: number; title?: string; className?: string }) {
  return (
    <img
      className={`pink-jacket ${className ?? ''}`}
      src={jacketUrl}
      width={Math.round(size * ASPECT)}
      height={size}
      alt={title ?? ''}
      aria-hidden={title ? undefined : true}
      draggable={false}
    />
  );
}
