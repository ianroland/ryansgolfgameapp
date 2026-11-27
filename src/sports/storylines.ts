/**
 * Scripted storylines in the living sports universe. Same in every save, like canon.
 *
 * Mason Vale (owner, 2026-11-27: "Vale retires but then comes back then gets seriously injured"):
 *  - retires after the 2027 season (kept on file while he's away, not deleted);
 *  - comes back to his team for 2029 (the team's weakest quarterback goes to the reserves);
 *  - is seriously injured six games into 2029 and misses the rest of it, playoffs included.
 * A save whose sports world was already past the 2027 off-season when this shipped keeps Vale active
 * (no retirement or comeback) but still has the 2029 injury, so the injury note doesn't mention a comeback.
 * He's still on the roster for 2030; from then on the ordinary aging and retirement rules apply to him.
 */
export const VALE = 'igl_mason_vale';

export const VALE_ARC = {
  retireAfter: 2027,
  returnFor: 2029,
  injuredIn: 2029,
  /** His team's game count when he goes down (he plays this game and is hurt in it). */
  injuredInGame: 6,
} as const;

/** Season-ending: longer than any regular season plus playoffs. */
export const SEASON_ENDING = 99;

export type StorylineKind = 'retired' | 'comeback' | 'injured';

export interface Storyline {
  i: string;
  n: string;
  t: string;
  kind: StorylineKind;
  age: number;
  note: string;
}

/** The season engine numbers seasons from 1 (= 2027); storylines use calendar years. */
export const STORY_YEAR_OF_SEASON = (season: number) => 2026 + season;

/** A scripted injury for this player in this engine season (1 = 2027), if any. */
export function scriptedInjury(playerId: string, season: number): { afterGame: number; games: number } | null {
  if (playerId === VALE && STORY_YEAR_OF_SEASON(season) === VALE_ARC.injuredIn) return { afterGame: VALE_ARC.injuredInGame, games: SEASON_ENDING };
  return null;
}

/** Off-season copy for the history board. */
export const STORYLINE_NOTE: Record<StorylineKind, (name: string, team: string) => string> = {
  retired: (n, t) => `${n} retires from the ${t}. He says he's done. Nobody in the building believes him.`,
  comeback: (n, t) => `${n} is back. The ${t} bring their old quarterback home after a year away.`,
  injured: (n, t) => `${n} goes down six games into the season: a serious injury, out for the rest of the year, playoffs included. The ${t} say it's too early to talk about next season.`,
};
