import { describe, expect, it } from 'vitest'
import { FAQ } from './faq-data'
import { keywordScore, norm } from './keyword'

const refund = FAQ.find((f) => f.q === 'How do I issue a refund?') as (typeof FAQ)[number]

describe('norm', () => {
  it('lowercases, strips punctuation and splits', () => {
    expect(norm('Refund, PLEASE!')).toEqual(['refund', 'please'])
  })

  it('drops stop words that carry no retrieval signal', () => {
    expect(norm('how do I issue a refund')).toEqual(['issue', 'refund'])
  })

  it('keeps "set up" phrasing out of the stop list damage', () => {
    // "set" and "up" are stopped, but the words that matter survive.
    expect(norm('set up canned responses')).toEqual(['canned', 'responses'])
  })

  it('survives empty and junk input', () => {
    expect(norm('')).toEqual([])
    expect(norm('!!! ???')).toEqual([])
  })
})

describe('keywordScore', () => {
  it('is the share of query words found in the entry', () => {
    expect(keywordScore(['refund'], refund)).toBe(1)
    expect(keywordScore(['refund', 'zzz'], refund)).toBe(0.5)
    expect(keywordScore(['zzz'], refund)).toBe(0)
  })

  it('searches tags and answer text, not just the question', () => {
    expect(refund.q.toLowerCase()).not.toContain('money')
    expect(keywordScore(['money'], refund)).toBe(1)
  })

  it('is zero for an empty query rather than NaN', () => {
    expect(keywordScore([], refund)).toBe(0)
  })
})
