import { FAQ } from './faq-data'
import {
  type Area,
  type FaqEntry,
  HYBRID_WEIGHTS,
  SCORE_FLOOR,
  type SearchProvider,
  type SearchResult,
  SUGGESTION_COUNT,
  TOP_K,
} from './types'

/**
 * Words carrying no retrieval signal in a help-centre query. Kept small on
 * purpose: an aggressive stop list strips "set up" and "how to" phrasing that
 * the tag lists actually match on.
 */
const STOP = new Set([
  'the', 'a', 'an', 'i', 'do', 'how', 'to', 'my', 'is', 'can', 'of',
  'for', 'in', 'on', 'and', 'with', 'me', 'up', 'set',
])

/** Lowercase, strip punctuation, split, drop stop words. */
export function norm(s: string): string[] {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w))
}

/** Share of query words appearing anywhere in the entry's text. Stands in
    for the inverted index the real provider will query. */
export function keywordScore(qWords: string[], item: FaqEntry): number {
  const hay = `${item.q} ${item.a} ${item.tags.join(' ')}`.toLowerCase()
  const hits = qWords.filter((w) => hay.includes(w)).length
  return qWords.length ? hits / qWords.length : 0
}

/**
 * Token-overlap stand-in for embedding cosine similarity. Exact matches score
 * 1, prefix/substring matches 0.5, normalised by the geometric mean of the
 * two vocabularies so long entries are not unfairly favoured.
 *
 * This is NOT semantic: "refund" and "money back" score zero together. The
 * real provider replaces it with Transformers.js embeddings.
 */
export function semanticScore(qWords: string[], item: FaqEntry): number {
  const vocab = new Set<string>()
  for (const t of item.tags) for (const w of norm(t)) vocab.add(w)
  for (const w of norm(item.q)) vocab.add(w)

  let overlap = 0
  for (const w of qWords) {
    if (vocab.has(w)) {
      overlap += 1
      continue
    }
    for (const k of vocab) {
      if (k.includes(w) || w.includes(k)) {
        overlap += 0.5
        break
      }
    }
  }

  const denom = Math.sqrt(qWords.length) * Math.sqrt(vocab.size)
  // 1.6 lifts the normalised overlap into a range that reads well on a
  // 0-100 bar; it is cosmetic, not information-bearing.
  return denom ? Math.min(1, (overlap / denom) * 1.6) : 0
}

/** Rank the corpus for one query. Exported separately so tests can drive the
    maths without awaiting the provider. */
export function rank(
  corpus: FaqEntry[],
  query: string,
  area: Area | null,
): SearchResult {
  const pool = area === null ? corpus : corpus.filter((f) => f.area === area)
  const raw = query.trim()

  if (!raw) {
    return {
      empty: true,
      rows: pool.slice(0, SUGGESTION_COUNT).map((item) => ({ item })),
    }
  }

  const qWords = norm(raw)
  const rows = pool
    .map((item) => {
      const sem = semanticScore(qWords, item)
      const kw = keywordScore(qWords, item)
      return {
        item,
        sem,
        kw,
        hybrid: HYBRID_WEIGHTS.semantic * sem + HYBRID_WEIGHTS.keyword * kw,
      }
    })
    .filter((r) => r.hybrid > SCORE_FLOOR)
    .sort((a, b) => b.hybrid - a.hybrid)
    .slice(0, TOP_K)

  return { empty: false, rows }
}

/**
 * In-memory provider backed by token overlap. Ships with the demo so the UI
 * works before the SQLite KNN pipeline exists.
 */
export class MockSearchProvider implements SearchProvider {
  readonly name = 'mock (token overlap)'

  private readonly corpus: FaqEntry[]

  constructor(corpus: FaqEntry[] = FAQ) {
    this.corpus = corpus
  }

  async ready(): Promise<void> {
    // Nothing to load.
  }

  async search(query: string, area: Area | null): Promise<SearchResult> {
    return rank(this.corpus, query, area)
  }
}
