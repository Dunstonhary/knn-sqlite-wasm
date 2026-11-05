import { useEffect, useRef, useState } from 'react'
import type { ProjectedVector } from '@/search/geometry'

const SIZE = 360
const R = 118
const CX = SIZE / 2
const CY = SIZE / 2
/** Camera distance in sphere radii. Larger is flatter; this keeps a little
    perspective so depth reads without warping the angles much. */
const CAM = 3.2

export const HUES = [
  'var(--color-score-semantic)',
  'var(--color-score-keyword)',
  'var(--color-score-hybrid)',
  '#a855f7',
  '#f59e0b',
]

interface P3 {
  x: number
  y: number
  z: number
}

/** Yaw about the vertical axis, then pitch toward the viewer. */
function rotate(p: P3, yaw: number, pitch: number): P3 {
  const cy = Math.cos(yaw)
  const sy = Math.sin(yaw)
  const x1 = p.x * cy + p.z * sy
  const z1 = -p.x * sy + p.z * cy
  const cp = Math.cos(pitch)
  const sp = Math.sin(pitch)
  const y2 = p.y * cp - z1 * sp
  const z2 = p.y * sp + z1 * cp
  return { x: x1, y: y2, z: z2 }
}

/** Weak perspective: nearer points sit further from centre and draw larger. */
function toScreen(p: P3) {
  const k = CAM / (CAM - p.z)
  return { sx: CX + p.x * R * k, sy: CY - p.y * R * k, k, depth: p.z }
}

