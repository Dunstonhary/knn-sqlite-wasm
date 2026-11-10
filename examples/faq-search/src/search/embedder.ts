import { CORPUS_DIMS, CORPUS_MODEL, corpusVectors, sampleVectors } from './corpus-vectors'
import { SAMPLE_QUERIES } from './sample-queries'

/**
 * Text to vectors.
 *
 * One encoder, and it is a real one: `Xenova/all-MiniLM-L6-v2` at q8, 384
 * unit-length dimensions, running on-device through Transformers.js. The
 * earlier hash stand-in is gone — it could never match "refund" to "money
 * back", which is the only interesting thing a semantic index does.
 *
 * The cost is a 21.9 MB download on first use, so the split matters:
 *
 *   - **Corpus vectors are precomputed** at build time (`npm run embed`) and
 *     shipped as 28 KB of base64. The dashboard therefore opens with its
 *     database, its rows and its vector plot already populated.
 *   - **Query vectors need the model**, because a query is not known until it
 *     is typed. That download starts on the first search, not on page load.
 */

export const EMBED_DIMS = CORPUS_DIMS
export const EMBEDDER_NAME = CORPUS_MODEL

export interface LoadProgress {
  /** 0..1, or null while the total size is still unknown. */
  fraction: number | null
  file: string
}

export type EncoderState = 'idle' | 'loading' | 'ready' | 'failed'

/** Minimal shape of what `pipeline('feature-extraction')` hands back. */
type Extractor = (
  text: string | string[],
  options: { pooling: 'mean'; normalize: boolean },
) => Promise<{ data: Float32Array; dims: number[] }>

let extractor: Extractor | null = null
let loading: Promise<void> | null = null

export function encoderState(): EncoderState {
  if (extractor) return 'ready'
  return loading ? 'loading' : 'idle'
}

/**
 * Download and start the encoder. Concurrent callers share one load — the
 * search panel and the vector panel both ask on the same render, and two
 * pipelines would mean two copies of the model in memory.
 */
export function loadEncoder(onProgress?: (p: LoadProgress) => void): Promise<void> {
  if (extractor) return Promise.resolve()
  loading ??= (async () => {
    // Imported here rather than at module scope: naming it at the top pulls
    // onnxruntime into the initial bundle, and nothing should download 27 MB
    // of runtime before somebody has typed a query.
    const { pipeline } = await import('@huggingface/transformers')
    extractor = (await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      dtype: 'q8',
      progress_callback: (p: { status?: string; file?: string; progress?: number }) => {
        if (p.status !== 'progress') return
        onProgress?.({
          fraction: typeof p.progress === 'number' ? p.progress / 100 : null,
          file: p.file ?? '',
        })
      },
    })) as unknown as Extractor
  })().catch((err) => {
    // A failed load must not be cached as "in progress" forever.
    loading = null
    throw err
  })
  return loading
}

/**
 * The vector for a query that was embedded at build time, or null.
 *
 * Matched on the exact text. A sample query therefore runs the whole
 * pipeline — index, search, plot — with no download at all, which is what
 * makes the dashboard explorable before anyone commits to 21.9 MB.
 */
export function precomputedQuery(text: string): Float32Array | null {
  const i = SAMPLE_QUERIES.indexOf(text.trim() as (typeof SAMPLE_QUERIES)[number])
  return i === -1 ? null : (sampleVectors()[i] as Float32Array)
}

/** True when embedding this text would have to download the encoder first. */
export function needsEncoder(text: string): boolean {
  return !extractor && precomputedQuery(text) === null
}

/** Embed one query, loading the encoder only if the text is not precomputed. */
export async function embedQuery(text: string): Promise<Float32Array> {
  const known = precomputedQuery(text)
  if (known) return known
  await loadEncoder()
  if (!extractor) throw new Error('embedder: encoder failed to load')
  const out = await extractor(text, { pooling: 'mean', normalize: true })
  return Float32Array.from(out.data)
}

/** The corpus, already embedded. No network, no wait. */
export function embedCorpus(): Float32Array[] {
  return corpusVectors()
}
