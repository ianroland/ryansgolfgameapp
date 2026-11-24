import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decimalOf, demoSlate, LEAGUES, SEASON_FORMAT, TEAMS, teamById, teamsOf, toAmerican } from '../src/sports/demo';
import { parlayCheck, potentialReturn, SLIP_RULES, stakeCheck, toggleSelection, type Selection } from '../src/sports/slip';
import { CLERK_EXPRESSIONS, LOUNGES } from '../src/sports/themes';

const sel = (gameId: string, market: Selection['market'], side: Selection['side'], american = -110): Selection => ({ gameId, market, side, point: null, american, label: `${gameId} ${side}` });

describe('sportsbook demo data (Phase 1)', () => {
  it('four original leagues with eight uniquely named teams each', () => {
    expect(LEAGUES.map((l) => l.short)).toEqual(['GDL', 'CBL', 'ALF', 'FHL']); // owner rename 2026-11-23; ids stay gdc/ccl/igl/fhl
    for (const l of LEAGUES) expect(teamsOf(l.id)).toHaveLength(8);
    expect(new Set(TEAMS.map((t) => t.id)).size).toBe(32);
    expect(new Set(TEAMS.map((t) => t.displayName)).size).toBe(32);
  });

  it('no team uses a major-league nickname (guard only; a full clearance check is still needed)', () => {
    const MAJOR = 'yankees red sox orioles rays blue jays white sox guardians tigers royals twins astros angels athletics mariners rangers braves marlins mets phillies nationals cubs reds brewers pirates cardinals diamondbacks rockies dodgers padres giants celtics nets knicks 76ers raptors bulls cavaliers pistons pacers bucks hawks hornets heat magic wizards nuggets timberwolves thunder trail blazers jazz warriors clippers lakers suns kings mavericks rockets grizzlies pelicans spurs bills dolphins patriots jets ravens bengals browns steelers texans colts jaguars titans broncos chiefs raiders chargers cowboys eagles commanders bears lions packers vikings falcons panthers saints buccaneers cardinals rams 49ers seahawks bruins sabres red wings canadiens senators lightning maple leafs hurricanes blue jackets devils islanders flyers penguins capitals blackhawks avalanche stars wild predators blues jets ducks flames oilers sharks kraken canucks golden knights utah'.split(' ');
    for (const t of TEAMS) expect(MAJOR.includes(t.name.toLowerCase()), t.name).toBe(false);
  });

  it('slates are deterministic, every team plays once, and lines carry the margin', () => {
    for (const l of LEAGUES) {
      const a = demoSlate(l.id);
      expect(a).toEqual(demoSlate(l.id));
      expect(new Set(a.flatMap((g) => [g.home, g.away])).size).toBe(8);
      for (const g of a) {
        const ml = g.lines.filter((x) => x.market === 'moneyline');
        const implied = ml.reduce((s, x) => s + 1 / decimalOf(x.american), 0);
        expect(implied, g.id).toBeGreaterThan(1);
      }
    }
  });

  it('American odds conversion round-trips sensibly', () => {
    expect(toAmerican(0.5)).toBe(-100);
    expect(decimalOf(150)).toBe(2.5);
    expect(decimalOf(-200)).toBe(1.5);
  });
});

