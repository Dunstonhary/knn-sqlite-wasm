import { useEffect, useRef, useState } from 'react'
import type { Area, SearchProvider, SearchResult } from './types'

const EMPTY: SearchResult = { empty: true, rows: [] }

/**
 * Runs a query against the provider, keeping the last good result on screen
 * while the next one resolves.
 *
 * Every response is tagged with the request that produced it and dropped if a
 * newer request has already started. Without that guard a slow embedding call
 * for "pay" can land after a fast one for "payment refund" and overwrite it.
 */
export function useSearch(
  provider: SearchProvider,
  query: string,
  area: Area | null,
) {
  const [result, setResult] = useState<SearchResult>(EMPTY)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const requestId = useRef(0)

  useEffect(() => {
    const id = ++requestId.current
    let cancelled = false
    setPending(true)

    provider
      .ready()
      .then(() => provider.search(query, area))
      .then((next) => {
        if (cancelled || id !== requestId.current) return
        setResult(next)
        setError(null)
      })
      .catch((err: unknown) => {
        if (cancelled || id !== requestId.current) return
        setError(err instanceof Error ? err : new Error(String(err)))
      })
      .finally(() => {
        if (cancelled || id !== requestId.current) return
        setPending(false)
      })

    return () => {
      cancelled = true
    }
  }, [provider, query, area])

  return { ...result, pending, error }
}
