/**
 * The three cocktail servers: one per casino. Names and lines come from the pack's
 * servers.json (DRAFT, pending approval; names provisional) and are not rewritten here.
 *
 * Portraits: six cut from each supplied 3x2 sheet (tools/cut_server_portraits.py). The sheets
 * draw friendly, playful, impressed (intrigued), concerned, firm and a whisper face; there is no
 * separate annoyed face, so `annoyed` lines use the firm face, and rumour lines use the whisper.
 */
import type { LocationId } from '../../expansion/unlocks';
import data from './servers.json';

export type ServerId = 'dp_server' | 'wb_server' | 'ms_server';
export type ServerExpression = 'friendly' | 'playful' | 'impressed' | 'concerned' | 'annoyed' | 'firm';
export type ServerEvent =
  | 'intro' | 'order' | 'first_order' | 'chat' | 'tip' | 'no_tip' | 'decline' | 'water'
  | 'rumor' | 'concern' | 'refusal' | 'hostile' | 'apology' | 'farewell';

export interface ServerLine {
  id: string;
  speaker: string;
  expression: ServerExpression;
  text: string;
}

export interface ServerDef {
  id: ServerId;
  name: string;
  short: string;
  location: LocationId;
  personality: string;
  dialogue: Record<ServerEvent, ServerLine[]>;
}

type Raw = { id: string; name: string; personality: string; dialogue: Record<string, ServerLine[]> };
const raw = data.servers as unknown as Record<LocationId, Raw>;

export const SERVERS: readonly ServerDef[] = (['desert_palms', 'white_buffalo', 'morongo_sky'] as LocationId[]).map((loc) => {
  const s = raw[loc];
  return { id: s.id as ServerId, name: s.name, short: s.name.split(' ')[0], location: loc, personality: s.personality, dialogue: s.dialogue as Record<ServerEvent, ServerLine[]> };
});

export const SERVER_IDS = SERVERS.map((s) => s.id);
export const serverById = (id: string) => SERVERS.find((s) => s.id === id);
export const serverAt = (loc: LocationId) => SERVERS.find((s) => s.location === loc)!;
export const isServerId = (id: string): id is ServerId => SERVERS.some((s) => s.id === id);
/** The pack's dialogue is a draft pending approval. */
export const SERVER_DIALOGUE_STATUS = (data as { status?: string }).status ?? 'draft';

const files = import.meta.glob<string>('../../assets/casino/npcs/servers/*/*.png', { eager: true, query: '?url', import: 'default' });
type Face = 'friendly' | 'playful' | 'impressed' | 'concerned' | 'firm' | 'whisper';
/** Which drawn face shows an expression (and the whisper face for rumours). */
export function serverFace(expression: ServerExpression, event?: ServerEvent): Face {
  if (event === 'rumor') return 'whisper';
  return expression === 'annoyed' ? 'firm' : expression;
}
export function serverPortrait(loc: LocationId, face: Face): string | undefined {
  return files[`../../assets/casino/npcs/servers/${loc}/${face}.png`];
}

/** A line for an event, avoiding the most recent ones (the pack has 1-2 lines per event). */
export function pickServerLine(server: ServerDef, event: ServerEvent, recent: readonly string[], pick: (n: number) => number): ServerLine {
  const lines = server.dialogue[event];
  const fresh = lines.filter((l) => !recent.includes(l.id));
  const pool = fresh.length ? fresh : lines;
  return pool[pick(pool.length)];
}
