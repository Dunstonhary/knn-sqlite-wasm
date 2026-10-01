# SqlLite-KNN-Bun-Node

KNN vector search on top of SQLite WASM.

> Status: scaffolding only. The KNN implementation lands in follow-up work.

## Requirements

Node `>=22.12.0` (floor set by `@sqlite.org/sqlite-wasm` and Vitest 5). An
`.nvmrc` is provided — `nvm use` picks the right version.

## Setup

```bash
npm install
```

## Scripts

| Command                | What it does                                      |
| ---------------------- | ------------------------------------------------- |
| `npm run build`        | Vite library build (ESM + CJS + `.d.ts`)          |
| `npm test`             | Vitest, Node tier                                 |
| `npm run test:watch`   | Vitest, Node tier, watch mode                     |
| `npm run test:browser` | Vitest, browser tier (Chromium via Playwright)    |
| `npm run typecheck`    | `tsc --noEmit`                                    |
| `npm run lint`         | `biome check .`                                   |
| `npm run format`       | `biome format --write .`                          |

## Test tiers

Tests run in two tiers so the default run stays fast and dependency-free:

- **Node** (`vitest.config.ts`) — the default. Covers pure logic: distance
  functions, topK selection, query planning. Picks up `src/**/*.test.ts`.
- **Browser** (`vitest.browser.config.ts`) — headless Chromium through the
  Playwright provider. Required for anything touching SQLite WASM, OPFS or
  Workers. Picks up `src/**/*.browser.test.ts`.

The browser tier needs browser binaries, so it is kept out of `npm test`:

```bash
npx playwright install chromium
npm run test:browser
```

## Build output

Vite runs in **library mode**, not app mode. `npm run build` emits
`dist/index.js` (ESM), `dist/index.cjs` (CJS), source maps, and
`dist/index.d.ts`. `@sqlite.org/sqlite-wasm` is marked external so its `.wasm`
asset is never inlined into the bundle.
