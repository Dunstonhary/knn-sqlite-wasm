import { playwright } from '@vitest/browser-playwright'
import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

// Tier 2: real browser, for the SQLite WASM path. Needs
// `npx playwright install chromium` first, so it stays out of `npm test`.
// The app's own vite config is merged in rather than restated: the
// `knn-sqlite-wasm` source alias and the sqlite-vec optimizeDeps exclusion
// are exactly what these tests are exercising.
export default mergeConfig(
  viteConfig,
  defineConfig({
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
  }),
)
