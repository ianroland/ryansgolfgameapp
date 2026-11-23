import type { GameTime } from '../core/types';
import type { QStage, TourId } from './config';
import type { Appearance, StoryState } from '../story/types';
export type { TourId };

export type StatKey = 'power' | 'accuracy' | 'shortGame' | 'putting' | 'nerve' | 'fitness';
export const STAT_KEYS: StatKey[] = ['power', 'accuracy', 'shortGame', 'putting', 'nerve', 'fitness'];
export const STAT_LABELS: Record<StatKey, string> = {
  power: 'Power',
  accuracy: 'Accuracy',
  shortGame: 'Short Game',
  putting: 'Putting',
  nerve: 'Nerve',
  fitness: 'Fitness',
};

export type PersonId = 'coach' | 'mom' | 'friend' | 'rival' | 'agent' | 'sponsor' | 'caddie' | 'fans';

export interface PoolGolfer {
  id: string;
  name: string;
  rating: number;
  /** Home tour this golfer currently plays. */
  tour: TourId;
}

export interface Sponsor {
  id: string;
  name: string;
  weekly: number;
  winBonus: number;
  untilSeason: number;
}

export interface InboxItem {
  id: string;
  at: GameTime;
  title: string;
  body: string;
  tone: 'good' | 'bad' | 'neutral';
}

export interface StoryChoiceView {
  label: string;
  hint: string;
}

export interface PendingStory {
  storyId: string;
  title: string;
  body: string;
  choices: StoryChoiceView[];
}

export type RoundMode = 'sim' | 'key' | 'full';

/** A tournament in progress, persisted so play can resume after a reload. */
export interface ActiveTournament {
  tournamentId: string;
  /** Course being played (missing on saves from before courses varied: Dry Creek). */
  courseId?: string;
  mode: RoundMode;
  /** Current round index (0-based). */
  round: number;
  /** Holes Ryan has finished in the current round (strokes, by hole index). */
  playerHoles: (number | null)[];
  /** Completed rounds' per-hole strokes for every entrant. */
  scores: Record<string, number[][]>;
  entrants: { id: string; name: string; rating: number }[];
  /** Per-round pin/wind seed. */
  seed: number;
  /** Golfers still in the field after the cut (all, before it). */
  alive: string[];
  /**
   * Competitor model this tournament plays on (see `FieldModel` in field.ts).
   * Missing on tournaments begun before model 2: those finish on model 1.
   */
  fieldModel?: 2;
}

export interface CareerState {
  id: 'career';
  playerId: string;
  season: number;
  week: number;
  age: number;
  status: 'amateur' | 'pro';
  tourCard: 'none' | 'epson' | 'lpga';
  qschool: { season: number; nextStage: QStage | null; result: 'lpga' | 'epson' | 'failed' | null };
  stats: Record<StatKey, number>;
  skillPoints: number;
  energy: number;
  /** Confidence, −10..+10. */
  form: number;
  fame: number;
  relationships: Record<PersonId, number>;
  flags: Record<string, number | boolean | string>;
  equipment: Record<string, string>;
  owned: string[];
  sponsor: Sponsor | null;
  pools: Record<TourId, PoolGolfer[]>;
  rivalId: string;
  /** Amateur ranking points this season, by golfer. */
  seasonPoints: Record<string, number>;
  /** Earnings this season, keyed `${tour}:${golferId}`. */
  seasonEarnings: Record<string, number>;
  inbox: InboxItem[];
  /** How Ryan holed notable shots, keyed by albatross id, until the hole is on file. */
  shotNotes?: Record<string, string>;
  pendingStory: PendingStory | null;
  /** Ryan's look (missing on older saves: Act I default). */
  appearance?: Appearance;
  /** Adventure state: act, unlocked looks, encounters (missing on older saves: Act I, nothing done). */
  story?: StoryState;
  active: ActiveTournament | null;
  /** Tournament ids entered (and paid for) this season. */
  entered: string[];
  achievements: Record<string, GameTime>;
  actionsUsed: number;
  /** Story ids that already happened (one-off events). */
  storiesSeen: string[];
  totals: CareerTotals;
  /** Last few tournament summaries, newest first. */
  recent: RecentResult[];
  /** End-of-season summaries, oldest first (older saves may lack it). */
  seasonLog?: SeasonLog[];
  /** All-time career prize money for every golfer (see moneyList.ts). */
  careerMoney?: Record<string, { name: string; amount: number; tour: TourId }>;
}

export interface SeasonLog {
  season: number;
  age: number;
  status: 'amateur' | 'pro';
  /** Main tour played that season. */
  tour: TourId;
  /** Rank on that tour's money list (pros) or the amateur points list. */
  rank: number | null;
  fame: number;
  /** Rank on the all-time career money list at season end. */
  allTimeRank?: number | null;
}

export interface CareerTotals {
  events: number;
  wins: number;
  top10s: number;
  cutsMade: number;
  earnings: number;
  majors: number;
  bestFinish: number | null;
  /** Exactly two under (an albatross is not also counted as an eagle). */
  eagles: number;
  aces: number;
  /** Exactly three under. Missing on saves from before v0.10 (treat as 0). */
  albatrosses?: number;
}

export interface RecentResult {
  tournamentId: string;
  name: string;
  tour: TourId;
  posLabel: string;
  toPar: number;
  prize: number;
  season: number;
  week: number;
}
