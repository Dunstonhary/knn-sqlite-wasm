import { describe, expect, it } from 'vitest';
import {
  binaryByteLength,
  dequantizeInt8,
  int8Scale,
  quantizeBinary,
  quantizeInt8,
} from './quantize.js';

describe('binaryByteLength', () => {
  it('rounds up to whole bytes', () => {
    expect(binaryByteLength(8)).toBe(1);
    expect(binaryByteLength(9)).toBe(2);
    expect(binaryByteLength(384)).toBe(48);
  });
});

describe('quantizeBinary', () => {
  it('sets a bit for each positive component, most significant first', () => {
    const v = new Float32Array([1, -1, 1, -1, -1, -1, -1, -1]);
    expect(quantizeBinary(v)[0]).toBe(0b1010_0000);
  });

  it('treats zero as not positive', () => {
    expect(quantizeBinary(new Float32Array([0, 0, 0, 0, 0, 0, 0, 0]))[0]).toBe(0);
  });

  it('pads a partial trailing byte with zeros', () => {
    const packed = quantizeBinary(new Float32Array([1, 1, 1]));
    expect(packed).toHaveLength(1);
    expect(packed[0]).toBe(0b1110_0000);
  });

  it('packs 384 dims into 48 bytes', () => {
    expect(quantizeBinary(new Float32Array(384).fill(1))).toHaveLength(48);
  });
});

describe('quantizeInt8', () => {
  it('maps the scale to 127', () => {
    expect(quantizeInt8(new Float32Array([1, -1, 0]), 1)).toEqual(Int8Array.from([127, -127, 0]));
  });

  it('clamps rather than wraps beyond the scale', () => {
    // Wrapping would flip the sign and corrupt the dot product.
    const q = quantizeInt8(new Float32Array([5, -5]), 1);
    expect(q[0]).toBe(127);
    expect(q[1]).toBe(-127);
  });

  it('round-trips within quantization error', () => {
    const v = new Float32Array([0.5, -0.25, 0.125]);
    const back = dequantizeInt8(quantizeInt8(v, 1), 1);
    for (let i = 0; i < v.length; i++) {
      expect(back[i]).toBeCloseTo(v[i] as number, 2);
    }
  });

  it('int8Scale picks the largest magnitude', () => {
    expect(int8Scale(new Float32Array([0.2, -0.9, 0.4]))).toBeCloseTo(0.9);
    // A zero vector would divide by zero, so the scale falls back to 1.
    expect(int8Scale(new Float32Array([0, 0]))).toBe(1);
  });
});
