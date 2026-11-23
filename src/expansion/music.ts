/**
 * Hook point for casino-specific soundtracks (CONFIRMED feature; audio NOT implemented yet).
 *
 * Screens call `requestCasinoMusic(cue)` when the player enters a casino location or room.
 * Until the music registry and audio assets are approved and built, this only records the
 * request (for tests and debugging) and changes nothing that is heard. When the system lands,
 * this becomes the single place that resolves a cue to a track, crossfades and loops it.
 */
let lastCue: string | null = null;

export function requestCasinoMusic(cue: string | null): void {
  lastCue = cue;
}

/** The most recent cue requested (null for none). */
export const requestedCasinoMusic = () => lastCue;
