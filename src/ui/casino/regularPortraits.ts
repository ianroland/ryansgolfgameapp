/**
 * Portrait slots for the craps regulars. Files dropped at
 * src/assets/casino/npcs/regulars/<regular id>/<neutral|happy|groan>.png are used automatically
 * (spec: docs/npc-factory/CRAPS_REGULARS_PORTRAITS.md). A missing face falls back to the neutral one,
 * then to the coloured initials on the rail; another NPC's face is never borrowed.
 */
import type { RegularFace } from './crapsRegulars';

const files = import.meta.glob<string>('../../assets/casino/npcs/regulars/*/*.png', { eager: true, query: '?url', import: 'default' });

export function regularPortrait(id: string, face: RegularFace): string | null {
  const at = (f: string) => files[`../../assets/casino/npcs/regulars/${id}/${f}.png`] ?? null;
  return at(face) ?? at('neutral');
}
