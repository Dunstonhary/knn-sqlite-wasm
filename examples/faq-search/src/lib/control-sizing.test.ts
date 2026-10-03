import { describe, expect, it } from 'vitest'
import { CONTROL_SIZING, TOUCH_TARGET_MIN_PX } from './control-sizing'

/** Tailwind's default scale: one unit is 0.25rem, and the demo never resets the root font size. */
const PX_PER_UNIT = 4

type Parsed = { property: string; px: number }

/**
 * Turn a single utility into the property it sets and the pixel value it sets
 * it to — `min-h-11` becomes `{ property: 'min-h', px: 44 }`. Only the handful
 * of sizing utilities the recipes below use are understood; anything else is a
 * parse failure rather than a silent pass, so a recipe cannot sneak past this
 * suite by using a utility the test does not measure.
 */
function parse(utility: string): Parsed {
  const match = /^(min-h|h|size)-(\d+(?:\.\d+)?)$/.exec(utility)
  if (!match) throw new Error(`unmeasurable sizing utility: ${utility}`)
  return { property: match[1], px: Number(match[2]) * PX_PER_UNIT }
}

/**
 * The density the desktop layout had before this change, which the `sm:`
 * override has to restore exactly. `0` means the touch floor is lifted and the
 * control goes back to sizing itself from its padding (the engine toggle sat
 * at 32px that way, the score-bars row at 16px).
 */
const APPROVED_DESKTOP_PX: Record<keyof typeof CONTROL_SIZING, number> = {
  engineToggle: 0,
  searchInput: 40,
  areaChip: 28,
  scoreToggleRow: 0,
  helpTrigger: 14,
}

describe('CONTROL_SIZING', () => {
  it('holds Apple HIG and Material to the same 44px floor', () => {
    expect(TOUCH_TARGET_MIN_PX).toBe(44)
  })

  it('covers every control the demo exposes', () => {
    expect(Object.keys(CONTROL_SIZING).sort()).toEqual(
      Object.keys(APPROVED_DESKTOP_PX).sort(),
    )
  })

  for (const [name, recipe] of Object.entries(CONTROL_SIZING)) {
    describe(name, () => {
      const [base, override] = recipe.split(' ')

      it('is a touch base plus one sm: override and nothing else', () => {
        // Two tokens exactly. A third would mean some other breakpoint is in
        // play and the two assertions below would stop describing the control.
        expect(recipe.split(' ')).toHaveLength(2)
        expect(override.startsWith('sm:')).toBe(true)
        expect(base.startsWith('sm:')).toBe(false)
      })

      it('starts at or above the touch floor', () => {
        expect(parse(base).px).toBeGreaterThanOrEqual(TOUCH_TARGET_MIN_PX)
      })

      it('restores the approved desktop density from sm: up', () => {
        const desktop = parse(override.slice('sm:'.length))
        // Same property both sides, or the override would not override.
        expect(desktop.property).toBe(parse(base).property)
        expect(desktop.px).toBe(APPROVED_DESKTOP_PX[name as keyof typeof CONTROL_SIZING])
      })
    })
  }
})
