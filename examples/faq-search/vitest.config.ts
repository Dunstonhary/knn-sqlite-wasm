import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

// Tier 1 (default): Node. Mirrors the library's own split so `npm test` in a
// fresh clone needs no browser binaries. Anything touching SQLite WASM lives
// in a *.browser.test.ts and runs under vitest.browser.config.ts instead —
// that build of sqlite3 refuses to initialise outside a browser, by design.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      name: 'node',
      environment: 'node',
      include: ['src/**/*.test.ts', '*.test.ts'],
      exclude: ['**/node_modules/**', 'src/**/*.browser.test.ts'],
    },
  }),
)
