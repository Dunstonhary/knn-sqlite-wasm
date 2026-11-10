import { Boxes } from 'lucide-react'
import { useEffect, useState } from 'react'
import { DbView } from '@/components/db-view'
import { SearchPanel } from '@/components/search-panel'
import { VectorPanel } from '@/components/vector-panel'
import { CORPUS_COUNT } from '@/search/corpus-vectors'
import { EMBED_DIMS, EMBEDDER_NAME, precomputedQuery } from '@/search/embedder'
import { SAMPLE_QUERIES } from '@/search/sample-queries'
import type { Area } from '@/search/types'
import { useEncoder } from '@/search/use-encoder'
import { useEngines } from '@/search/use-engines'
import { useVectors } from '@/search/use-vectors'

const DEBOUNCE_MS = 220

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline gap-1.5 rounded-md bg-muted px-2 py-1 text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </span>
  )
}

/**
 * One screen, three panels, nothing hidden behind a tab.
 *
 * The thing worth exploring here is how one query moves through three
 * representations at once — a ranked list, a position in 384 dimensions, and
 * rows in a database — so they are shown together rather than one at a time.
 */
export function Dashboard() {
  // `draft` is what is typed; `query` is what has been committed to the
  // engines. They differ while debouncing, and while a query is waiting for
  // an encoder nobody has agreed to download yet.
  const [draft, setDraft] = useState<string>(SAMPLE_QUERIES[0])
  const [query, setQuery] = useState<string>(SAMPLE_QUERIES[0])
  const [area, setArea] = useState<Area | null>(null)
  const [showScores, setShowScores] = useState(false)

  const encoder = useEncoder()
  const isPrecomputed = precomputedQuery(draft) !== null
  const blocked = draft.trim().length > 0 && !isPrecomputed && encoder.state !== 'ready'

  useEffect(() => {
    if (blocked) return
    const t = setTimeout(() => setQuery(draft), DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [draft, blocked])

  const engines = useEngines(query, area, true)
  const { vectors } = useVectors(query)

  const stats = engines.store?.stats() ?? null

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4 p-4 lg:p-6">
      <header className="flex flex-wrap items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-lg bg-muted">
          <Boxes className="size-5" />
        </div>
        <div className="mr-auto">
          <h1 className="text-[15px] font-semibold">Vector search, end to end</h1>
          <p className="text-[13px] text-muted-foreground">
            Binary KNN and sqlite-vec over the same embeddings, on-device
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Chip label="encoder" value={EMBEDDER_NAME.replace('Xenova/', '')} />
          <Chip label="dims" value={String(EMBED_DIMS)} />
          <Chip label="rows" value={String(CORPUS_COUNT)} />
          {stats && <Chip label="SQLite" value={stats.sqliteVersion} />}
          {stats && <Chip label="sqlite-vec" value={stats.vecVersion} />}
          <Chip
            label="model"
            value={encoder.state === 'ready' ? 'loaded' : 'not loaded'}
          />
        </div>
      </header>

      <p className="text-xs leading-relaxed text-muted-foreground">
        The {CORPUS_COUNT} corpus vectors and the six sample queries were embedded at build time
        and ship as 40&nbsp;KB of base64, so everything here works before anything is downloaded.
        Type a query of your own and the encoder is fetched then, and only then.
      </p>

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <SearchPanel
          draft={draft}
          onDraft={setDraft}
          area={area}
          onArea={setArea}
          engines={engines}
          encoder={encoder}
          blocked={blocked}
          onLoadEncoder={() => {
            encoder.load().then(
              () => setQuery(draft),
              () => {},
            )
          }}
          showScores={showScores}
          onShowScores={setShowScores}
        />
        <VectorPanel query={query} vectors={vectors} />
      </div>

      <DbView store={engines.store} />

      <p className="pb-6 text-center text-[11.5px] leading-relaxed text-muted-foreground">
        One pipeline, two engines: 1 bit per dimension for the scan, exact cosine on the
        shortlist — run by knn-sqlite-wasm in JavaScript, and by SQLite with sqlite-vec compiled
        in, where the corpus is rows in a table and the scan is a <code>vec0</code> MATCH.
        Everything runs in this tab.
      </p>
    </div>
  )
}
