/**
 * sports-lore/1: the versioned contract for the sports universe's historical canon.
 *
 * Read-only reference data. Nothing here touches the simulation, odds, betting, bankroll, saves
 * or the game clock. `schema_version` (this contract) is separate from `canon_revision` (which
 * edition of the history) and `canon_status` (proposed, approved or deprecated).
 */
import { z } from 'zod';

export const SCHEMA_VERSION = 'sports-lore/1' as const;

const year = z.number().int().min(1900).max(2200);
const id = z.string().regex(/^[a-z0-9][a-z0-9_.-]*$/);
export const leagueId = z.enum(['gdc', 'ccl', 'igl', 'fhl']);
export const tier = z.enum(['casual', 'fan', 'specialist', 'historian']);
const cite = z.array(z.object({ source: id, locator: z.string().min(1) }).strict()).min(1);

export const manifestSchema = z
  .object({
    schema_version: z.string(),
    canon_revision: z.string().regex(/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/),
    canon_status: z.enum(['proposed', 'approved', 'deprecated']),
    pack_id: id,
    title: z.string(),
    historical_scope: z.object({ from: year, to: year }).strict(),
    game_start_year: year,
    notice: z.string(),
    sources: z.array(z.object({ id, title: z.string(), file: z.string(), revision: z.string(), status: z.string() }).strict()).min(1),
    files: z.array(z.string()),
    open_questions: z.array(z.object({ id: z.string(), text: z.string(), source: z.string() }).strict()),
    /** Questions the game owner has answered, kept so readers can see why canon changed. */
    resolved_questions: z.array(z.object({ id: z.string(), text: z.string(), answer: z.string(), date: z.string() }).strict()).optional(),
    /** Added by the exporter: SHA-256 of each file, and export metadata. */
    hashes: z.record(z.string(), z.string()).optional(),
    'x-export': z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const leagueSchema = z
  .object({
    id: leagueId,
    name: z.string(),
    short: z.string(),
    sport: z.enum(['baseball', 'basketball', 'football', 'hockey']),
    founded: year,
    identity: z.string(),
    trophy: z.string(),
    founding: z
      .object({
        charter_city: z.string().nullable(),
        founding_clubs: z.number().int().positive().nullable(),
        founding_franchise_ids: z.array(id).nullable(),
        founding_event: id,
      })
      .strict(),
    summary: z.string(),
    current_format: z.object({ teams: z.number().int(), games_per_team: z.number().int(), effective_year: year.nullable() }).strict(),
    known_historic_formats: z.array(z.object({ season: year, fact: z.string(), event: id }).strict()),
    cite,
  })
  .strict();

export const teamSchema = z
  .object({
    id,
    league: leagueId,
    city: z.string(),
    state: z.string().length(2),
    nickname: z.string(),
    display_name: z.string(),
    colors_named: z.array(z.string()).length(2),
    status: z.enum(['active', 'relocated', 'retired']),
    cite,
  })
  .strict();

const affiliation = z
  .object({ team: id, from: year.nullable(), to: year.nullable(), basis: z.enum(['stated', 'implied', 'confirmed']) })
  .strict();
export const personSchema = z
  .object({
    id,
    name: z.string(),
    league: leagueId,
    roles: z.array(z.string()),
    affiliations: z.array(affiliation),
    events: z.array(id).min(1),
    career_status: z.enum(['active', 'retired', 'unknown']),
    birth_year: year.nullable(),
    notes: z.string().optional(),
    cite,
  })
  .strict();

export const factSchema = z.object({ id, text: z.string().min(1), year, tier }).strict();
const outcome = z
  .object({ league: leagueId, season: year, champion: id, runner_up: id.nullable(), score: z.string().optional(), series: z.string().optional() })
  .strict();
const claim = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('first_title'), team: id, season: year }).strict(),
  z.object({ kind: z.literal('drought'), team: id, from: year, to: year, status: z.enum(['established', 'inference_pending_approval']) }).strict(),
]);
export const eventSchema = z
  .object({
    id: z.string().regex(/^(gdc|ccl|igl|fhl)-\d{4}-\d{3}$/),
    league: leagueId,
    title: z.string(),
    year,
    span: z.object({ start: year, end: year }).strict(),
    teams: z.array(id),
    people: z.array(id),
    summary: z.string(),
    facts: z.array(factSchema).min(1),
    tags: z.array(z.string()).min(1),
    knowledge: z.object({ headline: tier, detail: tier, label: z.string() }).strict(),
    unknowns: z.array(z.string()),
    constraints: z.array(z.object({ id, rule: z.string() }).strict()),
    outcomes: z.array(outcome),
    claims: z.array(claim),
    status: z.enum(['draft', 'approved']),
    cite,
  })
  .strict();

