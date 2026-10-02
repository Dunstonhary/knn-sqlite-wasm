/** The six product areas a FAQ entry can belong to. */
export const AREAS = [
  'Inbox',
  'Contacts',
  'Connect',
  'Settings',
  'Payments',
  'Integrations',
] as const

export type Area = (typeof AREAS)[number]

export interface FaqEntry {
  area: Area
  q: string
  a: string
  /** Hand-written synonyms. The mock scorer leans on these; the real
      pipeline keeps them for the keyword half of the hybrid. */
  tags: string[]
}

/** One ranked hit. Scores are absent for the no-query "suggested" state. */
export interface ScoredEntry {
  item: FaqEntry
  sem?: number
  kw?: number
  hybrid?: number
}

export interface SearchResult {
  /** True when the query was blank, so rows are suggestions, not matches. */
  empty: boolean
  rows: ScoredEntry[]
}

/**
 * The swap seam between the UI and the ranking engine.
 *
 * Async on purpose: the production provider embeds the query with
 * Transformers.js and queries SQLite WASM, both of which are async. A
 * synchronous mock would let the UI assume sync and force a rewrite at
 * swap time, so the mock pays the async cost up front.
 */
export interface SearchProvider {
  /** Human-readable name, surfaced in the UI so it is obvious which
      engine answered. */
  readonly name: string
  /** Resolve any one-time setup (model download, DB open). Safe to call
      more than once. */
  ready(): Promise<void>
  search(query: string, area: Area | null): Promise<SearchResult>
}

/** Weights for the hybrid fusion. Shared so UI copy cannot drift from
    the maths. */
export const HYBRID_WEIGHTS = { semantic: 0.65, keyword: 0.35 } as const

/** Hits scoring at or below this are dropped as noise. */
export const SCORE_FLOOR = 0.04

/**
 * Hits scoring below this fraction of the best hit are dropped.
 *
 * An absolute floor cannot separate signal from noise when the scores are not
 * calibrated: an embedder that gives every entry some small positive
 * similarity clears any fixed threshold, so the result list always fills to
 * TOP_K with tail noise. Judging each hit against the best hit for that query
 * sidesteps the calibration problem entirely.
 */
export const RELATIVE_FLOOR = 0.55

/** Maximum hits returned for a real query. */
export const TOP_K = 5

/** How many entries to suggest when the query is blank. */
export const SUGGESTION_COUNT = 4
