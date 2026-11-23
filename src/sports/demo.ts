/**
 * SPORTSBOOK DEMO DATA (Phase 1 visual slice). NOT the sports engine.
 *
 * Fixed, deterministic placeholder content so the lounge UI can be built and reviewed:
 * the four original leagues and their working team names (SPORTSBOOK_DESIGN.md §4,
 * pending a clearance check), plus demo matchups, lines, scores, standings, news and
 * history. Every value here is illustrative and tagged demo; nothing is saved or bet.
 * The real engine (Phase 2) and odds (Phase 3) replace this module.
 */
import { hashString } from '../golf/math';

export const DEMO = true as const;

export type LeagueId = 'gdc' | 'ccl' | 'igl' | 'fhl';
export type Sport = 'baseball' | 'basketball' | 'football' | 'hockey';

export interface DemoTeam {
  id: string;
  league: LeagueId;
  city: string;
  name: string;
  short: string;
  colors: [string, string];
  /** Demo strength 40-90 (hashed from the id; not the engine's ratings). */
  rating: number;
}

export interface LeagueDef {
  id: LeagueId;
  name: string;
  short: string;
  sport: Sport;
  /** Spread name and the scoring unit. */
  spreadName: string;
  unit: string;
  /** Demo typical total (both teams) and spread scale. */
  baseTotal: number;
  spreadScale: number;
  /** Fixed run/puck line (baseball, hockey) or null for a rating-based point spread. */
  fixedSpread: number | null;
}

export const LEAGUES: readonly LeagueDef[] = [
  { id: 'gdc', name: 'Grand Diamond Circuit', short: 'GDC', sport: 'baseball', spreadName: 'Run line', unit: 'runs', baseTotal: 8.5, spreadScale: 1, fixedSpread: 1.5 },
  { id: 'ccl', name: 'Crown Court League', short: 'CCL', sport: 'basketball', spreadName: 'Spread', unit: 'points', baseTotal: 214.5, spreadScale: 0.35, fixedSpread: null },
  { id: 'igl', name: 'Iron Gridiron League', short: 'IGL', sport: 'football', spreadName: 'Spread', unit: 'points', baseTotal: 44.5, spreadScale: 0.28, fixedSpread: null },
  { id: 'fhl', name: 'Frostline Hockey League', short: 'FHL', sport: 'hockey', spreadName: 'Puck line', unit: 'goals', baseTotal: 5.5, spreadScale: 1, fixedSpread: 1.5 },
];

const T = (league: LeagueId, city: string, name: string, short: string, c1: string, c2: string): DemoTeam => {
  const id = `${league}_${short.toLowerCase()}`;
  return { id, league, city, name, short, colors: [c1, c2], rating: 40 + (hashString(`demo-rating:${id}`) % 51) };
};

