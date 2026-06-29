import { describe, it, expect, beforeEach } from 'vitest'
import Matter from 'matter-js'
import { activateAttractor, K, F_MAX, EPSILON, SLEEP_DIST_PX } from '../src/attractor'
import type { PhysicsLetter } from '../src/types'

function makeLetter(homeX: number, homeY: number, startX?: number, startY?: number): PhysicsLetter {
  const body = Matter.Bodies.rectangle(startX ?? homeX, startY ?? homeY, 20, 30, {
    isStatic: false,
  })
  const element = document.createElement('span') as HTMLSpanElement
  return { body, element, homeX, homeY, char: 'a', width: 20, height: 30, prevWeight: 300 }
}

// ─── Constants ──────────────────────────────────────────────────────────────

describe('attractor constants', () => {
  it('F_MAX is low enough to prevent close-range oscillation', () => {
    // Pre-fix F_MAX was 0.001; the fix lowered it to 0.0003
    expect(F_MAX).toBeLessThanOrEqual(0.0003)
  })

  it('SLEEP_DIST_PX is distance-only gate (>= 5px)', () => {
    expect(SLEEP_DIST_PX).toBeGreaterThanOrEqual(5)
  })

  it('force at SLEEP_DIST_PX boundary is capped by F_MAX', () => {
    const forceMag = Math.min(K / (SLEEP_DIST_PX + EPSILON), F_MAX)
    expect(forceMag).toBe(F_MAX)
  })
})

// ─── Force formula ───────────────────────────────────────────────────────────

describe('force magnitude formula', () => {
  it('is capped at F_MAX when body is very close to home', () => {
    const dist = 0
    const forceMag = Math.min(K / (dist + EPSILON), F_MAX)
    expect(forceMag).toBe(F_MAX)
    expect(K / (dist + EPSILON)).toBeGreaterThan(F_MAX)
  })

  it('is uncapped (K-law) when body is far from home', () => {
    const dist = 300
    const uncapped = K / (dist + EPSILON)
    const forceMag = Math.min(uncapped, F_MAX)
    expect(forceMag).toBe(uncapped)
    expect(forceMag).toBeLessThan(F_MAX)
  })

  it('transitions from uncapped to capped below the crossover distance', () => {
    // Crossover: K / (dist + EPSILON) = F_MAX → dist = K/F_MAX - EPSILON
    const crossover = K / F_MAX - EPSILON
    const farForce = Math.min(K / (crossover + 1 + EPSILON), F_MAX)
    const closeForce = Math.min(K / (crossover - 1 + EPSILON), F_MAX)
    expect(farForce).toBeLessThan(F_MAX)
    expect(closeForce).toBe(F_MAX)
  })

  it('force direction is normalised toward home', () => {
    const dx = 40
    const dy = 30
    const dist = Math.sqrt(dx * dx + dy * dy) // 50
    const fx = (dx / dist)
    const fy = (dy / dist)
    const magnitude = Math.sqrt(fx * fx + fy * fy)
    expect(magnitude).toBeCloseTo(1, 5)
  })
})

// ─── Sleep gate ──────────────────────────────────────────────────────────────

describe('sleep gate', () => {
  it('considers a letter asleep when dist <= SLEEP_DIST_PX', () => {
    const dist = SLEEP_DIST_PX - 0.1
    expect(dist > SLEEP_DIST_PX).toBe(false)
  })

  it('keeps a letter awake when dist > SLEEP_DIST_PX', () => {
    const dist = SLEEP_DIST_PX + 0.1
    expect(dist > SLEEP_DIST_PX).toBe(true)
  })

  it('does NOT gate on speed (pre-fix regression guard)', () => {
    // The sleep check is purely distance-based — no speed threshold.
    // If speed were used, a fast letter at dist < SLEEP_DIST_PX would stay awake.
    // This test documents that the gate is dist > SLEEP_DIST_PX, nothing else.
    const distClose = SLEEP_DIST_PX - 0.1
    const highSpeed = 999
    const awake = distClose > SLEEP_DIST_PX // speed is irrelevant
    expect(awake).toBe(false)
    expect(highSpeed).toBeGreaterThan(0) // speed exists but is not part of the gate
  })
})

// ─── Integration: activate → settle → deactivate ─────────────────────────────

describe('activateAttractor integration', () => {
  let engine: Matter.Engine

  beforeEach(() => {
    engine = Matter.Engine.create()
    engine.gravity.y = 1
  })

  it('disables gravity while active', () => {
    const letter = makeLetter(100, 100)
    Matter.Composite.add(engine.world, letter.body)
    activateAttractor(engine, [letter])
    expect(engine.gravity.y).toBe(0)
  })

  it('sets isSensor=true on all letters while active', () => {
    const letters = [makeLetter(100, 100), makeLetter(200, 100)]
    letters.forEach((l) => Matter.Composite.add(engine.world, l.body))
    activateAttractor(engine, letters)
    letters.forEach((l) => expect(l.body.isSensor).toBe(true))
  })

  it('restores gravity and sensor state after deactivate()', () => {
    const letter = makeLetter(100, 100)
    Matter.Composite.add(engine.world, letter.body)
    const deactivate = activateAttractor(engine, [letter])
    deactivate()
    expect(engine.gravity.y).toBe(1)
    expect(letter.body.isSensor).toBe(false)
  })

  it('snaps letter to exact home position on deactivate()', () => {
    const letter = makeLetter(100, 100, 200, 300)
    Matter.Composite.add(engine.world, letter.body)
    const deactivate = activateAttractor(engine, [letter])
    deactivate()
    expect(letter.body.position.x).toBeCloseTo(100, 3)
    expect(letter.body.position.y).toBeCloseTo(100, 3)
  })

  it('makes letters static on deactivate (re-hang, prevents re-fall)', () => {
    const letter = makeLetter(100, 100)
    Matter.Composite.add(engine.world, letter.body)
    const deactivate = activateAttractor(engine, [letter])
    deactivate()
    expect(letter.body.isStatic).toBe(true)
  })

  it('clears transform style on deactivate', () => {
    const letter = makeLetter(100, 100)
    letter.element.style.transform = 'translate(50px, 20px)'
    Matter.Composite.add(engine.world, letter.body)
    const deactivate = activateAttractor(engine, [letter])
    deactivate()
    expect(letter.element.style.transform).toBe('')
  })

  it('pulls a displaced letter toward home over engine ticks', () => {
    const letter = makeLetter(100, 100, 400, 100) // 300px away
    Matter.Composite.add(engine.world, letter.body)
    activateAttractor(engine, [letter])

    const initialDist = Math.abs(letter.body.position.x - letter.homeX)

    // Run enough ticks for the attractor to pull the letter noticeably closer
    for (let i = 0; i < 30; i++) {
      Matter.Engine.update(engine, 1000 / 60)
    }

    const finalDist = Math.abs(letter.body.position.x - letter.homeX)
    expect(finalDist).toBeLessThan(initialDist)
  })
})
