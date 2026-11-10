import type { SqliteVecStore, SqlResult, StoreStats, TableInfo } from 'knn-sqlite-wasm'
import { Database, Play, TriangleAlert } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'

const PREVIEW_ROWS = 50

/** Compact byte count — the figures here run from bytes to a few megabytes. */
function bytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}

/**
 * Render one cell.
 *
 * Blobs are the interesting case: a 384-dimension embedding is 1,536 bytes of
 * float32 and a binary code is 48 bytes, and seeing those sizes next to each
 * other in the actual table is the 32x claim made concrete. The first bytes
 * are shown as hex because a blob rendered as text is noise.
 */
function Cell({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground italic">null</span>
  }
  if (value instanceof Uint8Array) {
    const head = [...value.slice(0, 6)].map((b) => b.toString(16).padStart(2, '0')).join(' ')
    return (
      <span className="whitespace-nowrap">
        <span className="font-semibold">BLOB</span>{' '}
        <span className="text-muted-foreground">{bytes(value.length)}</span>{' '}
        <span className="text-muted-foreground">{head}…</span>
      </span>
    )
  }
  if (typeof value === 'number') return <span className="tabular-nums">{value}</span>
  return <span>{String(value)}</span>
}

function Grid({ result }: { result: SqlResult }) {
  if (!result.columns.length) {
    return <p className="p-3 text-xs text-muted-foreground">Statement returned no columns.</p>
  }
  return (
    <div className="max-h-[420px] overflow-auto">
      <table className="w-full border-collapse text-left text-xs">
        <thead className="sticky top-0 bg-muted">
          <tr>
            {result.columns.map((c) => (
              <th key={c} className="border-b px-2.5 py-1.5 font-semibold whitespace-nowrap">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row, i) => (
            // Row order is the statement's own; there is no stable id to key on.
            // biome-ignore lint/suspicious/noArrayIndexKey: positional by nature
            <tr key={i} className="align-top odd:bg-muted/40">
              {row.map((value, j) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: positional by nature
                <td key={j} className="max-w-[320px] truncate border-b px-2.5 py-1.5">
                  <Cell value={value} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function DbView({ store }: { store: SqliteVecStore | null }) {
  const [stats, setStats] = useState<StoreStats | null>(null)
  const [tables, setTables] = useState<TableInfo[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [sql, setSql] = useState('')
  const [result, setResult] = useState<SqlResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const run = useCallback(
    (statement: string) => {
      if (!store) return
      try {
        setResult(store.exec(statement))
        setError(null)
      } catch (err) {
        setResult(null)
        setError(err instanceof Error ? err.message : String(err))
      }
      // Any statement may have changed the schema or the row counts.
      setStats(store.stats())
      setTables(store.tables())
    },
    [store],
  )

  // Runs once the store exists, and only then: the dashboard opens it while
  // the first search runs, so this panel is told about it rather than
  // opening a second one.
  useEffect(() => {
    if (!store) return
    setLoading(false)
    const found = store.tables()
    setStats(store.stats())
    setTables(found)
    setSelected((prev) => {
      if (prev) return prev
      const first = found.find((t) => t.kind !== 'index')?.name ?? null
      if (first) {
        const statement = `select * from "${first}" limit ${PREVIEW_ROWS}`
        setSql(statement)
        run(statement)
      }
      return first
    })
  }, [store, run])

  const schema = useMemo(
    () => tables.find((t) => t.name === selected)?.sql ?? '',
    [tables, selected],
  )

  if (loading || !store) {
    return (
      <section className="rounded-xl border bg-card p-4">
        <p className="text-xs text-muted-foreground">Opening the database…</p>
      </section>
    )
  }

  return (
    <section className="flex flex-col rounded-xl border bg-card">
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <Database className="size-4" />
        <h2 className="text-sm font-semibold">Database</h2>
        <span className="ml-auto text-[11px] text-muted-foreground">
          the one the sqlite-vec engine searches, live
        </span>
      </header>
      <div className="flex flex-col gap-4 p-4">
      <section className="rounded-lg border p-3">
        <h3 className="mb-2 text-sm font-semibold">As it stands</h3>
        {stats && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
            {[
              ['SQLite', stats.sqliteVersion],
              ['sqlite-vec', stats.vecVersion],
              ['dimensions', String(stats.dims)],
              ['rows', String(stats.rows)],
              ['size', `${bytes(stats.bytes)} (${stats.pageCount} × ${bytes(stats.pageSize)})`],
              ['location', 'in memory'],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-medium tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold">Tables</h3>
        <div className="flex flex-wrap gap-1.5">
          {tables.map((t) => (
            <button
              key={t.name}
              type="button"
              aria-pressed={selected === t.name}
              onClick={() => {
                setSelected(t.name)
                const statement = `select * from "${t.name}" limit ${PREVIEW_ROWS}`
                setSql(statement)
                run(statement)
              }}
              className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                selected === t.name
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span className="font-medium">{t.name}</span>
              {t.kind === 'virtual' && <span className="ml-1.5 opacity-70">vec0</span>}
              {t.rows !== null && <span className="ml-1.5 tabular-nums opacity-70">{t.rows}</span>}
            </button>
          ))}
        </div>
        {schema && (
          <pre className="mt-2 overflow-auto rounded-lg bg-muted p-2.5 text-[11px] leading-relaxed">
            {schema}
          </pre>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold">Query it</h3>
        <textarea
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          onKeyDown={(e) => {
            // Enter inserts a newline; the modifier runs it, as in every
            // other SQL console.
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) run(sql)
          }}
          spellCheck={false}
          rows={3}
          aria-label="SQL to run against the database"
          className="w-full resize-y rounded-lg border bg-background p-2.5 font-mono text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button size="sm" className="h-8 gap-1.5 px-3 text-xs" onClick={() => run(sql)}>
            <Play className="size-3.5" />
            Run
          </Button>
          <span className="text-[11px] text-muted-foreground">⌘/Ctrl + Enter</span>
          {result && (
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {result.rows.length} row{result.rows.length === 1 ? '' : 's'} ·{' '}
              {result.ms.toFixed(2)} ms
            </span>
          )}
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {[
            ['hamming vs cosine, one query', EXAMPLE_TWO_STAGE],
            ['how big is a vector', EXAMPLE_SIZES],
            ['tags, unpacked', EXAMPLE_TAGS],
          ].map(([label, statement]) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                setSql(statement as string)
                run(statement as string)
              }}
              className="rounded-md border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              {label}
            </button>
          ))}
        </div>

        {error && (
          <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-destructive/40 p-2.5 text-xs text-destructive">
            <TriangleAlert className="mt-px size-3.5 shrink-0" />
            {error}
          </p>
        )}
        {result && !error && (
          <div className="mt-2 rounded-lg border">
            <Grid result={result} />
          </div>
        )}
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          Not a copy — the same database. It lives in memory, so anything you change here lasts
          until the page reloads, and the next search will see it.
        </p>
      </section>
      </div>
    </section>
  )
}

/** Both stages of the search, side by side, for one hard-coded row. */
const EXAMPLE_TWO_STAGE = `select f.id, f.area, f.q,
       vec_distance_hamming(b.bits, (select bits from faq_bits where id = 2)) as hamming_bits,
       vec_distance_cosine(f.embedding, (select embedding from faq where id = 2)) as cosine_dist
  from faq f join faq_bits b on b.id = f.id
 order by cosine_dist
 limit 8`

/** The 32x claim, as rows rather than as a README table. */
const EXAMPLE_SIZES = `select 'float32 embedding' as what, length(embedding) as bytes from faq where id = 0
union all
select 'binary code', length(bits) from faq_bits where id = 0
union all
select 'ratio', length(embedding) / length(bits) from faq, faq_bits
 where faq.id = 0 and faq_bits.id = 0`

/** The tags column, which is why the corpus is in here at all. */
const EXAMPLE_TAGS = `select f.area, f.q, j.value as tag
  from faq f, json_each(f.tags) j
 where j.value like '%pay%'
 order by f.id`
