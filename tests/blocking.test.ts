import { describe, expect, it } from 'vitest';
import { encounterMayShow, encounterShouldAutoOpen, openBlockingScreens, registerBlocking, type ScreenState } from '../src/ui/blocking';

const idle: ScreenState = { tournamentScreen: false, storyPending: false, openScreens: [] };

describe('one blocking screen at a time (regression: encounter opened over a story result)', () => {
  it('an encounter never opens over a story question, a story result, a tournament screen or a dialog', () => {
    expect(encounterMayShow(idle)).toBe(true);
    expect(encounterMayShow({ ...idle, storyPending: true })).toBe(false);
    // The bug: pendingStory is already cleared while the story's result screen is still up.
    expect(encounterMayShow({ ...idle, openScreens: ['story'] })).toBe(false);
    expect(encounterMayShow({ ...idle, tournamentScreen: true })).toBe(false);
    expect(encounterMayShow({ ...idle, openScreens: ['dialog:Enter'] })).toBe(false);
  });

  it('auto-opens a new offer once, only when the way is clear', () => {
    expect(encounterShouldAutoOpen(idle, 'gold_plated_driver', null)).toBe(true);
    expect(encounterShouldAutoOpen(idle, 'gold_plated_driver', 'gold_plated_driver')).toBe(false);
    expect(encounterShouldAutoOpen(idle, null, null)).toBe(false);
    expect(encounterShouldAutoOpen({ ...idle, openScreens: ['story'] }, 'gold_plated_driver', null)).toBe(false);
  });

  it('the registry tracks screens by id, counts repeats, and clears on close', () => {
    const before = openBlockingScreens().length;
    const closeStory = registerBlocking('story');
    const closeA = registerBlocking('dialog:X');
    const closeB = registerBlocking('dialog:X');
    expect(openBlockingScreens()).toEqual(expect.arrayContaining(['story', 'dialog:X']));
    closeA();
    expect(openBlockingScreens()).toContain('dialog:X'); // one still open
    closeB();
    closeStory();
    expect(openBlockingScreens()).toHaveLength(before);
  });
});
