/**
 * Sports lore service: read-only lookups and UI/NPC selectors over the sports-lore/1 pack.
 *
 * Boundaries (tested):
 * - Historical canon is a global, frozen reference. Nothing here writes it.
 * - No RNG, no simulation, odds, betting, bankroll, save or clock writes. The caller passes the
 *   current sports year; nothing dated in or after that year is ever returned.
 * - Game-simulated seasons (2027 on) belong to one save. They are merged into timelines as a
 *   separate, namespaced source and never become canon.
 */
import championships from './pack/championships.json';
import dialogueRules from './pack/dialogue_rules.json';
import events from './pack/events.json';
import franchiseHistory from './pack/franchise_history.json';
import leagues from './pack/leagues.json';
import manifest from './pack/manifest.json';
import people from './pack/people.json';
import rivalries from './pack/rivalries.json';
import teams from './pack/teams.json';
import type { KnowledgeTier, LoreChampionship, LoreEvent, LoreFact, LoreLeagueId, LorePack, LoreRivalry } from './schema';
import { errorsOf, parsePack, validatePack, type LoreIssue } from './validate';

const RAW = {
  'manifest.json': manifest,
  'leagues.json': leagues,
  'teams.json': teams,
  'people.json': people,
  'events.json': events,
  'rivalries.json': rivalries,
  'championships.json': championships,
  'franchise_history.json': franchiseHistory,
  'dialogue_rules.json': dialogueRules,
};

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

let cache: { pack: LorePack; issues: LoreIssue[] } | null = null;
/** The bundled canon, parsed, validated and frozen. Throws if the bundled pack has errors (the tests stop that shipping). */
export function bundledLore(): LorePack {
  if (!cache) {
    const raw = structuredClone(RAW) as Record<string, unknown>;
    const { pack, issues } = parsePack(raw);
    if (!pack) throw new Error(`sports-lore pack failed to parse: ${issues.map((i) => `${i.path} ${i.message}`).join('; ')}`);
    const all = [...issues, ...validatePack(pack)];
    if (errorsOf(all).length) throw new Error(`sports-lore pack is invalid: ${errorsOf(all).map((i) => `${i.code} ${i.path}`).join('; ')}`);
    cache = { pack: deepFreeze(pack), issues: all };
  }
  return cache.pack;
}
export const bundledLoreIssues = () => (bundledLore(), cache!.issues);

/** The sports year for a career season (season 1 = the game start year, 2027). */
export const sportsYearForSeason = (careerSeason: number, pack: LorePack = bundledLore()) => pack.manifest.game_start_year - 1 + careerSeason;

// ── Knowledge gating ──
const RANK: Record<KnowledgeTier, number> = { casual: 0, fan: 1, specialist: 2, historian: 3 };

export interface LoreViewer {
  /** Current sports year. Facts dated in or after it are unknown (the season is still being played). */
  year: number;
  tier: KnowledgeTier;
  /** Leagues the viewer follows. Default: all. */
  leagues?: readonly LoreLeagueId[];
  /** The viewer's own teams (fans know their own team's notable events). */
  teams?: readonly string[];
  /** For firsthand-attendance checks. Null or absent = unknown, so no firsthand claims. */
  birthYear?: number | null;
}

export function canKnow(v: LoreViewer, e: LoreEvent, f: LoreFact): boolean {
  if (f.year >= v.year) return false;
  if (v.tier === 'historian') return true;
  const need = RANK[f.tier];
  if (need === 0) return true;
  if (RANK[v.tier] < need) return false;
  const follows = !v.leagues || v.leagues.includes(e.league);
  const ownTeam = !!v.teams?.some((t) => e.teams.includes(t));
  return need === 1 ? follows || ownTeam : follows;
}

export interface KnownFact { event: string; fact: string; year: number; text: string; tier: KnowledgeTier }

export function knownFacts(v: LoreViewer, filter: (e: LoreEvent) => boolean = () => true, pack = bundledLore()): KnownFact[] {
  return pack.events
    .filter(filter)
    .flatMap((e) => e.facts.filter((f) => canKnow(v, e, f)).map((f) => ({ event: e.id, fact: `${e.id}#${f.id}`, year: f.year, text: f.text, tier: f.tier })));
}

/** Events whose headline the viewer knows (at least one known fact), in date order. */
export const knownEvents = (v: LoreViewer, filter: (e: LoreEvent) => boolean = () => true, pack = bundledLore()) =>
  pack.events.filter((e) => filter(e) && e.facts.some((f) => canKnow(v, e, f))).sort((a, b) => a.year - b.year || a.id.localeCompare(b.id));

/** Could this NPC plausibly have been there? Unknown birth year = no. */
export function canClaimFirsthand(eventId: string, birthYear: number | null | undefined, pack = bundledLore()): boolean {
  const e = pack.events.find((x) => x.id === eventId);
  if (!e || birthYear == null) return false;
  return e.span.start - birthYear >= pack.dialogueRules.firsthand_min_age;
}

