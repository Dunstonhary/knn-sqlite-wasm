import { useMemo, useState } from 'react'
import { AREA_COLOR, Space2D } from '@/components/space-2d'
import { HUES as HUES3, Space3D } from '@/components/space-3d'
import { FAQ } from '@/search/faq-data'
import { project } from '@/search/geometry'
import { K_CHOICES, type Layout, layout2d, type Vectors } from '@/search/neighbors'
import { Segmented } from './segmented'

type ViewKey = '2d' | '3d'

/**
 * The geometry panel: where the query sits relative to the corpus.
 *
 * Two projections of the same 384 dimensions, and a k that only this panel
 * cares about — the result list has its own cut-off, so moving k here changes
 * what is drawn and voted on, never what is retrieved.
 */
export function VectorPanel({ query, vectors }: { query: string; vectors: Vectors | null }) {
  const [view, setView] = useState<ViewKey>('2d')
  const [k, setK] = useState<number>(5)
  const [layout, setLayout] = useState<Layout>('plane')

  const data = useMemo(
    () => (vectors ? layout2d(query, FAQ, vectors, k, layout) : null),
    [query, vectors, k, layout],
  )
  const projection = useMemo(
    () => (vectors ? project(query, FAQ, vectors, 3) : null),
    [query, vectors],
  )

  const neighbors = data?.points.filter((p) => p.neighbor) ?? []

  return (
    <section className="flex flex-col rounded-xl border bg-card">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-3">
        <h2 className="mr-auto text-sm font-semibold">Vector space</h2>
        <Segmented<ViewKey>
          label="View"
          value={view}
          options={[
            ['2d', '2D'],
            ['3d', '3D'],
          ]}
          onChange={setView}
        />
        {view === '2d' && (
          <>
            <Segmented<number>
              label="k"
              value={k}
              options={K_CHOICES.map((n) => [n, String(n)] as [number, string])}
              onChange={setK}
            />
            <Segmented<Layout>
              label="Axes"
              value={layout}
              options={[
                ['plane', 'Query plane'],
                ['mds', 'MDS'],
              ]}
              onChange={setLayout}
            />
          </>
        )}
      </header>

      {!data || !projection ? (
        <p className="p-4 text-xs text-muted-foreground">Waiting for the query vector…</p>
      ) : (
        <div className="flex flex-col gap-3 p-4">
          {view === '2d' ? (
            <>
              <p className="text-xs leading-relaxed text-muted-foreground">
                All {FAQ.length} entries around the query at the origin.{' '}
                <span className="font-medium text-foreground">
                  d = √Σ(q<sub>i</sub> − v<sub>i</sub>)²
                </span>{' '}
                over {data.dims} dimensions. Vectors are unit length, so{' '}
                <span className="font-medium text-foreground">d² = 2 − 2·cos</span> — distance and
                cosine rank identically, and distance is drawn because a fixed distance is a
                circle. Two unrelated entries sit{' '}
                <span className="tabular-nums text-foreground">√2 ≈ 1.414</span> apart; that is the
                yardstick every number below is beating.
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {layout === 'plane' ? (
                  <>
                    <span className="font-medium text-foreground">Query plane.</span> x along the
                    query, y along “{data.anchor}” with the query component removed, each point
                    then pushed out to its true distance — so{' '}
                    <em>every radius here is exact</em> and only the bearing is a projection.
                    Overlapping points slide along their own ring, which spends bearing and never
                    distance.
                  </>
                ) : (
                  <>
                    <span className="font-medium text-foreground">MDS.</span> All{' '}
                    {data.points.length + 1} points fitted to the full pairwise distance matrix at
                    once. Kruskal stress-1 ={' '}
                    <span className="tabular-nums text-foreground">{data.stress.toFixed(3)}</span>
                    {data.stress > 0.3
                      ? ' — high, and honest: these entries sit nearly at right angles, and that many mutually orthogonal points form a simplex no plane can hold. Read it for who clusters with whom, never for how far.'
                      : ' — no radius is exact, but none is far off.'}
                  </>
                )}
              </p>
              <Space2D data={data} />

              <ul className="flex flex-col gap-1">
                {neighbors.map((p) => (
                  <li key={p.label} className="flex items-baseline gap-2 text-xs">
                    <span
                      className="w-3 shrink-0 font-semibold tabular-nums"
                      style={{ color: AREA_COLOR[p.area] }}
                    >
                      {p.rank}
                    </span>
                    <span className="flex-1 truncate" title={`tags: ${p.tags.join(', ')}`}>
                      {p.label}
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      d {p.dist.toFixed(3)}
                    </span>
                    <span className="w-20 shrink-0 text-right tabular-nums text-muted-foreground">
                      cos {p.cosine.toFixed(3)}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="rounded-lg border p-3">
                <p className="text-xs leading-relaxed">
                  <span className="font-semibold">Majority vote over the {data.k}:</span>{' '}
                  {data.vote.counts.map((c, i) => (
                    <span key={c.area}>
                      {i > 0 && ' · '}
                      <span style={{ color: AREA_COLOR[c.area] }}>{c.area}</span> {c.n}
                    </span>
                  ))}
                  {' → '}
                  {data.vote.tie ? (
                    <span className="font-semibold text-destructive">tie, k did not decide</span>
                  ) : (
                    <span className="font-semibold">{data.vote.winner}</span>
                  )}
                </p>
                <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                  The only place k being odd matters, and it matters less than the folklore says:
                  odd k breaks ties for <em>two</em> classes. Six areas here, so an odd k still
                  ties — which is what the red flag is for. Ranking never votes, so for the results
                  list k is only a cut-off.
                </p>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs leading-relaxed text-muted-foreground">
                The query and its two nearest matches, with the angle between each drawn as an
                arc. These three vectors define the box, so these angles are <em>exact</em> — no
                projection error. The dashed grey line is where an <em>unrelated</em> entry sits:
                in {projection.dims} dimensions two arbitrary directions land about 88° apart.
                Drag to rotate.
              </p>
              <Space3D vectors={projection.vectors} />
              <ul className="flex flex-col gap-1">
                {projection.vectors.slice(0, 2).map((v, i) => (
                  <li key={v.label} className="flex items-baseline gap-2 text-xs">
                    <span
                      className="w-3 font-semibold"
                      style={{ color: HUES3[i % HUES3.length] }}
                    >
                      {v.rank}
                    </span>
                    <span className="flex-1 truncate">{v.label}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {v.cosine.toFixed(3)}
                    </span>
                    <span className="w-16 text-right tabular-nums text-muted-foreground">
                      {Math.round(v.inPlane * 100)}% here
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  )
}
