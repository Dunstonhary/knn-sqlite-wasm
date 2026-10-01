import { defineConfig } from 'vitest/config';

// Tier 1 (default): Node environment. No browser binaries required, so a fresh
// clone can run `npm test` immediately. Tier 2 lives in vitest.browser.config.ts.
export default defineConfig({
  test: {
    name: 'node',
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['src/**/*.browser.test.ts'],
  },
});
