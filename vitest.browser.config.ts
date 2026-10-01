import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

// Tier 2: real browser. Required for anything touching SQLite WASM, OPFS or
// Workers. Needs `npx playwright install chromium` first, so it is kept out of
// the default `npm test` run.
export default defineConfig({
  test: {
    name: 'browser',
    include: ['src/**/*.browser.test.ts'],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
    },
  },
});
