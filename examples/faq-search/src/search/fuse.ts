import { keywordScore, norm } from './keyword'
import {
  type Area,
  type FaqEntry,
  HYBRID_WEIGHTS,
  RELATIVE_FLOOR,
  SCORE_FLOOR,
  type ScoredEntry,
  TOP_K,
} from './types'

/**
 * Turn semantic hits into the ranked list the UI shows.
 *
 * Shared by every engine on purpose. The engines differ in how they find
 * candidates — a JS loop, a SQL index, token overlap — and if each one also
 * owned its own fusion and cut-offs, a difference in the results would never
 * tell you which half it came from.
 */
export function fuse(
  hits: Array<{ item: FaqEntry; sem: number }>,
  query: string,
  area: Area | null,
): ScoredEntry[] {
  const qWords = norm(query)

  const rows = hits
    .map(({ item, sem }) => {
      // Cosine runs -1..1; the bars expect 0..1, and a negative match is no
      // match at all.
      const bounded = Math.max(0, sem)
      const kw = keywordScore(qWords, item)
      return {
        item,
        sem: bounded,
        kw,
        hybrid: HYBRID_WEIGHTS.semantic * bounded + HYBRID_WEIGHTS.keyword * kw,
      }
    })
    .filter((r) => area === null || r.item.area === area)
    .filter((r) => r.hybrid > SCORE_FLOOR)
    .sort((a, b) => b.hybrid - a.hybrid)

  // Keep only what is competitive with the best hit, then cap. Without this
  // the list always fills to TOP_K, because every embedder gives every entry
  // some small positive similarity.
  const best = rows[0]?.hybrid ?? 0
  return rows.filter((r) => r.hybrid >= best * RELATIVE_FLOOR).slice(0, TOP_K)
}
