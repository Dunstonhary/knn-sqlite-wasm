import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
      // Point at the library source, not its dist build: editing the library
      // then hot-reloads here instead of needing a rebuild first.
      'knn-sqlite-wasm': resolve(import.meta.dirname, '../../src/index.ts'),
    },
  },
})
