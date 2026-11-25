/**
 * The Legacy tab: Career Legacy (overview), Stats and Records under one tab (owner, 2026-11-24:
 * "combine those ... to clean nav a bit"). Each section is its own panel, unchanged.
 */
import { StatsPanel } from '../career/StatsPanel';
import { RecordsPanel } from '../records/RecordsPanel';
import { LegacyPanel } from './LegacyPanel';

export type LegacySection = 'overview' | 'stats' | 'records';

const SECTIONS: { id: LegacySection; label: string }[] = [
  { id: 'overview', label: 'Legacy' },
  { id: 'stats', label: 'Stats' },
  { id: 'records', label: 'Records' },
];

export function LegacyHub({ section, onSection, onOpenTrophies }: { section: LegacySection; onSection: (s: LegacySection) => void; onOpenTrophies: () => void }) {
  return (
    <div className="legacy-hub">
      <nav className="subtabs legacy-subtabs" aria-label="Legacy sections">
        {SECTIONS.map((s) => (
          <button key={s.id} className={section === s.id ? 'on' : ''} aria-current={section === s.id ? 'page' : undefined} onClick={() => onSection(s.id)} data-testid={`legacy-section-${s.id}`}>
            {s.label}
          </button>
        ))}
      </nav>
      {section === 'overview' && <LegacyPanel onOpenTrophies={onOpenTrophies} />}
      {section === 'stats' && <StatsPanel />}
      {section === 'records' && <RecordsPanel />}
    </div>
  );
}
