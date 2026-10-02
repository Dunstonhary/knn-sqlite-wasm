import { cosine, hamming } from './distance.js';
import { binaryByteLength, quantizeBinary } from './quantize.js';

export interface Neighbor {
  /** Row identity, as supplied when the vector was added. */
  id: number;
  /** Exact cosine similarity against the full-precision vector. */
  score: number;
  /** Bits differing from the query in stage 1. Exposed for tuning overfetch. */
  hammingDistance: number;
}

export interface SearchOptions {
  /** Neighbors to return. */
  k?: number;
  /**
   * Candidates to carry from stage 1 into the rescore.
   *
   * Binary quantization keeps direction but discards magnitude, so the
   * shortlist is reliable, not exact. Measured on 384-dim unit vectors,
   * recall@5 against exhaustive cosine:
   *
   *   overfetch     N=2k    N=10k   N=25k
   *      100        0.74    0.58    0.51
   *      500        0.95    0.82    0.76
   *     2500        1.00    0.98    0.94
   *
   * Rank 1 is the exception: top-1 recall measured 1.00 at every size, even
   * at overfetch 100. The nearest neighbor lands in the hamming shortlist
   * essentially always; it is ranks 2-5 that need width, because they sit so
   * close together that one bit per dimension cannot separate them.
   *
   * Hence the default scales with the corpus — see `defaultOverfetch`.
   */
  overfetch?: number;
}

/**
 * Shortlist width for a corpus of `size`.
 *
 * Ten percent of the corpus, clamped to [200, 5000]. The lower bound keeps
 * small corpora honest; the upper bound caps the rescore cost, since 5000
 * exact cosines at 384 dims is a few milliseconds and the curve has flattened
 * well before that.
 */
export function defaultOverfetch(size: number): number {
  return Math.min(size, Math.max(200, Math.min(5000, Math.ceil(size * 0.1))));
}

/**
 * Two-stage nearest-neighbor index.
 *
 * Stage 1 scans every vector in its binary form: integer XOR and popcount, 1
 * bit per dimension. Stage 2 takes only the shortlist and computes exact
 * cosine against full-precision vectors.
 *
 * The point is that stage 1 touches 32x less memory than a float scan, and
 * stage 2 — the expensive part — touches a few hundred vectors instead of the
 * whole corpus.
 */
export class BinaryKnnIndex {
  readonly dims: number;

  private readonly entries: Array<{
    id: number;
    binary: Uint8Array;
    full: Float32Array;
  }> = [];

  constructor(dims: number) {
    if (!Number.isInteger(dims) || dims <= 0) {
      throw new Error(`BinaryKnnIndex: dims must be a positive integer, got ${dims}`);
    }
    this.dims = dims;
  }

  get size(): number {
    return this.entries.length;
  }

  /** Bytes held by the binary representation. The figure that decides whether
      a corpus ships to a browser. */
  get binaryBytes(): number {
    return this.entries.length * binaryByteLength(this.dims);
  }

  /**
   * Add one vector. The full-precision copy is retained for rescoring; pass a
   * pre-quantized binary form to skip recomputing it.
   */
  add(id: number, vec: Float32Array, binary?: Uint8Array): void {
    if (vec.length !== this.dims) {
      throw new Error(`add: expected ${this.dims} dims, got ${vec.length}`);
    }
    this.entries.push({ id, full: vec, binary: binary ?? quantizeBinary(vec) });
  }

  /** The full-precision vector at an insertion position. Exposed so tuning
      and tests can build queries near known corpus points. */
  vectorAt(position: number): Float32Array {
    const entry = this.entries[position];
    if (!entry) throw new Error(`vectorAt: no vector at position ${position}`);
    return entry.full;
  }

  /** Nearest neighbors to `query`, most similar first. */
  search(query: Float32Array, options: SearchOptions = {}): Neighbor[] {
    if (query.length !== this.dims) {
      throw new Error(`search: expected ${this.dims} dims, got ${query.length}`);
    }
    const k = options.k ?? 5;
    const overfetch = options.overfetch ?? defaultOverfetch(this.entries.length);
    if (!this.entries.length || k <= 0) return [];

    // Stage 1: rank the whole corpus by hamming distance over the packed bits.
    const qBits = quantizeBinary(query);
    const candidates = this.entries.map((entry) => ({
      entry,
      d: hamming(qBits, entry.binary),
    }));
    candidates.sort((a, b) => a.d - b.d);

    // Stage 2: exact cosine over the shortlist only.
    const scored: Neighbor[] = candidates
      .slice(0, Math.min(overfetch, candidates.length))
      .map(({ entry, d }) => ({
        id: entry.id,
        score: cosine(query, entry.full),
        hammingDistance: d,
      }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
  }

  /**
   * Exhaustive cosine over every vector. Slow by design — it exists so tests
   * and tuning runs can measure what the two-stage search recalls.
   */
  searchExact(query: Float32Array, k = 5): Neighbor[] {
    const all: Neighbor[] = this.entries.map((entry) => ({
      id: entry.id,
      score: cosine(query, entry.full),
      hammingDistance: -1,
    }));
    all.sort((a, b) => b.score - a.score);
    return all.slice(0, k);
  }
}
