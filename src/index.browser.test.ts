import { describe, expect, it } from 'vitest';
import { VERSION } from './index.js';

// Proves the browser tier boots. Real browser coverage (WASM, OPFS, Workers)
// arrives with the SQLite integration.
describe('scaffold (browser)', () => {
  it('runs in a browser context', () => {
    expect(typeof window).toBe('object');
    expect(VERSION).toBe('0.0.0');
  });
});
