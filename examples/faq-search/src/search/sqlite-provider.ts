import { defaultOverfetch, openVecStore, type SqliteVecStore } from 'knn-sqlite-wasm'
import { EMBED_DIMS, embedCorpus, embedQuery } from './embedder'
import { FAQ } from './faq-data'
import { fuse } from './fuse'
import {
  type Area,
  type FaqEntry,
  type SearchProvider,
  type SearchResult,
  SUGGESTION_COUNT,
} from './types'

/** The columns the FAQ corpus occupies once it is rows rather than a literal. */
const COLUMNS = { area: 'text', q: 'text', a: 'text', tags: 'text' } as const

/** Rebuild an entry from its row. Tags are stored as a JSON array. */
function toEntry(row: Record<string, unknown>): FaqEntry {
  return {
    area: String(row.area) as Area,
    q: String(row.q),
    a: String(row.a),
    tags: JSON.parse(String(row.tags)) as string[],
  }
}

/**
 * The same two-stage search, run by SQLite instead of by JavaScript.
 *
 * The store itself lives in `knn-sqlite-wasm`; this class is only the glue
 * between it and the UI's `SearchProvider` contract. Two things are worth
 * noticing in the code below, because they are the reasons to put a corpus in
 * a database at all:
 *
 *   - Results are rebuilt from the rows SQLite returns, not looked up in the
 *     TypeScript array. The corpus genuinely lives in the database.
 *   - The area filter is a `where` clause inside the query, so a filtered
 *     search never retrieves rows it is about to discard.
 */
export class SqliteVecProvider implements SearchProvider {
  readonly name = 'sqlite-vec'

  private readonly corpus: FaqEntry[]
  private vecStore: SqliteVecStore | null = null
  private building: Promise<void> | null = null

  constructor(corpus: FaqEntry[] = FAQ) {
    this.corpus = corpus
  }

  /** The open database, for anything that wants to look inside it. */
  get store(): SqliteVecStore | null {
    return this.vecStore
  }

  ready(): Promise<void> {
    this.building ??= this.build().catch((err) => {
      this.building = null
      throw err
    })
    return this.building
  }

  private async build(): Promise<void> {
    const vectors = embedCorpus()
    const store = await openVecStore({
      dims: EMBED_DIMS,
      columns: COLUMNS,
      name: 'faq',
    })
    store.addMany(
      this.corpus.map((entry, i) => ({
        id: i,
        vector: vectors[i] as Float32Array,
        row: { area: entry.area, q: entry.q, a: entry.a, tags: JSON.stringify(entry.tags) },
      })),
    )
    this.vecStore = store
  }

  async search(query: string, area: Area | null): Promise<SearchResult> {
    await this.ready()
    const store = this.vecStore
    if (!store) throw new Error('sqlite: store missing after build')
    const raw = query.trim()

    if (!raw) {
      // Even the empty state reads from the database rather than the array.
      const suggestions = store.exec(
        `select area, q, a, tags from faq ${area ? 'where area = ?' : ''} limit ?`,
        area ? [area, SUGGESTION_COUNT] : [SUGGESTION_COUNT],
      )
      return {
        empty: true,
        rows: suggestions.rows.map((row) => ({
          item: toEntry(Object.fromEntries(suggestions.columns.map((c, i) => [c, row[i]]))),
        })),
      }
    }

    const qVec = await embedQuery(raw)
    const overfetch = Math.min(defaultOverfetch(this.corpus.length), this.corpus.length)

    const t0 = performance.now()
    const hits = store.search(
      qVec,
      this.corpus.length,
      overfetch,
      area ? { where: 't.area = ?', bind: [area] } : undefined,
    )
    const ms = performance.now() - t0

    return {
      empty: false,
      // `null` for the area: SQL already applied it, and asking `fuse` to
      // filter again would hide a bug in the clause rather than surface it.
      rows: fuse(
        hits.map((hit) => ({ item: toEntry(hit.row), sem: hit.cosine })),
        raw,
        null,
      ),
      ms,
      detail: `vec0 bit[${EMBED_DIMS}] MATCH k=${overfetch}${
        area ? `, filtered in SQL to ${area}` : ''
      }, rescored by vec_distance_cosine`,
    }
  }

  close(): void {
    this.vecStore?.close()
    this.vecStore = null
    this.building = null
  }
}