describe('nationwide sports universe (approved 2026-11-23)', () => {
  const APPROVED: Record<string, string> = {
    gdc_lamplighters: 'Boston Lamplighters', gdc_ore_haulers: 'Pittsburgh Ore Haulers', gdc_gilas: 'Tucson Gilas', gdc_paddlers: 'St. Louis Paddlers',
    gdc_firebirds: 'Phoenix Firebirds', gdc_loons: 'Minneapolis Loons', gdc_millers: 'Milwaukee Millers', gdc_kingfishers: 'Charleston Kingfishers',
    ccl_voltage: 'Los Angeles Voltage', ccl_monsoon: 'Miami Monsoon', ccl_anchors: 'Baltimore Anchors', ccl_jackrabbits: 'Denver Jackrabbits',
    ccl_comets: 'Chicago Comets', ccl_dustdevils: 'Las Vegas Dustdevils', ccl_forge: 'Detroit Forge', ccl_satellites: 'Seattle Satellites',
    igl_thunderherd: 'Oklahoma City Thunderherd', igl_undertow: 'Jacksonville Undertow', igl_rockslides: 'Salt Lake City Rockslides', igl_harvesters: 'Omaha Harvesters',
    igl_highlanders: 'Asheville Highlanders', igl_squall: 'New Orleans Squall', igl_smokejumpers: 'Portland Smokejumpers', igl_ironclads: 'Cleveland Ironclads',
    fhl_polars: 'Anchorage Polars', fhl_narwhals: 'Providence Narwhals', fhl_sawblades: 'Buffalo Sawblades', fhl_borealis: 'Duluth Borealis',
    fhl_floes: 'Portland Floes (Maine)', fhl_yetis: 'Bozeman Yetis', fhl_rivets: 'Toledo Rivets', fhl_snowowls: 'Burlington Snowowls (Vermont)',
  };

  it('all 32 teams use the approved ids and full names, in their leagues', () => {
    expect(Object.fromEntries(TEAMS.map((t) => [t.id, t.displayName]))).toEqual(APPROVED);
    for (const t of TEAMS) expect(t.id.startsWith(`${t.league}_`)).toBe(true);
  });

  it('every team has a city and a two-letter state; the two Portlands are told apart', () => {
    for (const t of TEAMS) expect(t.state, t.id).toMatch(/^[A-Z]{2}$/);
    expect([teamById('igl_smokejumpers').city, teamById('igl_smokejumpers').state]).toEqual(['Portland', 'OR']);
    expect([teamById('fhl_floes').city, teamById('fhl_floes').state]).toEqual(['Portland', 'ME']);
    expect(new Set(TEAMS.map((t) => t.short)).size).toBe(32);
  });

  it('the rename kept every franchise: same nicknames, colours and demo strengths as before', () => {
    expect(teamById('gdc_lamplighters')).toMatchObject({ name: 'Lamplighters', colors: ['#1d2f6b', '#c9a24a'], legacyKey: 'gdc_phl' });
    expect(teamById('gdc_ore_haulers').name).toBe('Ore Haulers');
    expect(new Set(TEAMS.map((t) => t.legacyKey)).size).toBe(32);
  });

  it('approved season format: balanced, equal home and away against every opponent', () => {
    expect(SEASON_FORMAT).toEqual({
      baseball: { gamesPerTeam: 42, meetingsPerOpponent: 6 },
      basketball: { gamesPerTeam: 28, meetingsPerOpponent: 4 },
      football: { gamesPerTeam: 14, meetingsPerOpponent: 2 },
      hockey: { gamesPerTeam: 28, meetingsPerOpponent: 4 },
    });
    for (const f of Object.values(SEASON_FORMAT)) {
      expect(f.gamesPerTeam).toBe(7 * f.meetingsPerOpponent);
      expect(f.meetingsPerOpponent % 2).toBe(0);
    }
  });
});

describe('bet slip maths', () => {
  it('one pick per game and market; picking the other side swaps it; picking again removes it', () => {
    let s = toggleSelection([], sel('g1', 'moneyline', 'home'));
    s = toggleSelection(s, sel('g1', 'moneyline', 'away'));
    expect(s.map((x) => x.side)).toEqual(['away']);
    s = toggleSelection(s, sel('g1', 'moneyline', 'away'));
    expect(s).toEqual([]);
  });

  it('parlays need 2-6 legs from different games', () => {
    expect(parlayCheck([sel('a', 'moneyline', 'home')]).ok).toBe(false);
    expect(parlayCheck([sel('a', 'moneyline', 'home'), sel('a', 'total', 'over')]).ok).toBe(false);
    expect(parlayCheck([sel('a', 'moneyline', 'home'), sel('b', 'total', 'over')]).ok).toBe(true);
    expect(parlayCheck('abcdefg'.split('').map((g) => sel(g, 'moneyline', 'home'))).ok).toBe(false);
  });

  it('returns: singles add up, parlays multiply, and the cap applies', () => {
    const two = [sel('a', 'moneyline', 'home', 100), sel('b', 'moneyline', 'home', 100)];
    expect(potentialReturn(two, 10, false)).toBe(40);
    expect(potentialReturn(two, 10, true)).toBe(40);
    const six = 'abcdef'.split('').map((g) => sel(g, 'moneyline', 'home', 900));
    expect(potentialReturn(six, 100, true)).toBe(Math.min(100 * SLIP_RULES.capMultiple, SLIP_RULES.capAmount));
  });

  it('stake limits and bankroll', () => {
    expect(stakeCheck(4, 1, false, 1000).ok).toBe(false);
    expect(stakeCheck(SLIP_RULES.maxStake + 5, 1, false, 99999).ok).toBe(false);
    expect(stakeCheck(50, 3, false, 100).ok).toBe(false);
    expect(stakeCheck(50, 3, true, 100).ok).toBe(true);
  });
});

