/**
 * Chip pictures for the current casino (data-driven, see src/expansion/chipThemes.ts).
 * A selector chip with a themed face shows the face (its value stays in the accessible label);
 * one without (the $10 chip) keeps the original CSS chip. Presentation only.
 */
import type { ReactNode } from 'react';
import { CHIP_THEMES } from '../../expansion/chipThemes';
import { useCasinoLocation } from './casinoLocation';

export function ChipButton({ value, on, onClick, disabled, label, testId, title }: { value: number; on?: boolean; onClick: () => void; disabled?: boolean; label: string; testId?: string; title?: string }) {
  const face = CHIP_THEMES[useCasinoLocation()].face(value);
  const children: ReactNode = face ? (
    <>
      <img src={face} alt="" draggable={false} />
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
