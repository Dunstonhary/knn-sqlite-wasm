import { describe, expect, it } from 'vitest'
import { FAQ } from './faq-data'
import { KnnSearchProvider } from './knn-provider'
import { SAMPLE_QUERIES } from './sample-queries'
import { SqliteVecProvider } from './sqlite-provider'

/**
 * The store itself is tested in the library (`src/sqlite.browser.test.ts`).
 * What is left to prove here is the thing this app claims by putting the two
 * engines side by side.
 */
describe('the two engines', () => {
  it('rank identically, because only the implementation differs', async () => {
    const js = new KnnSearchProvider()
    const sql = new SqliteVecProvider()
    try {
      // Sample queries only: anything else would download the encoder.
      for (const q of SAMPLE_QUERIES) {
        const [a, b] = await Promise.all([js.search(q, null), sql.search(q, null)])
        const titles = (r: Awaited<ReturnType<typeof js.search>>) => r.rows.map((x) => x.item.q)
        expect(titles(b), q).toEqual(titles(a))
        for (const [i, row] of b.rows.entries()) {
          expect(row.hybrid).toBeCloseTo(a.rows[i]?.hybrid as number, 5)
        }
      }
    } finally {
      sql.close()
    }
  })
})

describe('SqliteVecProvider', () => {
  it('loads the whole corpus into the database', async () => {
    const sql = new SqliteVecProvider()
    try {
      await sql.ready()
      const stats = sql.store?.stats()
      expect(stats?.rows).toBe(FAQ.length)
      expect(stats?.dims).toBe(384)
      expect(stats?.vecVersion).toMatch(/^v\d/)
    } finally {
      sql.close()
    }
  })

  it('rebuilds results from rows, not from the TypeScript array', async () => {
    const sql = new SqliteVecProvider()
    try {
      const res = await sql.search(SAMPLE_QUERIES[0], null)
      const top = res.rows[0]?.item
      expect(top?.q).toBe('How do I issue a refund?')
      // Tags survive the JSON round-trip through the tags column.
      expect(top?.tags).toContain('refund')
      expect(Array.isArray(top?.tags)).toBe(true)
    } finally {
      sql.close()
    }
  })

  it('applies the area filter in SQL, and says so', async () => {
    const sql = new SqliteVecProvider()
    try {
      const res = await sql.search(SAMPLE_QUERIES[4], 'Integrations')
      expect(res.rows.length).toBeGreaterThan(0)
      for (const row of res.rows) expect(row.item.area).toBe('Integrations')
      expect(res.detail).toContain('filtered in SQL to Integrations')
    } finally {
      sql.close()
    }
  })

  it('reads its suggestions out of the database too', async () => {
    const sql = new SqliteVecProvider()
    try {
      const res = await sql.search('', 'Payments')
      expect(res.empty).toBe(true)
      expect(res.rows.length).toBeGreaterThan(0)
      for (const row of res.rows) expect(row.item.area).toBe('Payments')
    } finally {
      sql.close()
    }
  })
})
