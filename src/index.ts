/**
 * knn-sqlite-wasm — nearest-neighbor vector search for the browser.
 *
 * Vectors are quantized to one bit per dimension for a cheap full-corpus scan,
 * then a shortlist is rescored at full precision. See `BinaryKnnIndex`.
 *
 * SQLite WASM persistence is not wired up yet; the index is in-memory.
 */

export { cosine, dot, hamming, normalize } from './distance.js';
export type { Neighbor, SearchOptions } from './knn.js';
export { BinaryKnnIndex, defaultOverfetch } from './knn.js';
export {
  binaryByteLength,
  dequantizeInt8,
  int8Scale,
  quantizeBinary,
  quantizeInt8,
} from './quantize.js';

/** Version of the library surface, bumped alongside package.json. */
export const VERSION = '0.0.0';

/** True once the library has something to do. */
export function isReady(): boolean {
  return true;
}
