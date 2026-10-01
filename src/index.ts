/**
 * Public entry point for knn-sqlite-wasm.
 *
 * This is scaffolding only: the KNN implementation (cosine distance, topK) and
 * the SQLite WASM bindings land in follow-up work. Keeping a real export here
 * means the library build and both test tiers exercise the full pipeline.
 */

/** Version of the library surface, bumped alongside package.json. */
export const VERSION = '0.0.0';

/** True once the library has something to do. Flipped by the first feature. */
export function isReady(): boolean {
  return false;
}
