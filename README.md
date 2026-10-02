# knn-sqlite-wasm

Nearest-neighbour vector search for the browser, built on binary quantization
with an exact-cosine rescore.

> **Status.** The KNN engine is implemented and tested. SQLite persistence is
> **not wired up yet** — the index is in-memory. `@sqlite.org/sqlite-wasm` is a
> declared dependency, but no source file imports it so far. See
> [Roadmap](#roadmap).

## Why binary quantization

A 50,000-entry corpus at 384 dimensions is 76.8 MB as `float32`. That does not
ship to a browser. One bit per dimension brings it to 2.4 MB.

| encoding | 50k × 384 | vs float32 |
| -------- | --------- | ---------- |
| float32  | 76.8 MB   | 1×         |
| int8     | 19.2 MB   | 4×         |
| binary   | 2.4 MB    | 32×        |

Binary alone is too lossy to rank with, so search runs in two stages:

1. **Scan** every vector by Hamming distance over the packed bits. Integer-only,
   one XOR and one table lookup per byte.
2. **Rescore** only the shortlist with exact cosine against the full-precision
   vectors.

Stage 1 touches 32× less memory than a float scan; stage 2 — the expensive
part — touches a few hundred vectors instead of the whole corpus.

## Measured recall

Recall of the exhaustive-cosine top-5, on 384-dimensional unit vectors:

| overfetch | N=2k | N=10k | N=25k |
| --------- | ---- | ----- | ----- |
| 100       | 0.74 | 0.58  | 0.51  |
| 500       | 0.95 | 0.82  | 0.76  |
| 2500      | 1.00 | 0.98  | 0.94  |

**Top-1 recall measured 1.00 in every configuration above**, including an
overfetch of 100 against 25,000 vectors. The true nearest neighbour lands in
the Hamming shortlist essentially always; it is ranks 2–5 that need width,
because they sit close enough together that one bit per dimension cannot
separate them.

So `overfetch` defaults to 10% of the corpus, clamped to `[200, 5000]`. A 25k
search at overfetch 500 takes about 5.6 ms.

## Usage

```ts
import { BinaryKnnIndex } from 'knn-sqlite-wasm'

const index = new BinaryKnnIndex(384)
index.add(1, embeddingFor('how do I issue a refund?'))
index.add(2, embeddingFor('how do I add a team member?'))

const hits = index.search(embeddingFor('money back to a customer'), { k: 5 })
// [{ id, score, hammingDistance }, ...] — most similar first

index.binaryBytes // bytes held by the binary representation
```

`searchExact()` runs exhaustive cosine. It is slow by design, and exists so
tuning runs can measure what the two-stage search recalls.

## Requirements

Node `>=22.12.0` (floor set by `@sqlite.org/sqlite-wasm` and Vitest 5). An
`.nvmrc` is provided — `nvm use` picks the right version.

```bash
nvm use
npm install
```

## Scripts

| Command                | What it does                                   |
| ---------------------- | ---------------------------------------------- |
| `npm run build`        | Vite library build (ESM + CJS + `.d.ts`)       |
| `npm test`             | Vitest, Node tier                              |
| `npm run test:watch`   | Vitest, Node tier, watch mode                  |
| `npm run test:browser` | Vitest, browser tier (Chromium via Playwright) |
| `npm run typecheck`    | `tsc --noEmit`                                 |
| `npm run lint`         | `biome check .`                                |
| `npm run format`       | `biome format --write .`                       |

## Demo

`examples/faq-search` is a FAQ search UI (Vite + React + Tailwind +
shadcn/ui) that runs the real pipeline, with a toggle to compare it against a
naive token-overlap baseline.

```bash
npm run dev -w faq-search
VITE_SHOW_SCORES=1 npm run dev -w faq-search   # show per-channel score bars
```

The demo's embedder is a deterministic hash stand-in (FNV-1a over words and
character trigrams) so it needs no model download. It is **lexical, not
semantic**: "refund" and "money back" do not match. Everything downstream of
the embedder — quantization, shortlist, rescore, hybrid fusion — is the real
implementation.

## Test tiers

Tests run in two tiers so the default run stays fast and dependency-free:

- **Node** (`vitest.config.ts`) — the default. Pure logic: distance kernels,
  quantization, recall. Picks up `src/**/*.test.ts`.
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

## Roadmap

- **SQLite persistence.** Store vectors as blobs and survive reloads via OPFS.
- **Real embeddings.** Swap the demo's hash embedder for Transformers.js.
- **sqlite-vec.** `vec0` virtual tables would replace the hand-rolled index,
  but need sqlite-vec compiled into the WASM binary — WebAssembly has no
  runtime extension loading. The published `sqlite-vec-wasm-demo@0.1.9` build
  currently aborts on init (`Module.postRun` already processed), so this means
  producing our own Emscripten build.

## License

MIT — see [LICENSE](LICENSE).
