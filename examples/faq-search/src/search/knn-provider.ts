import { BinaryKnnIndex } from 'knn-sqlite-wasm'
import { FAQ } from './faq-data'
import { embed, EMBED_DIMS } from './hash-embedder'
import { keywordScore, norm } from './mock-provider'
import {
  type Area,
  type FaqEntry,
  HYBRID_WEIGHTS,
  RELATIVE_FLOOR,
  SCORE_FLOOR,
  type SearchProvider,
  type SearchResult,
  SUGGESTION_COUNT,
  TOP_K,
} from './types'

/**
 * The real pipeline: embed the query, retrieve by binary KNN, fuse with a
 * keyword score.
 *
 * The semantic half runs through BinaryKnnIndex exactly as production will —
 * one bit per dimension for the wide scan, exact cosine on the shortlist. Only
 * the embedder is a stand-in.
 */
export class KnnSearchProvider implements SearchProvider {
  readonly name = 'binary KNN + rescore'

  private readonly corpus: FaqEntry[]
  private readonly index: BinaryKnnIndex
  private built = false

  constructor(corpus: FaqEntry[] = FAQ) {
    this.corpus = corpus
    this.index = new BinaryKnnIndex(EMBED_DIMS)
  }

  /** Bytes the binary index occupies — the figure that decides shippability. */
  get binaryBytes(): number {
    return this.index.binaryBytes
  }

  async ready(): Promise<void> {
    if (this.built) return
    this.corpus.forEach((entry, i) => {
      // Question, answer and tags all contribute; the question dominates
      // because that is what a user's query most resembles.
      this.index.add(i, embed(`${entry.q} ${entry.q} ${entry.a} ${entry.tags.join(' ')}`))
    })
    this.built = true
  }

  async search(query: string, area: Area | null): Promise<SearchResult> {
    await this.ready()
    const raw = query.trim()

    if (!raw) {
      const pool = area === null ? this.corpus : this.corpus.filter((f) => f.area === area)
      return { empty: true, rows: pool.slice(0, SUGGESTION_COUNT).map((item) => ({ item })) }
    }

    const qVec = embed(raw)
    const qWords = norm(raw)

    // Retrieve wider than TOP_K: the area filter is applied after retrieval,
    // so a narrow fetch could return nothing for a filtered area.
    const neighbors = this.index.search(qVec, { k: this.corpus.length })

    const rows = neighbors
      .map((hit) => {
        const item = this.corpus[hit.id]
        if (!item) return null
        // Cosine runs -1..1; the UI bars expect 0..1, and a negative match is
        // no match at all.
        const sem = Math.max(0, hit.score)
        const kw = keywordScore(qWords, item)
        return {
          item,
          sem,
          kw,
          hybrid: HYBRID_WEIGHTS.semantic * sem + HYBRID_WEIGHTS.keyword * kw,
        }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .filter((r) => area === null || r.item.area === area)
      .filter((r) => r.hybrid > SCORE_FLOOR)
      .sort((a, b) => b.hybrid - a.hybrid)

    // Keep only what is competitive with the best hit, then cap. Without this
    // the list always fills to TOP_K, because the embedder gives every entry
    // some small positive similarity.
    const best = rows[0]?.hybrid ?? 0
    const competitive = rows.filter((r) => r.hybrid >= best * RELATIVE_FLOOR).slice(0, TOP_K)

    return { empty: false, rows: competitive }
  }
}
