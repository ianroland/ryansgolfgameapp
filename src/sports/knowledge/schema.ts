/**
 * sports-lore/2: the generated history and the knowledge layer added to the bible pack for
 * NPC Factory (master brief, "Phase E: NPC Factory export").
 *
 * Words: an "athlete" is a sports player (the word "player" is reserved for the game's human
 * player and is never used as a key in an export). "known_from" is the first sports year in which
 * a fact can be known; NPCs never see a fact before then.
 */
import { z } from 'zod';

export const CONTRACT = 'sports-lore/2' as const;
export const HISTORY_REVISION = '0.2.0-draft' as const;

const year = z.number().int().min(1900).max(2200);
const id = z.string().min(1);
const league = z.enum(['gdc', 'ccl', 'igl', 'fhl']);
const team = z.string().regex(/^(gdc|ccl|igl|fhl)_[a-z_]+$/);
export const tierSchema = z.enum(['casual', 'fan', 'specialist', 'historian']);
/**
 * approved_canon: fixed by an owner decision. proposed_canon: the history ledger and bible
 * (draft until approved). derived_statistic: computed from the generated games by a published
 * rule (awards, leaders, records, totals). generated_history: deterministic generated detail
 * (game scores, series lengths, drafts, the 2026 season). Save-specific future seasons (2027 on)
 * are never in the pack.
 */
export const provenanceSchema = z.enum(['approved_canon', 'proposed_canon', 'derived_statistic', 'generated_history']);
const stats = z.record(z.string(), z.number());

export const seasonRow = z.object({
  id, league, year, games_per_team: z.number().int(),
  standings: z.array(z.object({ team, w: z.number().int(), l: z.number().int() }).strict()),
  seeds: z.array(team).length(4), champion: team, runner_up: team,
  origin: z.string(), adjusted: z.boolean(), provenance: provenanceSchema,
}).strict();
export const columnar = z.object({ columns: z.array(z.string()), rows: z.array(z.array(z.union([z.string(), z.number(), z.null(), z.array(z.string())]))) }).strict();
export const seriesRow = z.object({
  id, league, year, round: z.enum(['semifinal', 'final']), high_seed: team, low_seed: team, seeds: z.tuple([z.number().int(), z.number().int()]),
  winner: team, loser: team, wins: z.record(z.string(), z.number().int()), games: z.array(id), comeback: z.string().nullable(), legendary: z.boolean(),
  provenance: provenanceSchema,
}).strict();
export const championshipRow = z.object({
  id, league, year, trophy: z.string(), champion: team, runner_up: team, result: z.string(), series_id: id, deciding_game: id,
  championship_mvp: id.nullable(), participants: z.array(team).length(4), events: z.array(id), provenance: provenanceSchema,
}).strict();
export const athleteRow = z.object({
  id, name: z.string(), league, position: z.string(), birth_year: year, debut: year, final_season: year.nullable(),
  teams: z.array(z.object({ team, from: year, to: year }).strict()), status_2027: z.enum(['active', 'reserve', 'retired', 'unplayed']),
  bible_person: id.nullable(), hall_of_fame: z.object({ year, pathway: z.enum(['statistical', 'legends']) }).strict().nullable(),
  draft: z.object({ year, round: z.number().int(), pick: z.number().int(), overall: z.number().int(), team }).strict().nullable(),
}).strict();
export const careerRow = z.object({ athlete_id: id, league, seasons: z.number().int(), first: year, last: year, teams: z.array(team), regular: stats, playoffs: stats }).strict();
export const awardRow = z.object({ id, league, year, award: z.string(), athlete_id: id, team, value: z.number(), basis: z.string() }).strict();
export const leaderRow = z.object({ id, league, year, stat: z.string(), athlete_id: id, team, value: z.number() }).strict();
export const recordRow = z.object({
  id, kind: z.enum(['season', 'career', 'game', 'team']), league, category: z.string(), label: z.string(), rank: z.number().int(),
  athlete_id: id.nullable(), team: team.nullable(), year: year.nullable(), span: z.tuple([year, year]).nullable(), value: z.number(), provenance: provenanceSchema,
}).strict();
export const hofRow = z.object({ id, athlete_id: id, league, year, pathway: z.enum(['statistical', 'legends']), basis: z.string().nullable(), score: z.number().nullable(), provenance: provenanceSchema }).strict();
export const draftRow = z.object({ id, league, year, round: z.number().int(), pick: z.number().int(), overall: z.number().int(), athlete_id: id, team }).strict();
export const transactionRow = z.object({ id, league, year, type: z.string(), athlete_id: id, from: team, to: team, note: z.string().nullable(), event: id.nullable() }).strict();

