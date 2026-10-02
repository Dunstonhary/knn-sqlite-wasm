import { describe, expect, it } from 'vitest';
import { BinaryKnnIndex, normalize, quantizeBinary, VERSION } from './index.js';

// The library's real target is the browser, so the two-stage search is
// exercised here as well as in Node: typed arrays and bit twiddling are where
// engine differences would show up.
describe('scaffold (browser)', () => {
  it('runs in a browser context', () => {
    expect(typeof window).toBe('object');
    expect(VERSION).toBe('0.0.0');
  });
});

describe('KNN in the browser', () => {
  it('packs bits the same way the Node tier does', () => {
    const packed = quantizeBinary(new Float32Array([1, -1, 1, -1, -1, -1, -1, -1]));
    expect(packed[0]).toBe(0b1010_0000);
  });

  it('finds the nearest neighbour', () => {
    const index = new BinaryKnnIndex(8);
    index.add(1, normalize(new Float32Array([1, 1, 1, 1, -1, -1, -1, -1])));
    index.add(2, normalize(new Float32Array([-1, -1, -1, -1, 1, 1, 1, 1])));
    index.add(3, normalize(new Float32Array([1, 1, -1, -1, 1, 1, -1, -1])));

    const hits = index.search(normalize(new Float32Array([1, 1, 1, 1, -1, -1, -1, -1])), {
      k: 1,
    });
    expect(hits[0]?.id).toBe(1);
    expect(hits[0]?.score).toBeCloseTo(1);
    expect(hits[0]?.hammingDistance).toBe(0);
  });

  it('reports binary storage for a realistic corpus shape', () => {
    const index = new BinaryKnnIndex(384);
    for (let i = 0; i < 1000; i++) {
      const v = new Float32Array(384);
      for (let d = 0; d < 384; d++) v[d] = Math.sin(i * 0.1 + d);
      index.add(i, normalize(v));
    }
    // 1000 x 48 bytes, against 1.536 MB as float32.
    expect(index.binaryBytes).toBe(48_000);
    expect(index.search(index.vectorAt(500), { k: 1 })[0]?.id).toBe(500);
  });
});
