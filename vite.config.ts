import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

// Library mode: this package is consumed as a dependency, not served as an app.
export default defineConfig({
  plugins: [
    dts({
      include: ['src'],
      exclude: ['src/**/*.test.ts'],
    }),
  ],
  build: {
    target: 'es2022',
    sourcemap: true,
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.ts'),
      name: 'KnnSqliteWasm',
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'index.js' : 'index.cjs'),
    },
    rollupOptions: {
      // sqlite-vec-wasm-demo ships a 4.4 MB .wasm beside its loader, and the
      // loader fetches it relative to its own module URL. Inlining or
      // rewriting it would break that lookup, so it stays external and the
      // consumer's bundler resolves it.
      external: ['sqlite-vec-wasm-demo'],
    },
  },
});
