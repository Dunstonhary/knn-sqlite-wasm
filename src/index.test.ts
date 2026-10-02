import { describe, expect, it } from 'vitest';
import { isReady, VERSION } from './index.js';

describe('library surface', () => {
  it('exposes a version', () => {
    expect(VERSION).toBe('0.0.0');
  });

  it('is ready now that KNN has landed', () => {
    expect(isReady()).toBe(true);
  });
});