export const TEAMS: readonly DemoTeam[] = [
  T('gdc', 'Port Halcyon', 'Lamplighters', 'PHL', '#1d2f6b', '#c9a24a'),
  T('gdc', 'Copper Flats', 'Ore Haulers', 'CFO', '#b8642c', '#2b2b2b'),
  T('gdc', 'Saguaro Bay', 'Gilas', 'SBG', '#e2701d', '#141414'),
  T('gdc', 'Riverbend', 'Paddlers', 'RBP', '#1f8a8a', '#f4f4f4'),
  T('gdc', 'Cinder Peak', 'Firebirds', 'CPF', '#c41f2a', '#f2c230'),
  T('gdc', 'Lake Verity', 'Loons', 'LVL', '#1f4d2b', '#efe6cc'),
  T('gdc', 'North Marigold', 'Millers', 'NMM', '#d9b86a', '#5a3a1e'),
  T('gdc', 'Tidewater', 'Kingfishers', 'TWK', '#2050c0', '#f08a24'),
  T('ccl', 'Neon Coast', 'Voltage', 'NCV', '#1e7bff', '#0b0b0b'),
  T('ccl', 'Silver Mesa', 'Monsoon', 'SMM', '#b8bcc6', '#5b3a8c'),
  T('ccl', 'Harbor City', 'Anchors', 'HCA', '#14285a', '#c8202f'),
  T('ccl', 'Juniper Falls', 'Jackrabbits', 'JFJ', '#8aa27a', '#c9a77a'),
  T('ccl', 'Calderon Heights', 'Comets', 'CHC', '#5d2a8e', '#f4f4f4'),
  T('ccl', 'Dune Hollow', 'Dustdevils', 'DHD', '#d8b879', '#9a3c1c'),
  T('ccl', 'Ironvale', 'Forge', 'IVF', '#6f7783', '#ef7a1a'),
  T('ccl', 'Starlight Junction', 'Satellites', 'SJS', '#111111', '#2fd5e8'),
  T('igl', 'Badlands', 'Thunderherd', 'BLT', '#6a4022', '#e0b02c'),
  T('igl', 'Coastal Reach', 'Undertow', 'CRU', '#2e8b6e', '#132a52'),
  T('igl', 'Redrock Canyon', 'Rockslides', 'RCR', '#a8432b', '#8a8f96'),
  T('igl', 'Prairie Crown', 'Harvesters', 'PCH', '#d6a92a', '#2c6b2f'),
  T('igl', 'Summit Ridge', 'Highlanders', 'SRH', '#1f6a3a', '#f4f4f4'),
  T('igl', 'Gulfshore', 'Squall', 'GSS', '#35b6c4', '#6e7681'),
  T('igl', 'Ember Valley', 'Smokejumpers', 'EVS', '#ef6c1a', '#1a1a1a'),
  T('igl', 'Old Mill', 'Ironclads', 'OMI', '#5d6670', '#a3162a'),
  T('fhl', 'Glacier Point', 'Polars', 'GPP', '#f4f8ff', '#7ab8e8'),
  T('fhl', 'Northwind', 'Narwhals', 'NWN', '#1f8c8c', '#c0c6cc'),
  T('fhl', 'Pinecrest', 'Sawblades', 'PCS', '#1f5d32', '#8f9aa3'),
  T('fhl', 'Aurora Bay', 'Borealis', 'ABB', '#27a35a', '#7b3fb5'),
  T('fhl', 'Ice Harbor', 'Floes', 'IHF', '#eef3fb', '#16305e'),
  T('fhl', 'Frostfield', 'Yetis', 'FFY', '#f4f4f4', '#5a2d8c'),
  T('fhl', 'Steelport', 'Rivets', 'SPR', '#7b838c', '#f2c71b'),
  T('fhl', 'Crystal Lake', 'Snowowls', 'CLS', '#fafafa', '#c9a24a'),
];

export const teamById = (id: string) => TEAMS.find((t) => t.id === id)!;
export const teamsOf = (league: LeagueId) => TEAMS.filter((t) => t.league === league);
export const leagueById = (id: LeagueId) => LEAGUES.find((l) => l.id === id)!;

// ── Demo odds: a simple logistic on demo ratings, plus a demo margin. Illustrative only. ──
export const DEMO_MARGIN = 0.045;
const HOME_EDGE = 3;

/** American odds from a probability that already includes the margin. */
export function toAmerican(p: number): number {
  const raw = p >= 0.5 ? -(p / (1 - p)) * 100 : ((1 - p) / p) * 100;
  const step = Math.abs(raw) >= 200 ? 10 : 5;
  return Math.round(raw / step) * step;
}
export const decimalOf = (american: number) => (american > 0 ? 1 + american / 100 : 1 + 100 / -american);
export const fmtAmerican = (a: number) => (a > 0 ? `+${a}` : `${a}`);

export type Side = 'home' | 'away' | 'over' | 'under';
export type Market = 'moneyline' | 'spread' | 'total';

export interface DemoLine {
  market: Market;
  side: Side;
  /** Spread or total number (null for moneyline). */
  point: number | null;
  american: number;
}

export interface DemoGame {
  id: string;
  league: LeagueId;
  home: string;
  away: string;
  /** Demo kickoff label, e.g. "Thu 7:05 PM". */
  when: string;
  homeWinProb: number;
  lines: DemoLine[];
}

const WHEN = ['Thu 7:05 PM', 'Fri 6:40 PM', 'Sat 1:10 PM', 'Sun 4:25 PM'];

