/** Distance and similarity kernels. */

/** Population count of one byte, precomputed. Faster than a per-call loop and
    avoids depending on a 32-bit popcount intrinsic that WASM may not expose. */
const POPCOUNT = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  POPCOUNT[i] = (i & 1) + (POPCOUNT[i >> 1] as number);
}

/**
 * Number of differing bits between two binary-quantized vectors.
 *
 * Lower is more similar. This is the stage-1 kernel: integer-only, one XOR and
 * one table lookup per byte, so a 384-dim vector costs 48 iterations.
 */
export function hamming(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length) {
    throw new Error(`hamming: length mismatch (${a.length} vs ${b.length})`);
  }
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    d += POPCOUNT[(a[i] as number) ^ (b[i] as number)] as number;
  }
  return d;
}

/**
 * Cosine similarity in [-1, 1]. Higher is more similar.
 *
 * Returns 0 when either vector has zero magnitude: undefined direction has no
 * meaningful similarity, and 0 keeps it out of the top of a ranking.
 */
export function cosine(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`cosine: length mismatch (${a.length} vs ${b.length})`);
  }
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] as number;
    const y = b[i] as number;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom ? dot / denom : 0;
}

/** Dot product. Equivalent to cosine when both vectors are unit length, and
    cheaper, so pre-normalized corpora should prefer it. */
export function dot(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`dot: length mismatch (${a.length} vs ${b.length})`);
  }
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] as number) * (b[i] as number);
  return s;
}

/** Scale a vector to unit length in place. A zero vector is left untouched. */
export function normalize(vec: Float32Array): Float32Array {
  let n = 0;
  for (let i = 0; i < vec.length; i++) {
    const v = vec[i] as number;
    n += v * v;
  }
  n = Math.sqrt(n);
  if (!n) return vec;
  for (let i = 0; i < vec.length; i++) vec[i] = (vec[i] as number) / n;
  return vec;
}
