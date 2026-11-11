import { cosine, quantizeBinary } from 'knn-sqlite-wasm'
import { norm } from './keyword'
import type { Area, FaqEntry } from './types'

/**
 * Embeddings the view is drawing, already computed.
 *
 * Passed in rather than made here: the embedder is now a runtime choice and
 * one of the options is an async 21.9 MB model, so a module that wants to
 * stay a pure function of its inputs cannot be the one to call it.
 */
export interface Vectors {
  /** The query's embedding. */
  query: Float32Array
  /** One per corpus entry, in corpus order. */
  docs: Float32Array[]
  /** Which embedder produced them. */
  embedder: string
}

/**
 * Euclidean KNN in two dimensions, for the debug view.
 *
 * `geometry.ts` answers "how close is the top match, exactly" and draws two
 * arrows to prove it. This module answers a different question: "which k
 * entries are nearest, and how do you see that they are". So it places the
 * whole corpus, not a shortlist, and it measures in Euclidean distance rather
 * than cosine angle.
 *
 * The two agree. `embed` returns unit vectors, and for unit vectors
 *
 *     d(q, v)^2 = |q|^2 + |v|^2 - 2 q·v = 2 - 2 cos(q, v)
 *
 * so distance falls exactly as cosine rises; ranking by either gives the same
 * order. Distance is the one to draw, because a ring of constant distance is a
 * circle you can put on a plot and an angle is not.
 */

/**
 * Odd k only.
 *
 * The folklore is that odd k avoids ties. That is true for *two* classes and
 * only two: with 6 product areas an odd k ties all the time (k=5 as 2/2/1).
 * The control is odd anyway because it costs nothing and removes the one tie
 * that is easy to hit, and the view flags the ties it cannot prevent.
 */
export const K_CHOICES = [1, 3, 5, 7, 9] as const

export type Layout = 'plane' | 'mds'

export interface Placed {
  label: string
  area: Area
  tags: string[]
  /** Exact Euclidean distance to the query, in full 384-dim space. */
  dist: number
  /** Exact cosine. Satisfies dist^2 = 2 - 2*cosine. */
  cosine: number
  /** Differing bits between the two binary codes — what stage 1 compares. */
  hamming: number
  /** 1-based, ascending by `dist`. */
  rank: number
  /** Inside the k nearest. */
  neighbor: boolean
  /** Entry tags the query's own words hit. The human reason for the rank. */
  matched: string[]
  /** Plot coordinates in distance units, query at the origin. */
  x: number
  y: number
  /**
   * Fraction of the vector the projection plane keeps, 0..1. Only the bearing
   * is affected — the plotted radius is the true distance either way.
   * Meaningless for `mds`, where it is left at 1.
   */
  inPlane: number
}

export interface Vote {
  counts: Array<{ area: Area; n: number }>
  winner: Area | null
  /** Two or more areas share the top count, so k did not decide it. */
  tie: boolean
}

export interface Layout2D {
  query: string
  points: Placed[]
  k: number
  /** True distance to the k-th neighbour — the decision radius. */
  kthDist: number
  /**
   * Where to draw the decision ring, in plot units. Equal to `kthDist` when
   * `exactRadius`; otherwise it only separates the k from the rest, because
   * no drawn radius in that layout is the real distance.
   */
  ringRadius: number
  /** Plotted radii are true distances, so distance rings can be labelled. */
  exactRadius: boolean
  /** Largest true distance in the corpus. */
  maxDist: number
  vote: Vote
  dims: number
  layout: Layout
  /** Kruskal stress-1 of the placement, 0 = exact. Only meaningful for mds. */
  stress: number
  /** The entry whose direction fixes the second axis. `plane` only. */
  anchor: string | null
}

function dotp(a: Float32Array, b: Float32Array): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += (a[i] as number) * (b[i] as number)
  return s
}

/** Exact Euclidean distance. The thing every other number here derives from. */
export function euclidean(a: Float32Array, b: Float32Array): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    const d = (a[i] as number) - (b[i] as number)
    sum += d * d
  }
  return Math.sqrt(sum)
}

