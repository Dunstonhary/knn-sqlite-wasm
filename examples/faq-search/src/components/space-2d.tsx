import { useMemo, useState } from 'react'
import type { Layout2D, Placed } from '@/search/neighbors'
import { AREAS, type Area } from '@/search/types'

const W = 420
const H = 300
const PAD = 18

/** One hue per area, defined in index.css so legend and plot cannot drift. */
export const AREA_COLOR: Record<Area, string> = {
  Inbox: 'var(--color-area-inbox)',
  Contacts: 'var(--color-area-contacts)',
  Connect: 'var(--color-area-connect)',
  Settings: 'var(--color-area-settings)',
  Payments: 'var(--color-area-payments)',
  Integrations: 'var(--color-area-integrations)',
}

/** Smallest round step that keeps the rings countable. */
function tickStep(max: number): number {
  for (const step of [0.1, 0.2, 0.25, 0.5, 1]) {
    if (max / step <= 5) return step
  }
  return 1
}

/**
 * Fit the points and the query into the canvas at a single scale.
 *
 * A fixed square window centred on the query wastes most of the picture here:
 * every entry sits at a similar distance in a 60-degree fan, because 384-dim
 * hash vectors are close to orthogonal and that narrowness is the honest
 * shape of the data. Cropping to what is actually occupied is what makes the
 * fan readable; one scale for both axes is what keeps the rings circular.
 */
function useFit(points: Placed[]) {
  return useMemo(() => {
    const xs = [0, ...points.map((p) => p.x)]
    const ys = [0, ...points.map((p) => p.y)]
    let minX = Math.min(...xs)
    let maxX = Math.max(...xs)
    let minY = Math.min(...ys)
    let maxY = Math.max(...ys)
    const pad = 0.1 * Math.max(maxX - minX, maxY - minY, 0.2)
    minX -= pad
    maxX += pad
    minY -= pad
    maxY += pad

    const scale = Math.min((W - 2 * PAD) / (maxX - minX), (H - 2 * PAD) / (maxY - minY))
    const offX = PAD + (W - 2 * PAD - (maxX - minX) * scale) / 2
    const offY = PAD + (H - 2 * PAD - (maxY - minY) * scale) / 2
    const sx = (x: number) => offX + (x - minX) * scale
    const sy = (y: number) => offY + (maxY - y) * scale
    return { scale, sx, sy, qx: sx(0), qy: sy(0) }
  }, [points])
}

/**
 * Nudge overlapping points apart along their ring, never across it.
 *
 * Only used where the radius is the true distance and the bearing is already
 * declared a projection: the bearings here bunch hard — one match sits on the
 * axis and the rest pile into a few degrees of each other — so without this
 * half the corpus hides under three dots. Moving a point tangentially spends
 * accuracy that was never claimed and keeps the one number the plot asserts.
 */
function spreadOnRings(
  seats: Array<{ r: number; a: number }>,
  minGap: number,
): Array<{ r: number; a: number }> {
  const out = seats.map((s) => ({ ...s }))
  const pos = (s: { r: number; a: number }) => [s.r * Math.cos(s.a), s.r * Math.sin(s.a)] as const

  for (let pass = 0; pass < 120; pass++) {
    let moved = false
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i] as { r: number; a: number }
        const b = out[j] as { r: number; a: number }
        if (a.r < 1e-6 || b.r < 1e-6) continue
        const [ax, ay] = pos(a)
        const [bx, by] = pos(b)
        let dx = ax - bx
        let dy = ay - by
        let d = Math.hypot(dx, dy)
        if (d >= minGap) continue
        // Exactly coincident: break the symmetry deterministically.
        if (d < 1e-9) {
          dx = -Math.sin(a.a)
          dy = Math.cos(a.a)
          d = 1
        }
        const push = (minGap - d) / 2
        const sa = Math.sign(dx * -Math.sin(a.a) + dy * Math.cos(a.a)) || 1
        const sb = Math.sign(-dx * -Math.sin(b.a) - dy * Math.cos(b.a)) || -1
        // The first match holds the x axis, so it is the one that stays put.
        if (i > 0) a.a += (sa * push) / a.r
        b.a += (sb * push) / b.r
        moved = true
      }
    }
    if (!moved) break
  }
  return out
}

