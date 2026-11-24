import { createContext, useContext, type ReactNode } from 'react';
import { leagueById, teamById, type LeagueId } from '../../sports/demo';
import type { Board } from '../../sports/archive/board';
import type { Provenance } from '../../sports/archive/shared';
import type { Detail, NavAction, NavState } from './nav';

export interface HbCtx { board: Board; nav: NavState; go: (a: NavAction) => void }
export const Hb = createContext<HbCtx | null>(null);
export const useHb = () => useContext(Hb)!;

const PROV: Record<Provenance | 'mixed', [string, string]> = {
  canon: ['Ledger', 'Historical proposed canon (1972-2025)'],
  shared: ['2026 sim', 'Shared simulated history: the same in every save'],
  save: ['This save', "Generated in this save's own seasons (2027 on)"],
  replay: ['Rebuilt', "Rebuilt from this save's games (played before yearly off-seasons began)"],
  mixed: ['Ledger + save', 'Spans the shared history and this save'],
};
export function Prov({ p }: { p: Provenance | 'mixed' }) {
  return <span className={`hb-prov hb-prov-${p}`} title={PROV[p][1]}>{PROV[p][0]}</span>;
}

/** A franchise: colour square and name; opens the team page. */
export function Team({ id, short = false, plain = false }: { id: string; short?: boolean; plain?: boolean }) {
  const { go } = useHb();
  const t = teamById(id);
  const body = (<><i className="hb-sq" style={{ background: t.colors[0], borderColor: t.colors[1] }} aria-hidden="true" />{short ? t.short : t.displayName}</>);
  if (plain) return <span className="hb-team">{body}</span>;
  return <button type="button" className="hb-team hb-link" onClick={() => go({ type: 'open', detail: { kind: 'team', id } })} title={t.displayName}>{body}</button>;
}
export function Player({ id }: { id: string }) {
  const { board, go } = useHb();
  const p = board.player(id);
  if (!p) return <span>{board.name(id)}</span>;
  return <button type="button" className="hb-link" onClick={() => go({ type: 'open', detail: { kind: 'player', id } })}>{p.n}</button>;
}
export function SeasonLink({ league, year, children }: { league: LeagueId; year: number; children?: ReactNode }) {
  const { go } = useHb();
  return <button type="button" className="hb-link" onClick={() => go({ type: 'open', detail: { kind: 'season', league, year } })}>{children ?? year}</button>;
}
export const leagueShort = (l: LeagueId) => leagueById(l).short;

export function Panel({ title, children, className = '', aside }: { title?: ReactNode; children: ReactNode; className?: string; aside?: ReactNode }) {
  return (
    <section className={`hb-panel ${className}`}>
      {title && <h3 className="hb-h">{title}{aside && <span className="hb-h-aside">{aside}</span>}</h3>}
      {children}
    </section>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <p className="hb-empty">{children}</p>;
}

export function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div className="hb-pager" role="navigation" aria-label="Pages">
      <button type="button" disabled={page === 0} onClick={() => onPage(page - 1)}>◀ Prev</button>
      <span>Page {page + 1} of {pages}</span>
      <button type="button" disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>Next ▶</button>
    </div>
  );
}

export function LeagueSwitch({ value, onChange, all }: { value: LeagueId | 'all'; onChange: (l: LeagueId | 'all') => void; all?: boolean }) {
  const ids: (LeagueId | 'all')[] = [...(all ? ['all' as const] : []), 'gdc', 'ccl', 'igl', 'fhl'];
  return (
    <div className="hb-leagues" role="group" aria-label="League">
      {ids.map((l) => (
        <button key={l} type="button" className={value === l ? 'on' : ''} aria-pressed={value === l} onClick={() => onChange(l)} data-testid={`hb-league-${l}`}>
          {l === 'all' ? 'All leagues' : leagueById(l).short}
        </button>
      ))}
    </div>
  );
}

export const detailKey = (d: Detail) => JSON.stringify(d);
/** "the Founders Cup" but "The Crown" (the trophy's name already has its article). */
export const theTrophy = (t: string) => (/^the /i.test(t) ? t : `the ${t}`);
export const decadeOf = (y: number) => Math.floor(y / 10) * 10;
export const n0 = (v: number | undefined) => (v ?? 0).toLocaleString('en-US');
