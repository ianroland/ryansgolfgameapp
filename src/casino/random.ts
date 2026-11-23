/** Fair random numbers for the casino (crypto when available). */
export type RandomInt = (maxExclusive: number) => number;

export const cryptoInt: RandomInt = (max) => {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buf = new Uint32Array(1);
    const limit = Math.floor(0x1_0000_0000 / max) * max; // avoid modulo bias
    do crypto.getRandomValues(buf);
    while (buf[0] >= limit);
    return buf[0] % max;
  }
  return Math.floor(Math.random() * max);
};

/** Deterministic generator for tests. */
export function seededInt(seed: number): RandomInt {
  let s = seed >>> 0 || 1;
  return (max) => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) % max;
  };
}