describe('lounge themes and the sandbox boundary', () => {
  it('every casino has a complete theme; only Desert Palms is playable in this slice', () => {
    for (const t of Object.values(LOUNGES)) {
      expect(Object.keys(t.tokens).sort()).toEqual(['accent', 'bg1', 'bg2', 'crt', 'crtText', 'neon', 'panel', 'trim']);
    }
    expect(Object.values(LOUNGES).filter((t) => t.playable).map((t) => t.location)).toEqual(['desert_palms']);
  });

  it('the asset manifest lists every required asset with exact sizes', () => {
    const m = JSON.parse(readFileSync(join(__dirname, '../src/assets/sportsbook/manifest.json'), 'utf8'));
    const bg = m.assets.filter((a: { id: string }) => a.id.endsWith('.bg_lounge'));
    expect(bg.map((a: { width: number; height: number }) => [a.width, a.height])).toEqual([[1672, 941], [1672, 941], [1672, 941]]);
    expect(m.assets.find((a: { id: string }) => a.id === 'team_crests').count).toBe(32);
    // Installed: the three lounge backgrounds and the Desert Palms clerk. Everything else stays missing.
    const installed = m.assets.filter((a: { status: string }) => a.status === 'installed').map((a: { id: string }) => a.id).sort();
    expect(installed).toEqual(['desert_palms.bg_lounge', 'desert_palms.clerk', 'morongo_sky.bg_lounge', 'white_buffalo.bg_lounge']);
    // Logos and crests are deferred: teams use colour squares for now.
    const deferred = m.assets.filter((a: { status: string }) => a.status === 'deferred').map((a: { id: string }) => a.id).sort();
    expect(deferred).toEqual(['league_logos', 'team_crests']);
  });

  it('the installed backgrounds are 1672x941 opaque PNGs and each casino theme points at its own', () => {
    for (const loc of ['desert_palms', 'white_buffalo', 'morongo_sky'] as const) {
      const buf = readFileSync(join(__dirname, `../src/assets/sportsbook/${loc}/bg_lounge.png`));
      expect(buf.subarray(0, 8).toString('hex'), loc).toBe('89504e470d0a1a0a');
      // IHDR: width, height, then colour type 2 (RGB, no alpha channel) with no tRNS chunk = opaque.
      expect([buf.readUInt32BE(16), buf.readUInt32BE(20)], loc).toEqual([1672, 941]);
      expect(buf[25], loc).toBe(2);
      expect(buf.includes(Buffer.from('tRNS')), loc).toBe(false);
      expect(LOUNGES[loc].art.background, loc).toContain(`${loc}/bg_lounge`);
    }
  });

  it('the live UI layout sits inside the 1672x941 art', async () => {
    const { LOUNGE_LAYOUT } = await import('../src/sports/themes');
    const rects = [...LOUNGE_LAYOUT.screens, LOUNGE_LAYOUT.board, LOUNGE_LAYOUT.clerk, LOUNGE_LAYOUT.content, LOUNGE_LAYOUT.slip];
    for (const [x, y, w, h] of rects) expect(x >= 0 && y >= 0 && x + w <= 1672 && y + h <= 941).toBe(true);
  });

  it('sports code never touches money, saves, NPC state or drinks; the lounge reaches money only via services.sportsbook', () => {
    const sports = readdirSync(join(__dirname, '../src/sports')).filter((f) => /\.tsx?$/.test(f)).map((f) => join(__dirname, '../src/sports', f));
    for (const f of sports) expect(readFileSync(f, 'utf8'), f).not.toMatch(/economyService|persistence|services\.|\bnpc\/|servers\/|drinks|\.post\(/);
    const ui = readdirSync(join(__dirname, '../src/ui/sportsbook')).filter((f) => /\.tsx?$/.test(f)).map((f) => join(__dirname, '../src/ui/sportsbook', f));
    for (const f of ui) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/economyService|persistence|\bnpc\/|servers\/|drinks|\.post\(/);
      for (const m of src.matchAll(/services\.(\w+)/g)) expect(m[1], f).toBe('sportsbook');
    }
  });
});

describe('Desert Palms sportsbook clerk (Emmett Okafor)', () => {
  it('has all six NPC Factory portraits, 256x256 with transparency', () => {
    for (const e of CLERK_EXPRESSIONS) {
      const buf = readFileSync(`src/assets/sportsbook/desert_palms/clerk_${e}.png`);
      expect(buf.readUInt32BE(16), e).toBe(256);
      expect(buf.readUInt32BE(20), e).toBe(256);
      expect(buf[25], `${e} colour type RGBA`).toBe(6);
    }
  });

  it('only Desert Palms has a clerk; the other lounges keep the placeholder', () => {
    expect(LOUNGES.desert_palms.art.clerk?.npcId).toBe('emmett_okafor');
    expect(LOUNGES.desert_palms.art.clerk?.name).toBe('Emmett Okafor');
    expect(Object.keys(LOUNGES.desert_palms.art.clerk!.portraits).sort()).toEqual([...CLERK_EXPRESSIONS].sort());
    expect(LOUNGES.white_buffalo.art.clerk).toBeNull();
    expect(LOUNGES.morongo_sky.art.clerk).toBeNull();
  });
});
