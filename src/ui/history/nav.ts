/** History Board navigation (pure): a section, a league, and a back stack of drill-downs. */
import type { LeagueId } from '../../sports/demo';

export type Section = 'overview' | 'archive' | 'championships' | 'players' | 'records' | 'awards' | 'hof' | 'moments' | 'review';
export const SECTIONS: { id: Section; label: string }[] = [
  { id: 'overview', label: 'League' },
  { id: 'archive', label: 'Seasons' },
  { id: 'championships', label: 'Champions' },
  { id: 'players', label: 'Players' },
  { id: 'records', label: 'Records' },
  { id: 'awards', label: 'Awards' },
  { id: 'hof', label: 'Hall of Fame' },
  { id: 'moments', label: 'Moments' },
  { id: 'review', label: 'Year in Review' },
];
export type Detail =
  | { kind: 'player'; id: string }
  | { kind: 'team'; id: string }
  | { kind: 'season'; league: LeagueId; year: number }
  | { kind: 'review'; year: number };
export interface NavState { section: Section; league: LeagueId; stack: Detail[] }
export type NavAction =
  | { type: 'section'; section: Section }
  | { type: 'league'; league: LeagueId }
  | { type: 'open'; detail: Detail; replace?: boolean }
  | { type: 'back' };

export const initialNav = (league: LeagueId = 'gdc'): NavState => ({ section: 'overview', league, stack: [] });
const same = (a: Detail | undefined, b: Detail) => !!a && JSON.stringify(a) === JSON.stringify(b);

export function navReduce(s: NavState, a: NavAction): NavState {
  switch (a.type) {
    case 'section':
      return s.section === a.section && !s.stack.length ? s : { ...s, section: a.section, stack: [] };
    case 'league':
      return s.league === a.league ? s : { ...s, league: a.league, stack: s.stack.filter((d) => d.kind === 'player' || d.kind === 'review') };
    case 'open': {
      if (same(s.stack.at(-1), a.detail)) return s;
      const league = a.detail.kind === 'season' ? a.detail.league : a.detail.kind === 'player' || a.detail.kind === 'team' ? (a.detail.id.slice(0, 3) as LeagueId) : s.league;
      const stack = a.replace ? [...s.stack.slice(0, -1), a.detail] : [...s.stack, a.detail].slice(-20);
      return { ...s, league, stack };
    }
    case 'back':
      return s.stack.length ? { ...s, stack: s.stack.slice(0, -1) } : s;
  }
}
