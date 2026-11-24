import { describe, expect, it, vi } from 'vitest';
import { releaseWebGL } from '../src/game/destroyGame';

const fakeCanvas = (kind: 'webgl2' | 'webgl' | '2d' | 'lost') => {
  const loseContext = vi.fn();
  const gl = { isContextLost: () => kind === 'lost', getExtension: (n: string) => (n === 'WEBGL_lose_context' ? { loseContext } : null) };
  const canvas = { width: 800, height: 600, getContext: (t: string) => (kind === '2d' ? null : t === 'webgl2' && kind !== 'webgl' ? gl : t === 'webgl' && kind === 'webgl' ? gl : null) };
  return { canvas: canvas as unknown as HTMLCanvasElement, loseContext };
};

describe('releasing a Phaser WebGL context (iOS GPU memory)', () => {
  it('loses WebGL2 and WebGL1 contexts and shrinks the canvas', () => {
    for (const kind of ['webgl2', 'webgl'] as const) {
      const { canvas, loseContext } = fakeCanvas(kind);
      expect(releaseWebGL(canvas)).toBe(true);
      expect(loseContext).toHaveBeenCalledOnce();
      expect([canvas.width, canvas.height]).toEqual([1, 1]);
    }
  });

  it('leaves 2D canvases, lost contexts and missing canvases alone', () => {
    expect(releaseWebGL(fakeCanvas('2d').canvas)).toBe(false);
    const lost = fakeCanvas('lost');
    expect(releaseWebGL(lost.canvas)).toBe(false);
    expect(lost.loseContext).not.toHaveBeenCalled();
    expect(releaseWebGL(null)).toBe(false);
  });

  it('both Phaser hosts use it', async () => {
    const { readFileSync } = await import('node:fs');
    for (const f of ['src/ui/components/ClubhouseCanvas.tsx', 'src/ui/tournament/TournamentView.tsx']) {
      const s = readFileSync(f, 'utf8');
      expect(s, f).toContain('destroyGame(game)');
      expect(s, f).not.toContain('game.destroy(true)');
    }
  });
});
