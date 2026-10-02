import { describe, expect, it } from 'vitest';
import { cosine, dot, hamming, normalize } from './distance.js';

describe('hamming', () => {
  it('counts differing bits', () => {
    expect(hamming(Uint8Array.from([0b1111_0000]), Uint8Array.from([0b1111_0000]))).toBe(0);
    expect(hamming(Uint8Array.from([0b1111_0000]), Uint8Array.from([0b0000_1111]))).toBe(8);
    expect(hamming(Uint8Array.from([0b1010_1010]), Uint8Array.from([0b1010_1011]))).toBe(1);
  });

  it('sums across bytes', () => {
    expect(hamming(Uint8Array.from([0xff, 0x00]), Uint8Array.from([0x00, 0xff]))).toBe(16);
  });

  it('rejects mismatched lengths', () => {
    expect(() => hamming(Uint8Array.from([1]), Uint8Array.from([1, 2]))).toThrow(/mismatch/);
  });
});

describe('cosine', () => {
  it('is 1 for identical direction regardless of magnitude', () => {
    expect(cosine(new Float32Array([1, 0]), new Float32Array([7, 0]))).toBeCloseTo(1);
  });

  it('is 0 for orthogonal vectors and -1 for opposite', () => {
    expect(cosine(new Float32Array([1, 0]), new Float32Array([0, 1]))).toBeCloseTo(0);
    expect(cosine(new Float32Array([1, 0]), new Float32Array([-1, 0]))).toBeCloseTo(-1);
  });

  it('returns 0 against a zero vector instead of NaN', () => {
    expect(cosine(new Float32Array([1, 2]), new Float32Array([0, 0]))).toBe(0);
  });

  it('rejects mismatched lengths', () => {
    expect(() => cosine(new Float32Array(2), new Float32Array(3))).toThrow(/mismatch/);
  });
});

describe('dot and normalize', () => {
  it('dot equals cosine once both sides are unit length', () => {
    const a = normalize(new Float32Array([3, 4]));
    const b = normalize(new Float32Array([1, 2]));
    expect(dot(a, b)).toBeCloseTo(cosine(a, b), 6);
  });

  it('normalize gives unit length', () => {
    const v = normalize(new Float32Array([3, 4]));
    expect(Math.hypot(v[0] as number, v[1] as number)).toBeCloseTo(1);
  });

  it('normalize leaves a zero vector alone', () => {
    expect(Array.from(normalize(new Float32Array([0, 0])))).toEqual([0, 0]);
  });
});
