/**
 * Authoritative tournament pipeline.
 *
 * When a tournament is finalized, `process()` runs, inside ONE IndexedDB
 * read-write transaction:
 *   1. Validate the result (checksum-sealed; standings, cut and prizes are
 *      re-derived from hole-by-hole scores and the official schedule).
 *   2. Pay prize money through the economy service.
 *   3. Record the tournament and the career event.
 *   4. Apply career consequences (fame, skill points, money lists, Q-School,
 *      sponsor bonus, achievements) to the career state.
 *   5. Run subscribers (trophy awards).
 *   6. Persist the processing record (idempotency).
 * After the transaction commits:
 *   7. Notify the player.
 *
 * Reprocessing the same event (or another event for an already-recorded
 * tournament) never pays out, applies or awards twice.
 */
import { achievementById } from '../career/achievements';
import { applyTournamentResult } from '../career/engine';
import { validateResult, type TournamentResult } from '../career/tournament';
import type { CareerEvent, CareerEventType, GolferId, ProcessedCareerEvent } from '../core/types';
import type { AppDB } from '../persistence/db';
import { CareerEventSchema } from '../persistence/schemas';
import type { EconomyService } from './economyService';
import type { GameNotification, Notifier } from './notifier';

export interface CareerHandlerContext {
  db: AppDB;
  event: CareerEvent<TournamentResult>;
  result: TournamentResult;
  golferId: GolferId;
}

export interface CareerHandlerOutput {
  awardedTrophyIds?: string[];
  notifications?: Omit<GameNotification, 'id'>[];
}

/** Runs inside the pipeline's transaction. Throwing aborts the whole event. */
export type CareerHandler = (ctx: CareerHandlerContext) => Promise<CareerHandlerOutput>;

export type ProcessOutcome =
  | { status: 'applied'; eventId: string; payoutTransactionId?: string; prize: number; awardedTrophyIds: string[]; unlocked: string[] }
  | { status: 'duplicate'; eventId: string; previous: ProcessedCareerEvent }
  | { status: 'rejected'; eventId?: string; reason: string };

export function tournamentEventId(result: TournamentResult) {
  return `evt:tournament_completed:${result.tournamentId}:${result.playerId}`;
}

export function buildTournamentEvent(result: TournamentResult): CareerEvent<TournamentResult> {
  return {
    id: tournamentEventId(result),
    eventType: 'tournament_completed',
    golferId: result.playerId,
    tournamentId: result.tournamentId,
    occurredAt: result.finalizedAt,
    payload: result,
    schemaVersion: 1,
  };
}

export function validateTournamentEvent(raw: unknown): { ok: true; event: CareerEvent<TournamentResult> } | { ok: false; reason: string } {
  const parsed = CareerEventSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: `Malformed event: ${parsed.error.issues[0]?.message ?? 'invalid'}` };
  const event = parsed.data as CareerEvent<TournamentResult>;
  if (event.golferId !== event.payload.playerId) return { ok: false, reason: 'Event golfer does not match the result' };
  if (event.tournamentId !== event.payload.tournamentId) return { ok: false, reason: 'Event tournament does not match the result' };
  const v = validateResult(event.payload);
  if (!v.ok) return { ok: false, reason: v.reason };
  return { ok: true, event };
}

export class TournamentPipeline {
  private handlers = new Map<CareerEventType, CareerHandler[]>();

  constructor(
    private readonly db: AppDB,
    private readonly economy: EconomyService,
    private readonly notifier: Notifier,
  ) {}

