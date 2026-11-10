import { describe, expect, it } from 'vitest'
import { FAQ } from './faq-data'
import { fuse } from './fuse'
import { RELATIVE_FLOOR, TOP_K } from './types'

const entry = (q: string) => FAQ.find((f) => f.q === q) as (typeof FAQ)[number]
const refund = entry('How do I issue a refund?')
const slack = entry('How do I connect Slack?')

describe('fuse', () => {
  it('ranks by the hybrid score, not by the semantic one alone', () => {
    const rows = fuse(
      [
        { item: slack, sem: 0.9 },
        { item: refund, sem: 0.85 },
      ],
      'refund the payment',
      null,
    )
    // Slack wins on semantics but has no keyword overlap with the query.
    expect(rows[0]?.item.q).toBe(refund.q)
    expect(rows[0]?.kw).toBeGreaterThan(rows[1]?.kw ?? 1)
  })

  it('drops hits that are not competitive with the best one', () => {
    const rows = fuse(
      [
        { item: refund, sem: 0.9 },
        { item: slack, sem: 0.9 * RELATIVE_FLOOR * 0.5 },
      ],
      'refund',
      null,
    )
    expect(rows.map((r) => r.item.q)).toEqual([refund.q])
  })

  it('caps the list even when everything is competitive', () => {
    const rows = fuse(
      FAQ.map((item) => ({ item, sem: 0.9 })),
      'how do I',
      null,
    )
    expect(rows.length).toBeLessThanOrEqual(TOP_K)
  })

  it('keeps only the chosen area', () => {
    const rows = fuse(
      FAQ.map((item) => ({ item, sem: 0.9 })),
      'how do I',
      'Payments',
    )
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) expect(r.item.area).toBe('Payments')
  })

  it('treats a negative cosine as no match rather than a penalty', () => {
    const rows = fuse([{ item: refund, sem: -0.4 }], 'refund', null)
    expect(rows[0]?.sem).toBe(0)
  })

  it('returns nothing when nothing clears the floor', () => {
    expect(fuse([{ item: refund, sem: 0 }], 'xyzzy', null)).toEqual([])
  })
})
