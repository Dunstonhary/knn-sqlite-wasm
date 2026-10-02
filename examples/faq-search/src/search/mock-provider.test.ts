import { describe, expect, it } from 'vitest'
import { FAQ } from './faq-data'
import { MockSearchProvider, keywordScore, norm, rank, semanticScore } from './mock-provider'
import { HYBRID_WEIGHTS, SCORE_FLOOR, SUGGESTION_COUNT, TOP_K } from './types'

describe('norm', () => {
  it('lowercases, strips punctuation and drops stop words', () => {
    expect(norm('How do I connect my payment provider?')).toEqual([
      'connect',
      'payment',
      'provider',
    ])
  })

  it('returns an empty list for punctuation-only input', () => {
    expect(norm('??? !!!')).toEqual([])
  })
})

describe('rank', () => {
  it('suggests entries when the query is blank', () => {
    const r = rank(FAQ, '   ', null)
    expect(r.empty).toBe(true)
    expect(r.rows).toHaveLength(SUGGESTION_COUNT)
    // Suggestions carry no scores — there was nothing to score against.
    expect(r.rows[0].hybrid).toBeUndefined()
  })

  it('ranks the exact question first', () => {
    const r = rank(FAQ, 'How do I issue a refund?', null)
    expect(r.empty).toBe(false)
    expect(r.rows[0].item.q).toBe('How do I issue a refund?')
  })

  it('returns hits in descending hybrid order', () => {
    const r = rank(FAQ, 'payment refund card', null)
    const scores = r.rows.map((x) => x.hybrid as number)
    expect(scores).toEqual([...scores].sort((a, b) => b - a))
  })

  it('caps results at TOP_K', () => {
    const r = rank(FAQ, 'how do I connect my account settings payment', null)
    expect(r.rows.length).toBeLessThanOrEqual(TOP_K)
  })

  it('drops hits at or below the score floor', () => {
    const r = rank(FAQ, 'payment', null)
    for (const row of r.rows) {
      expect(row.hybrid as number).toBeGreaterThan(SCORE_FLOOR)
    }
  })

  it('restricts the pool to the selected area', () => {
    const r = rank(FAQ, 'connect', 'Integrations')
    expect(r.rows.length).toBeGreaterThan(0)
    for (const row of r.rows) {
      expect(row.item.area).toBe('Integrations')
    }
  })

  it('returns no rows when nothing clears the floor', () => {
    const r = rank(FAQ, 'zzzz qqqq', null)
    expect(r.empty).toBe(false)
    expect(r.rows).toHaveLength(0)
  })

  it('computes hybrid as the weighted sum of its channels', () => {
    const r = rank(FAQ, 'refund', null)
    const row = r.rows[0]
    const expected =
      HYBRID_WEIGHTS.semantic * (row.sem as number) +
      HYBRID_WEIGHTS.keyword * (row.kw as number)
    expect(row.hybrid).toBeCloseTo(expected, 10)
  })
})

describe('score channels', () => {
  const entry = FAQ.find((f) => f.q === 'How do I issue a refund?')!

  it('keywordScore is the share of query words found', () => {
    expect(keywordScore(['refund'], entry)).toBe(1)
    expect(keywordScore(['refund', 'zzzz'], entry)).toBe(0.5)
    expect(keywordScore([], entry)).toBe(0)
  })

  it('semanticScore stays within 0..1', () => {
    for (const q of ['refund', 'payment transaction money', 'zzzz']) {
      const s = semanticScore(norm(q), entry)
      expect(s).toBeGreaterThanOrEqual(0)
      expect(s).toBeLessThanOrEqual(1)
    }
  })

  it('scores an unrelated query at zero', () => {
    expect(semanticScore(['zzzz'], entry)).toBe(0)
  })
})

describe('MockSearchProvider', () => {
  it('satisfies the SearchProvider contract', async () => {
    const p = new MockSearchProvider()
    await p.ready()
    const r = await p.search('refund', null)
    expect(r.rows[0].item.area).toBe('Payments')
    expect(p.name).toMatch(/mock/)
  })

  it('accepts an injected corpus', async () => {
    const p = new MockSearchProvider([FAQ[0]])
    const r = await p.search('payment', null)
    expect(r.rows).toHaveLength(1)
  })
})
