/**
 * Apple's HIG and Material both put the minimum tappable target at 44px.
 * Anything smaller is a coin flip with a thumb.
 */
export const TOUCH_TARGET_MIN_PX = 44

/**
 * Sizing for the demo's interactive controls, touch-first.
 *
 * Each recipe is a touch-sized base plus a single `sm:` override that hands
 * the approved desktop density straight back — phones get the 44px floor,
 * pointer-sized screens keep the layout they already had. Going the other way
 * (desktop base, larger on small screens) would need a max-width variant on
 * every control and leaves the untouched case as the wrong one.
 *
 * The class strings are written out in full on purpose: Tailwind v4 scans
 * source text, so a class assembled at runtime never reaches the stylesheet.
 */
export const CONTROL_SIZING = {
  /** Engine toggle. No fixed height — padding sizes it, the floor lifts it. */
  engineToggle: 'min-h-11 sm:min-h-0',
  /** Search field. */
  searchInput: 'h-11 sm:h-10',
  /** Area filter chips. */
  areaChip: 'h-11 sm:h-7',
  /** The score-bars checkbox and its label, which tap as one row. */
  scoreToggleRow: 'min-h-11 sm:min-h-0',
  /** The (i) that opens the score-bars explainer. */
  helpTrigger: 'size-11 sm:size-3.5',
} as const
