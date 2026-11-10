import type { FaqEntry } from './types'

/**
 * The keyword half of the hybrid.
 *
 * Embeddings are good at meaning and indifferent to exact strings; a user who
 * types a product name, an error code or a menu path wants that string found.
 * This supplies the second signal, which is why the fusion is 0.65/0.35 and
 * not 1.0 semantic.
 *
 * It stands in for the inverted index a production system would query.
 */

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

/** Share of query words appearing anywhere in the entry's text. */
export function keywordScore(qWords: string[], item: FaqEntry): number {
  const hay = `${item.q} ${item.a} ${item.tags.join(' ')}`.toLowerCase()
  const hits = qWords.filter((w) => hay.includes(w)).length
  return qWords.length ? hits / qWords.length : 0
}
