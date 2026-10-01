import { describe, expect, it } from 'vitest';
import { isReady, VERSION } from './index.js';

describe('scaffold', () => {
  it('exposes a version', () => {
    expect(VERSION).toBe('0.0.0');
  });

  it('is not ready until features land', () => {
    expect(isReady()).toBe(false);
  });
});
