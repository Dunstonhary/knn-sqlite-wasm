import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

// Tier 2: real browser. Required for anything touching SQLite WASM, OPFS or
// Workers. Needs `npx playwright install chromium` first, so it is kept out of
// the default `npm test` run.
export default defineConfig({
  // The sqlite3 loader fetches its .wasm next to its own module URL, and a
  // pre-bundled copy under .vite/deps has no such sibling. Consumers need the
  // same line in their own config; see src/sqlite.ts.
  optimizeDeps: {
    exclude: ['sqlite-vec-wasm-demo'],
  },
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
