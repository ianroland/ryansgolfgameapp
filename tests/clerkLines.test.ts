import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CLERK_LINES, clerkLine, historyLines, liveLines } from '../src/sports/clerks/lines';
import { EMMETT_LINES } from '../src/sports/clerks/emmett';
import { lore } from '../src/sports/lore/service';

describe('sportsbook clerk lines (Emmett Okafor)', () => {
  it('every history line cites real events in its own league, and ids are unique', () => {
    expect(new Set(EMMETT_LINES.map((l) => l.id)).size).toBe(EMMETT_LINES.length);
    for (const l of EMMETT_LINES) {
      expect(l.events.length, l.id).toBeGreaterThan(0);
      for (const id of l.events) expect(lore.event(id)?.league, `${l.id} → ${id}`).toBe(l.league);
    }
    // Every anchor event gets at least one line.
    for (const e of ['gdc-1972-001', 'gdc-1983-001', 'gdc-1998-001', 'gdc-2011-001', 'ccl-1974-001', 'ccl-1987-001', 'ccl-1996-001', 'ccl-2008-001', 'igl-1976-001', 'igl-1985-001', 'igl-1994-001', 'igl-2016-001', 'fhl-1978-001', 'fhl-1989-001', 'fhl-2002-001', 'fhl-2019-001'])
      expect(EMMETT_LINES.some((l) => l.events.includes(e)), e).toBe(true);
  });

  it('lines are short one-liners', () => {
    for (const l of EMMETT_LINES) expect(l.text.length, l.id).toBeLessThanOrEqual(100);
  });

  it('honours the canon rules', () => {
    const all = EMMETT_LINES.map((l) => l.text).join('\n');
    expect(all).not.toMatch(/New Orleans (officially )?won/i);
    for (const l of EMMETT_LINES.filter((x) => x.events.includes('gdc-2011-001'))) expect(l.text, l.id).toMatch(/no (proof|evidence)/i);
    expect(all).not.toMatch(/24 (wins|games)/);
    expect(all).toMatch(/13–1/); // Voss, owner decision
    // King and Mercer are never placed on a team.
    for (const l of EMMETT_LINES.filter((x) => /King|Mercer/.test(x.text))) expect(l.text).not.toMatch(/King (of|for|with) (the )?(Comets|Voltage|Chicago|Los Angeles)|Mercer (of|for|with)/);
  });

  it('nobody knows the future: lines only appear once their events are history', () => {
    expect(historyLines('emmett_okafor', 'ccl', 2027).map((l) => l.id)).toContain('em.ccl.vegas-1996');
    expect(historyLines('emmett_okafor', 'ccl', 1996).map((l) => l.id)).not.toContain('em.ccl.vegas-1996');
    expect(historyLines('emmett_okafor', 'fhl', 2019).map((l) => l.id)).not.toContain('em.fhl.burlington');
    expect(historyLines('emmett_okafor', 'ccl', 2010).map((l) => l.id)).not.toContain('em.ccl.bellamy'); // spans to 2012
  });

  it('mixes history with the live board, deterministically', () => {
    const ctx = { seed: 4242, season: 1, week: 5, league: 'gdc' as const };
    const seen = Array.from({ length: 9 }, (_, i) => clerkLine('emmett_okafor', { ...ctx, nonce: i })!);
    expect(seen.map((l) => l.id)).toEqual(Array.from({ length: 9 }, (_, i) => clerkLine('emmett_okafor', { ...ctx, nonce: i })!.id));
    expect(seen.filter((l) => l.events.length).length).toBe(6);
    expect(seen.filter((l) => l.id.startsWith('live.')).length).toBe(3);
    const live = liveLines(4242, 1, 5, 'gdc');
    expect(live.some((l) => l.id === 'live.gdc.leader')).toBe(true);
    expect(liveLines(4242, 1, 1, 'igl').map((l) => l.id)).toEqual(['live.igl.fresh', 'live.igl.next']);
    expect(CLERK_LINES.unknown_clerk).toBeUndefined();
    expect(clerkLine('unknown_clerk', { ...ctx, nonce: 0 })!.id.startsWith('live.')).toBe(true);
  });

  it('clerk lines never touch money, odds, NPC relationships or drinks', () => {
    for (const f of ['src/sports/clerks/lines.ts', 'src/sports/clerks/emmett.ts']) expect(readFileSync(f, 'utf8'), f).not.toMatch(/services|persistence|economy|\.post\(|drink|npc\//);
  });
});