function popcount(a: Uint8Array, b: Uint8Array): number {
  let d = 0
  for (let i = 0; i < a.length; i++) {
    let x = (a[i] as number) ^ (b[i] as number)
    while (x) {
      d += x & 1
      x >>= 1
    }
  }
  return d
}

/** Tags of this entry that the query's words land on, whole word or stem. */
function matchedTags(qWords: string[], tags: string[]): string[] {
  return tags.filter((tag) =>
    norm(tag).some((part) => qWords.some((w) => part.includes(w) || w.includes(part))),
  )
}

/**
 * Eigenvalues and eigenvectors of a symmetric matrix, by cyclic Jacobi.
 *
 * Power iteration plus deflation is the shorter thing to write and it is
 * wrong here. When the top eigenvalue is degenerate — which near-orthogonal
 * embeddings make it nearly always — a deterministic start vector converges
 * to its own projection onto that eigenspace, and the deflated matrix's
 * leading eigenvector is then exactly orthogonal to that same start vector.
 * The second axis comes back as zero and the picture collapses onto a line.
 * Jacobi has no start vector and no such failure, and n is 15.
 *
 * Returns eigenvalues in `values[i]` and the matching eigenvector down
 * column `i` of `vectors`.
 */
function jacobiEigen(input: number[][]): { values: number[]; vectors: number[][] } {
  const n = input.length
  const a = input.map((row) => row.slice())
  const v = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  )

  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) off += (a[i]?.[j] as number) ** 2
    }
    if (off < 1e-22) break

    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = a[p]?.[q] as number
        if (Math.abs(apq) < 1e-18) continue
        const theta = ((a[q]?.[q] as number) - (a[p]?.[p] as number)) / (2 * apq)
        const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
        const c = 1 / Math.sqrt(t * t + 1)
        const sn = t * c
        for (let k = 0; k < n; k++) {
          const kp = a[k]?.[p] as number
          const kq = a[k]?.[q] as number
          ;(a[k] as number[])[p] = c * kp - sn * kq
          ;(a[k] as number[])[q] = sn * kp + c * kq
        }
        for (let k = 0; k < n; k++) {
          const pk = a[p]?.[k] as number
          const qk = a[q]?.[k] as number
          ;(a[p] as number[])[k] = c * pk - sn * qk
          ;(a[q] as number[])[k] = sn * pk + c * qk
        }
        for (let k = 0; k < n; k++) {
          const kp = v[k]?.[p] as number
          const kq = v[k]?.[q] as number
          ;(v[k] as number[])[p] = c * kp - sn * kq
          ;(v[k] as number[])[q] = sn * kp + c * kq
        }
      }
    }
  }

  return { values: a.map((row, i) => row[i] as number), vectors: v }
}

/**
 * Classical MDS: double-centre the squared-distance matrix, then take its two
 * leading eigenvectors.
 *
 * `stress` is Kruskal stress-1 over every pair, not only the pairs touching
 * the query, so it describes the whole picture. It is exactly zero when the
 * points were flat to begin with, and it cannot be driven low when they were
 * not: 15 mutually near-orthogonal vectors form a 14-simplex, whose honest
 * stress in two dimensions is about 0.79 no matter how it is fitted.
 */
