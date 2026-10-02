import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { ScoreBars } from '@/components/score-bars'
import type { ScoredEntry } from '@/search/types'

export function ResultCard({
  entry,
  showScores,
}: {
  entry: ScoredEntry
  showScores: boolean
}) {
  return (
    <Card className="gap-0 px-3.5 py-3 shadow-xs">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{entry.item.q}</h3>
        <Badge variant="secondary" className="shrink-0 font-medium">
          {entry.item.area}
        </Badge>
      </div>
      <p className="text-[13px] leading-relaxed text-muted-foreground">{entry.item.a}</p>
      {showScores && <ScoreBars entry={entry} />}
    </Card>
  )
}
