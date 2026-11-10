/**
 * knn-sqlite-wasm — nearest-neighbor vector search for the browser.
 *
 * Vectors are quantized to one bit per dimension for a cheap full-corpus scan,
 * then a shortlist is rescored at full precision.
 *
 * Two engines run that design. `BinaryKnnIndex` is pure JavaScript and holds
 * everything in memory. `SqliteVecStore` hands the same two stages to SQLite
 * with sqlite-vec compiled in, so the vectors sit beside their rows and the
 * whole corpus can be queried, filtered and inspected as SQL. The SQLite
 * engine is browser-only; the JS one runs anywhere.
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
export type {
  ColumnType,
  SqlResult,
  StoreStats,
  TableInfo,
  VecFilter,
  VecHit,
  VecStoreOptions,
} from './sqlite.js';
export { bitBytes, loadSqlite, openVecStore, SqliteVecStore } from './sqlite.js';

/** Version of the library surface, bumped alongside package.json. */
export const VERSION = '0.0.0';

/** True once the library has something to do. */
export function isReady(): boolean {
  return true;
}
