import { DESERT_ROSE, desertRoseSeason } from '../career/championships';
import type { TrophyDefinitionId, TrophyInstance } from '../core/types';

export type TrophyStyle = 'medal' | 'state_cup' | 'pro_cup' | 'card_plaque' | 'epson_cup' | 'lpga_cup' | 'major_cup' | 'albatross_ball' | 'albatross_plaque' | 'pink_jacket';

export interface TrophyDefinition {
  id: TrophyDefinitionId;
  name: string;
  /** Career milestone description shown in the details panel. */
  milestone: string;
  /** Visual style used by the renderer. */
  style: TrophyStyle;
  purchasable: false;
}

export const TROPHY_DEFINITIONS: Record<TrophyDefinitionId, TrophyDefinition> = {
  amateur_win: {
    id: 'amateur_win',
    name: 'Amateur Champion',
    milestone: 'Won an event on the Amateur Circuit.',
    style: 'medal',
    purchasable: false,
  },
  state_amateur: {
    id: 'state_amateur',
    name: 'State Amateur',
    milestone: 'Won the State Amateur Championship.',
    style: 'state_cup',
    purchasable: false,
  },
  pro_series_win: {
    id: 'pro_series_win',
    name: 'Pro Series Winner',
    milestone: 'Won a professional event on the SoCal Pro Series.',
    style: 'pro_cup',
    purchasable: false,
  },
  qschool_card: {
    id: 'qschool_card',
    name: 'PGA Tour Card',
    milestone: 'Finished inside the top 20 at Q-School Final Stage to earn a PGA Tour card.',
    style: 'card_plaque',
    purchasable: false,
  },
  epson_win: {
    id: 'epson_win',
    name: 'Korn Ferry Tour Winner',
    milestone: 'Won an event on the Korn Ferry Tour.',
    style: 'epson_cup',
    purchasable: false,
  },
  lpga_win: {
    id: 'lpga_win',
    name: 'PGA Tour Winner',
    milestone: 'Won an event on the PGA Tour.',
    style: 'lpga_cup',
    purchasable: false,
  },
  major_win: {
    id: 'major_win',
    name: 'Major Champion',
    milestone: 'Won one of the four majors.',
    style: 'major_cup',
    purchasable: false,
  },
  albatross_first: {
    id: 'albatross_first',
    name: 'Albatross Ball',
    milestone: 'Made a first career albatross: three under par on one hole.',
    style: 'albatross_ball',
    purchasable: false,
  },
  albatross_five: {
    id: 'albatross_five',
    name: 'Five Albatross Plaque',
    milestone: 'Made five career albatrosses.',
    style: 'albatross_plaque',
    purchasable: false,
  },
};

/** Albatross milestones that come with a clubhouse trophy. */
export const ALBATROSS_TROPHIES: { count: number; defId: TrophyDefinitionId }[] = [
  { count: 1, defId: 'albatross_first' },
  { count: 5, defId: 'albatross_five' },
];

/** One trophy per milestone per golfer. */
export function milestoneTrophyId(ownerId: string, defId: TrophyDefinitionId): string {
  return `trophy:${ownerId}:milestone:${defId}`;
}

export const TROPHY_DEFINITION_IDS = Object.keys(TROPHY_DEFINITIONS) as TrophyDefinitionId[];

/** One trophy per tournament per golfer. */
export function trophyInstanceId(ownerId: string, tournamentId: string): string {
  return `trophy:${ownerId}:${tournamentId}`;
}

/**
 * How a trophy is shown. A Desert Rose Invitational championship trophy won in
 * phase 3 is a Pink Jacket (Career Legacy V1): same stored `major_win` trophy,
 * one per championship, presented as the jacket. Stored trophies are never changed.
 */
/** A Pink Jacket: a Desert Rose Invitational trophy won while Ryan was in phase 3 (stamped at award). */
type JacketCheck = Pick<TrophyInstance, 'trophyDefinitionId' | 'sourceTournamentId'> & { metadata?: Record<string, unknown> };
export const isPinkJacket = (t: JacketCheck) =>
  t.trophyDefinitionId === 'major_win' && desertRoseSeason(t.sourceTournamentId) !== null && t.metadata?.pinkJacket === true;

export function trophyLook(t: JacketCheck & Pick<TrophyInstance, 'eventName' | 'courseName'>): { name: string; style: TrophyStyle; milestone: string; eventName: string; venue: string } {
  const def = TROPHY_DEFINITIONS[t.trophyDefinitionId];
  if (isPinkJacket(t)) {
    return {
      name: DESERT_ROSE.award,
      style: 'pink_jacket',
      milestone: `Won ${DESERT_ROSE.name}, the season's first major.`,
      // Results keep the name they were played under; earlier seasons played it as a placeholder name.
      eventName: t.eventName === DESERT_ROSE.name ? t.eventName : `${DESERT_ROSE.name} (played as ${t.eventName})`,
      venue: `${DESERT_ROSE.venue} (${t.courseName} course)`,
    };
  }
  return { name: def.name, style: def.style, milestone: def.milestone, eventName: t.eventName, venue: t.courseName };
}