export function Space3D({ vectors }: { vectors: ProjectedVector[] }) {
  const [yaw, setYaw] = useState(0.6)
  const [pitch, setPitch] = useState(0.25)
  const [spin, setSpin] = useState(true)
  const [hover, setHover] = useState<number | null>(null)
  const drag = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (!spin) return
    let raf = 0
    let last = performance.now()
    const tick = (t: number) => {
      const dt = (t - last) / 1000
      last = t
      setYaw((v) => v + dt * 0.35)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [spin])

  const shown = vectors.slice(0, 2)

  // A coordinate grid rather than a sphere: the floor plane plus the two back
  // walls give a box you can read depth from, and the three axes show which
  // direction each basis vector points.
  const DIV = 4
  const seg = (a: P3, b: P3) => {
    const ra = toScreen(rotate(a, yaw, pitch))
    const rb = toScreen(rotate(b, yaw, pitch))
    return { x1: ra.sx, y1: ra.sy, x2: rb.sx, y2: rb.sy }
  }

  const gridLines: Array<{ x1: number; y1: number; x2: number; y2: number; dim: boolean }> = []
  for (let i = 0; i <= DIV; i++) {
    const t = -1 + (2 * i) / DIV
    // floor (y = -1)
    gridLines.push({ ...seg({ x: t, y: -1, z: -1 }, { x: t, y: -1, z: 1 }), dim: false })
    gridLines.push({ ...seg({ x: -1, y: -1, z: t }, { x: 1, y: -1, z: t }), dim: false })
    // back wall (z = -1)
    gridLines.push({ ...seg({ x: t, y: -1, z: -1 }, { x: t, y: 1, z: -1 }), dim: true })
    gridLines.push({ ...seg({ x: -1, y: t, z: -1 }, { x: 1, y: t, z: -1 }), dim: true })
    // side wall (x = -1)
    gridLines.push({ ...seg({ x: -1, y: -1, z: t }, { x: -1, y: 1, z: t }), dim: true })
    gridLines.push({ ...seg({ x: -1, y: t, z: -1 }, { x: -1, y: t, z: 1 }), dim: true })
  }

  const axisDefs: Array<{ end: P3; label: string }> = [
    { end: { x: 1.15, y: 0, z: 0 }, label: 'e1' },
    { end: { x: 0, y: 1.15, z: 0 }, label: 'e2' },
    { end: { x: 0, y: 0, z: 1.15 }, label: 'e3' },
  ]
  const axes = axisDefs.map((a) => ({
    ...seg({ x: 0, y: 0, z: 0 }, a.end),
    label: a.label,
    tip: toScreen(rotate(a.end, yaw, pitch)),
  }))

  const items = shown
    .map((v, i) => {
      const r = rotate({ x: v.x, y: v.y, z: v.z }, yaw, pitch)
      return { v, i, r, s: toScreen(r) }
    })
    // Painter's algorithm: far things first so near ones overlap them.
    .sort((a, b) => a.s.depth - b.s.depth)

  // An arc swept from the query round to each vector, so the angle between
  // them is a thing you can see rather than a number you have to trust.
  const arcs = shown.map((v, i) => {
    const len = Math.hypot(v.x, v.y, v.z) || 1
    const u = { x: v.x / len, y: v.y / len, z: v.z / len }
    const theta = Math.acos(Math.max(-1, Math.min(1, u.x))) // query is (1,0,0)
    const pts: string[] = []
    const STEPS = 28
    for (let k = 0; k <= STEPS; k++) {
      const t = (k / STEPS) * theta
      // Rotate from the query toward this vector, staying on the unit sphere.
      const perp = { x: u.x - Math.cos(theta), y: u.y, z: u.z }
      const pn = Math.hypot(perp.x, perp.y, perp.z) || 1
      const e = { x: perp.x / pn, y: perp.y / pn, z: perp.z / pn }
      const radius = 0.42 + i * 0.1
      const pt = {
        x: (Math.cos(t) * 1 + Math.sin(t) * e.x) * radius,
        y: Math.sin(t) * e.y * radius,
        z: Math.sin(t) * e.z * radius,
      }
      const sp = toScreen(rotate(pt, yaw, pitch))
      pts.push(`${sp.sx.toFixed(1)},${sp.sy.toFixed(1)}`)
    }
    const midT = theta / 2
    const perp = { x: u.x - Math.cos(theta), y: u.y, z: u.z }
    const pn = Math.hypot(perp.x, perp.y, perp.z) || 1
    const e = { x: perp.x / pn, y: perp.y / pn, z: perp.z / pn }
    const radius = 0.42 + i * 0.1
    const mid = toScreen(
      rotate(
        {
          x: (Math.cos(midT) + Math.sin(midT) * e.x) * radius,
          y: Math.sin(midT) * e.y * radius,
          z: Math.sin(midT) * e.z * radius,
        },
        yaw,
        pitch,
      ),
    )
    return { points: pts.join(' '), mid, deg: Math.round((theta * 180) / Math.PI), i }
  })

  // Where an unrelated entry sits. In 384 dimensions two arbitrary directions
  // are ~88 degrees apart, so this is the yardstick the matches are beating.
  const BASELINE_DEG = 88
  const bRad = (BASELINE_DEG * Math.PI) / 180
  const baseline = toScreen(
    rotate({ x: Math.cos(bRad), y: 0, z: Math.sin(bRad) }, yaw, pitch),
  )

  const qr = rotate({ x: 1, y: 0, z: 0 }, yaw, pitch)
  const qs = toScreen(qr)

  return (
    <div>
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="w-full max-w-[360px] touch-none select-none"
        role="img"
        aria-label="Rotatable 3D view of the query and nearest FAQ entries on the unit sphere"
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY }
          setSpin(false)
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          if (!drag.current) return
          const dx = e.clientX - drag.current.x
          const dy = e.clientY - drag.current.y
          drag.current = { x: e.clientX, y: e.clientY }
          setYaw((v) => v + dx * 0.01)
          setPitch((v) => Math.max(-1.3, Math.min(1.3, v + dy * 0.01)))
        }}
        onPointerUp={() => {
          drag.current = null
        }}
      >
        <title>3D vector space</title>

        {gridLines.map((g, i) => (
          <line
            key={i}
            x1={g.x1}
            y1={g.y1}
            x2={g.x2}
            y2={g.y2}
            stroke="var(--color-border)"
            strokeWidth="1"
            opacity={g.dim ? 0.35 : 0.7}
          />
        ))}

        {axes.map((a) => (
          <g key={a.label}>
            <line
              x1={a.x1}
              y1={a.y1}
              x2={a.x2}
              y2={a.y2}
              stroke="var(--color-muted-foreground)"
              strokeWidth="1.2"
              strokeDasharray="3 3"
            />
            <text
              x={a.tip.sx}
              y={a.tip.sy}
              fontSize="9"
              fill="var(--color-muted-foreground)"
              textAnchor="middle"
            >
              {a.label}
            </text>
          </g>
        ))}

        {/* baseline: what an unrelated entry looks like */}
        <line
          x1={CX}
          y1={CY}
          x2={baseline.sx}
          y2={baseline.sy}
          stroke="var(--color-muted-foreground)"
          strokeWidth="1"
          strokeDasharray="2 4"
          opacity="0.6"
        />
        <text
          x={baseline.sx}
          y={baseline.sy + 12}
          fontSize="9"
          fill="var(--color-muted-foreground)"
          textAnchor="middle"
        >
          unrelated ≈ 88°
        </text>

        {arcs.map((a) => (
          <g key={a.i}>
            <polyline
              points={a.points}
              fill="none"
              stroke={HUES[a.i % HUES.length]}
              strokeWidth="1.5"
              opacity="0.85"
            />
            <text
              x={a.mid.sx}
              y={a.mid.sy}
              fontSize="10"
              fontWeight="600"
              fill={HUES[a.i % HUES.length]}
              textAnchor="middle"
            >
              {a.deg}°
            </text>
          </g>
        ))}

        {items.map(({ v, i, s }) => {
          const col = HUES[i % HUES.length]
          const on = hover === i
          // Behind the sphere's midpoint: fade it so depth is legible.
          const far = s.depth < 0
          return (
            <g
              key={v.label}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: 'pointer' }}
              opacity={far && !on ? 0.4 : 1}
            >
              <line
                x1={CX}
                y1={CY}
                x2={s.sx}
                y2={s.sy}
                stroke={col}
                strokeWidth={on ? 3 : 1.8}
              />
              <circle cx={s.sx} cy={s.sy} r={(on ? 6 : 4) * s.k} fill={col} />
              <text
                x={s.sx}
                y={s.sy - 9 * s.k}
                fontSize="10"
                fill={col}
                textAnchor="middle"
                fontWeight="600"
              >
                {v.rank}
              </text>
            </g>
          )
        })}

        <line
          x1={CX}
          y1={CY}
          x2={qs.sx}
          y2={qs.sy}
          stroke="var(--color-foreground)"
          strokeWidth="3"
        />
        <circle cx={qs.sx} cy={qs.sy} r={5 * qs.k} fill="var(--color-foreground)" />
        <text
          x={qs.sx}
          y={qs.sy - 12}
          fontSize="11"
          fontWeight="700"
          textAnchor="middle"
          fill="var(--color-foreground)"
        >
          query
        </text>
        <circle cx={CX} cy={CY} r="2.5" fill="var(--color-muted-foreground)" />

        {hover !== null && shown[hover] && (
          <text
            x={CX}
            y={SIZE - 6}
            fontSize="11"
            textAnchor="middle"
            fill="var(--color-muted-foreground)"
          >
            {`cos = ${(shown[hover] as ProjectedVector).cosine.toFixed(3)} · ${Math.round(
              (Math.acos(
                Math.max(-1, Math.min(1, (shown[hover] as ProjectedVector).cosine)),
              ) *
                180) /
                Math.PI,
            )}°`}
          </text>
        )}
      </svg>

      <div className="mt-1 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setSpin((v) => !v)}
          className="rounded-md border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {spin ? 'Pause' : 'Spin'}
        </button>
        <span className="text-xs text-muted-foreground">drag to rotate</span>
      </div>
    </div>
  )
}
