/**
 * Runtime validation at persistence boundaries (writes, reads, import/export,
 * and incoming career events). Every table row is checked against these.
 */
import { z } from 'zod';
import { ACTIONS_PER_WEEK, SEASON_WEEKS } from '../career/config';
import { TRANSACTION_TYPES, type TransactionType } from '../core/types';

const isoTime = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Expected ISO-8601 time');
const id = z.string().min(1);
const int = z.number().int();
const nonNeg = int.nonnegative();

export const PlayerProfileSchema = z.object({
  id,
  displayName: z.string().min(1),
  createdAtReal: isoTime,
  careerClock: isoTime,
  ledgerSeq: nonNeg,
});

export const EconomyTransactionSchema = z.object({
  id,
  ownerId: id,
  amount: int.refine((n) => n !== 0, 'Zero-amount transaction'),
  type: z.enum(TRANSACTION_TYPES as [TransactionType, ...TransactionType[]]),
  sourceId: id,
  timestamp: isoTime,
  balanceAfter: nonNeg,
  seq: int.positive(),
  idempotencyKey: id,
});

export const BalanceSnapshotSchema = z.object({
  ownerId: id,
  balance: nonNeg,
  lastTransactionId: id,
  seq: nonNeg,
});

export const PropertySchema = z.object({
  id,
  ownerId: id,
  propertyDefinitionId: id,
  unlockedAt: isoTime,
  layoutVersion: nonNeg,
});

export const FurnitureInstanceSchema = z
  .object({
    id,
    ownerId: id,
    catalogItemId: id,
    purchasedAt: isoTime,
    purchaseTransactionId: id,
    propertyId: id.optional(),
    placementZoneId: id.optional(),
  })
  .refine((f) => (f.propertyId === undefined) === (f.placementZoneId === undefined), {
    message: 'propertyId and placementZoneId must be set together',
  });

export const TrophyInstanceSchema = z.object({
  id,
  ownerId: id,
  trophyDefinitionId: z.enum(['amateur_win', 'state_amateur', 'pro_series_win', 'qschool_card', 'epson_win', 'lpga_win', 'major_win', 'albatross_first', 'albatross_five']),
  sourceTournamentId: id,
  sourceCareerEventId: id,
  eventName: z.string().min(1),
  tourName: z.string().min(1),
  courseName: z.string().min(1),
  earnedAt: isoTime,
  finish: z.object({
    position: int.positive(),
    posLabel: z.string().min(1),
    toPar: int,
    total: nonNeg,
    rounds: z.array(nonNeg),
    fieldSize: int.positive(),
  }),
  prize: nonNeg,
  runnerUp: z.string().nullable(),
  metadata: z.looseObject({ milestone: z.string() }),
});

export const TrophyPlacementSchema = z.object({
  trophyInstanceId: id,
  furnitureInstanceId: id,
  slotIndex: nonNeg,
});

const TourIdSchema = z.enum(['amateur', 'mini', 'qschool', 'epson', 'lpga']);
const EntrantSchema = z.object({ id, name: z.string().min(1), rating: z.number() });

export const TournamentDefSchema = z.object({
  id,
  tour: TourIdSchema,
  name: z.string().min(1),
  season: int.positive(),
  week: int.positive(),
  rounds: int.positive(),
  fieldSize: int.positive(),
  ratingShift: int,
  purse: nonNeg,
  entryFee: nonNeg,
  travelCost: nonNeg,
  cut: z.object({ afterRound: int.positive(), top: int.positive() }).nullable(),
  paidPlaces: nonNeg,
  prizeMoney: z.boolean(),
  special: z.boolean(),
  qStage: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable(),
  courseId: id,
});

export const StandingSchema = z.object({
  id,
  name: z.string().min(1),
  rounds: z.array(nonNeg),
  total: nonNeg,
  toPar: int,
  position: int.positive(),
  posLabel: z.string().min(1),
  madeCut: z.boolean(),
  prize: nonNeg,
  points: nonNeg,
  playoff: z.literal(true).optional(),
});

export const TournamentResultSchema = z.object({
  tournamentId: id,
  courseId: id.optional(),
  status: z.literal('completed'),
  def: TournamentDefSchema,
  playerId: id,
  entrants: z.array(EntrantSchema).min(2),
  scores: z.record(z.string(), z.array(z.array(int.min(1).max(15)))),
  pars: z.array(int.min(3).max(6)),
  standings: z.array(StandingSchema),
  finalizedAt: isoTime,
  authority: z.object({ source: z.literal('tournament_engine'), engineVersion: z.string().min(1), checksum: z.string().length(16) }),
});

