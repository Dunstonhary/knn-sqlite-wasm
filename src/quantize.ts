/**
 * Vector quantization.
 *
 * Storage at 50k x 384 dimensions:
 *   float32  76.8 MB
 *   int8     19.2 MB   (4x smaller)
 *   binary    2.4 MB   (32x smaller)
 *
 * Binary is what makes a corpus this size shippable to a browser. It is lossy
 * enough that it is used to shortlist, never to rank — see `search` in knn.ts.
 */

/** Bits packed into one byte of a binary-quantized vector. */
const BITS_PER_BYTE = 8;

/** Bytes needed to hold `dims` single-bit components. */
export function binaryByteLength(dims: number): number {
  return Math.ceil(dims / BITS_PER_BYTE);
}

/**
 * Pack a vector to one bit per dimension: 1 where the component is positive,
 * 0 otherwise.
 *
 * Bit order is most-significant-first within each byte, so dimension 0 is the
 * high bit of byte 0. Any encoder and decoder agreeing on this order works;
 * mixing orders silently corrupts distances, so it is fixed here.
 */
export function quantizeBinary(vec: Float32Array): Uint8Array {
  const out = new Uint8Array(binaryByteLength(vec.length));
  for (let i = 0; i < vec.length; i++) {
    const component = vec[i] as number;
    if (component > 0) {
      out[i >> 3] = (out[i >> 3] as number) | (0b1000_0000 >> (i & 7));
    }
  }
  return out;
}

/**
 * Scale a vector to signed 8-bit.
 *
 * `scale` is the absolute value mapped to 127. Components beyond it clamp
 * rather than wrap, because a wrapped component flips sign and corrupts the
 * dot product far worse than a saturated one.
 */
export function quantizeInt8(vec: Float32Array, scale = 1): Int8Array {
  const out = new Int8Array(vec.length);
  for (let i = 0; i < vec.length; i++) {
    const v = Math.round(((vec[i] as number) / scale) * 127);
    out[i] = v > 127 ? 127 : v < -127 ? -127 : v;
  }
  return out;
}

/** Reverse `quantizeInt8`. Lossy: the rounding is not recoverable. */
export function dequantizeInt8(vec: Int8Array, scale = 1): Float32Array {
  const out = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i++) {
    out[i] = ((vec[i] as number) / 127) * scale;
  }
  return out;
}

/** Scale that maps a vector's largest component to 127 with no clipping. */
export function int8Scale(vec: Float32Array): number {
  let max = 0;
  for (let i = 0; i < vec.length; i++) {
    const a = Math.abs(vec[i] as number);
    if (a > max) max = a;
  }
  return max || 1;
}
