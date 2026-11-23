/**
 * The game's own roulette betting board (single zero), drawn over the casino scene's decorative
 * grid. Every cell is one of the engine's supported bets (src/casino/roulette.ts): straight-up
 * 0-36, columns, dozens, low/high, even/odd, red/black. No splits, streets, corners or six-lines:
 * the engine doesn't offer them. Presentation only; the caller supplies each cell's button.
 */
import type { CSSProperties, ReactNode } from 'react';
import { colorOf, type RouletteSpot } from '../../casino/roulette';

/** Grid placement (CSS grid lines) and label for a spot. Columns: 0 | 1-36 in 12 columns | 2:1. */
export function boardCell(spot: RouletteSpot): { style: CSSProperties; label: string; tone: string } {
  if (spot.startsWith('n')) {
    const n = Number(spot.slice(1));
    if (n === 0) return { style: { gridColumn: '1', gridRow: '1 / 4' }, label: '0', tone: 'green' };
    const col = 2 + Math.floor((n - 1) / 3);
    const row = 3 - ((n - 1) % 3);
    return { style: { gridColumn: `${col}`, gridRow: `${row}` }, label: String(n), tone: colorOf(n) };
  }
  const outside: Record<string, [string, string, string]> = {
    col3: ['14', '1', '2:1'], col2: ['14', '2', '2:1'], col1: ['14', '3', '2:1'],
    dozen1: ['2 / 6', '4', '1st 12'], dozen2: ['6 / 10', '4', '2nd 12'], dozen3: ['10 / 14', '4', '3rd 12'],
    low: ['2 / 4', '5', '1–18'], even: ['4 / 6', '5', 'Even'], red: ['6 / 8', '5', 'Red'],
    black: ['8 / 10', '5', 'Black'], odd: ['10 / 12', '5', 'Odd'], high: ['12 / 14', '5', '19–36'],
  };
  const [gridColumn, gridRow, label] = outside[spot];
  return { style: { gridColumn, gridRow }, label, tone: spot === 'red' ? 'red' : spot === 'black' ? 'black' : 'outside' };
}

export function RouletteBoard({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={`rb-panel ${className ?? ''}`} style={style} data-testid="roulette-board">
      <div className="rb-grid">{children}</div>
    </div>
  );
}
