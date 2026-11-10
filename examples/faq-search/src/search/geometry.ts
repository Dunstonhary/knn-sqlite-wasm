import { cosine, quantizeBinary } from 'knn-sqlite-wasm'
import type { Vectors } from './neighbors'
import type { FaqEntry } from './types'

/**
 * Geometry for the vector-space view.
 *
 * The embedding space has 384 dimensions and a screen has two, so any picture
 * is a projection and something is always lost. The question is what.
 *
 * The projection used here is the plane spanned by the query and its nearest
 * neighbour. Both of those vectors lie entirely inside that plane, so the
 * angle drawn between them IS their true angle — `cos(angle)` equals the
 * cosine similarity exactly, not approximately.
 *
 * Every other entry sticks partly out of the plane. Its drawn angle is
 * therefore only a shadow of its real one. Rather than hide that, each vector
 * is drawn at its projected length: a short arrow means most of that entry
 * points somewhere this plane cannot show. Full-length means it genuinely
 * lives here.
 *
 * A PCA or t-SNE scatter would look tidier and tell you less — no angle on it
 * would correspond to any real similarity.
 */

export interface ProjectedVector {
  label: string
  area: string
  /** Coordinates in the projection subspace, each in [-1, 1]. */
  x: number
  y: number
  /** Third axis. Zero in the 2D projection. */
  z: number
  /** Exact cosine against the query, computed in full 384-dim space. */
  cosine: number
  /** Angle of the projection, radians, measured from the query's direction. */
  projectedAngle: number
  /**
   * How much of this vector survives the projection, 0..1. 1 means it lies in
   * the plane and its drawn angle is exact; 0.3 means most of it points out of
   * view and the drawn angle understates the true distance.
   */
  inPlane: number
  /** Differing bits against the query's binary code. */
  hamming: number
  rank: number
}

export interface Projection {
  query: string
  vectors: ProjectedVector[]
  dims: number
  /** Bits in the binary code: one per dimension, packed 8 per byte. */
  bits: number
  /** Entries spanning the subspace. Their angles are exact. */
  anchors: string[]
}

function dot(a: Float32Array, b: Float32Array): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += (a[i] as number) * (b[i] as number)
  return s
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

/**
 * Build the projection subspace and place every entry in it.
 *
 * `axes` of 2 gives the plane through the query and its nearest match; 3 adds
 * the runner-up. Each extra axis makes one more entry's angle exact and lets
 * the rest keep more of their true shape, at the cost of needing to rotate the
 * picture to read it.
 */
export function project(
  query: string,
  corpus: FaqEntry[],
  vectors: Vectors,
  axes: 2 | 3 = 2,
): Projection {
  const q = vectors.query
  const dims = q.length
  const qBits = quantizeBinary(q)

  const docs = corpus.map((item, i) => {
    const vec = vectors.docs[i]
    if (!vec) throw new Error(`project: no vector for corpus row ${i}`)
    return { item, vec }
  })

  const scored = docs.map((d) => ({ ...d, cos: cosine(q, d.vec) })).sort((a, b) => b.cos - a.cos)

  if (!scored.length) return { query, vectors: [], dims, bits: dims, anchors: [] }

  // Gram-Schmidt: e1 along the query, then each further axis from the next
  // best match with the earlier axes removed. Every vector used to build the
  // basis therefore lies exactly inside it.
  const basis: Float32Array[] = [q]
  const anchors: string[] = []
  for (let a = 1; a < axes; a++) {
    const cand = scored[a - 1]
    if (!cand) break
    const r = new Float32Array(dims)
    for (let i = 0; i < dims; i++) r[i] = cand.vec[i] as number
    for (const e of basis) {
      const c = dot(r, e)
      for (let i = 0; i < dims; i++) r[i] = (r[i] as number) - c * (e[i] as number)
    }
    let n = 0
    for (let i = 0; i < dims; i++) n += (r[i] as number) ** 2
    n = Math.sqrt(n)
    // Parallel to an existing axis — nothing new to add, so fall back to a
    // fresh unit direction rather than dividing by ~zero.
    if (n < 1e-9) {
      const f = new Float32Array(dims)
      f[a] = 1
      basis.push(f)
    } else {
      for (let i = 0; i < dims; i++) r[i] = (r[i] as number) / n
      basis.push(r)
    }
    anchors.push(cand.item.q)
  }

  const [e1, e2, e3] = basis

  const placed: ProjectedVector[] = scored.map((d, i) => {
    const x = e1 ? dot(d.vec, e1) : 0
    const y = e2 ? dot(d.vec, e2) : 0
    const z = e3 ? dot(d.vec, e3) : 0
    const len = Math.sqrt(x * x + y * y + z * z)
    return {
      label: d.item.q,
      area: d.item.area,
      x,
      y,
      z,
      cosine: d.cos,
      projectedAngle: Math.atan2(y, x),
      inPlane: Math.min(1, len),
      hamming: popcount(qBits, quantizeBinary(d.vec)),
      rank: i + 1,
    }
  })

  return { query, vectors: placed, dims, bits: dims, anchors }
}
