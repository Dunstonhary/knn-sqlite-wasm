import { Info, MessageCircleQuestion, Search } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { ResultCard } from '@/components/result-card'
import { hybridCaption } from '@/components/score-bars'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { CONTROL_SIZING } from '@/lib/control-sizing'
import { KnnSearchProvider } from '@/search/knn-provider'
import { MockSearchProvider } from '@/search/mock-provider'
import { AREAS, type Area } from '@/search/types'
import { useSearch } from '@/search/use-search'

type EngineKey = 'knn' | 'mock'

export function FaqSearch() {
  // Built once: the KNN provider embeds and indexes the whole corpus on first
  // use, and rebuilding it on every render would redo that work.
  const knn = useMemo(() => new KnnSearchProvider(), [])
  const mock = useMemo(() => new MockSearchProvider(), [])

  const [engineKey, setEngineKey] = useState<EngineKey>('knn')
  const [query, setQuery] = useState('')
  const [area, setArea] = useState<Area | null>(null)
  // Display-only, and deliberately not persisted: the bars are a tuning aid, so
  // every visit starts clean. Flipping this re-renders the cards but never
  // touches the provider, so the results and their order stay as they are.
  const [showScores, setShowScores] = useState(false)
  const showScoresId = useId()

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
            className={`${CONTROL_SIZING.engineToggle} flex-1 rounded-md py-1.5 text-[13px] font-semibold transition-colors ${
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
          className={`${CONTROL_SIZING.searchInput} pl-9`}
        />
      </div>

      <div className="mb-2.5 flex flex-wrap gap-1.5">
        <Button
          variant={area === null ? 'default' : 'outline'}
          size="sm"
          className={`${CONTROL_SIZING.areaChip} rounded-md px-3 text-xs`}
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
            className={`${CONTROL_SIZING.areaChip} rounded-md px-3 text-xs`}
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

      <div className="mb-2.5 flex items-center gap-1">
        {/* The checkbox sits inside its own label so the whole row is one tap
            target — the 16px box alone never was. */}
        <label
          htmlFor={showScoresId}
          className={`${CONTROL_SIZING.scoreToggleRow} flex items-center gap-2 pr-1 text-xs text-muted-foreground`}
        >
          <Checkbox
            id={showScoresId}
            checked={showScores}
            onCheckedChange={(checked) => setShowScores(checked === true)}
          />
          Show score bars
        </label>
        {/* A popover, not a tooltip: touch has no hover, so hover-only helper
            text is unreachable on a phone no matter how large the trigger. */}
        <Popover>
          <PopoverTrigger
            type="button"
            aria-label="What are score bars?"
            className={`${CONTROL_SIZING.helpTrigger} flex items-center justify-center rounded-sm text-muted-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50`}
          >
            <Info className="size-3.5" />
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[260px] p-3 text-xs">
            Per-result semantic, keyword and hybrid scores. Display only — the ranking already
            uses them, so toggling this changes nothing but the view.
          </PopoverContent>
        </Popover>
      </div>

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