export function classicalMds(dist: number[][]): {
  coords: Array<[number, number]>
  stress: number
} {
  const n = dist.length
  if (!n) return { coords: [], stress: 0 }

  const sq = dist.map((row) => row.map((d) => d * d))
  const rowMean = sq.map((row) => row.reduce((a, b) => a + b, 0) / n)
  const grand = rowMean.reduce((a, b) => a + b, 0) / n

  const b: number[][] = []
  for (let i = 0; i < n; i++) {
    const row: number[] = []
    for (let j = 0; j < n; j++) {
      row.push(
        -0.5 * ((sq[i]?.[j] as number) - (rowMean[i] as number) - (rowMean[j] as number) + grand),
      )
    }
    b.push(row)
  }

  const { values, vectors } = jacobiEigen(b)
  const order = values
    .map((value, i) => ({ value, i }))
    .sort((x, y) => y.value - x.value || x.i - y.i)
  const first = order[0]
  const second = order[1]
  // A negative eigenvalue means that axis carries no real distance; clamping
  // to zero collapses it rather than inventing a spread for it.
  const s1 = Math.sqrt(Math.max(0, first?.value ?? 0))
  const s2 = Math.sqrt(Math.max(0, second?.value ?? 0))

  const coords: Array<[number, number]> = Array.from({ length: n }, (_, i) => [
    (vectors[i]?.[first?.i ?? 0] ?? 0) * s1,
    (vectors[i]?.[second?.i ?? 0] ?? 0) * s2,
  ])

  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const [xi, yi] = coords[i] as [number, number]
      const [xj, yj] = coords[j] as [number, number]
      const drawn = Math.hypot(xi - xj, yi - yj)
      const real = dist[i]?.[j] as number
      num += (drawn - real) ** 2
      den += real * real
    }
  }

  return { coords, stress: den ? Math.sqrt(num / den) : 0 }
}

/**
 * Place the query and every corpus entry on a plane, and mark the k nearest.
 *
 * `plane` spans the query and its nearest match, as `geometry.ts` does, but
 * each point is then pushed out to its *true* distance along its projected
 * bearing. So every radius on the plot is exact and only the compass direction
 * is a shadow — which is what makes the decision ring mean something.
 *
 * `mds` instead fits all 15 points to the full pairwise distance matrix at
 * once. No radius is then exact, but none is badly wrong either, and the
 * returned stress says how wrong.
 */
