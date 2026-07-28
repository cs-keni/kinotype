import { describe, it, expect } from 'vitest'
import {
  FADE_ALPHA,
  FLASH_MIN_SPEED,
  TRAIL_MAX_ALPHA,
  TRAIL_MAX_SPEED,
  TRAIL_MIN_SPEED,
  canvasSizeFor,
  shouldFlash,
  shouldTrail,
  trailAlpha,
  withAlpha,
} from '../src/effects'
import { MAX_RETURN_SPEED } from '../src/attractor'

describe('trail gating', () => {
  it('leaves no trail at rest', () => {
    expect(shouldTrail(0)).toBe(false)
    expect(trailAlpha(0)).toBe(0)
  })

  it('leaves no trail during reassembly (VQT #5)', () => {
    // The return must reform the phrase cleanly. Gating on speed gets that for
    // free, but only while the threshold stays above the return cruise speed —
    // this is the test that fails if someone retunes the attractor faster.
    expect(TRAIL_MIN_SPEED).toBeGreaterThan(MAX_RETURN_SPEED)
    expect(shouldTrail(MAX_RETURN_SPEED)).toBe(false)
  })

  it('trails on a scatter, which is far faster than the threshold', () => {
    expect(shouldTrail(14)).toBe(true)
    expect(trailAlpha(14)).toBeGreaterThan(0)
  })

  it('ramps opacity with speed', () => {
    expect(trailAlpha(5)).toBeLessThan(trailAlpha(10))
    expect(trailAlpha(10)).toBeLessThan(trailAlpha(TRAIL_MAX_SPEED))
  })

  it('never exceeds the faint ceiling, however fast the letter', () => {
    for (const speed of [TRAIL_MAX_SPEED, 40, 500, 10_000]) {
      expect(trailAlpha(speed)).toBeLessThanOrEqual(TRAIL_MAX_ALPHA)
    }
    expect(trailAlpha(TRAIL_MAX_SPEED)).toBeCloseTo(TRAIL_MAX_ALPHA, 6)
  })

  it('is continuous at the threshold — no visible pop as a letter speeds up', () => {
    expect(trailAlpha(TRAIL_MIN_SPEED)).toBe(0)
    expect(trailAlpha(TRAIL_MIN_SPEED + 0.01)).toBeLessThan(0.01)
  })

  it('stays faint — a trail is never more than a third opaque', () => {
    expect(TRAIL_MAX_ALPHA).toBeLessThan(0.5)
  })
})

describe('impact flash gating', () => {
  it('ignores resting contact, so a settled letter does not strobe', () => {
    expect(shouldFlash(0)).toBe(false)
    expect(shouldFlash(0.5)).toBe(false)
  })

  it('ignores boundary contact during reassembly', () => {
    // Letters are sensors during the return and can pass through bounds;
    // collisionStart still fires, so the speed gate is what keeps it quiet.
    expect(FLASH_MIN_SPEED).toBeGreaterThan(MAX_RETURN_SPEED)
    expect(shouldFlash(MAX_RETURN_SPEED)).toBe(false)
  })

  it('flashes on a real impact', () => {
    expect(shouldFlash(14)).toBe(true)
  })
})

describe('fade decay', () => {
  it('decays a mark to near-invisible inside the spec 200–400ms window', () => {
    // Remaining intensity after n frames of an alpha-a fill is (1-a)^n.
    const framesTo5Percent = Math.log(0.05) / Math.log(1 - FADE_ALPHA)
    const ms = (framesTo5Percent / 60) * 1000
    expect(ms).toBeGreaterThan(200)
    expect(ms).toBeLessThan(400)
  })

  it('uses a fill alpha low enough to read as a smear, not a wipe', () => {
    expect(FADE_ALPHA).toBeGreaterThan(0)
    expect(FADE_ALPHA).toBeLessThan(0.3)
  })
})

describe('canvasSizeFor', () => {
  it('scales the backing store by device pixel ratio (VQT #5)', () => {
    expect(canvasSizeFor(1440, 900, 2)).toEqual({ width: 2880, height: 1800 })
    expect(canvasSizeFor(800, 600, 1)).toEqual({ width: 800, height: 600 })
  })

  it('handles fractional ratios without producing a fractional backing store', () => {
    const { width, height } = canvasSizeFor(1000, 700, 1.5)
    expect(Number.isInteger(width)).toBe(true)
    expect(Number.isInteger(height)).toBe(true)
    expect(width).toBe(1500)
  })

  it('never scales below 1, so a bogus DPR cannot shrink the canvas', () => {
    expect(canvasSizeFor(800, 600, 0)).toEqual({ width: 800, height: 600 })
    expect(canvasSizeFor(800, 600, Number.NaN)).toEqual({ width: 800, height: 600 })
  })
})

describe('withAlpha', () => {
  it('converts a six-digit hex to rgba', () => {
    expect(withAlpha('#F7F4EE', 0.15)).toBe('rgba(247, 244, 238, 0.15)')
    expect(withAlpha('#000000', 1)).toBe('rgba(0, 0, 0, 1)')
  })

  it('expands three-digit shorthand', () => {
    expect(withAlpha('#FFF', 0.5)).toBe('rgba(255, 255, 255, 0.5)')
  })

  it('tolerates a missing leading hash', () => {
    expect(withAlpha('1A1A1A', 1)).toBe('rgba(26, 26, 26, 1)')
  })
})
