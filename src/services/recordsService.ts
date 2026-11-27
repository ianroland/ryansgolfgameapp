/**
 * The record book: verified albatrosses, and the clubhouse trophies they earn.
 *
 * Every albatross record is derived from a stored, sealed tournament result,
 * so the `albatrosses` table can always be rebuilt from the `tournaments`
 * table. Two ways in, both idempotent (stable record IDs):
 *   - live: a pipeline subscriber records each finished tournament's albatrosses
 *     inside the pipeline's transaction;
 *   - reconcile: on load and after an import, any albatross in a verified
 *     stored result that has no record yet is added (`source: 'backfill'`), and any
 *     record no verified result supports is removed. Nothing is ever invented
 *     for results that don't have trustworthy hole scores.
 */
import { ladderAt } from '../career/ladder';
import { ALBATROSS_TROPHIES, milestoneTrophyId, trophyLook } from '../catalog/trophies';
import { PLAYER_ID } from '../core/ids';
import type { TrophyInstance } from '../core/types';
import type { AppDB } from '../persistence/db';
import type { TournamentRecord } from '../persistence/records';
import {
  compareChronological,
  detectAlbatrosses,
  isVerifiedRecord,
  milestoneLabel,
  momentOf,
  roundsPlayed,
  scoreLine,
  type AlbatrossRecord,
} from '../records/albatross';
import type { GameNotification } from './notifier';
import type { TournamentPipeline } from './tournamentPipeline';

export interface RecordBook {
  albatrosses: AlbatrossRecord[];
  /** Tracked rounds per golfer (rounds in events on file). */
  rounds: Record<string, number>;
  season: number;
  /** Results whose hole scores could be checked (the rest are skipped, not guessed). */
  verifiedEvents: number;
  storedEvents: number;
}

export interface ReconcileReport {
  added: number;
  removed: number;
  skippedRecords: number;
  trophies: string[];
}

/** Milestone trophies Ryan has earned but doesn't hold yet. Runs inside a transaction. */
async function awardMilestoneTrophies(db: AppDB, ownerId: string): Promise<TrophyInstance[]> {
  const mine = (await db.albatrosses.where('golferId').equals(ownerId).toArray()).sort(compareChronological);
  const out: TrophyInstance[] = [];
  for (const { count, defId } of ALBATROSS_TROPHIES) {
    if (mine.length < count) continue;
    const id = milestoneTrophyId(ownerId, defId);
    if (await db.trophies.get(id)) continue;
    const rec = mine[count - 1];
    const tournament = await db.tournaments.get(rec.tournamentId);
    const me = tournament?.standings.find((s) => s.id === ownerId);
    if (!tournament || !me) continue; // never award without the source result
    const trophy: TrophyInstance = {
      id,
      ownerId,
      trophyDefinitionId: defId,
      sourceTournamentId: rec.tournamentId,
      sourceCareerEventId: tournament.recordedFromCareerEventId,
      eventName: rec.tournamentName,
      tourName: rec.tourName,
      courseName: rec.courseName,
      earnedAt: rec.gameDate,
      finish: {
        position: me.position,
        posLabel: me.posLabel,
        toPar: me.toPar,
        total: me.total,
        rounds: me.rounds,
        fieldSize: tournament.standings.length,
      },
      prize: me.prize,
      runnerUp: null,
      metadata: {
        milestone: `${milestoneLabel(count) ?? `Albatross #${count}`}: ${scoreLine(rec)} on hole ${rec.holeNumber} (${rec.holeName}, ${rec.yards} yds), round ${rec.round}.`,
        season: rec.season,
        week: rec.week,
        albatrossId: rec.id,
        engineVersion: tournament.authority.engineVersion,
      },
    };
    await db.trophies.add(trophy);
    out.push(trophy);
  }
  return out;
}

function trophyNote(t: TrophyInstance): Omit<GameNotification, 'id'> {
  return { kind: 'trophy', title: `Trophy earned: ${trophyLook(t).name}`, body: `${t.eventName} · ${t.courseName}`, refId: t.id };
}

