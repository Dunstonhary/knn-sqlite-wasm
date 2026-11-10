import { useEffect, useRef, useState } from 'react'
import { KnnSearchProvider } from './knn-provider'
import { SqliteVecProvider } from './sqlite-provider'
import type { Area, SearchResult } from './types'

export interface EngineRun {
  name: string
  result: SearchResult | null
  error: Error | null
}

export interface EnginesState {
  /** The results shown. Taken from SQLite, since both agree. */
  rows: SearchResult['rows']
  empty: boolean
  pending: boolean
  error: Error | null
  js: EngineRun
  sql: EngineRun
  /** Both engines returned the same ranking. Null before the first run. */
  agree: boolean | null
  /** The open SQLite store, for the database panel. */
  store: SqliteVecProvider['store']
}

const titles = (r: SearchResult | null) => (r ? JSON.stringify(r.rows.map((x) => x.item.q)) : null)

function asError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err))
}

/**
 * Run both engines on every query, rather than making the reader pick one.
 *
 * The comparison is the interesting part: same vectors, same two stages, one
 * in JavaScript and one in SQL. A toggle hides that behind a click and makes
 * a disagreement invisible; running both means the dashboard can state, on
 * every query, whether they still agree.
 */
export function useEngines(query: string, area: Area | null, enabled: boolean): EnginesState {
  // Lazy initial state, not a ref: both are created exactly once, and
  // reading a ref during render is what the linter is right to object to.
  const [js] = useState(() => new KnnSearchProvider())
  const [sql] = useState(() => new SqliteVecProvider())

  const [state, setState] = useState<EnginesState>({
    rows: [],
    empty: true,
    pending: true,
    error: null,
    js: { name: js.name, result: null, error: null },
    sql: { name: sql.name, result: null, error: null },
    agree: null,
    store: null,
  })
  const requestId = useRef(0)

  useEffect(() => {
    if (!enabled) {
      setState((prev) => ({ ...prev, pending: false }))
      return
    }
    const id = ++requestId.current
    let cancelled = false
    setState((prev) => ({ ...prev, pending: true }))

    const run = async () => {
      // Settled, not all: one engine failing should still show the other's
      // answer and name the one that broke.
      const [a, b] = await Promise.allSettled([js.search(query, area), sql.search(query, area)])
      if (cancelled || id !== requestId.current) return

      const jsRun: EngineRun = {
        name: js.name,
        result: a.status === 'fulfilled' ? a.value : null,
        error: a.status === 'rejected' ? asError(a.reason) : null,
      }
      const sqlRun: EngineRun = {
        name: sql.name,
        result: b.status === 'fulfilled' ? b.value : null,
        error: b.status === 'rejected' ? asError(b.reason) : null,
      }
      const shown = sqlRun.result ?? jsRun.result

      setState({
        rows: shown?.rows ?? [],
        empty: shown?.empty ?? true,
        pending: false,
        error: shown ? null : (sqlRun.error ?? jsRun.error),
        js: jsRun,
        sql: sqlRun,
        agree: jsRun.result && sqlRun.result ? titles(jsRun.result) === titles(sqlRun.result) : null,
        store: sql.store,
      })
    }

    run().catch((err: unknown) => {
      if (cancelled || id !== requestId.current) return
      setState((prev) => ({ ...prev, pending: false, error: asError(err) }))
    })

    return () => {
      cancelled = true
    }
  }, [js, sql, query, area, enabled])

  return state
}
