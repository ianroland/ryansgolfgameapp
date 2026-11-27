/**
 * People screen groups beyond the inner circle (owner, 2026-11-24): people on the course who've
 * challenged Ryan, casino staff and casino regulars. Read-only views of saved state; nothing here
 * changes money, odds or outcomes.
 */
import type { CareerState } from '../../career/types';
import { CAST } from '../../story/cast';
import { encounterById } from '../../story/encounters';
import type { StoryState } from '../../story/types';
import { DEALERS } from '../../npc/registry';
import { SERVERS } from '../../casino/servers/registry';
import { relationshipOf, tierOf } from '../../npc/relationship';
import type { NpcId, NpcState } from '../../npc/types';
import { locationById } from '../../expansion/locations';
import type { LocationId } from '../../expansion/unlocks';
import { REGULARS } from '../casino/crapsRegulars';
import { crapsRollsAt } from '../../services/casinoService';

export interface Challenger {
  id: string;
  name: string;
  role: string;
  personality: string;
  bond: number;
  meetings: number;
  wins: number;
  losses: number;
  last: string | null;
}

/** Cast members (outside the inner circle) Ryan has met in an encounter, with challenge results. */
export function courseChallengers(story: StoryState | undefined): Challenger[] {
  const out: Challenger[] = [];
  const records = Object.entries(story?.encounters ?? {}).sort(([, a], [, b]) => a.season - b.season || a.week - b.week);
  for (const who of CAST) {
    if (who.person) continue;
    let meetings = 0, wins = 0, losses = 0;
    let last: string | null = null;
    for (const [id, rec] of records) {
      const def = encounterById(id);
      if (!def || !def.cast.includes(who.id)) continue;
      meetings++;
      last = def.outcomes[rec.outcome]?.summary ?? last;
      const vsThem = Object.values(def.nodes).some((n) => 'challenge' in n && n.challenge.opponent === who.id);
      if (vsThem) {
        if (rec.path.includes('win')) wins++;
        if (rec.path.includes('lose')) losses++;
      }
    }
    if (meetings > 0) out.push({ id: who.id, name: who.name, role: who.role, personality: who.personality, bond: story?.bonds[who.id] ?? 50, meetings, wins, losses, last });
  }
  return out;
}

export interface StaffRow {
  id: NpcId;
  name: string;
  job: string;
  where: string;
  tier: string;
  relationship: number;
  visits: number;
  tipped: number;
  tips: number;
}

const GAME_JOB: Record<string, string> = {
  blackjack: 'Blackjack dealer', craps: 'Craps stickperson', roulette: 'Roulette croupier', baccarat: 'Baccarat dealer', threecard: 'Three Card Poker dealer',
};

/** Dealers and servers Ryan has met (a visit or a tip on file). */
export function casinoStaff(states: readonly NpcState[]): StaffRow[] {
  const byId = new Map(states.map((s) => [s.npcId, s]));
  const people = [
    ...DEALERS.map((d) => ({ id: d.id as NpcId, name: d.name, job: GAME_JOB[d.game] ?? 'Dealer', loc: d.location })),
    ...SERVERS.map((s) => ({ id: s.id as NpcId, name: s.name, job: 'Cocktail server', loc: s.location })),
  ];
  const rows: StaffRow[] = [];
  for (const p of people) {
    const s = byId.get(p.id);
    if (!s || (s.visits === 0 && s.tips.count === 0)) continue;
    rows.push({ id: p.id, name: p.name, job: p.job, where: locationById(p.loc)?.name ?? p.loc, tier: tierOf(s), relationship: relationshipOf(s), visits: Math.max(s.visits, s.tips.visitsTipped ?? 0), tipped: s.tips.lifetime, tips: s.tips.count });
  }
  return rows;
}

/** How well a table's regulars know Ryan, by craps rolls at that casino. Approved by the owner 2026-11-27 ("i love this"). */
export const FAMILIARITY: readonly { min: number; label: string }[] = [
  { min: 1, label: 'New face' },
  { min: 30, label: 'Nodding terms' },
  { min: 150, label: 'Table regular' },
  { min: 500, label: 'Rail family' },
];
export const FAMILIARITY_STATUS: 'draft' | 'approved' = 'approved';

export function familiarity(rolls: number): string | null {
  let label: string | null = null;
  for (const f of FAMILIARITY) if (rolls >= f.min) label = f.label;
  return label;
}

export interface RegularRow {
  id: string;
  name: string;
  where: string;
  bio: string;
  rolls: number;
  label: string;
}

/** Craps regulars at the tables Ryan has rolled at. */
export function casinoRegulars(c: CareerState): RegularRow[] {
  const rows: RegularRow[] = [];
  for (const r of REGULARS) {
    const rolls = crapsRollsAt(c, r.location as LocationId);
    const label = familiarity(rolls);
    if (!label) continue;
    rows.push({ id: r.id, name: r.name, where: locationById(r.location)?.name ?? r.location, bio: r.bio, rolls, label });
  }
  return rows;
}
