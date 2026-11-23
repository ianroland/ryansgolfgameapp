/**
 * Trophy awards. Subscribes to `tournament_completed` career events on the
 * authoritative pipeline; there is no other way to create a trophy.
 *
 * Idempotency: a trophy's ID is `trophy:<golfer>:<tournament>`, the table's
 * primary key, so one tournament can never award two trophies.
 */
import { TROPHY_DEFINITIONS, trophyInstanceId } from '../catalog/trophies';
import { resultCourse, type TournamentResult } from '../career/tournament';
import { QSERIES_LPGA_CARDS, TOURS } from '../career/config';
import { desertRoseSeason } from '../career/championships';
import { storyOf } from '../story/appearance';
import type { CareerEvent, GolferId, TrophyDefinitionId, TrophyInstance } from '../core/types';
import type { TournamentPipeline } from './tournamentPipeline';

/** Which trophy (if any) this result earns for the golfer. */
export function evaluateTrophy(result: TournamentResult, golferId: GolferId): TrophyDefinitionId | null {
  const s = result.standings.find((x) => x.id === golferId);
  if (!s || !s.madeCut) return null;
  const def = result.def;
  if (def.tour === 'qschool') return def.qStage === 3 && s.position <= QSERIES_LPGA_CARDS ? 'qschool_card' : null;
  if (s.position !== 1) return null;
  // A tie for first isn't a win: there must be a unique leader.
  if (result.standings.filter((x) => x.position === 1).length > 1) return null;
  switch (def.tour) {
    case 'amateur':
      return def.special ? 'state_amateur' : 'amateur_win';
    case 'mini':
      return 'pro_series_win';
    case 'epson':
      return 'epson_win';
    case 'lpga':
      return def.special ? 'major_win' : 'lpga_win';
  }
}

export function buildTrophyInstance(defId: TrophyDefinitionId, result: TournamentResult, event: CareerEvent, golferId: GolferId): TrophyInstance {
  const def = TROPHY_DEFINITIONS[defId];
  const me = result.standings.find((s) => s.id === golferId)!;
  const runnerUp = result.standings.find((s) => s.id !== golferId && s.position > me.position && s.madeCut) ?? null;
  return {
    id: trophyInstanceId(golferId, result.tournamentId),
    ownerId: golferId,
    trophyDefinitionId: defId,
    sourceTournamentId: result.tournamentId,
    sourceCareerEventId: event.id,
    eventName: result.def.name,
    tourName: TOURS[result.def.tour].name,
    courseName: resultCourse(result).name,
    earnedAt: result.finalizedAt,
    finish: {
      position: me.position,
      posLabel: me.posLabel,
      toPar: me.toPar,
      total: me.total,
      rounds: me.rounds,
      fieldSize: result.standings.length,
    },
    prize: me.prize,
    runnerUp: runnerUp ? `${runnerUp.name} (${runnerUp.posLabel})` : null,
    metadata: {
      milestone: def.milestone,
      season: result.def.season,
      week: result.def.week,
      engineVersion: result.authority.engineVersion,
    },
  };
}

export function registerTrophyAwards(pipeline: TournamentPipeline): () => void {
  return pipeline.subscribe('tournament_completed', async ({ db, event, result, golferId }) => {
    const defId = evaluateTrophy(result, golferId);
    if (!defId) return {};
    const trophy = buildTrophyInstance(defId, result, event, golferId);
    if (await db.trophies.get(trophy.id)) return {};
    // The Pink Jacket: a Desert Rose Invitational win on the top tour while Ryan is in phase 3 (Act III+).
    // Recorded on the trophy when it is awarded, from the authoritative career state of that moment.
    if (defId === 'major_win' && desertRoseSeason(result.tournamentId) !== null) {
      const career = await db.careers.get('career');
      if (career && career.playerId === golferId && storyOf(career).act >= 3) trophy.metadata = { ...trophy.metadata, pinkJacket: true };
    }
    await db.trophies.add(trophy);
    return {
      awardedTrophyIds: [trophy.id],
      notifications: [
        {
          kind: 'trophy' as const,
          title: `Trophy earned: ${TROPHY_DEFINITIONS[defId].name}`,
          body: `${trophy.eventName} · ${trophy.finish.posLabel}`,
          refId: trophy.id,
        },
      ],
    };
  });
}