export const TournamentRecordSchema = TournamentResultSchema.extend({ id, recordedFromCareerEventId: id });

export const CareerEventSchema = z.object({
  id,
  eventType: z.literal('tournament_completed'),
  golferId: id,
  tournamentId: id,
  occurredAt: isoTime,
  payload: TournamentResultSchema,
  schemaVersion: z.literal(1),
});

export const ProcessedCareerEventSchema = z.object({
  eventId: id,
  outcome: z.enum(['applied', 'rejected']),
  reason: z.string().optional(),
  processedAtReal: isoTime,
  payoutTransactionId: id.optional(),
  awardedTrophyIds: z.array(id),
});

const statValue = z.number().min(1).max(100);

/** Career RPG state. Core fields are checked; the rest passes through. */
export const CareerStateSchema = z.looseObject({
  id: z.literal('career'),
  playerId: id,
  season: int.positive(),
  week: int.min(1).max(SEASON_WEEKS),
  age: int.positive(),
  status: z.enum(['amateur', 'pro']),
  tourCard: z.enum(['none', 'epson', 'lpga']),
  stats: z.object({ power: statValue, accuracy: statValue, shortGame: statValue, putting: statValue, nerve: statValue, fitness: statValue }),
  skillPoints: nonNeg,
  energy: z.number().min(0).max(100),
  form: z.number().min(-10).max(10),
  fame: z.number().min(0).max(100),
  relationships: z.record(z.string(), z.number().min(0).max(100)),
  equipment: z.record(z.string(), id),
  owned: z.array(id),
  pools: z.record(TourIdSchema, z.array(z.object({ id, name: z.string().min(1), rating: z.number(), tour: TourIdSchema }))),
  achievements: z.record(z.string(), isoTime),
  actionsUsed: int.min(0).max(ACTIONS_PER_WEEK),
  entered: z.array(id),
  totals: z.looseObject({ events: nonNeg, wins: nonNeg, earnings: nonNeg }),
});

/** A verified albatross (see src/records/albatross.ts). */
export const AlbatrossRecordSchema = z
  .object({
    id: z.string().regex(/^alb:.+:r\d+:h\d+$/, 'Albatross id must be alb:<tournament>:<golfer>:r<round>:h<hole>'),
    golferId: id,
    golferName: z.string().min(1),
    isPlayer: z.boolean(),
    tournamentId: id,
    tournamentName: z.string().min(1),
    tour: TourIdSchema,
    tourName: z.string().min(1),
    major: z.boolean(),
    season: int.positive(),
    week: int.min(1).max(SEASON_WEEKS),
    gameDate: isoTime,
    courseId: id,
    courseName: z.string().min(1),
    round: int.positive(),
    holeNumber: int.positive(),
    holeName: z.string().min(1),
    par: int.min(4).max(6),
    yards: int.positive(),
    strokes: int.positive(),
    shot: z.string().max(120).optional(),
    source: z.enum(['live', 'backfill']),
    sourceCareerEventId: id,
    recordedAtReal: isoTime,
  })
  .refine((r) => r.strokes - r.par === -3, { message: 'An albatross is exactly three under par' });

/** Table name → row schema. Used for writes, load validation and import. */
export const TABLE_SCHEMAS = {
  profiles: PlayerProfileSchema,
  ledger: EconomyTransactionSchema,
  balances: BalanceSnapshotSchema,
  properties: PropertySchema,
  furniture: FurnitureInstanceSchema,
  trophies: TrophyInstanceSchema,
  trophyPlacements: TrophyPlacementSchema,
  careers: CareerStateSchema,
  tournaments: TournamentRecordSchema,
  careerEvents: CareerEventSchema,
  processedEvents: ProcessedCareerEventSchema,
  albatrosses: AlbatrossRecordSchema,
} as const;

export type TableName = keyof typeof TABLE_SCHEMAS;

export function validateRow<T extends TableName>(table: T, row: unknown): z.infer<(typeof TABLE_SCHEMAS)[T]> {
  return TABLE_SCHEMAS[table].parse(row) as z.infer<(typeof TABLE_SCHEMAS)[T]>;
}
