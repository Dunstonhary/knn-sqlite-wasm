# FAQ semantic search — demo

A help-centre search UI running the real `knn-sqlite-wasm` pipeline, with a
toggle to compare it against a naive token-overlap baseline.

```bash
nvm use                                        # Node >=22.12.0
npm install                                    # from the repo root
npm run dev -w faq-search
```

Tick "Show score bars" above the results for the per-channel semantic, keyword
and hybrid scores. Display only — they are computed either way and the ranking
is unaffected.

## How it works

A query is embedded, retrieved by binary KNN, then fused with a keyword score
at 0.65 semantic / 0.35 keyword.

| piece | file | real? |
| ----- | ---- | ----- |
| embedder | `src/search/hash-embedder.ts` | **stand-in** — FNV-1a over words and character trigrams, 384 dims |
| vector search | `knn-sqlite-wasm` | real — binary scan plus exact-cosine rescore |
| keyword score | `src/search/mock-provider.ts` | stand-in — share of query words present |
| fusion, filtering, ranking | `src/search/knn-provider.ts` | real |

The embedder is **lexical, not semantic**: "refund" and "money back" do not
match. It exists so the demo runs with no model download. Swapping in
Transformers.js means replacing `embed()` and nothing else — the
`SearchProvider` interface is already async for exactly that reason.

## Why results are filtered by a relative floor

An absolute score threshold cannot separate signal from noise when the
embedder gives every entry some small positive similarity — the list just
fills to five every time. Hits are instead judged against the best hit for
that query (`RELATIVE_FLOOR` in `src/search/types.ts`).

## Stack

Vite, React 19, TypeScript, Tailwind v4, shadcn/ui.
