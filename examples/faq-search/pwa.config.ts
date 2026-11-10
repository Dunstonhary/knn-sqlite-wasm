import type { VitePWAOptions } from 'vite-plugin-pwa'

/**
 * PWA configuration, kept out of vite.config.ts so the manifest and the
 * service-worker policy have one source of truth that pwa.config.test.ts can
 * assert against directly.
 *
 * The icons in public/ were rasterised from public/favicon.svg — same mark,
 * same light --background token behind it, nothing fetched from outside the
 * repo.
 */
export const pwaOptions = {
  // 'autoUpdate' registers a worker that takes over as soon as a new build is
  // precached. Paired with cleanupOutdatedCaches below, a fresh deploy
  // replaces the old one instead of leaving a stale worker serving yesterday's
  // assets to everyone who has already installed the app.
  registerType: 'autoUpdate',
  // Lets the plugin inject the registration into index.html, so main.tsx stays
  // free of service-worker plumbing.
  injectRegister: 'auto',
  manifestFilename: 'manifest.webmanifest',

  manifest: {
    name: 'FAQ-KNN-Application',
    short_name: 'FAQ Search',
    description:
      'Semantic and keyword hybrid search over a help centre, running entirely on-device.',
    display: 'standalone',
    // Relative, so an install keeps working when the demo is served from a
    // sub-path (GitHub Pages) rather than a domain root.
    start_url: '.',
    scope: '.',
    // src/index.css: --background is oklch(1 0 0) in :root. The .dark block
    // exists but nothing ever sets the class, so one colour is the honest
    // answer — a dark toolbar above a light app would be worse than none.
    theme_color: '#ffffff',
    background_color: '#ffffff',
    icons: [
      { src: 'pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        // Drawn at 44% of the canvas so the mark survives whatever shape
        // Android's adaptive-icon mask crops it to.
        src: 'pwa-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  },

  workbox: {
    // Precaching the build output is the offline story for the app shell.
    globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,wasm}'],
    // ...but not for the two wasm runtimes, which are 4.2 MB and 26.9 MB and
    // belong to features most visitors never open. Precaching is an install
    // cost everyone pays up front; these are paid by whoever actually picks
    // the sqlite-vec engine or the MiniLM embedder, and the runtime rule
    // below keeps them offline from the second use onward.
    globIgnores: ['**/ort-*.wasm', '**/sqlite3-*.wasm'],
    // Workbox's default ceiling is 2 MB. Nothing precached exceeds it now
    // that the runtimes are excluded, but leaving the default in place means
    // a future asset would be dropped silently rather than noisily.
    maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
    runtimeCaching: [
      {
        // Cache-first and never revalidated: a wasm binary's URL carries its
        // content hash, so a changed build is a different URL and a cached
        // one can never be stale.
        urlPattern: ({ url }: { url: URL }) => url.pathname.endsWith('.wasm'),
        handler: 'CacheFirst' as const,
        options: {
          cacheName: 'wasm-runtimes',
          expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 90 },
          cacheableResponse: { statuses: [0, 200] },
        },
      },
    ],
    navigateFallback: 'index.html',
    cleanupOutdatedCaches: true,
    clientsClaim: true,
    skipWaiting: true,
  },
} satisfies Partial<VitePWAOptions>
