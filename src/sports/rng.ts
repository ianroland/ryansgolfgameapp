/**
 * Seeded random streams for the sports engine. Every random decision draws from its own stream,
 * keyed by (world seed, purpose, id), e.g. `game:<gameId>` or `injury:<playerId>:<gameId>`. A
 * result therefore depends only on the world state and its own stream: replaying a season with
 * the same seed reproduces everything, and odds simulations (Phase 3) can use separate streams
 * without disturbing real results. Self-contained: no imports from golf or casino code.
 */

/** FNV-1a 32-bit hash. */
export function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export interface Rng {
  /** Uniform [0, 1). */
  next(): number;
  /** Integer in [lo, hi] inclusive. */
  int(lo: number, hi: number): number;
  /** True with probability p. */
  chance(p: number): boolean;
  /** Approximately standard normal. */
  normal(): number;
  pick<T>(items: readonly T[]): T;
  /** Index drawn in proportion to weights. */
  weighted(weights: readonly number[]): number;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stream for one purpose. */
export function stream(seed: number, ...parts: (string | number)[]): Rng {
  const next = mulberry32(hash32(`${seed >>> 0}|${parts.join('|')}`));
  return {
    next,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    chance: (p) => next() < p,
    normal: () => {
      let s = 0;
      for (let i = 0; i < 6; i++) s += next();
      return (s - 3) / Math.sqrt(0.5);
    },
    pick: (items) => items[Math.floor(next() * items.length)],
    weighted: (weights) => {
      const total = weights.reduce((a, b) => a + b, 0);
      let u = next() * total;
      for (let i = 0; i < weights.length; i++) {
        u -= weights[i];
        if (u < 0) return i;
      }
      return weights.length - 1;
    },
  };
}
