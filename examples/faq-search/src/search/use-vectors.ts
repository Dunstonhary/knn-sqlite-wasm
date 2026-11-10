import { useEffect, useState } from 'react'
import { embedCorpus, embedQuery, EMBEDDER_NAME } from './embedder'
import type { Vectors } from './neighbors'

export interface VectorState {
  vectors: Vectors | null
  pending: boolean
  error: Error | null
}

/**
 * Vectors for the geometry panels.
 *
 * The corpus half is precomputed and synchronous, so the panels have
 * something to draw on the first render. Only the query vector can be
 * outstanding, and only when the query is one the build did not embed.
 *
 * Every response carries the request that produced it and is dropped if a
 * newer one has started, for the same reason `useSearch` does it: a slow
 * embed for "pay" must not land after a fast one for "payment refund".
 */
export function useVectors(query: string): VectorState {
  const [state, setState] = useState<VectorState>({
    vectors: null,
    pending: true,
    error: null,
  })

  useEffect(() => {
    let cancelled = false
    setState((prev) => ({ ...prev, pending: true, error: null }))

    embedQuery(query)
      .then((queryVec) => {
        if (cancelled) return
        setState({
          vectors: { query: queryVec, docs: embedCorpus(), embedder: EMBEDDER_NAME },
          pending: false,
          error: null,
        })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setState({
          vectors: null,
          pending: false,
          error: err instanceof Error ? err : new Error(String(err)),
        })
      })

    return () => {
      cancelled = true
    }
  }, [query])

  return state
}