export function registerAlbatrossRecords(pipeline: TournamentPipeline): () => void {
  return pipeline.subscribe('tournament_completed', async ({ db, event, result, golferId }) => {
    const career = await db.careers.get('career');
    const notes = career?.shotNotes ?? {};
    const ladder = career ? ladderAt(career, result.def.season, result.def.week) : 'pga';
    const found = detectAlbatrosses(result, { source: 'live', sourceCareerEventId: event.id, recordedAtReal: new Date().toISOString(), shotNotes: notes, ladder });
    const notifications: Omit<GameNotification, 'id'>[] = [];
    let mine = await db.albatrosses.where('golferId').equals(golferId).count();
    for (const rec of found) {
      if (await db.albatrosses.get(rec.id)) continue; // already on file
      await db.albatrosses.add(rec);
      if (rec.isPlayer) mine += 1;
      notifications.push(
        rec.isPlayer
          ? { kind: 'albatross', title: 'ALBATROSS!', body: `${scoreLine(rec)} · Hole ${rec.holeNumber}, ${rec.courseName}`, refId: rec.id, moment: momentOf(rec, mine) }
          : { kind: 'info', title: `Albatross: ${rec.golferName}`, body: `${scoreLine(rec)} on ${rec.holeNumber} at ${rec.courseName}` },
      );
    }
    // Shot notes are only kept until their hole is on file.
    if (career?.shotNotes && found.some((f) => notes[f.id])) {
      const left = Object.fromEntries(Object.entries(career.shotNotes).filter(([k]) => !k.startsWith(`alb:${result.tournamentId}:`)));
      await db.careers.put({ ...career, shotNotes: left });
    }
    const trophies = await awardMilestoneTrophies(db, golferId);
    return { awardedTrophyIds: trophies.map((t) => t.id), notifications: [...notifications, ...trophies.map(trophyNote)] };
  });
}

export class RecordsService {
  constructor(private readonly db: AppDB) {}

  /**
   * Makes the albatross table match the verified stored results. Safe to run
   * any number of times. Also squares Ryan's career totals with his records.
   */
  async reconcile(ownerId: string = PLAYER_ID): Promise<ReconcileReport> {
    const db = this.db;
    return db.transaction('rw', [db.albatrosses, db.tournaments, db.trophies, db.careers], async () => {
      const records = await db.tournaments.toArray();
      const career = await db.careers.get('career');
      const verified = records.filter((r) => isVerifiedRecord(r));
      const now = new Date().toISOString();
      const derived = new Map<string, AlbatrossRecord>();
      for (const r of verified) {
        for (const a of detectAlbatrosses(r, { source: 'backfill', sourceCareerEventId: r.recordedFromCareerEventId, recordedAtReal: now, ladder: career ? ladderAt(career, r.def.season, r.def.week) : 'pga' })) derived.set(a.id, a);
      }
      const existing = await db.albatrosses.toArray();
      const have = new Set(existing.map((a) => a.id));
      let removed = 0;
      for (const a of existing) {
        if (!derived.has(a.id)) {
          await db.albatrosses.delete(a.id);
          removed++;
        }
      }
      let added = 0;
      for (const [id, a] of derived) {
        if (!have.has(id)) {
          await db.albatrosses.add(a);
          added++;
        }
      }
      // Older saves counted an albatross as an eagle and kept no albatross total.
      // (career loaded above)
      if (career && career.playerId === ownerId) {
        const mine = [...derived.values()].filter((a) => a.golferId === ownerId);
        const t = career.totals;
        if (t.albatrosses !== mine.length) {
          // Before v0.10 a non-ace albatross was added to eagles: take those back out once.
          const overcount = t.albatrosses === undefined ? mine.filter((a) => a.strokes > 1).length : 0;
          await db.careers.put({ ...career, totals: { ...t, albatrosses: mine.length, eagles: Math.max(0, t.eagles - overcount) } });
        }
      }
      const trophies = await awardMilestoneTrophies(db, ownerId);
      return { added, removed, skippedRecords: records.length - verified.length, trophies: trophies.map((t) => t.id) };
    });
  }

  async recordBook(): Promise<RecordBook> {
    const [albatrosses, records, career] = await Promise.all([this.db.albatrosses.toArray(), this.db.tournaments.toArray(), this.db.careers.get('career')]);
    return {
      albatrosses: albatrosses.sort(compareChronological),
      rounds: roundsPlayed(records as TournamentRecord[]),
      season: career?.season ?? 1,
      verifiedEvents: records.filter((r) => isVerifiedRecord(r)).length,
      storedEvents: records.length,
    };
  }
}
