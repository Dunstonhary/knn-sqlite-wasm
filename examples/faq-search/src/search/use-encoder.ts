import { useCallback, useState } from 'react'
import { type EncoderState, loadEncoder, type LoadProgress } from './embedder'

export interface EncoderStatus {
  state: EncoderState
  progress: LoadProgress | null
  error: Error | null
  /** Start the download. Safe to call repeatedly. */
  load: () => Promise<void>
}

/**
 * Download state for the sentence encoder, as something the UI can render.
 *
 * Kept separate from the search hook because the encoder is shared: the
 * dashboard shows one progress bar, not one per panel that happens to need a
 * vector.
 */
export function useEncoder(): EncoderStatus {
  const [state, setState] = useState<EncoderState>(() =>
    typeof window === 'undefined' ? 'idle' : 'idle',
  )
  const [progress, setProgress] = useState<LoadProgress | null>(null)
  const [error, setError] = useState<Error | null>(null)

  const load = useCallback(async () => {
    setState('loading')
    setError(null)
    try {
      await loadEncoder((p) => setProgress(p))
      setProgress(null)
      setState('ready')
    } catch (err) {
      setProgress(null)
      setState('failed')
      setError(err instanceof Error ? err : new Error(String(err)))
      throw err
    }
  }, [])

  return { state, progress, error, load }
}
