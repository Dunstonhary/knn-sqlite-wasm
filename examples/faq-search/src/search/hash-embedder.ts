import { normalize } from 'knn-sqlite-wasm'

/**
 * Deterministic local embedder.
 *
 * Hashes word and character trigrams into a fixed-width vector. No model
 * download, no network, identical output every run — which is what makes the
 * KNN pipeline demonstrable before Transformers.js lands.
 *
 * It is LEXICAL, not semantic: "refund" and "money back" land in unrelated
 * dimensions, exactly as they would under the token-overlap mock. What it does
 * prove is the machinery around it — quantization, hamming shortlist, cosine
 * rescore — on real vectors of production width. Swapping in real embeddings
 * means replacing this one function.
 */
export const EMBED_DIMS = 384

/** FNV-1a. Cheap, well-distributed, and stable across engines. */
function hash(text: string, seed: number): number {
  let h = 0x811c9dc5 ^ seed
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

/** Character trigrams, so near-misses and plurals still share dimensions. */
function trigrams(word: string): string[] {
  const padded = `  ${word} `
  const out: string[] = []
  for (let i = 0; i < padded.length - 2; i++) out.push(padded.slice(i, i + 3))
  return out
}

/**
 * Project text into a unit vector.
 *
 * Each feature contributes to two dimensions with signs drawn from separate
 * hashes. The second hash is what keeps unrelated features from piling up in
 * the same direction: with one hash, every collision adds constructively and
 * the vector drifts toward whichever bucket is busiest.
 */
export function embed(text: string): Float32Array {
  const vec = new Float32Array(EMBED_DIMS)

  const add = (feature: string, weight: number) => {
    const h1 = hash(feature, 0)
    const h2 = hash(feature, 0x9e3779b9)
    const sign = h2 & 1 ? 1 : -1
    vec[h1 % EMBED_DIMS] += weight * sign
    vec[h2 % EMBED_DIMS] += weight * sign * 0.5
  }

  for (const word of tokens(text)) {
    // Whole words carry more signal than the trigrams inside them.
    add(`w:${word}`, 1)
    for (const tri of trigrams(word)) add(`t:${tri}`, 0.35)
  }

  return normalize(vec)
}
