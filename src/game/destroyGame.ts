import type * as Phaser from 'phaser';

/** Phaser.Core.Events.DESTROY (a plain string, so this file never loads Phaser itself). */
const DESTROY = 'destroy';

/**
 * Destroy a Phaser game AND give its WebGL context back to the browser.
 *
 * Phaser 4 deletes its textures on destroy but never calls WEBGL_lose_context, so the context (and
 * its GPU memory) lingers until garbage collection. iOS/iPadOS WebKit caps live WebGL contexts and
 * graphics memory tightly: after enough golf rounds and clubhouse visits in one session, other
 * images on the page stop drawing or draw garbled (seen on Biff's encounter, Nov 2026). Releasing
 * the context explicitly frees that memory immediately.
 */
export function destroyGame(game: Phaser.Game): void {
  game.events.once(DESTROY, () => {
    const canvas = game.canvas;
    // DESTROY fires just before the renderer tears down; release after that finishes.
    window.setTimeout(() => releaseWebGL(canvas), 0);
  });
  game.destroy(true);
}

/** Lose the canvas's WebGL context, if it has one. Safe on 2D canvases and already-lost contexts. */
export function releaseWebGL(canvas: HTMLCanvasElement | null | undefined): boolean {
  if (!canvas) return false;
  let gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  try {
    // getContext returns the existing context of the same type, or null for a different type.
    gl = (canvas.getContext('webgl2') as WebGL2RenderingContext | null) ?? (canvas.getContext('webgl') as WebGLRenderingContext | null);
  } catch {
    return false;
  }
  if (!gl || gl.isContextLost()) return false;
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  // Shrinking the backing store frees the drawing buffer on browsers that keep it after context loss.
  canvas.width = 1;
  canvas.height = 1;
  return true;
}
