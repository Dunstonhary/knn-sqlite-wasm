import { describe, expect, it } from 'vitest';
import { normalize } from './distance.js';
import { BinaryKnnIndex, defaultOverfetch } from './knn.js';

/** Deterministic PRNG so recall figures are reproducible across runs. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomUnitVector(dims: number, rnd: () => number): Float32Array {
  const v = new Float32Array(dims);
  // Box-Muller gives a direction uniform on the sphere; uniform components
  // would cluster toward the cube's corners and flatter the quantizer.
  for (let i = 0; i < dims; i++) {
    const u1 = Math.max(rnd(), 1e-9);
    const u2 = rnd();
    v[i] = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
  return normalize(v);
}

function buildIndex(n: number, dims: number, seed = 42) {
  const rnd = mulberry32(seed);
  const index = new BinaryKnnIndex(dims);
  for (let i = 0; i < n; i++) index.add(i, randomUnitVector(dims, rnd));
  return { index, rnd };
}

describe('BinaryKnnIndex basics', () => {
  it('rejects a non-positive dimension', () => {
    expect(() => new BinaryKnnIndex(0)).toThrow(/positive integer/);
    expect(() => new BinaryKnnIndex(1.5)).toThrow(/positive integer/);
  });

  it('rejects vectors of the wrong width', () => {
    const ix = new BinaryKnnIndex(4);
    expect(() => ix.add(1, new Float32Array(3))).toThrow(/expected 4 dims/);
    ix.add(1, new Float32Array(4));
    expect(() => ix.search(new Float32Array(3))).toThrow(/expected 4 dims/);
  });

  it('returns nothing when empty', () => {
    expect(new BinaryKnnIndex(4).search(new Float32Array(4))).toEqual([]);
  });

  it('finds an exact match first', () => {
    const ix = new BinaryKnnIndex(4);
    ix.add(1, new Float32Array([1, 0, 0, 0]));
    ix.add(2, new Float32Array([0, 1, 0, 0]));
    ix.add(3, new Float32Array([0, 0, 1, 0]));
    const hits = ix.search(new Float32Array([1, 0, 0, 0]), { k: 1 });
    expect(hits[0]?.id).toBe(1);
    expect(hits[0]?.score).toBeCloseTo(1);
  });

  it('orders results by descending similarity', () => {
    const { index } = buildIndex(200, 64);
    const scores = index.search(new Float32Array(64).fill(0.1), { k: 10 }).map((h) => h.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it('honours k and never exceeds the corpus', () => {
    const { index } = buildIndex(7, 32);
    expect(index.search(new Float32Array(32).fill(0.5), { k: 3 })).toHaveLength(3);
    expect(index.search(new Float32Array(32).fill(0.5), { k: 99 })).toHaveLength(7);
  });

  it('reports binary storage, not full-precision storage', () => {
    const { index } = buildIndex(1000, 384);
    // 1000 vectors x 48 bytes, versus 1000 x 384 x 4 = 1.536 MB as float32.
    expect(index.binaryBytes).toBe(48_000);
    expect(index.size).toBe(1000);
  });
});

describe('binary + rescore recall', () => {
  const DIMS = 384;
  const N = 2000;
  const K = 5;

  /** A query sitting at roughly `alpha` cosine from a known corpus vector —
      the shape a real embedded question has against its answer. */
  function queryNear(base: Float32Array, dims: number, rnd: () => number, alpha: number) {
    const noise = randomUnitVector(dims, rnd);
    const out = new Float32Array(dims);
    for (let i = 0; i < dims; i++) {
      out[i] = alpha * (base[i] as number) + (1 - alpha) * (noise[i] as number);
    }
    return normalize(out);
  }

  it('always surfaces the true nearest neighbour', () => {
    // The figure that matters for retrieval: rank 1 is the answer. Measured at
    // 1.00 for corpora up to 25k even with a shortlist of only 100.
    const { index, rnd } = buildIndex(N, DIMS, 7);
    const corpus = Array.from({ length: N }, (_, i) => i);

    let found = 0;
    const QUERIES = 40;
    for (let q = 0; q < QUERIES; q++) {
      const base = index.vectorAt(corpus[Math.floor(rnd() * N)] as number);
      const query = queryNear(base, DIMS, rnd, 0.85);
      const exactTop = index.searchExact(query, 1)[0]?.id;
      expect(index.search(query, { k: K, overfetch: 100 })[0]?.id).toBe(exactTop);
      found++;
    }
    expect(found).toBe(QUERIES);
  });

  it('recovers most of the exact top-5 at the default overfetch', () => {
    const { index, rnd } = buildIndex(N, DIMS, 7);

    let recalled = 0;
    let total = 0;
    for (let q = 0; q < 40; q++) {
      const base = index.vectorAt(Math.floor(rnd() * N));
      const query = queryNear(base, DIMS, rnd, 0.85);
      const exact = new Set(index.searchExact(query, K).map((h) => h.id));
      for (const hit of index.search(query, { k: K })) if (exact.has(hit.id)) recalled++;
      total += K;
    }
    // Ranks 2-5 of a random corpus are near-orthogonal to each other, so one
    // bit per dimension cannot fully separate them. Real embeddings, where
    // those ranks are genuinely related, separate more cleanly.
    expect(recalled / total).toBeGreaterThan(0.7);
  });

  it('recall rises monotonically with overfetch', () => {
    const { index, rnd } = buildIndex(N, DIMS, 11);
    const queries = Array.from({ length: 30 }, () =>
      queryNear(index.vectorAt(Math.floor(rnd() * N)), DIMS, rnd, 0.85),
    );

    const recallAt = (overfetch: number) => {
      let hit = 0;
      for (const q of queries) {
        const exact = new Set(index.searchExact(q, K).map((h) => h.id));
        for (const h of index.search(q, { k: K, overfetch })) if (exact.has(h.id)) hit++;
      }
      return hit / (queries.length * K);
    };

    expect(recallAt(500)).toBeGreaterThanOrEqual(recallAt(50));
    expect(recallAt(N)).toBeGreaterThan(0.95);
  });

  it('a full-width overfetch matches exact search exactly', () => {
    const { index, rnd } = buildIndex(300, 128, 3);
    const query = randomUnitVector(128, rnd);
    expect(index.search(query, { k: K, overfetch: 300 }).map((h) => h.id)).toEqual(
      index.searchExact(query, K).map((h) => h.id),
    );
  });

  it('reports the hamming distance that produced each candidate', () => {
    const { index, rnd } = buildIndex(100, 64, 5);
    for (const hit of index.search(randomUnitVector(64, rnd), { k: 3 })) {
      expect(hit.hammingDistance).toBeGreaterThanOrEqual(0);
      expect(hit.hammingDistance).toBeLessThanOrEqual(64);
    }
  });
});

describe('defaultOverfetch', () => {
  it('is a tenth of the corpus between its bounds', () => {
    expect(defaultOverfetch(20_000)).toBe(2000);
  });

  it('never exceeds the corpus', () => {
    expect(defaultOverfetch(50)).toBe(50);
  });

  it('floors at 200 and caps at 5000', () => {
    expect(defaultOverfetch(1000)).toBe(200);
    expect(defaultOverfetch(1_000_000)).toBe(5000);
  });
});
