/**
 * The casino's RPG dialogue panel: portrait, name, relationship tier, typed line. Every table
 * dealer (and later the cocktail servers) speaks through it, so the tables themselves carry no
 * full-body dealer sprite: the table art is the focus and the dealer lives in this panel.
 *
 * The panel can be collapsed to a one-line strip (remembered in this browser, for every table).
 * Casino-specific border colours come from the current casino. Presentation only: what a dealer
 * says and when is decided by the game, and relationships live in the NPC service.
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { NpcId } from '../../npc/types';
import { TierChip } from './Tipping';
import { useCasinoLocation } from './casinoLocation';

/** Table presentation switch: full-body dealers behind the tables are off (story scenes still use them). */
export const SHOW_TABLE_DEALER_SPRITES = false;

const COLLAPSE_KEY = 'wtg.casino.dialogueCollapsed';
const listeners = new Set<(v: boolean) => void>();
function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Shared collapsed state: collapsing one table's panel collapses them all (a viewer preference, not save data). */
export function useDialogueCollapsed(): [boolean, (v: boolean) => void] {
  const [collapsed, setLocal] = useState(readCollapsed);
  useEffect(() => {
    listeners.add(setLocal);
    return () => void listeners.delete(setLocal);
  }, []);
  const set = useCallback((v: boolean) => {
    try {
      localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0');
    } catch {
      /* storage unavailable: lasts this session */
    }
    listeners.forEach((l) => l(v));
  }, []);
  return [collapsed, set];
}

export interface DealerPanelProps {
  name: string;
  /** NPC whose relationship tier is shown (omit for Ryan). */
  npcId?: NpcId;
  /** The portrait element (existing portrait/expression art). */
  portrait: ReactNode;
  /** The full typed line (for the collapsed strip). */
  text: string;
  /** The typed-out text as shown in the open panel. */
  children: ReactNode;
  draft?: boolean;
  /** Extra controls in the name row (e.g. the chat level toggle). */
  extra?: ReactNode;
  /** Action buttons (e.g. Continue); shown open and collapsed. */
  actions?: ReactNode;
  className?: string;
  testId?: string;
  role?: 'dialog';
  onClick?: () => void;
  speaker?: string;
}

export function DealerDialoguePanel({ name, npcId, portrait, text, children, draft, extra, actions, className, testId, role, onClick, speaker }: DealerPanelProps) {
  const [collapsed, setCollapsed] = useDialogueCollapsed();
  const loc = useCasinoLocation();
  const toggle = (
    <button
      type="button"
      className="dlg-toggle"
      onClick={(e) => {
        e.stopPropagation();
        setCollapsed(!collapsed);
      }}
      aria-expanded={!collapsed}
      aria-label={collapsed ? `Show ${name}'s dialogue` : `Collapse ${name}'s dialogue`}
      title={collapsed ? 'Show dialogue' : 'Collapse dialogue'}
      data-testid="dlg-toggle"
    >
      {collapsed ? '▸' : '▾'}
    </button>
  );
  return (
    <div
      className={`rpg-box dealer-panel loc-${loc} ${collapsed ? 'collapsed' : ''} ${className ?? ''}`}
      aria-live="polite"
      role={role}
      data-testid={testId}
      data-who={speaker}
      data-collapsed={collapsed ? 'yes' : 'no'}
      onClick={onClick}
    >
      <span className="dlg-portrait" data-dealer-portrait>{portrait}</span>
      <div className="rpg-body">
        <p className="rpg-name">
          {name}
          {npcId && <TierChip npcId={npcId} />}
          {draft && <span className="rpg-draft" title="Dialogue awaiting Script Room approval">Draft line</span>}
          {extra}
        </p>
        {collapsed ? <p className="rpg-text dlg-oneline" title={text}>{text}</p> : children}
      </div>
      <div className="dlg-side">
        {toggle}
        {actions}
      </div>
    </div>
  );
}
