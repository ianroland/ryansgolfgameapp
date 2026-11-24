/**
 * sports-lore/2 reference retrieval: what an NPC may know and say about sports history.
 * Dependency-free: shipped in the knowledge pack as knowledge/retrieve.mjs (same code, types
 * stripped), so NPC Factory and the game apply identical rules.
 *
 * Rules
 * - Nothing before it is known: a fact is available only from its `known_from` sports year.
 *   The game supplies the current year (2026 + career season); the pack holds history up to 2026.
 * - Knowledge tiers: casual facts are known to everyone; fan facts to people who follow that
 *   league or whose favourite or hometown team is involved; specialist facts to people who follow
 *   that league; historian facts to historians.
 * - Firsthand memory needs the NPC to have been at least `firsthandMinAge` (8) that year.
 * - Retrieval never writes text: it returns facts with their ids. A dialogue line built from them
 *   must carry those ids (and the pack revision) so every line traces to the data.
 */

export type Tier = 'casual' | 'fan' | 'specialist' | 'historian';
export interface KFact {
  id: string; kind: string; year: number; known_from: number; league: string;
  teams: string[]; athletes: string[]; events: string[]; rivalry: string | null;
  tier: Tier; text: string; uses: string[]; provenance: string;
  data: Record<string, unknown>; refs: string[];
}
export interface KIndex { teams_by_city: Record<string, string[]>; teams_by_state: Record<string, string[]> }
export interface NpcSportsProfile {
  /** The current sports year in the NPC's world. */
  year: number;
  tier: Tier;
  /** Leagues the NPC follows ('gdc' | 'ccl' | 'igl' | 'fhl'). Absent: all four. */
  leagues?: string[];
  favoriteTeams?: string[];
  hometown?: { city?: string; state?: string } | null;
  birthYear?: number | null;
}
export interface KQuery {
  league?: string; team?: string; athlete?: string; year?: number; event?: string; rivalry?: string;
  kinds?: string[]; uses?: string[]; minYear?: number; maxYear?: number; limit?: number;
}
export interface KResult extends KFact {
  /** The NPC could have seen it (old enough that year). */
  firsthand: boolean;
  /** Why the NPC knows it: 'common knowledge', 'follows <league>', 'favourite team', 'home team', 'historian'. */
  why: string;
  score: number;
}

const RANK: Record<Tier, number> = { casual: 0, fan: 1, specialist: 2, historian: 3 };
export const FIRSTHAND_MIN_AGE = 8;

/** Franchises in the NPC's hometown (same city and state), else in the same state. */
export function hometownTeams(index: KIndex, hometown: NpcSportsProfile['hometown']): { local: string[]; regional: string[] } {
  if (!hometown) return { local: [], regional: [] };
  const local = hometown.city && hometown.state ? index.teams_by_city[`${hometown.city}, ${hometown.state}`] ?? [] : [];
  const regional = hometown.state ? (index.teams_by_state[hometown.state] ?? []).filter((t) => !local.includes(t)) : [];
  return { local, regional };
}

/** Can this NPC know this fact now, and why? Null = no. */
export function knows(f: KFact, npc: NpcSportsProfile, home: { local: string[]; regional: string[] }): string | null {
  if (f.known_from > npc.year) return null;
  const follows = !npc.leagues || npc.leagues.includes(f.league);
  const fav = (npc.favoriteTeams ?? []).some((t) => f.teams.includes(t));
  const local = home.local.some((t) => f.teams.includes(t)) || home.regional.some((t) => f.teams.includes(t));
  const need = RANK[f.tier];
  if (npc.tier === 'historian') return need === 3 ? 'historian' : fav ? 'favourite team' : local ? 'home team' : follows ? `follows ${f.league}` : 'common knowledge';
  if (need === 0) return fav ? 'favourite team' : local ? 'home team' : 'common knowledge';
  if (RANK[npc.tier] < need) return null;
  if (need === 1) return fav ? 'favourite team' : local ? 'home team' : follows ? `follows ${f.league}` : null;
  if (need === 2) return follows ? (fav ? 'favourite team' : `follows ${f.league}`) : null;
  return null;
}

/**
 * Facts this NPC may use for a query, most relevant first: their own teams, then their home
 * teams, then the query's focus; more important (lower tier) and more recent facts first.
 */
export function retrieve(facts: KFact[], index: KIndex, npc: NpcSportsProfile, q: KQuery = {}): KResult[] {
  const home = hometownTeams(index, npc.hometown);
  const out: KResult[] = [];
  for (const f of facts) {
    if (q.league && f.league !== q.league) continue;
    if (q.team && !f.teams.includes(q.team)) continue;
    if (q.athlete && !f.athletes.includes(q.athlete)) continue;
    if (q.year !== undefined && f.year !== q.year) continue;
    if (q.event && !f.events.includes(q.event)) continue;
    if (q.rivalry && f.rivalry !== q.rivalry) continue;
    if (q.kinds && !q.kinds.includes(f.kind)) continue;
    if (q.uses && !q.uses.some((u) => f.uses.includes(u))) continue;
    if (q.minYear !== undefined && f.year < q.minYear) continue;
    if (q.maxYear !== undefined && f.year > q.maxYear) continue;
    const why = knows(f, npc, home);
    if (!why) continue;
    const fav = (npc.favoriteTeams ?? []).some((t) => f.teams.includes(t));
    const loc = home.local.some((t) => f.teams.includes(t));
    const reg = home.regional.some((t) => f.teams.includes(t));
    const score = (fav ? 8 : 0) + (loc ? 5 : reg ? 2 : 0) + (3 - RANK[f.tier]) + Math.max(0, 1 - (npc.year - f.year) / 60);
    const firsthand = npc.birthYear != null && f.year - npc.birthYear >= FIRSTHAND_MIN_AGE && f.year <= npc.year;
    out.push({ ...f, firsthand, why, score: Math.round(score * 1000) / 1000 });
  }
  out.sort((a, b) => b.score - a.score || b.year - a.year || a.id.localeCompare(b.id));
  return q.limit ? out.slice(0, q.limit) : out;
}
