import { describe, it, expect, beforeEach } from 'vitest'
import Matter from 'matter-js'
import { createEngine, createBodies, wakeBodies, SLEEP_THRESHOLD_FRAMES } from '../src/physics'
import { activateAttractor } from '../src/attractor'
import type { HomePosition } from '../src/types'

function makeHome(char: string, w: number, h: number): HomePosition {
  return {
    char,
    element: document.createElement('span') as HTMLSpanElement,
    homeX: 100,
    homeY: 100,
    width: w,
    height: h,
  }
}

// ─── createEngine ────────────────────────────────────────────────────────────

describe('createEngine', () => {
  it('creates an engine with gravity.y = 1', () => {
    const engine = createEngine()
    expect(engine.gravity.y).toBe(1)
  })
})

// ─── Mass clamping ───────────────────────────────────────────────────────────

const DENSITY = 0.002
const MIN_MASS = 0.5
const MAX_MASS = 2.5

describe('createBodies mass bounds', () => {
  let engine: Matter.Engine

  beforeEach(() => {
    engine = createEngine()
  })

  it('clamps tiny glyphs to MIN_MASS', () => {
    // 1×1 glyph: raw = 1 * 1 * 0.002 = 0.002 → clamped to 0.5
    const letters = createBodies(engine, [makeHome('i', 1, 1)])
    expect(letters[0].body.mass).toBeCloseTo(MIN_MASS, 5)
  })

  it('clamps large glyphs to MAX_MASS', () => {
    // 100×100 glyph: raw = 100 * 100 * 0.002 = 20 → clamped to 2.5
    const letters = createBodies(engine, [makeHome('W', 100, 100)])
    expect(letters[0].body.mass).toBeCloseTo(MAX_MASS, 5)
  })

  it('passes mid-range glyphs through unclamped', () => {
    // 30×30 glyph: raw = 30 * 30 * 0.002 = 1.8 → within [0.5, 2.5]
    const expected = 30 * 30 * DENSITY
    expect(expected).toBeGreaterThan(MIN_MASS)
    expect(expected).toBeLessThan(MAX_MASS)
    const letters = createBodies(engine, [makeHome('n', 30, 30)])
    expect(letters[0].body.mass).toBeCloseTo(expected, 5)
  })

  it('mass ratio MAX/MIN is 5.0', () => {
    expect(MAX_MASS / MIN_MASS).toBe(5.0)
  })
})

// ─── createBodies initial state ──────────────────────────────────────────────

describe('createBodies initial body state', () => {
  let engine: Matter.Engine

  beforeEach(() => {
    engine = createEngine()
  })

  it('creates one body per HomePosition', () => {
    const letters = createBodies(engine, [makeHome('a', 20, 30), makeHome('b', 20, 30)])
    expect(letters).toHaveLength(2)
  })

  it('positions each body at its homeX/homeY', () => {
    const home = makeHome('x', 20, 30)
    home.homeX = 250
    home.homeY = 180
    const [letter] = createBodies(engine, [home])
    expect(letter.body.position.x).toBeCloseTo(250, 3)
    expect(letter.body.position.y).toBeCloseTo(180, 3)
  })

  it('starts letters as static (suspended until first interaction)', () => {
    const [letter] = createBodies(engine, [makeHome('m', 20, 30)])
    expect(letter.body.isStatic).toBe(true)
  })

  it('sets prevWeight to 300 (resting font weight)', () => {
    const [letter] = createBodies(engine, [makeHome('e', 20, 30)])
    expect(letter.prevWeight).toBe(300)
  })

  it('labels body with the glyph character', () => {
    const [letter] = createBodies(engine, [makeHome('k', 20, 30)])
    expect(letter.body.label).toBe('k')
  })
})

// ─── wakeBodies ──────────────────────────────────────────────────────────────

describe('wakeBodies', () => {
  it('makes all static bodies dynamic', () => {
    const engine = createEngine()
    const letters = createBodies(engine, [makeHome('a', 20, 30), makeHome('b', 20, 30)])
    letters.forEach((l) => expect(l.body.isStatic).toBe(true))
    wakeBodies(letters)
    letters.forEach((l) => expect(l.body.isStatic).toBe(false))
  })
})

// ─── Sleeping ────────────────────────────────────────────────────────────────
// Not a jitter fix: resting drift measures 0.000px either way, so VQT #3 passes
// on solver stability alone. Sleeping is an idle-cost saving (4.2x on a rested
// pile) for a runner that loops forever once started.

describe('sleeping', () => {
  it('enables sleeping so a resting page stops paying full solver cost', () => {
    expect(createEngine().enableSleeping).toBe(true)
  })

  it('gives every body an explicit sleep threshold', () => {
    const engine = createEngine()
    const letters = createBodies(engine, [
      { char: 'a', element: document.createElement('span'), homeX: 10, homeY: 10, width: 20, height: 30 },
    ])
    expect(letters[0].body.sleepThreshold).toBe(SLEEP_THRESHOLD_FRAMES)
  })

  it('wakeBodies clears the sleep flag, not just isStatic', () => {
    // applyForce does not wake a sleeping body, so a letter that dozed off
    // would ignore both the cursor and the attractor if this regressed.
    const engine = createEngine()
    const letters = createBodies(engine, [
      { char: 'a', element: document.createElement('span'), homeX: 10, homeY: 10, width: 20, height: 30 },
    ])
    Matter.Body.setStatic(letters[0].body, false)
    Matter.Sleeping.set(letters[0].body, true)
    expect(letters[0].body.isSleeping).toBe(true)

    wakeBodies(letters)

    expect(letters[0].body.isSleeping).toBe(false)
    expect(letters[0].body.isStatic).toBe(false)
  })

  it('a sleeping letter still returns home when the attractor fires', () => {
    const engine = createEngine()
    const letters = createBodies(engine, [
      { char: 'a', element: document.createElement('span'), homeX: 100, homeY: 100, width: 20, height: 30 },
    ])
    wakeBodies(letters)
    Matter.Body.setPosition(letters[0].body, { x: 500, y: 400 })
    Matter.Sleeping.set(letters[0].body, true)

    activateAttractor(engine, letters)
    for (let i = 0; i < 900; i++) Matter.Engine.update(engine, 1000 / 60)

    expect(letters[0].body.isStatic).toBe(true)
    expect(letters[0].body.position.x).toBeCloseTo(100, 3)
    expect(letters[0].body.position.y).toBeCloseTo(100, 3)
  })
})
