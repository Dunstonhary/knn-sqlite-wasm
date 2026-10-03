import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { pwaOptions } from './pwa.config.ts'

export default defineConfig({
  plugins: [react(), tailwindcss(), VitePWA(pwaOptions)],
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
      // Point at the library source, not its dist build: editing the library
      // then hot-reloads here instead of needing a rebuild first.
      'knn-sqlite-wasm': resolve(import.meta.dirname, '../../src/index.ts'),
    },
  },
})
