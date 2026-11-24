/**
 * The living sports universe for this save (Phase D part 3). Runs each completed season's
 * off-season exactly once and stores it (the `sportsYears` table), and gives the chain this
 * save's stored years on load so decades are never rebuilt.
 *
 * Transition rules:
 * - A season's off-season runs only once the career has moved past that season (every game of
 *   it is final), after every ticket that can settle has settled (existing rules).
 * - If a ticket on that season is still open, the transition stops and says why: nothing is
 *   graded, voided or replaced. (Each season keeps its own rosters, so a transition never changes
 *   a game a ticket depends on; this guard only matters if a ticket can't be graded at all.)
 * - The year's row and the career's `sportsYearDone` are written in one transaction; a repeat,
 *   a reload or a second tab finds the year done and does nothing.
 */
import { inbox } from '../career/engine';
import { sportsWorldOf, ticketsOf } from '../career/sportsbook';
import type { CareerState } from '../career/types';
import type { AppDB, SportsYearRecord } from '../persistence/db';
import { seasonOf } from '../sports/book';
import { LEAGUES, teamById } from '../sports/demo';
import { chainKey, forgetChain, processSeason, registerState, yearOfSeason, type EvolveRef } from '../sports/universe/chain';
import type { UState } from '../sports/universe/model';
import type { YearLines, YearSummary } from '../sports/universe/offseason';
import type { Notifier } from './notifier';
import type { SportsbookService } from './sportsbookService';

/** Rows that keep the next season's full state (older rows keep summary and lines only). */
export const STATE_ROWS = 3;

export const evolveRefOf = (c: Pick<CareerState, 'flags' | 'playerId'>): EvolveRef | null => {
  const ref = sportsWorldOf(c);
  return typeof ref === 'number' || ref.evolveFrom === undefined ? null : (ref as EvolveRef);
};
/** The last sports year whose off-season is stored (before any: the year before the base season). */
export const yearDoneOf = (c: Pick<CareerState, 'flags'>, ref: EvolveRef) =>
  typeof c.flags.sportsYearDone === 'number' ? c.flags.sportsYearDone : yearOfSeason(ref.evolveFrom - 1) - 1;

export interface ProcessResult { years: number[]; blocked?: string }

export class SportsUniverseService {
  private primed: string | null = null;
  constructor(
    private readonly db: AppDB,
    private readonly sportsbook: SportsbookService,
    private readonly notifier: Notifier,
  ) {}

  /** Hands this save's stored states to the chain. Call on load and after an import. */
  async prime(): Promise<void> {
    const c = await this.db.careers.get('career');
    const ref = c && evolveRefOf(c);
    if (!ref) { this.primed = null; return; }
    const rows = (await this.db.sportsYears.toArray()).filter((r) => r.chain === chainKey(ref)).sort((a, b) => a.year - b.year);
    forgetChain(ref);
    for (const r of rows) if (r.state) registerState(ref, r.season + 1, JSON.parse(r.state) as UState);
    this.primed = chainKey(ref);
  }

  /** Runs every off-season that is due. Safe to call any time, any number of times. */
  async processDue(): Promise<ProcessResult> {
    const first = await this.db.careers.get('career');
    const ref = first && evolveRefOf(first);
    if (!ref) return { years: [] };
    if (this.primed !== chainKey(ref)) await this.prime();
    await this.sportsbook.settleDue();
    const years: number[] = [];
    for (let guard = 0; guard < 200; guard++) {
      const c = (await this.db.careers.get('career'))!;
      const year = yearDoneOf(c, ref) + 1;
      const season = year - 2026;
      if (season >= c.season) break; // not complete yet
      const open = ticketsOf(c).filter((t) => t.status === 'open' && t.legs.some((l) => l.season === season));
      if (open.length) return { years, blocked: `${open.length} open ticket(s) on season ${season} could not be graded; the ${year} off-season waits for them.` };
      const out = processSeason(ref, season, (s) => seasonOf(ref, s));
      const wrote = await this.db.transaction('rw', [this.db.careers, this.db.sportsYears], async () => {
        const cur = (await this.db.careers.get('career'))!;
        if (yearDoneOf(cur, ref) >= year) return false;
        const row: SportsYearRecord = {
          id: `sy:${year}`, year, season, chain: chainKey(ref), phase: 'complete', steps: out.summary.steps, at: `${cur.season}.${cur.week}`,
          summary: JSON.stringify(out.summary), lines: JSON.stringify(out.lines), state: JSON.stringify(out.next),
        };
        await this.db.sportsYears.put(row);
        for (const old of await this.db.sportsYears.where('year').below(year - STATE_ROWS + 1).toArray()) {
          if (old.state !== null) await this.db.sportsYears.put({ ...old, state: null });
        }
        const next: CareerState = { ...cur, flags: { ...cur.flags, sportsYearDone: year }, inbox: [...cur.inbox] };
        inbox(next, `Sports ${year}: the year in review`, reviewLine(out.summary));
        await this.db.careers.put(next);
        return true;
      });
      if (wrote) years.push(year);
    }
    if (years.length) this.notifier.emit({ kind: 'info', title: `Sports ${years.at(-1)}: champions crowned`, body: 'The year in review is in your Inbox.', refId: `sy:${years.at(-1)}` });
    return { years };
  }

  /** This save's completed sports years, oldest first. */
  async years(): Promise<YearSummary[]> {
    const c = await this.db.careers.get('career');
    const ref = c && evolveRefOf(c);
    if (!ref) return [];
    return (await this.db.sportsYears.toArray()).filter((r) => r.chain === chainKey(ref)).sort((a, b) => a.year - b.year).map((r) => JSON.parse(r.summary) as YearSummary);
  }

  /**
   * Everything the History Board needs from this save, read-only: the stored years (summaries
   * and player lines) and the newest stored state.
   */
  async historyInput(): Promise<{ rows: { year: number; summary: YearSummary; lines: YearLines }[]; state: UState | null }> {
    const c = await this.db.careers.get('career');
    const ref = c && evolveRefOf(c);
    if (!ref) return { rows: [], state: null };
    const rows = (await this.db.sportsYears.toArray()).filter((r) => r.chain === chainKey(ref)).sort((a, b) => a.year - b.year);
    const latest = [...rows].reverse().find((r) => r.state);
    return {
      rows: rows.map((r) => ({ year: r.year, summary: JSON.parse(r.summary) as YearSummary, lines: JSON.parse(r.lines) as YearLines })),
      state: latest?.state ? (JSON.parse(latest.state) as UState) : null,
    };
  }

  /** Player lines for one stored year. */
  async lines(year: number): Promise<YearLines | null> {
    const r = await this.db.sportsYears.get(`sy:${year}`);
    return r ? (JSON.parse(r.lines) as YearLines) : null;
  }
}

function reviewLine(s: YearSummary): string {
  const champs = LEAGUES.map((l) => `${l.short} ${teamById(s.leagues[l.id].champion).name}`).join(', ');
  const retired = s.retired.length;
  const drafted = s.draft.length;
  const hof = s.hallOfFame.length ? ` Hall of Fame class of ${s.year + 1}: ${s.hallOfFame.map((h) => h.n).join(', ')}.` : '';
  return `Champions: ${champs}. ${retired} retirement${retired === 1 ? '' : 's'}, ${drafted} rookies drafted.${hof}`;
}