  subscribe(type: CareerEventType, handler: CareerHandler): () => void {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), handler]);
    return () => this.handlers.set(type, (this.handlers.get(type) ?? []).filter((h) => h !== handler));
  }

  async process(raw: unknown): Promise<ProcessOutcome> {
    const rawId = typeof (raw as { id?: unknown })?.id === 'string' ? ((raw as { id: string }).id as string) : undefined;
    const notifications: Omit<GameNotification, 'id'>[] = [];

    const outcome = await this.db.transaction('rw', this.db.allTables, async (): Promise<ProcessOutcome> => {
      if (rawId) {
        const previous = await this.db.processedEvents.get(rawId);
        if (previous) return { status: 'duplicate', eventId: rawId, previous };
      }

      const reject = async (reason: string): Promise<ProcessOutcome> => {
        if (rawId) {
          await this.db.processedEvents.put({ eventId: rawId, outcome: 'rejected', reason, processedAtReal: new Date().toISOString(), awardedTrophyIds: [] });
        }
        return { status: 'rejected', eventId: rawId, reason };
      };

      // 1. Validate.
      const validation = validateTournamentEvent(raw);
      if (!validation.ok) return reject(validation.reason);
      const event = validation.event;
      const result = event.payload;
      const golferId = event.golferId;

      const profile = await this.db.profiles.get(golferId);
      if (!profile) return reject('Career events are only processed for golfers with a career profile');
      const career = await this.db.careers.get('career');
      if (!career || career.playerId !== golferId) return reject('No career for this golfer');
      if (await this.db.tournaments.get(result.tournamentId)) return reject(`${result.def.name} was already recorded`);
      if (!career.entered.includes(result.tournamentId)) return reject('Ryan never entered this tournament');

      if (result.finalizedAt > profile.careerClock) await this.db.profiles.update(golferId, { careerClock: result.finalizedAt });

      // 2. Prize money.
      const me = result.standings.find((s) => s.id === golferId)!;
      let payoutTransactionId: string | undefined;
      if (me.prize > 0) {
        const { transaction } = await this.economy.post({
          ownerId: golferId,
          amount: me.prize,
          type: 'prize_money',
          sourceId: result.tournamentId,
          idempotencyKey: `prize:${result.tournamentId}:${golferId}`,
        });
        payoutTransactionId = transaction.id;
        notifications.push({ kind: 'payout', title: `+$${me.prize.toLocaleString()}`, body: `${result.def.name} prize money.` });
      }

      // 3. Records.
      await this.db.careerEvents.put(event as CareerEvent);
      await this.db.tournaments.put({ ...result, id: result.tournamentId, recordedFromCareerEventId: event.id });

      // 4. Career consequences.
      const applied = applyTournamentResult(career, result);
      for (const op of applied.money) {
        await this.economy.post({ ownerId: golferId, amount: op.amount, type: op.type, sourceId: op.sourceId, idempotencyKey: op.key });
        if (op.type === 'sponsor_income') notifications.push({ kind: 'payout', title: `+$${op.amount.toLocaleString()}`, body: 'Sponsor win bonus!' });
      }
      await this.db.careers.put(applied.career);
      for (const id of applied.unlocked ?? []) notifications.push({ kind: 'info', title: `Achievement: ${achievementById(id)?.name ?? id}`, body: achievementById(id)?.description, refId: `ach:${id}` });

      // 5. Subscribers evaluate and award.
      const awardedTrophyIds: string[] = [];
      for (const handler of this.handlers.get(event.eventType) ?? []) {
        const out = await handler({ db: this.db, event, result, golferId });
        awardedTrophyIds.push(...(out.awardedTrophyIds ?? []));
        notifications.push(...(out.notifications ?? []));
      }

      // 6. Processing record.
      await this.db.processedEvents.put({ eventId: event.id, outcome: 'applied', processedAtReal: new Date().toISOString(), payoutTransactionId, awardedTrophyIds });
      return { status: 'applied', eventId: event.id, payoutTransactionId, prize: me.prize, awardedTrophyIds, unlocked: applied.unlocked ?? [] };
    });

    // 7. Notify only after a successful commit.
    if (outcome.status === 'applied') for (const n of notifications) this.notifier.emit(n);
    return outcome;
  }
}
