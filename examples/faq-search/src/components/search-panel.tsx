import { Check, Download, Search, TriangleAlert } from 'lucide-react'
import { useId } from 'react'
import { hybridCaption } from '@/components/score-bars'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { ResultCard } from '@/components/result-card'
import { CONTROL_SIZING } from '@/lib/control-sizing'
import { SAMPLE_QUERIES } from '@/search/sample-queries'
import { AREAS, type Area } from '@/search/types'
import type { EnginesState } from '@/search/use-engines'
import type { EncoderStatus } from '@/search/use-encoder'

const ms = (v: number | undefined) => (v === undefined ? '—' : v < 1 ? v.toFixed(2) : v.toFixed(1))

/**
 * Both engines, every query.
 *
 * The timings are the honest part: at fourteen rows SQL loses to a JS loop
 * and says so. What the strip is really for is the agreement flag — same
 * vectors and same two stages, so a disagreement would mean one of them is
 * wrong, and that is worth seeing on every query rather than in a test log.
 */
function EngineStrip({ engines }: { engines: EnginesState }) {
  const rows = [engines.js, engines.sql]
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border px-3 py-2 text-xs">
      {rows.map((run) => (
        <span key={run.name} className="flex items-baseline gap-1.5">
          <span className="font-medium">{run.name}</span>
          {run.error ? (
            <span className="text-destructive">failed</span>
          ) : (
            <span className="tabular-nums text-muted-foreground">
              {ms(run.result?.ms)} ms
            </span>
          )}
        </span>
      ))}
      {engines.agree !== null && (
        <span
          className={`flex items-center gap-1 ${
            engines.agree ? 'text-muted-foreground' : 'font-semibold text-destructive'
          }`}
        >
          {engines.agree ? (
            <>
              <Check className="size-3.5" /> identical ranking
            </>
          ) : (
            <>
              <TriangleAlert className="size-3.5" /> engines disagree
            </>
          )}
        </span>
      )}
    </div>
  )
}

/** The encoder is 21.9 MB, so it is asked for rather than simply taken. */
function EncoderPrompt({ encoder, onLoad }: { encoder: EncoderStatus; onLoad: () => void }) {
  if (encoder.state === 'loading') {
    const pct = encoder.progress?.fraction != null ? Math.round(encoder.progress.fraction * 100) : null
    return (
      <div className="rounded-lg border p-3">
        <p className="text-xs font-medium">Downloading the sentence encoder…</p>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-foreground transition-[width]"
            style={{ width: pct === null ? '30%' : `${pct}%` }}
          />
        </div>
        <p className="mt-1.5 truncate text-[11px] text-muted-foreground">
          {encoder.progress?.file ?? 'starting'} {pct === null ? '' : `· ${pct}%`}
        </p>
      </div>
    )
  }
  return (
    <div className="rounded-lg border border-dashed p-3">
      <p className="text-xs leading-relaxed">
        <span className="font-medium">This query is not one of the precomputed ones.</span>{' '}
        Embedding it needs MiniLM-L6-v2 — 21.9&nbsp;MB, fetched once and cached by the browser.
        The sample queries below need nothing.
      </p>
      {encoder.error && (
        <p className="mt-1.5 text-[11px] text-destructive">{encoder.error.message}</p>
      )}
      <Button size="sm" className="mt-2 h-8 gap-1.5 px-3 text-xs" onClick={onLoad}>
        <Download className="size-3.5" />
        Load encoder and search
      </Button>
    </div>
  )
}

export function SearchPanel({
  draft,
  onDraft,
  area,
  onArea,
  engines,
  encoder,
  blocked,
  onLoadEncoder,
  showScores,
  onShowScores,
}: {
  draft: string
  onDraft: (next: string) => void
  area: Area | null
  onArea: (next: Area | null) => void
  engines: EnginesState
  encoder: EncoderStatus
  blocked: boolean
  onLoadEncoder: () => void
  showScores: boolean
  onShowScores: (next: boolean) => void
}) {
  const showScoresId = useId()

  const status = engines.error
    ? `Search failed: ${engines.error.message}`
    : engines.empty
      ? `${engines.rows.length} suggested articles`
      : engines.rows.length
        ? `${engines.rows.length} results · hybrid (${hybridCaption})`
        : 'No matches — try rephrasing'

  return (
    <section className="flex flex-col rounded-xl border bg-card">
      <header className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Search</h2>
      </header>

      <div className="flex flex-col gap-3 p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={draft}
            onChange={(e) => onDraft(e.target.value)}
            placeholder="Ask the help centre something"
            aria-label="Search the help centre"
            className={`${CONTROL_SIZING.searchInput} pl-9`}
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {SAMPLE_QUERIES.map((q) => (
            <button
              key={q}
              type="button"
              aria-pressed={draft === q}
              onClick={() => onDraft(q)}
              className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                draft === q
                  ? 'border-foreground bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {q}
            </button>
          ))}
        </div>

        {blocked ? (
          <EncoderPrompt encoder={encoder} onLoad={onLoadEncoder} />
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              <Button
                variant={area === null ? 'default' : 'outline'}
                size="sm"
                className={`${CONTROL_SIZING.areaChip} rounded-md px-3 text-xs`}
                aria-pressed={area === null}
                onClick={() => onArea(null)}
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
                  onClick={() => onArea(area === a ? null : a)}
                >
                  {a}
                </Button>
              ))}
            </div>

            <EngineStrip engines={engines} />

            {engines.sql.result?.detail && !engines.empty && (
              <p className="font-mono text-[11px] leading-relaxed text-muted-foreground">
                {engines.sql.result.detail}
              </p>
            )}

            <div className="flex items-center justify-between gap-2">
              <p
                className="text-xs text-muted-foreground"
                aria-live="polite"
                data-pending={engines.pending || undefined}
              >
                {status}
              </p>
              <label
                htmlFor={showScoresId}
                className={`${CONTROL_SIZING.scoreToggleRow} flex items-center gap-2 pr-1 text-xs text-muted-foreground`}
              >
                <Checkbox
                  id={showScoresId}
                  checked={showScores}
                  onCheckedChange={(checked) => onShowScores(checked === true)}
                />
                Score bars
              </label>
            </div>

            <div className="flex flex-col gap-2">
              {engines.rows.map((entry) => (
                <ResultCard
                  key={`${entry.item.area}:${entry.item.q}`}
                  entry={entry}
                  showScores={showScores && !engines.empty}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  )
}
