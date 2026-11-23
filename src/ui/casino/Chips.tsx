/**
 * Chip pictures for the current casino (data-driven, see src/expansion/chipThemes.ts).
 * Every chip image in the casino is drawn by <ChipImg>, so sizing rules live in one place:
 * square box, object-fit: contain, smooth downscaling, no cropping masks, no stretching.
 * A selector chip without a themed face keeps the original CSS chip. Presentation only.
 */
import type { ReactNode } from 'react';
import { CHIP_CANVAS, chipAsset, type ChipAsset } from '../../expansion/chipThemes';
import { useCasinoLocation } from './casinoLocation';

/** One chip picture. Width and height attributes are equal, so the browser reserves a square. */
export function ChipImg({ src, source, className }: { src: string; source?: ChipAsset['source']; className?: string }) {
  return (
    <img
      className={`chip-img ${className ?? ''}`}
      src={src}
      width={CHIP_CANVAS}
      height={CHIP_CANVAS}
      alt=""
      draggable={false}
      decoding="async"
      data-chip-source={source}
    />
  );
}

export function ChipButton({ value, on, onClick, disabled, label, testId, title }: { value: number; on?: boolean; onClick: () => void; disabled?: boolean; label: string; testId?: string; title?: string }) {
  const face = chipAsset(useCasinoLocation(), value);
  const children: ReactNode = face ? (
    <>
      <ChipImg src={face.url} source={face.source} />
      <span className="sr-only">{value}</span>
    </>
  ) : (
    value
  );
  return (
    <button
      className={`chip chip-${value} ${face ? 'chip-face' : ''} ${on ? 'on' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      aria-label={label}
      title={title}
      data-testid={testId}
      data-themed={face ? 'yes' : 'no'}
    >
      {children}
    </button>
  );
}
