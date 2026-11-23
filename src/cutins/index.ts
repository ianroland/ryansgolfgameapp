/**
 * CI-1 · Competitor moments detection and selection.
 *
 * A pure, log-only library. Nothing in the shipped game imports it: there
 * is no UI, no wiring and no player-facing difference. Presentation reads
 * results; it never creates them.
 */
export * from './types';
export * from './constants';
export { revealSnapshot, truncateSnapshot, boundariesOf, thruOf } from './snapshot';
export { detect, totalsAt, leadersAt, positionOf, momentIdOf } from './detect';
export { score4, scoreTerms, isProximate, type ScoreCtx, type ScoreTerms } from './score';
export { planRound, selectAt, mergeCandidates, type PlanOptions } from './plan';
export { issueToken, consume, claimPresentation, type BoundaryToken } from './token';
export { markPresented, wasPresented, presentationHistory, type PresentationOutcome } from './presentationLog';
