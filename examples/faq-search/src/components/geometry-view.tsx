import { useMemo } from 'react'
import { FAQ } from '@/search/faq-data'
import { Space3D, HUES as HUES3 } from '@/components/space-3d'
import { bitPair, project } from '@/search/geometry'



function BitView({ query, entry }: { query: string; entry: (typeof FAQ)[number] }) {
  const { q, d } = useMemo(() => bitPair(query, entry), [query, entry])
  const cols = 32
  const cell = 7
  const rows = Math.ceil(q.length / cols)
  const diff = q.reduce((n, b, i) => n + (b === d[i] ? 0 : 1), 0)

  return (
    <div>
      <svg viewBox={`0 0 ${cols * cell} ${rows * cell}`} className="w-full max-w-[340px]" role="img"
        aria-label={`Binary codes compared bit by bit; ${diff} of ${q.length} bits differ`}>
        <title>Binary code comparison</title>
        {q.map((bit, i) => {
          const same = bit === d[i]
          return (
            <rect key={i} x={(i % cols) * cell} y={Math.floor(i / cols) * cell}
              width={cell - 1} height={cell - 1} rx="1"
              fill={same ? 'var(--color-muted)' : 'var(--color-destructive)'}
              opacity={same ? 1 : 0.85} />
          )
        })}
      </svg>
      <p className="mt-2 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">{diff}</span> of {q.length} bits differ —
        this is the Hamming distance, the only thing stage 1 ever computes.
      </p>
    </div>
  )
}

export function GeometryView({ query }: { query: string }) {
  const projection = useMemo(
    () => project(query || 'how do I add a team member', FAQ, 3),
    [query],
  )
  const top = projection.vectors[0]
  const topEntry = useMemo(() => FAQ.find((f) => f.q === top?.label), [top])

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h3 className="text-sm font-semibold">Where the query sits</h3>
        <p className="mt-1 mb-3 text-xs leading-relaxed text-muted-foreground">
          The query and its two nearest matches, with the angle between each drawn as an arc.
          These three vectors define the box, so these angles are <em>exact</em> — no projection
          error. The dashed grey line marks where an <em>unrelated</em> entry sits: in{' '}
          {projection.dims} dimensions two arbitrary directions land about 88° apart, so that is
          the yardstick. A match at 50° is not “pointing elsewhere” — it is far closer to the
          query than anything else in the corpus can be. Drag to rotate.
        </p>
        <Space3D vectors={projection.vectors} />
        <ul className="mt-3 flex flex-col gap-1">
          {projection.vectors.slice(0, 2).map((v, i) => (
            <li key={v.label} className="flex items-baseline gap-2 text-xs">
              <span className="w-3 font-semibold" style={{ color: HUES3[i % HUES3.length] }}>{v.rank}</span>
              <span className="flex-1 truncate">{v.label}</span>
              <span className="tabular-nums text-muted-foreground">{v.cosine.toFixed(3)}</span>
              <span className="w-16 text-right tabular-nums text-muted-foreground">
                {Math.round(v.inPlane * 100)}% here
              </span>
            </li>
          ))}
        </ul>
      </section>

      {topEntry && (
        <section>
          <h3 className="text-sm font-semibold">What stage 1 actually compares</h3>
          <p className="mt-1 mb-3 text-xs leading-relaxed text-muted-foreground">
            Each dimension collapses to a single bit — is it positive or not. Red cells are where
            the query and “{topEntry.q}” disagree. {projection.dims} floats become{' '}
            {projection.dims / 8} bytes, which is the whole reason a 50k corpus fits in 2.4&nbsp;MB.
          </p>
          <BitView query={query || 'how do I add a team member'} entry={topEntry} />
        </section>
      )}
    </div>
  )
}
