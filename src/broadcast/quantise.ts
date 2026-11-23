/**
 * Quantisation EXPERIMENT (test-only). Not used by the prototype at runtime:
 * the Phase 1 record keeps the full-precision path. These encoders exist so
 * the fidelity of a smaller archive format can be measured before anyone
 * adopts it.
 *
 * Int16 encodings store deltas from the shot's first sample at a fixed step.
 * If any value is non-finite or any delta falls outside the Int16 range, the
 * encoder writes Float32 (absolute hole coordinates) instead — it never clips
 * or wraps.
 */

export type Encoded =
  | { encoding: 'i16'; step: number; origin: [number, number, number]; data: Int16Array }
  | { encoding: 'f32'; data: Float32Array };

const I16_MAX = 32767;

export function encodeInt16(path: Float64Array, step: number): Encoded {
  const ox = path[0];
  const oy = path[1];
  const oz = path[2];
  const out = new Int16Array(path.length);
  for (let i = 0; i < path.length; i += 3) {
    const v = [(path[i] - ox) / step, (path[i + 1] - oy) / step, (path[i + 2] - oz) / step];
    for (let a = 0; a < 3; a++) {
      const q = Math.round(v[a]);
      if (!Number.isFinite(v[a]) || Math.abs(q) > I16_MAX) return encodeFloat32(path);
      out[i + a] = q;
    }
  }
  return { encoding: 'i16', step, origin: [ox, oy, oz], data: out };
}

export function encodeFloat32(path: Float64Array): Encoded {
  return { encoding: 'f32', data: Float32Array.from(path) };
}

export function decode(e: Encoded): Float64Array {
  if (e.encoding === 'f32') return Float64Array.from(e.data);
  const out = new Float64Array(e.data.length);
  for (let i = 0; i < e.data.length; i += 3) {
    out[i] = e.origin[0] + e.data[i] * e.step;
    out[i + 1] = e.origin[1] + e.data[i + 1] * e.step;
    out[i + 2] = e.origin[2] + e.data[i + 2] * e.step;
  }
  return out;
}

export const bytesOf = (e: Encoded) => e.data.byteLength;

/** Largest 3D position error, in yards, between two paths. */
export function maxError(a: Float64Array, b: Float64Array): number {
  let m = 0;
  for (let i = 0; i < a.length; i += 3) {
    m = Math.max(m, Math.hypot(a[i] - b[i], a[i + 1] - b[i + 1], a[i + 2] - b[i + 2]));
  }
  return m;
}
