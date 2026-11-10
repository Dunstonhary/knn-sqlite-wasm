# FAQ semantic search — demo

A help-centre search UI running the real `knn-sqlite-wasm` pipeline, with
toggles to swap the **engine** that executes it and the **embedder** that
feeds it.

```bash
nvm use                                        # Node >=22.12.0
npm install                                    # from the repo root
npm run dev -w faq-search
```

Tick "Show score bars" above the results for the per-channel semantic, keyword
and hybrid scores. Display only — they are computed either way and the ranking
is unaffected.

## How it works

A query is embedded, retrieved by two-stage KNN, then fused with a keyword
score at 0.65 semantic / 0.35 keyword.

| piece | file | real? |
| ----- | ---- | ----- |
| embedder (hash) | `src/search/hash-embedder.ts` | **stand-in** — FNV-1a over words and character trigrams, 384 dims |
| embedder (MiniLM) | `src/search/embedder.ts` | real — `Xenova/all-MiniLM-L6-v2`, q8, 384 dims |
| vector search (JS) | `knn-sqlite-wasm` | real — binary scan plus exact-cosine rescore |
| vector search (SQL) | `knn-sqlite-wasm` (`openVecStore`) | real — SQLite + sqlite-vec, `vec0` bit index plus cosine rescore |
| keyword score | `src/search/mock-provider.ts` | stand-in — share of query words present |
| fusion, filtering, ranking | `src/search/fuse.ts` | real, and shared by every engine |

### Two engines, one pipeline

`Binary KNN (JS)` and `sqlite-vec` run the same two stages over the same
vectors. Stage 1 scans every entry as one bit per dimension; stage 2 rescores
only the shortlist at full precision. The difference is who does it:

```sql
-- what SqliteVecStore.search runs, from the library
with shortlist as (
  select id, distance as hamming from vec_faq_bits
   where bits match vec_quantize_binary(vec_f32(?)) and k = ?
)
select f.id, s.hamming, vec_distance_cosine(f.embedding, vec_f32(?)) as dist
  from shortlist s join faq f on f.id = s.id
 order by dist limit ?
```

The corpus is rows in a `faq` table rather than a TypeScript literal, so the
tags, the text and the vectors are all data the query planner can join
against. Results are rebuilt from the rows SQLite returns, and the area filter
is a `where` clause inside the query rather than a `.filter()` afterwards.

`src/search/sqlite.browser.test.ts` asserts the two engines return identical
rankings and identical hybrid scores — if that test fails, the toggle in the
UI is comparing two different things.

### Seeing it

The **Database** tab is the store, not a picture of it. Schema and row counts
come from `store.tables()`, every grid from `store.exec()`. Three canned
queries are wired to buttons, including the one that turns this README's 32x
claim into output:

| what | bytes |
| ---- | ----- |
| float32 embedding | 1536 |
| binary code | 48 |
| ratio | 32 |

It is the same database the search uses, so a statement typed there changes
what the next search sees — until a reload rebuilds it.

### Two embedders

The hash embedder is **lexical**: "refund" and "money back" share no
dimensions, so they do not match. It costs nothing and runs instantly.

MiniLM is a real sentence encoder. It costs 21.9 MB on first use, fetched from
the Hugging Face CDN and cached by Transformers.js. The Transformers.js import
is dynamic, so nobody who stays on the hash pays for onnxruntime either.
Measured on this corpus:

| query | hash | MiniLM |
| ----- | ---- | ------ |
| "give the money back to a customer" | 5 noisy hits, refund 3rd | 2 hits, **refund 1st** |

Everything downstream is identical because both emit 384 unit-length
dimensions — the binary quantizer, the SQLite schema and the 2D view do not
know which one produced their input.

## Running SQLite WASM under Vite

Two of the three workarounds now live in the library (`setStatus` and the
`onRuntimeInitialized` that defines `HEAPU64` — both documented at their call
site in `src/sqlite.ts`). The third is config a consumer has to supply, and it
is in `vite.config.ts` here:

```ts
optimizeDeps: { exclude: ['sqlite-vec-wasm-demo'] }
```

The loader fetches `sqlite3.wasm` next to its own module URL, and a
pre-bundled copy under `.vite/deps` has no such sibling. Without the exclusion
the wasm request returns `index.html` and you get
`expected magic word 00 61 73 6d`.

## Why results are filtered by a relative floor

An absolute score threshold cannot separate signal from noise when the
embedder gives every entry some small positive similarity — the list just
fills to five every time. Hits are instead judged against the best hit for
that query (`RELATIVE_FLOOR` in `src/search/types.ts`).

## Tests

```bash
npm test -w faq-search            # node: maths, fusion, embedder contract, PWA policy
npm run test:browser -w faq-search  # chromium: everything touching SQLite WASM
```

The split mirrors the library's own. This build of sqlite3 refuses to
initialise outside a browser, so its tests cannot run in the node tier — they
live in `*.browser.test.ts` and need `npx playwright install chromium` once.
The store itself is tested in the library; what is tested here is the glue —
that both engines rank identically, that results come back from rows, and that
the area filter really is a `where` clause.

## Offline and bundle size

`dist` is about 31 MB, almost all of it the two wasm runtimes: `sqlite3.wasm`
is 4.2 MB and onnxruntime's is 26.9 MB. Neither is precached — the service
worker installs a 1.25 MB app shell and the runtimes are cached on first use
by a `CacheFirst` rule (`pwa.config.ts`). Charging every visitor 31 MB up
front for two features most never open would be the wrong default; the policy
is asserted in `pwa.config.test.ts`.

## Stack

Vite, React 19, TypeScript, Tailwind v4, shadcn/ui, SQLite WASM + sqlite-vec,
Transformers.js.
