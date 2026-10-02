import type { ScoredEntry } from '@/search/types'
import { HYBRID_WEIGHTS } from '@/search/types'

const pct = (v: number) => Math.round(v * 100)

/**
 * Per-channel score readout. This is a debugging affordance for tuning the
 * fusion weights, not end-user UI — it renders only while the "Show score
 * bars" checkbox is ticked.
 */
export function ScoreBars({ entry }: { entry: ScoredEntry }) {
  if (entry.sem === undefined || entry.kw === undefined || entry.hybrid === undefined) {
    return null
  }

  const channels = [
    { label: 'semantic', value: entry.sem, bar: 'bg-score-semantic' },
    { label: 'keyword', value: entry.kw, bar: 'bg-score-keyword' },
    { label: 'hybrid', value: entry.hybrid, bar: 'bg-score-hybrid' },
  ]

  return (
    <div className="mt-2.5 flex flex-col gap-1 border-t pt-2.5">
      {channels.map((c) => (
        <div key={c.label} className="flex items-center gap-2">
          <span className="w-16 text-[11px] text-muted-foreground">{c.label}</span>
          <div
            className="h-[5px] flex-1 overflow-hidden rounded-full bg-muted"
            role="meter"
            aria-label={`${c.label} score`}
            aria-valuenow={pct(c.value)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className={`h-full ${c.bar}`} style={{ width: `${pct(c.value)}%` }} />
          </div>
          <span className="w-7 text-right text-[11px] tabular-nums text-muted-foreground">
            {pct(c.value)}
          </span>
        </div>
      ))}
    </div>
  )
}

/** Human-readable description of the fusion, derived from the weights so the
    copy cannot drift from the maths. */
export const hybridCaption = `${HYBRID_WEIGHTS.semantic} semantic + ${HYBRID_WEIGHTS.keyword} keyword`
