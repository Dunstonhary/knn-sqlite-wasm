import { BinaryKnnIndex, defaultOverfetch } from 'knn-sqlite-wasm'
import { EMBED_DIMS, embedCorpus, embedQuery } from './embedder'
import { FAQ } from './faq-data'
import { fuse } from './fuse'
import {
  type Area,
  type FaqEntry,
  type SearchProvider,
  type SearchResult,
  SUGGESTION_COUNT,
} from './types'

/**
 * Binary KNN in JavaScript: one bit per dimension for the wide scan, exact
 * cosine on the shortlist, all in memory.
 *
 * The sibling of `SqliteVecProvider`, which does the same two stages in SQL.
 * Both take their vectors from the same embedder, so a disagreement between
 * them is a difference in the engines and nothing else.
 */
export class KnnSearchProvider implements SearchProvider {
  readonly name = 'binary KNN (JS)'

  private readonly corpus: FaqEntry[]
  private index: BinaryKnnIndex | null = null
  private building: Promise<void> | null = null

  constructor(corpus: FaqEntry[] = FAQ) {
    this.corpus = corpus
  }

  ready(): Promise<void> {
    this.building ??= this.build().catch((err) => {
      this.building = null
      throw err
    })
    return this.building
  }

  private async build(): Promise<void> {
    // Corpus vectors are precomputed, so this is a loop over 14 arrays rather
    // than a model download. The index is ready on the first render.
    const vectors = embedCorpus()
    const index = new BinaryKnnIndex(EMBED_DIMS)
    vectors.forEach((vec, i) => index.add(i, vec))
    this.index = index
  }

  async search(query: string, area: Area | null): Promise<SearchResult> {
    await this.ready()
    const raw = query.trim()

    if (!raw) {
      const pool = area === null ? this.corpus : this.corpus.filter((f) => f.area === area)
      return { empty: true, rows: pool.slice(0, SUGGESTION_COUNT).map((item) => ({ item })) }
    }

    const qVec = await embedQuery(raw)
    const index = this.index
    if (!index) throw new Error('knn: index missing after build')

    const t0 = performance.now()
    // Retrieve wider than TOP_K: the area filter is applied after retrieval,
    // so a narrow fetch could return nothing for a filtered area.
    const neighbors = index.search(qVec, { k: this.corpus.length })
    const ms = performance.now() - t0

    const hits = neighbors
      .map((hit) => {
        const item = this.corpus[hit.id]
        return item ? { item, sem: hit.score } : null
      })
      .filter((h): h is { item: FaqEntry; sem: number } => h !== null)

    return {
      empty: false,
      rows: fuse(hits, raw, area),
      ms,
      detail: `${this.corpus.length} vectors scanned as bits, top ${Math.min(
        defaultOverfetch(this.corpus.length),
        this.corpus.length,
      )} rescored in JS`,
    }
  }
}