// ── Lookups ──
export const lore = {
  league: (id: LoreLeagueId, pack = bundledLore()) => pack.leagues.find((l) => l.id === id) ?? null,
  team: (id: string, pack = bundledLore()) => pack.teams.find((t) => t.id === id) ?? null,
  event: (id: string, pack = bundledLore()) => pack.events.find((e) => e.id === id) ?? null,
  person: (id: string, pack = bundledLore()) => pack.people.find((p) => p.id === id) ?? null,
  eventsByLeague: (id: LoreLeagueId, pack = bundledLore()) => pack.events.filter((e) => e.league === id),
  eventsByTeam: (id: string, pack = bundledLore()) => pack.events.filter((e) => e.teams.includes(id)),
  /** Events overlapping [from, to]. */
  eventsByEra: (from: number, to: number, pack = bundledLore()) => pack.events.filter((e) => e.span.end >= from && e.span.start <= to),
  eventsByTier: (tier: KnowledgeTier, pack = bundledLore()) => pack.events.filter((e) => e.facts.some((f) => f.tier === tier)),
};

// ── Save-specific simulated history (separate ledger) ──
export interface SimulatedSeason {
  /** `save:<saveId>`. Simulated history is per save and never shared canon. */
  namespace: string;
  league: LoreLeagueId;
  season: number;
  champion: string;
  runnerUp: string | null;
}

export function checkSimulated(rows: readonly SimulatedSeason[], pack = bundledLore()): LoreIssue[] {
  const issues: LoreIssue[] = [];
  const seen = new Set<string>();
  const teamIds = new Set(pack.teams.map((t) => t.id));
  for (const r of rows) {
    const path = `simulated:${r.namespace}:${r.league}:${r.season}`;
    if (!/^save:.+/.test(r.namespace)) issues.push({ severity: 'error', code: 'NAMESPACE', path, message: 'Simulated history must be namespaced save:<id>.' });
    if (r.season < pack.manifest.game_start_year) issues.push({ severity: 'error', code: 'CANON_OVERWRITE', path, message: `Season ${r.season} is canon history; simulated seasons start in ${pack.manifest.game_start_year}.` });
    for (const t of [r.champion, r.runnerUp]) if (t && (!teamIds.has(t) || !t.startsWith(`${r.league}_`))) issues.push({ severity: 'error', code: 'UNKNOWN_TEAM', path, message: `Unknown ${r.league} team ${t}.` });
    const k = `${r.namespace}:${r.league}:${r.season}`;
    if (seen.has(k)) issues.push({ severity: 'error', code: 'DUPLICATE_CHAMPIONSHIP', path, message: 'Season recorded twice.' });
    seen.add(k);
  }
  return issues;
}

// ── Selectors (UI- and NPC-ready) ──
export type LedgerRow =
  | { season: number; source: 'canon'; status: 'established'; champion: string; runnerUp: string | null; note: string; record: string }
  | { season: number; source: 'canon'; status: 'winner_unknown'; finalists: string[]; note: string; record: string }
  | { season: number; source: 'canon'; status: 'inference_pending_approval'; champion: string; note: string; record: string }
  | { season: number; source: 'canon'; status: 'unwritten' }
  | { season: number; source: 'simulated'; status: 'simulated'; namespace: string; champion: string; runnerUp: string | null };

export interface LeagueTimeline {
  league: LoreLeagueId;
  name: string;
  founded: number;
  trophy: string;
  identity: string;
  canonStatus: string;
  canonRevision: string;
  /** Every season from founding up to (not including) the current year, newest first. */
  ledger: LedgerRow[];
  /** Titles known to exist but not yet placed in a season. */
  undatedTitles: { champion: string; count: number; from: number; to: number; note: string; record: string }[];
  events: LoreEvent[];
  rivalries: LoreRivalry[];
  counts: { established: number; unwritten: number; pending: number };
}

