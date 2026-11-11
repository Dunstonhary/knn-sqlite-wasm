import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { pwaOptions } from './pwa.config.ts'

// GitHub Pages serves the demo from /<repo>/, not a domain root. The deploy
// workflow sets BASE_PATH; a plain `npm run build` keeps the root default so
// local `vite preview` still works.
const base = process.env.BASE_PATH ?? '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      ...pwaOptions,
      workbox: {
        ...pwaOptions.workbox,
        // Precache keys are base-prefixed, so the navigation fallback has to
        // be too or createHandlerBoundToURL cannot find it. pwa.config.ts
        // keeps the bare filename; the base belongs to the deploy, not the
        // policy.
        navigateFallback: `${base}${pwaOptions.workbox.navigateFallback}`,
      },
    }),
  ],
  // Emscripten's loader fetches sqlite3.wasm next to its own module URL, and
  // a pre-bundled copy under .vite/deps has no such sibling. Excluding it
  // keeps the module where its wasm actually is.
  optimizeDeps: {
    exclude: ['sqlite-vec-wasm-demo'],
  },
  build: {
    rollupOptions: {
      output: {
        // sqlite-vec-wasm-demo's own pre-js hardcodes its wasm fetch to
        // `new URL('sqlite3.wasm', import.meta.url)` — it ignores any
        // `locateFile` override, so the only way to satisfy it in a
        // production build is to keep this one asset unhashed, landing next
        // to the JS chunk that imports it (both under `assets/`).
        assetFileNames: (asset) =>
          asset.names?.includes('sqlite3.wasm')
            ? 'assets/sqlite3.wasm'
            : 'assets/[name]-[hash][extname]',
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
      // Point at the library source, not its dist build: editing the library
      // then hot-reloads here instead of needing a rebuild first.
      'knn-sqlite-wasm': resolve(import.meta.dirname, '../../src/index.ts'),
    },
  },
})
