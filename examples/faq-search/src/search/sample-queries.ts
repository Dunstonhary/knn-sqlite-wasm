/**
 * Queries the dashboard ships vectors for.
 *
 * Every one is a paraphrase: it shares almost no words with the entry it
 * should find. That is deliberate — they are the cases the old hash embedder
 * got wrong, so picking one is the fastest way to see what the encoder is
 * for. Their vectors are precomputed, so exploring costs no download.
 */
export const SAMPLE_QUERIES = [
  'give the money back to a customer',
  'add someone to my team',
  'why did a card get declined',
  'let people book time with me',
  'send our events to a chat tool',
  'bulk upload people from a spreadsheet',
] as const
