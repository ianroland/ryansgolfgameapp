/**
 * Career Legacy V1 awards. Extends existing systems only:
 *   - evaluation: careerStats() over checksum-sealed, verified tournament records;
 *   - storage: the career's existing achievements map (ids `legacy_*`);
 *   - Pink Jackets: the existing per-tournament `major_win` trophies for
 *     The Desert Rose Invitational (one trophy per championship, idempotent id).
 *
 * Live: a `tournament_completed` subscriber on the authoritative pipeline, so a
 * milestone is only ever earned from a validated, recorded result, inside the
 * pipeline's transaction, and never from a preview or an uncommitted round.
 * Existing saves: `reconcile()` recognizes milestones already earned in the
 * verified history, exactly once, with their original chronology.
 */
import { careerStats } from '../career/careerStats';
import { DESERT_ROSE, desertRoseSeason } from '../career/championships';
import { gameDate, PLAYER_ID } from '../career/config';
import { evaluateLegacy, legacyMilestone, pinkJackets, type LegacyEarned } from '../career/legacy';
import type { CareerState } from '../career/types';
import { isPinkJacket, trophyInstanceId } from '../catalog/trophies';
import type { AppDB } from '../persistence/db';
import type { TournamentRecord } from '../persistence/records';
import { isVerifiedRecord } from '../records/albatross';
import type { GameNotification } from './notifier';
import type { TournamentPipeline } from './tournamentPipeline';

type Note = Omit<GameNotification, 'id'>;

/** Verified records for the golfer, oldest first. */
export async function verifiedHistory(db: AppDB, golferId: string): Promise<TournamentRecord[]> {
  const rows = await db.tournaments.toArray();
  return rows.filter((r) => r.playerId === golferId && isVerifiedRecord(r)).sort((a, b) => a.def.season - b.def.season || a.def.week - b.def.week);
}

/** Tournament ids of the golfer's Pink Jackets (Desert Rose trophies stamped at award: top tour, phase 3). */
export async function jacketIds(db: AppDB, golferId: string): Promise<Set<string>> {
  const rows = await db.trophies.where('ownerId').equals(golferId).toArray();
  return new Set(rows.filter(isPinkJacket).map((t) => t.sourceTournamentId));
}

/** Milestones the verified history proves that the career doesn't hold yet. */
export function missingMilestones(career: CareerState, records: TournamentRecord[], jackets: ReadonlySet<string>): LegacyEarned[] {
  const stats = careerStats(records, career.playerId);
  return evaluateLegacy(stats.history, career.seasonLog ?? [], career.fame, jackets).filter((e) => !career.achievements[e.id]);
}

/** Records the milestones on the career, each with its original game date (Legend: today's game date). */
function grant(career: CareerState, earned: LegacyEarned[]): CareerState {
  const achievements = { ...career.achievements };
  for (const e of earned) achievements[e.id] = e.at || gameDate(career.season, career.week);
  return { ...career, achievements };
}

export function registerLegacyAwards(pipeline: TournamentPipeline): () => void {
  return pipeline.subscribe('tournament_completed', async ({ db, result, golferId }) => {
    const career = await db.careers.get('career');
    if (!career || career.playerId !== golferId) return {};
    const records = await verifiedHistory(db, golferId);
    const jackets = await jacketIds(db, golferId);
    const notifications: Note[] = [];
    let ceremony = false;

    // The Pink Jacket ceremony: this result's trophy is a Pink Jacket (Desert Rose, top tour, phase 3).
    const season = desertRoseSeason(result.tournamentId);
    if (season !== null && jackets.has(result.tournamentId)) {
      const won = pinkJackets(careerStats(records, golferId).history, jackets);
      const n = won.findIndex((j) => j.tournamentId === result.tournamentId) + 1;
      const me = result.standings.find((s) => s.id === golferId)!;
      const runner = result.standings.find((s) => s.id !== golferId && s.madeCut && s.position > me.position);
      if (n > 0) {
        ceremony = true;
        notifications.push({
          kind: 'legacy',
          title: `${DESERT_ROSE.award} #${n}`,
          body: `${DESERT_ROSE.name} · Season ${season}`,
          refId: trophyInstanceId(golferId, result.tournamentId),
          legacy: { kind: 'jacket', id: trophyInstanceId(golferId, result.tournamentId), title: DESERT_ROSE.award, full: true, season, eventName: DESERT_ROSE.name, venue: DESERT_ROSE.venue, jacketNumber: n, toPar: me.toPar, rounds: me.rounds, runnerUp: runner ? `${runner.name} (${runner.posLabel})` : null },
        });
      }
    }

    const earned = missingMilestones(career, records, jackets);
    if (!earned.length) return { notifications };
    await db.careers.put(grant(career, earned));
    for (const e of earned) {
      const def = legacyMilestone(e.id)!;
      notifications.push({
        kind: 'legacy',
        title: `Milestone: ${def.name}`,
        body: e.eventName ? `${e.eventName} · Season ${e.season}` : e.marker ?? def.description,
        refId: e.id,
        // The Pink Jacket ceremony is the first jacket's celebration; its milestone joins the timeline with a toast.
        legacy: { kind: 'milestone', id: e.id, title: def.name, full: def.celebrate === 'full' && !(e.id === 'legacy_first_pink_jacket' && ceremony), season: e.season, eventName: e.eventName },
      });
    }
    return { notifications };
  });
}

export class LegacyService {
  constructor(private readonly db: AppDB) {}

  /**
   * Recognizes milestones already earned in the verified history (older saves,
   * imports, season-end and fame milestones), exactly once and with their
   * original chronology. Never celebrates; returns the ids it recorded.
   */
  async reconcile(golferId: string = PLAYER_ID): Promise<string[]> {
    const db = this.db;
    return db.transaction('rw', [db.careers, db.tournaments, db.trophies], async () => {
      const career = await db.careers.get('career');
      if (!career || career.playerId !== golferId) return [];
      const earned = missingMilestones(career, await verifiedHistory(db, golferId), await jacketIds(db, golferId));
      if (earned.length) await db.careers.put(grant(career, earned));
      return earned.map((e) => e.id);
    });
  }
}