export function leagueTimeline(id: LoreLeagueId, v: LoreViewer, simulated: readonly SimulatedSeason[] = [], pack = bundledLore()): LeagueTimeline {
  const L = lore.league(id, pack)!;
  const ch = pack.championships.filter((c) => c.league === id);
  const visibleChamp = (c: LoreChampionship) => c.events.every((eid) => {
    const e = lore.event(eid, pack)!;
    return knownEvents(v, (x) => x.id === e.id, pack).length > 0;
  });
  const sim = simulated.filter((s) => s.league === id && s.season < v.year && s.season >= pack.manifest.game_start_year);
  const ledger: LedgerRow[] = [];
  const lastSeason = v.year - 1;
  for (let y = lastSeason; y >= L.founded; y--) {
    if (y > pack.manifest.historical_scope.to) {
      const s = sim.find((r) => r.season === y);
      if (s) ledger.push({ season: y, source: 'simulated', status: 'simulated', namespace: s.namespace, champion: s.champion, runnerUp: s.runnerUp });
      continue;
    }
    const c = ch.find((x) => x.season === y && x.status !== 'year_unknown' && visibleChamp(x));
    if (!c) ledger.push({ season: y, source: 'canon', status: 'unwritten' });
    else if (c.status === 'established') ledger.push({ season: y, source: 'canon', status: 'established', champion: c.champion!, runnerUp: c.runner_up, note: c.notes, record: c.id });
    else if (c.status === 'winner_unknown') ledger.push({ season: y, source: 'canon', status: 'winner_unknown', finalists: c.finalists ?? [], note: c.notes, record: c.id });
    else ledger.push({ season: y, source: 'canon', status: 'inference_pending_approval', champion: c.champion!, note: c.notes, record: c.id });
  }
  const undated = ch
    .filter((c) => c.status === 'year_unknown' && c.window && c.window.to < v.year && visibleChamp(c))
    .map((c) => ({ champion: c.champion!, count: c.window!.count, from: c.window!.from, to: c.window!.to, note: c.notes, record: c.id }));
  const evs = knownEvents(v, (e) => e.league === id, pack);
  const known = new Set(evs.map((e) => e.id));
  return {
    league: id,
    name: L.name,
    founded: L.founded,
    trophy: L.trophy,
    identity: L.identity,
    canonStatus: pack.manifest.canon_status,
    canonRevision: pack.manifest.canon_revision,
    ledger,
    undatedTitles: undated,
    events: evs,
    rivalries: pack.rivalries.filter((r) => r.league === id && r.events.some((e) => known.has(e))),
    counts: {
      established: ledger.filter((r) => r.status === 'established').length,
      unwritten: ledger.filter((r) => r.status === 'unwritten').length,
      pending: ledger.filter((r) => r.status === 'inference_pending_approval').length,
    },
  };
}

export function teamHistory(teamId: string, v: LoreViewer, pack = bundledLore()) {
  const t = lore.team(teamId, pack);
  if (!t) return null;
  const tl = leagueTimeline(t.league, v, [], pack);
  const titles = tl.ledger.filter((r): r is Extract<LedgerRow, { status: 'established' }> => r.status === 'established' && r.champion === teamId);
  const finals = tl.ledger.filter((r): r is Extract<LedgerRow, { status: 'established' }> => r.status === 'established' && r.runnerUp === teamId);
  return {
    team: t,
    franchise: pack.franchiseHistory.find((f) => f.team === teamId)!,
    titles: titles.map((r) => r.season),
    finalsLost: finals.map((r) => r.season),
    undatedTitles: tl.undatedTitles.filter((u) => u.champion === teamId),
    pendingTitles: tl.ledger.filter((r) => r.status === 'inference_pending_approval' && r.champion === teamId).map((r) => r.season),
    events: knownEvents(v, (e) => e.teams.includes(teamId), pack),
    rivalries: tl.rivalries.filter((r) => r.teams.includes(teamId)),
    people: pack.people.filter((p) => p.affiliations.some((a) => a.team === teamId) && p.events.some((e) => knownEvents(v, (x) => x.id === e, pack).length)),
    perspectives: pack.dialogueRules.team_perspectives.filter((p) => p.team === teamId),
  };
}

export function rivalrySummary(id: string, v: LoreViewer, pack = bundledLore()) {
  const r = pack.rivalries.find((x) => x.id === id);
  if (!r) return null;
  const facts = knownFacts(v, (e) => r.events.includes(e.id), pack);
  if (!facts.length) return null;
  return { rivalry: r, teams: r.teams.map((t) => lore.team(t, pack)!), facts };
}

export interface NpcLoreProfile {
  npcId: string;
  tier: KnowledgeTier;
  leagues?: readonly LoreLeagueId[];
  teams?: readonly string[];
  birthYear?: number | null;
}

/** Everything an NPC may say about sports history this year, with event ids and the rules that bind it. */
export function npcLoreContext(p: NpcLoreProfile, year: number, pack = bundledLore()) {
  const v: LoreViewer = { year, tier: p.tier, leagues: p.leagues, teams: p.teams, birthYear: p.birthYear };
  const facts = knownFacts(v, () => true, pack);
  const evIds = [...new Set(facts.map((f) => f.event))];
  return {
    npcId: p.npcId,
    year,
    loreRevision: pack.manifest.canon_revision,
    canonStatus: pack.manifest.canon_status,
    facts,
    constraints: evIds.flatMap((id) => lore.event(id, pack)!.constraints.map((c) => ({ event: id, rule: c.rule }))),
    perspectives: pack.dialogueRules.team_perspectives.filter((x) => p.teams?.includes(x.team) && x.events.some((e) => evIds.includes(e))),
    firsthand: evIds.filter((id) => canClaimFirsthand(id, p.birthYear, pack)),
    rules: pack.dialogueRules.rules,
  };
}