export const rivalrySchema = z
  .object({
    id,
    league: leagueId,
    teams: z.tuple([id, id]),
    events: z.array(id).min(1),
    intensity: z.enum(['low', 'medium', 'high']),
    basis: z.string(),
    summary: z.string(),
    interpretation: z.string().optional(),
    cite,
  })
  .strict();

export const championshipSchema = z
  .object({
    id,
    league: leagueId,
    season: year.nullable(),
    trophy: z.string(),
    champion: id.nullable(),
    runner_up: id.nullable(),
    /**
     * established: a written result. winner_unknown: the final happened, the winner is unwritten.
     * year_unknown: a title is known to exist inside a window of seasons. inference_pending_approval:
     * derived from other canon, not yet approved; never shown as fact.
     */
    status: z.enum(['established', 'winner_unknown', 'year_unknown', 'inference_pending_approval']),
    events: z.array(id).min(1),
    notes: z.string(),
    first_title: z.boolean().optional(),
    finalists: z.array(id).optional(),
    window: z.object({ from: year, to: year, exclude: z.array(year), count: z.number().int().positive() }).strict().optional(),
    score: z.string().optional(),
    series: z.string().optional(),
    cite,
  })
  .strict();

export const franchiseHistorySchema = z
  .object({
    team: id,
    status: z.enum(['active', 'relocated', 'retired']),
    current_city: z.string(),
    current_state: z.string().length(2),
    /** Year the franchise began play in its current city; null = unwritten. */
    current_since: year.nullable(),
    founding_city: z.string().nullable(),
    founding_member: z.boolean().nullable(),
    /** Null = unwritten. An empty array would mean "never relocated". */
    relocations: z.array(z.object({ year, from_city: z.string(), to_city: z.string() }).strict()).nullable(),
    retired_year: year.nullable(),
    attested_in_current_city: z.array(z.object({ year, event: id, basis: z.string() }).strict()),
    notes: z.string(),
  })
  .strict();

export const dialogueRulesSchema = z
  .object({
    tiers: z.array(z.object({ id: tier, order: z.number().int(), description: z.string() }).strict()).length(4),
    firsthand_min_age: z.number().int().min(0),
    rules: z.array(z.object({ id, text: z.string() }).strict()),
    team_perspectives: z.array(z.object({ team: id, events: z.array(id).min(1), stance: z.string() }).strict()),
    cite,
  })
  .strict();

export const LORE_FILES = {
  'manifest.json': manifestSchema,
  'leagues.json': z.array(leagueSchema).length(4),
  'teams.json': z.array(teamSchema),
  'people.json': z.array(personSchema),
  'events.json': z.array(eventSchema),
  'rivalries.json': z.array(rivalrySchema),
  'championships.json': z.array(championshipSchema),
  'franchise_history.json': z.array(franchiseHistorySchema),
  'dialogue_rules.json': dialogueRulesSchema,
} as const;
export type LoreFileName = keyof typeof LORE_FILES;
export const LORE_FILE_NAMES = Object.keys(LORE_FILES) as LoreFileName[];

export type LoreManifest = z.infer<typeof manifestSchema>;
export type LoreLeague = z.infer<typeof leagueSchema>;
export type LoreTeam = z.infer<typeof teamSchema>;
export type LorePerson = z.infer<typeof personSchema>;
export type LoreFact = z.infer<typeof factSchema>;
export type LoreEvent = z.infer<typeof eventSchema>;
export type LoreRivalry = z.infer<typeof rivalrySchema>;
export type LoreChampionship = z.infer<typeof championshipSchema>;
export type LoreFranchiseHistory = z.infer<typeof franchiseHistorySchema>;
export type LoreDialogueRules = z.infer<typeof dialogueRulesSchema>;
export type KnowledgeTier = z.infer<typeof tier>;
export type LoreLeagueId = z.infer<typeof leagueId>;

export interface LorePack {
  manifest: LoreManifest;
  leagues: LoreLeague[];
  teams: LoreTeam[];
  people: LorePerson[];
  events: LoreEvent[];
  rivalries: LoreRivalry[];
  championships: LoreChampionship[];
  franchiseHistory: LoreFranchiseHistory[];
  dialogueRules: LoreDialogueRules;
}

export const PACK_KEY: Record<LoreFileName, keyof LorePack> = {
  'manifest.json': 'manifest',
  'leagues.json': 'leagues',
  'teams.json': 'teams',
  'people.json': 'people',
  'events.json': 'events',
  'rivalries.json': 'rivalries',
  'championships.json': 'championships',
  'franchise_history.json': 'franchiseHistory',
  'dialogue_rules.json': 'dialogueRules',
};
