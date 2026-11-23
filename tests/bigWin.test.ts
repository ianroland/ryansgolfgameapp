/** Big-win celebration tiers (presentation only). */
import { describe, expect, it } from 'vitest';
import { bigWinTier } from '../src/ui/casino/BigWin';

describe('big win tiers', () => {
  it('small wins and losses get nothing; big profit or a big multiple gets BIG; huge gets MEGA', () => {
    expect(bigWinTier(0, 10)).toBeNull();
    expect(bigWinTier(-50, 50)).toBeNull();
    expect(bigWinTier(20, 20)).toBeNull(); // even money
    expect(bigWinTier(240, 240)).toBeNull();
    expect(bigWinTier(250, 250)).toBe('big'); // $250 profit
    expect(bigWinTier(90, 10)).toBe('big'); // 10× on a $10 bet
    expect(bigWinTier(40, 4)).toBeNull(); // 11× but only $40
    expect(bigWinTier(350, 10)).toBe('mega'); // roulette straight-up, 36×
    expect(bigWinTier(1000, 1000)).toBe('mega');
  });
});
