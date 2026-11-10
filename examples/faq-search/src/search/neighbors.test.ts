import { describe, expect, it } from 'vitest'
import { SAMPLE_QUERIES } from './sample-queries'
import { corpusVectors, sampleVectors } from './corpus-vectors'
import { FAQ } from './faq-data'
import {
  classicalMds,
  euclidean,
  K_CHOICES,
  layout2d,
  majority,
  type Placed,
} from './neighbors'
import type { Area } from './types'

const QUERY = SAMPLE_QUERIES[0]

/**
 * Build-time vectors, so the maths is testable with no model and no network
 * — and testable against the exact vectors the app ships.
 */
const vectorsFor = (index = 0, docs = corpusVectors()) => ({
  query: sampleVectors()[index] as Float32Array,
  docs,
  embedder: 'precomputed',
})
const V = vectorsFor()

function placed(area: Area, rank: number): Placed {
  return {
    label: `e${rank}`,
    area,
    tags: [],
    dist: rank,
    cosine: 0,
    hamming: 0,
    rank,
    neighbor: true,
    matched: [],
    x: 0,
    y: 0,
    inPlane: 1,
  }
}

describe('euclidean', () => {
  it('is zero against itself and symmetric', () => {
    const a = corpusVectors()[0] as Float32Array
    const b = corpusVectors()[5] as Float32Array
    expect(euclidean(a, a)).toBeCloseTo(0, 6)
    expect(euclidean(a, b)).toBeCloseTo(euclidean(b, a), 6)
  })

  it('satisfies d^2 = 2 - 2cos, which is why the two rank alike', () => {
    const data = layout2d(QUERY, FAQ, V, 5)
    for (const p of data.points) {
      expect(p.dist ** 2).toBeCloseTo(2 - 2 * p.cosine, 4)
    }
  })
})

describe('layout2d', () => {
  it('ranks by distance ascending, which is cosine descending', () => {
    const { points } = layout2d(QUERY, FAQ, V, 5)
    for (let i = 1; i < points.length; i++) {
      expect((points[i] as Placed).dist).toBeGreaterThanOrEqual((points[i - 1] as Placed).dist)
      expect((points[i] as Placed).cosine).toBeLessThanOrEqual((points[i - 1] as Placed).cosine)
      expect((points[i] as Placed).rank).toBe(i + 1)
    }
  })

  it.each(K_CHOICES)('marks exactly k neighbours for k=%i', (k) => {
    const data = layout2d(QUERY, FAQ, V, k)
    const inside = data.points.filter((p) => p.neighbor)
    expect(inside).toHaveLength(k)
    expect(data.kthDist).toBeCloseTo((inside[inside.length - 1] as Placed).dist, 10)
  })

  it('clamps k to the corpus rather than returning a short list', () => {
    const data = layout2d(QUERY, FAQ, V, FAQ.length + 50)
    expect(data.k).toBe(FAQ.length)
    expect(data.points.filter((p) => p.neighbor)).toHaveLength(FAQ.length)
  })

  it('draws the decision ring where the neighbours end and the rest begin', () => {
    const data = layout2d(QUERY, FAQ, V, 5)
    for (const p of data.points) {
      if (p.neighbor) expect(p.dist).toBeLessThanOrEqual(data.kthDist + 1e-9)
      else expect(p.dist).toBeGreaterThanOrEqual(data.kthDist - 1e-9)
    }
  })

  // The whole claim the caption makes about the plane layout. If the radius
  // were only the projected length, the ring would be a lie.
  it('plots every point at its true distance in the query plane', () => {
    const data = layout2d(QUERY, FAQ, V, 5, 'plane')
    for (const p of data.points) {
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(p.dist, 6)
    }
  })

  it('pins the nearest match to +x and the runner-up above it', () => {
    for (const layout of ['plane', 'mds'] as const) {
      const { points } = layout2d(QUERY, FAQ, V, 5, layout)
      const first = points[0] as Placed
      const second = points[1] as Placed
      expect(first.y).toBeCloseTo(0, 6)
      expect(first.x).toBeGreaterThan(0)
      expect(second.y).toBeGreaterThanOrEqual(-1e-9)
    }
  })

  it('puts the ring at the true k-th distance when radii are exact', () => {
    const data = layout2d(QUERY, FAQ, V, 7, 'plane')
    expect(data.exactRadius).toBe(true)
    expect(data.ringRadius).toBeCloseTo(data.kthDist, 10)
  })

  it('places the mds ring by what is drawn, not by a distance it did not draw', () => {
    const data = layout2d(QUERY, FAQ, V, 7, 'mds')
    expect(data.exactRadius).toBe(false)
    const radius = data.points.map((p) => Math.hypot(p.x, p.y))
    const inside = radius.slice(0, data.k)
    // The ring has to sit out past the last neighbour it is meant to enclose,
    // which a ring at the true distance would not do once mds compresses.
    expect(data.ringRadius).toBeGreaterThanOrEqual(Math.max(...inside))
    expect(data.ringRadius).toBeLessThan(data.maxDist * 2)
  })

  it('reports mds stress rather than hiding it', () => {
    const data = layout2d(QUERY, FAQ, V, 5, 'mds')
    expect(data.stress).toBeGreaterThanOrEqual(0)
    expect(data.stress).toBeLessThan(1)
    // These hash embeddings are near-orthogonal, so the honest stress is
    // high. The number is the point: it is what says the picture is only
    // topological. If this ever drops it means the embedder got better.
    expect(data.stress).toBeGreaterThan(0.2)
  })

  it('spreads mds across both axes instead of collapsing to a line', () => {
    const { points } = layout2d(QUERY, FAQ, V, 5, 'mds')
    const spreadY = Math.max(...points.map((p) => Math.abs(p.y)))
    const spreadX = Math.max(...points.map((p) => Math.abs(p.x)))
    expect(spreadY).toBeGreaterThan(spreadX * 0.2)
  })

  it('is deterministic, so the picture does not move between renders', () => {
    const a = layout2d(QUERY, FAQ, V, 7, 'mds')
    const b = layout2d(QUERY, FAQ, V, 7, 'mds')
    expect(a.points.map((p) => [p.x, p.y])).toEqual(b.points.map((p) => [p.x, p.y]))
  })

  it('reports which of an entry tags the query actually hit', () => {
    // "give the money back to a customer" shares one word with the refund
    // entry's tags, and it is not the word "refund".
    const data = layout2d(QUERY, FAQ, V, 3)
    const hit = data.points.find((p) => p.label === 'How do I issue a refund?')
    expect(hit?.matched).toContain('money')
    expect(hit?.matched).not.toContain('refund')
  })

  it('puts the right entry first for a query that shares almost no words', () => {
    // The case the hash embedder could never do. If this regresses, the
    // shipped vectors and the shipped corpus have drifted apart.
    const data = layout2d(QUERY, FAQ, V, 3)
    expect(data.points[0]?.label).toBe('How do I issue a refund?')
  })

  it('survives an empty corpus', () => {
    const data = layout2d(QUERY, [], vectorsFor(0, []), 5)
    expect(data.points).toHaveLength(0)
    expect(data.vote.winner).toBeNull()
  })
})