export function Space2D({ data }: { data: Layout2D }) {
  const [hover, setHover] = useState<number | null>(null)
  const { scale, sx, sy, qx, qy } = useFit(data.points)

  // Screen positions, de-overlapped where that costs nothing true.
  const seats = useMemo(() => {
    const raw = data.points.map((p) => ({
      r: Math.hypot(sx(p.x) - qx, sy(p.y) - qy),
      a: Math.atan2(sy(p.y) - qy, sx(p.x) - qx),
    }))
    const laid = data.exactRadius ? spreadOnRings(raw, 19) : raw
    return laid.map((s) => ({ x: qx + s.r * Math.cos(s.a), y: qy + s.r * Math.sin(s.a) }))
  }, [data.points, data.exactRadius, sx, sy, qx, qy])

  const ticks = useMemo(() => {
    if (!data.exactRadius) return []
    const step = tickStep(data.maxDist)
    const out: number[] = []
    for (let t = step; t <= data.maxDist * 1.05 + 1e-9; t += step) out.push(Number(t.toFixed(4)))
    return out
  }, [data.exactRadius, data.maxDist])

  const shown = hover !== null ? data.points[hover] : null
  const legendAreas = AREAS.filter((a) => data.points.some((p) => p.area === a))
  const ring = data.ringRadius * scale

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none select-none"
        role="img"
        aria-label={`Two-dimensional map of ${data.points.length} FAQ entries around the query, with the ${data.k} nearest marked`}
      >
        <title>Euclidean neighbourhood of the query</title>

        {/* Distance rings. The whole reason to measure in Euclidean rather
            than in angle: a fixed distance is a circle you can draw. Only
            drawn where a drawn radius is the real distance. */}
        {ticks.map((t) => (
          <g key={t}>
            <circle
              cx={qx}
              cy={qy}
              r={t * scale}
              fill="none"
              stroke="var(--color-border)"
              strokeWidth="1"
            />
            <text
              x={qx + t * scale}
              y={qy - 4}
              fontSize="8"
              fill="var(--color-muted-foreground)"
              textAnchor="middle"
            >
              {t.toFixed(2)}
            </text>
          </g>
        ))}

        <line x1={PAD} y1={qy} x2={W - PAD} y2={qy} stroke="var(--color-border)" strokeWidth="1" />
        <line x1={qx} y1={PAD} x2={qx} y2={H - PAD} stroke="var(--color-border)" strokeWidth="1" />

        {/* The decision boundary: inside is a neighbour, outside is not. */}
        <circle
          cx={qx}
          cy={qy}
          r={ring}
          fill="var(--color-score-hybrid)"
          fillOpacity="0.06"
          stroke="var(--color-score-hybrid)"
          strokeWidth="1.5"
          strokeDasharray="4 3"
        />
        <text
          x={qx + ring}
          y={qy + 15}
          fontSize="9"
          fontWeight="600"
          textAnchor="middle"
          fill="var(--color-score-hybrid)"
        >
          k={data.k} · d {data.exactRadius ? '=' : '≈'} {data.kthDist.toFixed(3)}
        </text>

        {/* Drawn before the entries, not after: mds can place the nearest
            match almost on top of the query, and a marker that hides the
            point it is being compared with is worse than one half covered. */}
        <circle
          cx={qx}
          cy={qy}
          r="5"
          fill="var(--color-foreground)"
          stroke="var(--color-background)"
          strokeWidth="1.5"
        />
        <text
          x={qx}
          y={qy + 18}
          fontSize="10"
          fontWeight="700"
          textAnchor="middle"
          fill="var(--color-foreground)"
        >
          query
        </text>

        {/* Outsiders first, so a neighbour always draws over them. */}
        {data.points
          .filter((p) => !p.neighbor)
          .map((p) => {
            const i = p.rank - 1
            return (
              <circle
                key={p.label}
                cx={seats[i]?.x}
                cy={seats[i]?.y}
                r={hover === i ? 6 : 4}
                fill="var(--color-background)"
                stroke={AREA_COLOR[p.area]}
                strokeWidth="1.5"
                opacity={hover === i ? 1 : 0.6}
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            )
          })}

        {data.points
          .filter((p) => p.neighbor)
          .map((p) => {
            const i = p.rank - 1
            const on = hover === i
            const px = seats[i]?.x ?? qx
            const py = seats[i]?.y ?? qy
            return (
              <g
                key={p.label}
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                {/* The segment whose length is the distance being compared. */}
                <line
                  x1={qx}
                  y1={qy}
                  x2={px}
                  y2={py}
                  stroke={AREA_COLOR[p.area]}
                  strokeWidth={on ? 2.4 : 1.2}
                  opacity={on ? 1 : 0.65}
                />
                <circle cx={px} cy={py} r={on ? 8 : 6} fill={AREA_COLOR[p.area]} />
                <text
                  x={px}
                  y={py + 3}
                  fontSize="9"
                  fontWeight="700"
                  textAnchor="middle"
                  fill="var(--color-background)"
                >
                  {p.rank}
                </text>
                {on && (
                  <text
                    x={px}
                    y={py - 12}
                    fontSize="10"
                    fontWeight="700"
                    textAnchor="middle"
                    fill={AREA_COLOR[p.area]}
                  >
                    {p.dist.toFixed(3)}
                  </text>
                )}
              </g>
            )
          })}

      </svg>

      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
        {legendAreas.map((a) => (
          <span key={a} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span
              className="inline-block size-2 rounded-full"
              style={{ backgroundColor: AREA_COLOR[a] }}
            />
            {a}
          </span>
        ))}
      </div>

      <p className="mt-2 min-h-[32px] text-xs leading-relaxed text-muted-foreground">
        {shown ? (
          <>
            <span className="font-semibold text-foreground">#{shown.rank}</span> {shown.label} — d ={' '}
            <span className="tabular-nums">{shown.dist.toFixed(4)}</span>, cos ={' '}
            <span className="tabular-nums">{shown.cosine.toFixed(4)}</span>,{' '}
            <span className="tabular-nums">{shown.hamming}</span>/{data.dims} bits differ
            {data.layout === 'plane' && (
              <> · {Math.round(shown.inPlane * 100)}% of it lies in this plane</>
            )}
            {shown.matched.length > 0 && <> · tags hit: {shown.matched.join(', ')}</>}
          </>
        ) : (
          'Hover a point for its exact distance, its cosine, and which of its tags the query hit.'
        )}
      </p>
    </div>
  )
}