export function layout2d(
  query: string,
  corpus: FaqEntry[],
  vectors: Vectors,
  k: number,
  layout: Layout = 'plane',
): Layout2D {
  const q = vectors.query
  const dims = q.length
  const qBits = quantizeBinary(q)
  const qWords = norm(query)

  const scored = corpus
    .map((item, i) => {
      const vec = vectors.docs[i]
      if (!vec) throw new Error(`layout2d: no vector for corpus row ${i}`)
      return { item, vec, dist: euclidean(q, vec), cos: cosine(q, vec) }
    })
    .sort((a, b) => a.dist - b.dist)

  const empty: Layout2D = {
    query,
    points: [],
    k,
    kthDist: 0,
    ringRadius: 0,
    exactRadius: layout === 'plane',
    maxDist: 1,
    vote: { counts: [], winner: null, tie: false },
    dims,
    layout,
    stress: 0,
    anchor: null,
  }
  if (!scored.length) return empty

  const kk = Math.max(1, Math.min(k, scored.length))
  const kth = scored[kk - 1]?.dist ?? 0
  const maxDist = scored[scored.length - 1]?.dist ?? 1

  let coords: Array<[number, number]>
  let inPlane: number[]
  let stress = 0
  let anchor: string | null = null

  if (layout === 'mds') {
    const all = [q, ...scored.map((s) => s.vec)]
    const matrix = all.map((a) => all.map((b) => euclidean(a, b)))
    const fit = classicalMds(matrix)
    const [qx, qy] = fit.coords[0] as [number, number]
    coords = fit.coords.slice(1).map(([x, y]) => [x - qx, y - qy])
    inPlane = scored.map(() => 1)
    stress = fit.stress
  } else {
    // Gram-Schmidt: e1 along the query, e2 the nearest match with e1 removed.
    const e1 = q
    const nn = scored[0]?.vec
    const r = new Float32Array(dims)
    if (nn) {
      for (let i = 0; i < dims; i++) r[i] = nn[i] as number
      const c = dotp(r, e1)
      for (let i = 0; i < dims; i++) r[i] = (r[i] as number) - c * (e1[i] as number)
    }
    let nrm = 0
    for (let i = 0; i < dims; i++) nrm += (r[i] as number) ** 2
    nrm = Math.sqrt(nrm)
    // The match is parallel to the query — any perpendicular will do.
    if (nrm < 1e-9) {
      r.fill(0)
      r[1] = 1
    } else {
      for (let i = 0; i < dims; i++) r[i] = (r[i] as number) / nrm
    }
    const e2 = r
    anchor = scored[0]?.item.q ?? null

    coords = []
    inPlane = []
    for (const s of scored) {
      const px = dotp(s.vec, e1)
      const py = dotp(s.vec, e2)
      // Bearing from the query, which sits at (1, 0) in this basis.
      const dx = px - 1
      const dy = py
      const len = Math.hypot(dx, dy)
      // Push out to the true distance: the radius is then exact for every
      // point and the projection error is confined to the angle.
      const scale = len > 1e-9 ? s.dist / len : 0
      coords.push([dx * scale, dy * scale])
      inPlane.push(Math.min(1, Math.hypot(px, py)))
    }
  }

  // Put the nearest match on +X and the runner-up above the axis, so the
  // picture does not flip or spin between queries or between layouts.
  const [ax, ay] = coords[0] ?? [1, 0]
  const theta = Math.atan2(ay, ax)
  const cs = Math.cos(-theta)
  const sn = Math.sin(-theta)
  coords = coords.map(([x, y]) => [x * cs - y * sn, x * sn + y * cs])
  const flip = (coords[1]?.[1] ?? 0) < 0 ? -1 : 1
  coords = coords.map(([x, y]) => [x, y * flip])

  const points: Placed[] = scored.map((s, i) => {
    const [x, y] = coords[i] as [number, number]
    return {
      label: s.item.q,
      area: s.item.area,
      tags: s.item.tags,
      dist: s.dist,
      cosine: s.cos,
      hamming: popcount(qBits, quantizeBinary(s.vec)),
      rank: i + 1,
      neighbor: i < kk,
      matched: matchedTags(qWords, s.item.tags),
      x,
      y,
      inPlane: inPlane[i] as number,
    }
  })

  return {
    query,
    points,
    k: kk,
    kthDist: kth,
    ringRadius: ringFor(points, kk, layout === 'plane' ? kth : null),
    exactRadius: layout === 'plane',
    maxDist,
    vote: majority(points.filter((p) => p.neighbor)),
    dims,
    layout,
    stress,
    anchor,
  }
}

/**
 * Radius to draw the decision boundary at, in plot units.
 *
 * With exact radii it is just the k-th distance. Without them — MDS squashes
 * some points almost onto the query — a ring at the true distance would sit
 * well outside the cloud and separate nothing, so it is placed between the
 * last neighbour and the first outsider instead. The ring then still means
 * "inside is a neighbour", which is what it is there to say.
 */
function ringFor(points: Placed[], k: number, exact: number | null): number {
  if (exact !== null) return exact
  const radius = points.map((p) => Math.hypot(p.x, p.y))
  const inside = radius.slice(0, k)
  const outside = radius.slice(k)
  const last = Math.max(...inside, 0)
  if (!outside.length) return last * 1.08
  const first = Math.min(...outside)
  // The fit can place an outsider inside a neighbour; hugging the last
  // neighbour is then the least misleading of the available lies.
  return first > last ? (last + first) / 2 : last * 1.04
}

/** Plurality vote over the neighbours' areas — what a KNN *classifier* does. */
export function majority(neighbors: Placed[]): Vote {
  const tally = new Map<Area, number>()
  for (const n of neighbors) tally.set(n.area, (tally.get(n.area) ?? 0) + 1)

  const counts = [...tally.entries()]
    .map(([area, n]) => ({ area, n }))
    .sort((a, b) => b.n - a.n || a.area.localeCompare(b.area))

  const top = counts[0]
  if (!top) return { counts, winner: null, tie: false }
  const tie = counts.filter((c) => c.n === top.n).length > 1
  return { counts, winner: tie ? null : top.area, tie }
}
