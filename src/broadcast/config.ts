/**
 * Broadcast proof of concept (Phase 1) — developer-only configuration.
 *
 * The broadcast presentation is OFF unless a developer build is opened with
 * `?broadcast=poc`. Release builds never enable it. Nothing here touches the
 * golf engine: it only chooses how the camera presents a shot that has
 * already been simulated.
 */

export type GreenCamCandidate = 'A' | 'B' | 'C' | 'D';
export type GreenCamAngle = 'line' | 'offset30';

export interface BroadcastConfig {
  /** Green-side camera height/distance candidate (see greenCam.ts). */
  candidate: GreenCamCandidate;
  angle: GreenCamAngle;
  /** Phase 1: replay every approach shot (developer mode only). */
  replayApproaches: boolean;
}

export const DEFAULT_BROADCAST: BroadcastConfig = { candidate: 'C', angle: 'offset30', replayApproaches: true };

/**
 * Author decision (21 Nov 2026): C is the provisional default, B is kept for
 * occasional cinematic use, D is the safe fallback. A is removed from the
 * active candidates; its research data stays (greenCam.ts) and it can still be
 * opened for research with `&research=1`.
 */
export const ACTIVE_CANDIDATES: GreenCamCandidate[] = ['B', 'C', 'D'];
const RESEARCH_CANDIDATES: GreenCamCandidate[] = ['A', 'B', 'C', 'D'];

/**
 * Reads `?broadcast=poc[&cam=B|C|D][&angle=line|offset30][&replay=0][&research=1]`.
 * Returns null (Classic presentation) unless `dev` is true and the flag is present.
 */
export function broadcastConfigFromSearch(search: string, dev: boolean): BroadcastConfig | null {
  if (!dev) return null;
  const q = new URLSearchParams(search);
  if (q.get('broadcast') !== 'poc') return null;
  const cam = (q.get('cam') ?? '').toUpperCase() as GreenCamCandidate;
  const angle = q.get('angle');
  const allowed = q.get('research') === '1' ? RESEARCH_CANDIDATES : ACTIVE_CANDIDATES;
  return {
    candidate: allowed.includes(cam) ? cam : DEFAULT_BROADCAST.candidate,
    angle: angle === 'line' || angle === 'offset30' ? angle : DEFAULT_BROADCAST.angle,
    replayApproaches: q.get('replay') !== '0',
  };
}
