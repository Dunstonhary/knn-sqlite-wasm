import { describe, expect, it } from 'vitest'
import { CORPUS_COUNT, CORPUS_DIMS } from './corpus-vectors'
import { embedCorpus, EMBED_DIMS, EMBEDDER_NAME, encoderState, needsEncoder, precomputedQuery } from './embedder'
import { FAQ } from './faq-data'
import { SAMPLE_QUERIES } from './sample-queries'

const unitLength = (v: Float32Array) => Math.sqrt(v.reduce((s, x) => s + x * x, 0))

describe('the shipped vectors', () => {
  it('cover every corpus entry, and no more', () => {
    // A mismatch means faq-data.ts changed without `npm run embed`, which
    // would silently rank a query against someone else's vector.
    expect(CORPUS_COUNT).toBe(FAQ.length)
    expect(embedCorpus()).toHaveLength(FAQ.length)
  })

  it('cover every sample query', () => {
    for (const q of SAMPLE_QUERIES) {
      expect(precomputedQuery(q), q).not.toBeNull()
      expect(precomputedQuery(q)?.length, q).toBe(CORPUS_DIMS)
    }
  })

  it('are unit length, which is what makes cosine and dot the same', () => {
    for (const v of embedCorpus()) expect(unitLength(v)).toBeCloseTo(1, 4)
    for (const q of SAMPLE_QUERIES) {
      expect(unitLength(precomputedQuery(q) as Float32Array)).toBeCloseTo(1, 4)
    }
  })

  it('agree on 384 dimensions with everything built around that number', () => {
    expect(EMBED_DIMS).toBe(384)
    expect(CORPUS_DIMS).toBe(384)
    for (const v of embedCorpus()) expect(v.length).toBe(384)
  })

  it('name the model they came from', () => {
    expect(EMBEDDER_NAME).toContain('MiniLM')
  })

  it('tolerate surrounding whitespace when matching a sample', () => {
    expect(precomputedQuery(`  ${SAMPLE_QUERIES[0]}  `)).not.toBeNull()
  })

  it('return null for anything that was not precomputed', () => {
    expect(precomputedQuery('something nobody built a vector for')).toBeNull()
  })
})

describe('the encoder', () => {
  it('stays unloaded until a query needs it', () => {
    // Importing this module must not start a 21.9 MB download.
    expect(encoderState()).toBe('idle')
  })

  it('is not needed for a sample query, and is for anything else', () => {
    expect(needsEncoder(SAMPLE_QUERIES[0])).toBe(false)
    expect(needsEncoder('a query nobody anticipated')).toBe(true)
  })
})