/** This week's demo slate: 4 games per league (every team plays once). */
export function demoSlate(league: LeagueId): DemoGame[] {
  const L = leagueById(league);
  const teams = teamsOf(league);
  const order = [...teams].sort((a, b) => (hashString(`slate:${a.id}`) % 997) - (hashString(`slate:${b.id}`) % 997));
  const games: DemoGame[] = [];
  for (let i = 0; i < 4; i++) {
    const home = order[i * 2];
    const away = order[i * 2 + 1];
    const diff = home.rating + HOME_EDGE - away.rating;
    const p = 1 / (1 + Math.pow(10, -diff / 40));
    const ph = p * (1 + DEMO_MARGIN / 2);
    const pa = (1 - p) * (1 + DEMO_MARGIN / 2);
    const spread = L.fixedSpread ?? Math.max(0.5, Math.round(Math.abs(diff) * L.spreadScale * 2) / 2);
    const favHome = diff >= 0;
    const total = L.baseTotal + (((hashString(`total:${home.id}:${away.id}`) % 7) - 3) * (L.sport === 'basketball' ? 2 : L.sport === 'football' ? 1 : 0.5));
    games.push({
      id: `demo:${league}:${home.short}-${away.short}`,
      league,
      home: home.id,
      away: away.id,
      when: WHEN[i],
      homeWinProb: p,
      lines: [
        { market: 'moneyline', side: 'home', point: null, american: toAmerican(Math.min(0.97, ph)) },
        { market: 'moneyline', side: 'away', point: null, american: toAmerican(Math.min(0.97, pa)) },
        { market: 'spread', side: 'home', point: favHome ? -spread : spread, american: -110 },
        { market: 'spread', side: 'away', point: favHome ? spread : -spread, american: -110 },
        { market: 'total', side: 'over', point: total, american: -110 },
        { market: 'total', side: 'under', point: total, american: -110 },
      ],
    });
  }
  return games;
}

// ── Demo results, standings, news, history (static placeholders). ──
export interface DemoFinal { league: LeagueId; home: string; away: string; hs: number; as: number; note?: string }

export function demoScores(league: LeagueId): DemoFinal[] {
  const L = leagueById(league);
  const teams = teamsOf(league);
  return [0, 1, 2, 3].map((i) => {
    const home = teams[(i * 3) % 8];
    const away = teams[(i * 3 + 5) % 8];
    const h = hashString(`score:${home.id}:${away.id}`);
    const base = Math.round(L.baseTotal / 2);
    const spreadUnits = L.sport === 'basketball' ? 18 : L.sport === 'football' ? 14 : 4;
    const hs = Math.max(0, base + ((h % (spreadUnits * 2 + 1)) - spreadUnits) / 2 | 0);
    const as = Math.max(0, base + (((h >>> 8) % (spreadUnits * 2 + 1)) - spreadUnits) / 2 | 0);
    return { league, home: home.id, away: away.id, hs: hs === as ? hs + 1 : hs, as, note: L.sport === 'hockey' && h % 5 === 0 ? 'OT' : undefined };
  });
}

export interface DemoStanding { team: string; w: number; l: number; streak: string }
export function demoStandings(league: LeagueId): DemoStanding[] {
  return teamsOf(league)
    .map((t) => {
      const w = Math.round(((t.rating - 40) / 50) * 12) + 2;
      return { team: t.id, w, l: 14 - w, streak: `${hashString(`streak:${t.id}`) % 2 ? 'W' : 'L'}${1 + (hashString(`len:${t.id}`) % 4)}` };
    })
    .sort((a, b) => b.w - a.w || a.team.localeCompare(b.team));
}

export interface DemoNews { league: LeagueId; headline: string; body: string; tag: 'result' | 'injury' | 'trade' | 'milestone' }
export function demoNews(): DemoNews[] {
  const t = (id: string) => { const x = teamById(id); return `${x.city} ${x.name}`; };
  return [
    { league: 'ccl', tag: 'result', headline: `${t('ccl_ncv')} rally late`, body: 'A 14-2 closing run settles it in the final two minutes. (Demo story.)' },
    { league: 'fhl', tag: 'injury', headline: `${t('fhl_gpp')} goalie day-to-day`, body: 'Lower-body injury in the second period; listed as questionable. (Demo story.)' },
    { league: 'gdc', tag: 'milestone', headline: `${t('gdc_cpf')} ace reaches 100 strikeouts`, body: 'Fastest to the mark in club history. (Demo story.)' },
    { league: 'igl', tag: 'trade', headline: `${t('igl_pch')} add a veteran lineman`, body: 'A depth move ahead of the playoff push. (Demo story.)' },
  ];
}

export interface DemoChampion { league: LeagueId; season: string; team: string; mvp: string }
export function demoHistory(): DemoChampion[] {
  const names = ['R. Okonkwo', 'D. Haverford', 'M. Castellano', 'J. Lindqvist', 'T. Abernathy', 'S. Navarre', 'K. Odegaard', 'L. Whitcombe'];
  return LEAGUES.flatMap((L, li) =>
    [2024, 2025, 2026].map((y, yi) => ({ league: L.id, season: String(y), team: teamsOf(L.id)[(li * 3 + yi * 5) % 8].id, mvp: names[(li + yi * 3) % names.length] })),
  );
}
