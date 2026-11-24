import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { auditSeason } from '../src/sports/history/audit';
import type { HistoryData } from '../src/sports/history/data';
import { freeSeason, mergeForward } from '../src/sports/history/forward';
import { historySeason } from '../src/sports/history/games';
import { bundledLore } from '../src/sports/lore/service';

const read = (f: string) => JSON.parse(readFileSync(f, 'utf8'));
const data: HistoryData = { players: read('src/sports/history/data/players.json').players, seasons: read('src/sports/history/data/seasons.json').seasons };
const fwd = read('src/sports/history/data/forward.json');

describe('Phase F: every season and every game of the shared history passes the audit', () => {
  it('1972-2026: schedules, records, playoffs, player assignments, per-game arithmetic, event references', () => {
    const merged = mergeForward(data, fwd);
    const lore = new Set(bundledLore().events.map((e) => e.id));
    const issues: string[] = [];
    let games = 0;
    for (const s of [...data.seasons, ...fwd.seasons]) {
      const a = s.year <= 2025 ? auditSeason(data, historySeason(data, s), lore) : auditSeason(merged, freeSeason(merged, s), lore);
      issues.push(...a.issues);
      games += a.games + a.playoffGames;
    }
    expect(issues).toEqual([]);
    expect(games).toBeGreaterThan(25_000);
  }, 300_000);

  it('the audit catches a broken season', () => {
    const s = structuredClone(data.seasons.find((x) => x.id === 'ccl-1996')!);
    const h = historySeason(data, s);
    h.season = { ...h.season, champion: 'ccl_voltage' };
    h.regular[0] = { ...h.regular[0], away: h.regular[0].home };
    const a = auditSeason(data, h, new Set());
    expect(a.issues.some((x) => x.includes('final gives'))).toBe(true);
    expect(a.issues.some((x) => x.includes('teams'))).toBe(true);
    expect(a.issues.some((x) => x.includes('unknown event'))).toBe(true);
  }, 60_000);
});
