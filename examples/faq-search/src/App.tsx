import { FaqSearch } from '@/components/faq-search'

export default function App() {
  return (
    <main className="min-h-dvh bg-background">
      <FaqSearch />
      <p className="mx-auto max-w-[620px] px-5 pb-8 text-center text-[11.5px] leading-relaxed text-muted-foreground">
        Binary KNN runs the real two-stage pipeline from knn-sqlite-wasm — 1 bit per dimension for
        the scan, exact cosine on the shortlist. The embedder is a local hash stand-in, so matching
        is lexical until Transformers.js lands.
      </p>
    </main>
  )
}