describe('majority', () => {
  it('names a winner when one area leads outright', () => {
    const vote = majority([placed('Payments', 1), placed('Payments', 2), placed('Inbox', 3)])
    expect(vote.winner).toBe('Payments')
    expect(vote.tie).toBe(false)
  })

  it('flags a tie, which odd k does not prevent beyond two classes', () => {
    const vote = majority([
      placed('Payments', 1),
      placed('Payments', 2),
      placed('Inbox', 3),
      placed('Inbox', 4),
      placed('Connect', 5),
    ])
    expect(vote.tie).toBe(true)
    expect(vote.winner).toBeNull()
    expect(vote.counts[0]?.n).toBe(2)
  })

  it('has no winner with nothing to count', () => {
    expect(majority([])).toEqual({ counts: [], winner: null, tie: false })
  })
})

describe('classicalMds', () => {
  const matrix = (pts: number[][]) =>
    pts.map((a) => pts.map((b) => Math.hypot(...a.map((x, i) => x - (b[i] as number)))))

  it('is exact for points that were already flat', () => {
    const square = classicalMds(matrix([[0, 0], [1, 0], [1, 1], [0, 1]]))
    expect(square.stress).toBeCloseTo(0, 8)
    const line = classicalMds(matrix([[0, 0], [1, 0], [2, 0], [5, 0]]))
    expect(line.stress).toBeCloseTo(0, 8)
  })

  // The square's two eigenvalues are equal. Power iteration with a fixed
  // start vector returns a zero second axis here; Jacobi does not.
  it('keeps both axes when the leading eigenvalue is degenerate', () => {
    const { coords } = classicalMds(matrix([[0, 0], [1, 0], [1, 1], [0, 1]]))
    expect(Math.max(...coords.map(([, y]) => Math.abs(y)))).toBeGreaterThan(0.1)
  })

  it('cannot flatten a simplex, and says so', () => {
    const basis = Array.from({ length: 15 }, (_, i) =>
      Array.from({ length: 15 }, (_, j) => (i === j ? 1 : 0)),
    )
    expect(classicalMds(matrix(basis)).stress).toBeGreaterThan(0.7)
  })

  it('handles an empty matrix', () => {
    expect(classicalMds([])).toEqual({ coords: [], stress: 0 })
  })
})
