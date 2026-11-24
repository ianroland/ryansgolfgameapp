import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decimalOf, demoSlate, LEAGUES, TEAMS, teamsOf, toAmerican } from '../src/sports/demo';
import { parlayCheck, potentialReturn, SLIP_RULES, stakeCheck, toggleSelection, type Selection } from '../src/sports/slip';
import { LOUNGES } from '../src/sports/themes';

const sel = (gameId: string, market: Selection['market'], side: Selection['side'], american = -110): Selection => ({ gameId, market, side, point: null, american, label: `${gameId} ${side}` });

describe('sportsbook demo data (Phase 1)', () => {
  it('four original leagues with eight uniquely named teams each', () => {
    expect(LEAGUES.map((l) => l.short)).toEqual(['GDC', 'CCL', 'IGL', 'FHL']);
    for (const l of LEAGUES) expect(teamsOf(l.id)).toHaveLength(8);
    expect(new Set(TEAMS.map((t) => t.id)).size).toBe(32);
    expect(new Set(TEAMS.map((t) => `${t.city} ${t.name}`)).size).toBe(32);
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
    // Only the three lounge backgrounds are installed; everything else stays missing.
    const installed = m.assets.filter((a: { status: string }) => a.status === 'installed').map((a: { id: string }) => a.id).sort();
    expect(installed).toEqual(['desert_palms.bg_lounge', 'morongo_sky.bg_lounge', 'white_buffalo.bg_lounge']);
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

  it('the demo slice never touches money, saves, NPC state or drinks', () => {
    const files = [
      ...readdirSync(join(__dirname, '../src/sports')).map((f) => join(__dirname, '../src/sports', f)),
      ...readdirSync(join(__dirname, '../src/ui/sportsbook')).map((f) => join(__dirname, '../src/ui/sportsbook', f)),
    ].filter((f) => /\.tsx?$/.test(f));
    for (const f of files) expect(readFileSync(f, 'utf8'), f).not.toMatch(/economyService|persistence|services\.|\bnpc\/|servers\/|drinks|\.post\(/);
  });
});
