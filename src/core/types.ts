/**
 * Core domain types for Ryan's Road to the LPGA (persistence layer).
 *
 * Runtime validation for every persisted shape lives in
 * src/persistence/schemas.ts; these interfaces are the compile-time view.
 *
 * Time conventions:
 *  - `GameTime` is an ISO-8601 string on the *in-game* career calendar.
 *  - `RealTime` is an ISO-8601 string of the wall clock (diagnostics only).
 */

export type GameTime = string;
export type RealTime = string;
export type GolferId = string;
export type PlayerId = GolferId;

/** The human player's career profile. Also a golfer. */
export interface PlayerProfile {
  id: PlayerId;
  displayName: string;
  createdAtReal: RealTime;
  /** Current in-game date/time on the career calendar. */
  careerClock: GameTime;
  /** Monotonic counter used to order ledger entries for this player. */
  ledgerSeq: number;
}

/** Any golfer the career knows about (player or opponent). */
export interface Golfer {
  id: GolferId;
  displayName: string;
  hometown?: string;
  isPlayer: boolean;
}

// ───────────────────────── Economy ─────────────────────────

export type TransactionType =
  | 'career_start_grant'
  | 'furniture_purchase'
  | 'home_purchase'
  | 'gear_purchase'
  | 'lifestyle_purchase'
  | 'entry_fee'
  | 'travel'
  | 'prize_money'
  | 'living_costs'
  | 'job_wage'
  | 'sponsor_income'
  | 'story'
  | 'casino'
  /** A tip to a casino dealer (Casino Secrets & Rivalries). Never a wager. */
  | 'tip';

export const TRANSACTION_TYPES: TransactionType[] = [
  'career_start_grant', 'furniture_purchase', 'home_purchase', 'gear_purchase', 'lifestyle_purchase', 'entry_fee',
  'travel', 'prize_money', 'living_costs', 'job_wage', 'sponsor_income', 'story', 'casino', 'tip',
];

export interface EconomyTransaction {
  id: string;
  ownerId: PlayerId;
  /** Signed whole dollars. Debits are negative. */
  amount: number;
  type: TransactionType;
  /** Catalog item ID, tournament ID, or other source reference. */
  sourceId: string;
  /** In-game timestamp. */
  timestamp: GameTime;
  balanceAfter: number;
  /** Per-player ordering. */
  seq: number;
  /** Unique per logical operation. Enforced by a unique DB index. */
  idempotencyKey: string;
}

/** Derived balance snapshot; always equals the sum of the owner's ledger. */
export interface BalanceSnapshot {
  ownerId: PlayerId;
  balance: number;
  lastTransactionId: string;
  seq: number;
}

// ───────────────────────── Property & furniture ─────────────────────────

export interface Property {
  id: string;
  ownerId: PlayerId;
  propertyDefinitionId: string;
  unlockedAt: GameTime;
  /** Incremented on every committed layout change (optimistic concurrency). */
  layoutVersion: number;
}

export interface FurnitureInstance {
  id: string;
  ownerId: PlayerId;
  catalogItemId: string;
  purchasedAt: GameTime;
  purchaseTransactionId: string;
  propertyId?: string;
  placementZoneId?: string;
}

// ───────────────────────── Trophies ─────────────────────────

export type TrophyDefinitionId =
  | 'amateur_win'
  | 'state_amateur'
  | 'pro_series_win'
  | 'qschool_card'
  | 'epson_win'
  | 'lpga_win'
  | 'major_win'
  | 'albatross_first'
  | 'albatross_five';

export interface TrophyFinish {
  position: number;
  posLabel: string;
  toPar: number;
  total: number;
  rounds: number[];
  fieldSize: number;
}

export interface TrophyInstance {
  /** Stable: `trophy:<ownerId>:<tournamentId>` — one trophy per tournament. */
  id: string;
  ownerId: GolferId;
  trophyDefinitionId: TrophyDefinitionId;
  /** The tournament the trophy came from. */
  sourceTournamentId: string;
  /** The career event that triggered the award. */
  sourceCareerEventId: string;
  eventName: string;
  tourName: string;
  courseName: string;
  /** In-game date the trophy was earned. */
  earnedAt: GameTime;
  finish: TrophyFinish;
  prize: number;
  /** Closest finisher behind (for the plaque). */
  runnerUp: string | null;
  metadata: {
    milestone: string;
    [k: string]: unknown;
  };
}

export interface TrophyPlacement {
  trophyInstanceId: string;
  furnitureInstanceId: string;
  slotIndex: number;
}

// ───────────────────────── Tournaments & career events ─────────────────────────

export type CareerEventType = 'tournament_completed';

export interface CareerEvent<P = unknown> {
  id: string;
  eventType: CareerEventType;
  golferId: GolferId;
  tournamentId: string;
  occurredAt: GameTime;
  payload: P;
  schemaVersion: 1;
}

export interface ProcessedCareerEvent {
  eventId: string;
  outcome: 'applied' | 'rejected';
  reason?: string;
  processedAtReal: RealTime;
  payoutTransactionId?: string;
  awardedTrophyIds: string[];
}