export const FACT_KINDS = ['championship', 'final', 'semifinal', 'comeback', 'award', 'leader', 'standings', 'franchise', 'drought', 'grudge', 'rivalry', 'record', 'hall_of_fame', 'legend', 'draft', 'trade'] as const;
export const FACT_USES = ['sportsbook', 'favorite_team', 'rivalry', 'championship_memory', 'legend', 'grudge', 'trivia'] as const;
export const factRow = z.object({
  id: z.string().regex(/^f\.[a-z_]+\.[A-Za-z0-9_.:-]+$/),
  kind: z.enum(FACT_KINDS),
  /** The season or year the fact is about, and the first sports year an NPC can know it. */
  year, known_from: year,
  league, teams: z.array(team), athletes: z.array(id), events: z.array(id), rivalry: id.nullable(),
  tier: tierSchema,
  text: z.string().min(1),
  data: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.string())])),
  /** Ids of the history records this fact restates (resolvable in the history files). */
  refs: z.array(id).min(1),
  provenance: provenanceSchema,
  uses: z.array(z.enum(FACT_USES)).min(1),
}).strict();
export type Fact = z.infer<typeof factRow>;
export type Tier = z.infer<typeof tierSchema>;

export const indexSchema = z.object({
  by_league: z.record(z.string(), z.array(id)),
  by_team: z.record(z.string(), z.array(id)),
  by_athlete: z.record(z.string(), z.array(id)),
  by_year: z.record(z.string(), z.array(id)),
  by_event: z.record(z.string(), z.array(id)),
  by_rivalry: z.record(z.string(), z.array(id)),
  /** "City, ST" and "ST" → franchises there (for an NPC's hometown). */
  teams_by_city: z.record(z.string(), z.array(team)),
  teams_by_state: z.record(z.string(), z.array(team)),
}).strict();

/** What the game passes at run time about the season in progress (never stored as canon). */
export const liveContextSchema = z.object({
  contract: z.literal(CONTRACT),
  year, week: z.number().int(),
  scope: z.literal('save'),
  leagues: z.array(z.object({
    league,
    standings: z.array(z.object({ team, w: z.number().int(), l: z.number().int(), t: z.number().int(), otl: z.number().int() }).strict()),
    recent: z.array(z.object({ id, week: z.number().int(), home: team, away: team, home_score: z.number().int(), away_score: z.number().int() }).strict()),
  }).strict()),
}).strict();

export const KNOWLEDGE_FILES = {
  'history/seasons.json': z.array(seasonRow),
  'history/games.json': columnar,
  'history/playoff_series.json': z.array(seriesRow),
  'history/championships.json': z.array(championshipRow),
  'history/players.json': z.array(athleteRow),
  'history/player_seasons.json': z.object({ regular: z.record(z.string(), columnar), playoffs: z.record(z.string(), columnar) }).strict(),
  'history/player_careers.json': z.array(careerRow),
  'history/awards.json': z.array(awardRow),
  'history/leaders.json': z.array(leaderRow),
  'history/records.json': z.array(recordRow),
  'history/hall_of_fame.json': z.array(hofRow),
  'history/drafts.json': z.array(draftRow),
  'history/transactions.json': z.array(transactionRow),
  'knowledge/facts.json': z.array(factRow),
  'knowledge/index.json': indexSchema,
} as const;
export type KnowledgeFileName = keyof typeof KNOWLEDGE_FILES;
