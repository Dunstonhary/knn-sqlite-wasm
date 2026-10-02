import { MessageCircleQuestion, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ResultCard } from '@/components/result-card'
import { hybridCaption } from '@/components/score-bars'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { KnnSearchProvider } from '@/search/knn-provider'
import { MockSearchProvider } from '@/search/mock-provider'
import { AREAS, type Area } from '@/search/types'
import { useSearch } from '@/search/use-search'

type EngineKey = 'knn' | 'mock'

export function FaqSearch({ showScores = false }: { showScores?: boolean }) {
  // Built once: the KNN provider embeds and indexes the whole corpus on first
  // use, and rebuilding it on every render would redo that work.
  const knn = useMemo(() => new KnnSearchProvider(), [])
  const mock = useMemo(() => new MockSearchProvider(), [])

  const [engineKey, setEngineKey] = useState<EngineKey>('knn')
  const [query, setQuery] = useState('')
  const [area, setArea] = useState<Area | null>(null)

  const engine = engineKey === 'knn' ? knn : mock
  const { empty, rows, pending, error } = useSearch(engine, query, area)

  const status = error
    ? `Search failed: ${error.message}`
    : empty
      ? `${rows.length} suggested articles — start typing to search`
      : rows.length
        ? `${rows.length} results · ${engine.name} · hybrid (${hybridCaption})`
        : 'No matches — try rephrasing'

  return (
    <div className="mx-auto max-w-[620px] p-5">
      <header className="mb-4 flex items-center gap-2.5">
        <div className="flex size-[34px] items-center justify-center rounded-lg bg-muted">
          <MessageCircleQuestion className="size-[18px]" />
        </div>
        <div className="flex-1">
          <p className="text-[15px] font-semibold">FAQ-KNN-Application</p>
          <p className="text-[13px] text-muted-foreground">Semantic + keyword hybrid search</p>
        </div>
      </header>

      <div className="mb-4 flex gap-1 rounded-lg bg-muted p-1" role="group" aria-label="Search engine">
        {(
          [
            ['knn', 'Binary KNN'],
            ['mock', 'Token overlap'],
          ] as Array<[EngineKey, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={engineKey === key}
            onClick={() => setEngineKey(key)}
            className={`flex-1 rounded-md py-1.5 text-[13px] font-semibold transition-colors ${
              engineKey === key
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="relative mb-3">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="How do I connect my payment provider?"
          aria-label="Search the help centre"
          className="h-10 pl-9"
        />
      </div>

      <div className="mb-2.5 flex flex-wrap gap-1.5">
        <Button
          variant={area === null ? 'default' : 'outline'}
          size="sm"
          className="h-7 rounded-md px-3 text-xs"
          aria-pressed={area === null}
          onClick={() => setArea(null)}
        >
          All areas
        </Button>
        {AREAS.map((a) => (
          <Button
            key={a}
            variant={area === a ? 'default' : 'outline'}
            size="sm"
            className="h-7 rounded-md px-3 text-xs"
            aria-pressed={area === a}
            onClick={() => setArea(area === a ? null : a)}
          >
            {a}
          </Button>
        ))}
      </div>

      <p
        className="mb-2.5 text-xs text-muted-foreground"
        aria-live="polite"
        data-pending={pending || undefined}
      >
        {status}
      </p>

      <div className="flex flex-col gap-2">
        {rows.map((entry) => (
          <ResultCard
            key={`${entry.item.area}:${entry.item.q}`}
            entry={entry}
            showScores={showScores && !empty}
          />
        ))}
      </div>
    </div>
  )
}
