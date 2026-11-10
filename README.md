# knn-sqlite-wasm

Nearest-neighbour vector search for the browser, built on binary quantization
with an exact-cosine rescore.

> **Status.** Two engines, both implemented and tested. `BinaryKnnIndex` is
> pure JavaScript and runs anywhere. `SqliteVecStore` hands the same two
> stages to SQLite with sqlite-vec compiled in, and is browser-only. They are
> asserted to return the same rankings.
>
> The database is in memory; surviving a reload is the open item. See
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

## The SQLite engine

Same two stages, executed by a database. The vectors sit beside their rows, so
filtering, joining and inspecting are SQL instead of more JavaScript.

```ts
import { openVecStore } from 'knn-sqlite-wasm'

const store = await openVecStore({
  dims: 384,
  columns: { area: 'text', title: 'text' }, // real columns, not a JSON blob
  name: 'faq',
})

store.addMany(docs.map((d, id) => ({
  id,
  vector: embeddingFor(d.text),
  row: { area: d.area, title: d.title },
})))

const hits = store.search(embeddingFor('money back to a customer'), 5, 500)
// [{ id, cosine, hamming, row: { area, title } }, ...]
```

`openVecStore` creates two tables: `faq` for the rows and their full-precision
`embedding` blobs, and `faq_bits`, a `vec0` virtual table of binary codes.
Stage 1 is a `MATCH` against `faq_bits`; stage 2 is `vec_distance_cosine` over
the shortlist. Pass a `filter` to narrow in SQL:

```ts
store.search(queryVector, 5, 500, { where: 't.area = ?', bind: ['Payments'] })
```

The filter runs *after* stage 1 picks its shortlist, so a selective filter on a
large corpus can return fewer than `k` rows even when more exist. Widen
`overfetch` when that matters — it is the standard cost of filtering an
approximate index.

`store.exec(sql, bind)` runs anything and returns `{ columns, rows, ms }`, and
`store.tables()` lists the schema with row counts. Both exist so the database
can be looked at rather than only queried through this class; the demo's
**Database** tab is built on them.

### Browser only, and what a bundler needs

This build of SQLite refuses to initialise outside a browser. It also needs
one line of bundler config, because its loader fetches `sqlite3.wasm` relative
to its own module URL and a pre-bundled copy has no such sibling:

```ts
// vite.config.ts
optimizeDeps: { exclude: ['sqlite-vec-wasm-demo'] }
```

Without it the wasm request returns your `index.html` and emscripten reports
`expected magic word 00 61 73 6d`. Two further workarounds — `setStatus` and
an `onRuntimeInitialized` that defines `HEAPU64` — are handled inside
`src/sqlite.ts` and documented at the call site.

## Requirements

Node `>=22.12.0` (floor set by Vitest 5). An `.nvmrc` is provided — `nvm use`
picks the right version.

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
```

A "Show score bars" checkbox above the results reveals the per-channel
semantic, keyword and hybrid scores. It is display only — the scores are
always computed, and the ranking does not change.

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
  Workers, which is where `SqliteVecStore` is covered. Picks up
  `src/**/*.browser.test.ts`.

The browser tier needs browser binaries, so it is kept out of `npm test`:

```bash
npx playwright install chromium
npm run test:browser
```

## Build output

Vite runs in **library mode**, not app mode. `npm run build` emits
`dist/index.js` (ESM), `dist/index.cjs` (CJS), source maps, and
`dist/index.d.ts`. `sqlite-vec-wasm-demo` is marked external: its loader
fetches the 4.4 MB `sqlite3.wasm` relative to its own module URL, so inlining
or rewriting it would break that lookup. Consumers resolve it with their own
bundler — and must exclude it from dependency pre-bundling (see below).

## Roadmap

- **Persistence.** The only real gap. `openVecStore` opens `:memory:`, so the
  corpus is re-embedded and re-inserted on every page load. Surviving a reload
  means OPFS, or shipping a prebuilt `.db` and `sqlite3_deserialize`-ing it;
  the export/reload round-trip is confirmed to work, it is just not wired up.
- ~~**Real embeddings.**~~ Done in the demo: `Xenova/all-MiniLM-L6-v2` at q8
  via Transformers.js, 384 dims, behind a toggle so the hash embedder stays
  the zero-download default. Dropping it into this library means replacing
  one function; the `SearchProvider` seam was already async for this.
- ~~**sqlite-vec.**~~ Done, and it needed **no custom Emscripten build**. The
  published `sqlite-vec-wasm-demo@0.1.9` works as shipped once three things
  are supplied, none of which are documented upstream:
  1. `optimizeDeps.exclude` — a pre-bundled copy has no `sqlite3.wasm`
     sibling to fetch, so the wasm request returns `index.html`.
  2. `setStatus` — the build `await`s the wasm inside the factory and appends
     sqlite3's API as `--post-js` after that await, so `run()` reaches
     `postRun()` first. `setStatus` defers `doRun()` past it. **This is the
     `Module.postRun` abort**, and it is a sequencing problem, not a build
     problem.
  3. `onRuntimeInitialized` — `HEAPU64` is absent from
     `EXPORTED_RUNTIME_METHODS` and reading an unexported symbol aborts;
     sqlite3's bootstrap probes it once to set `bigIntEnabled`.

  All three are implemented and commented in `src/sqlite.ts` and covered by
  `npm run test:browser`. `vec0` sits *beside* `BinaryKnnIndex` rather than
  replacing it: the JS engine runs outside a browser and needs no wasm, which
  is worth keeping.

## License

MIT — see [LICENSE](LICENSE).
