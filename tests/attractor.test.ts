import { describe, it, expect, beforeEach } from 'vitest'
import Matter from 'matter-js'
import {
  activateAttractor,
  cancelAttractor,
  desiredSpeed,
  normalizeAngle,
  staggerDelay,
  F_MAX,
  MAX_RETURN_SPEED,
  MAX_TICKS,
  REST_FRICTION_AIR,
  RETURN_FRICTION_AIR,
  SLEEP_DIST_PX,
  SLOW_RADIUS,
  STAGGER_TICKS,
} from '../src/attractor'
import type { PhysicsLetter } from '../src/types'

function makeLetter(homeX: number, homeY: number, startX?: number, startY?: number): PhysicsLetter {
  const body = Matter.Bodies.rectangle(startX ?? homeX, startY ?? homeY, 20, 30, {
    isStatic: false,
  })
  const element = document.createElement('span') as HTMLSpanElement
  return { body, element, homeX, homeY, char: 'a', width: 20, height: 30, prevWeight: 300 }
}

function step(engine: Matter.Engine, ticks: number): void {
  for (let i = 0; i < ticks; i++) Matter.Engine.update(engine, 1000 / 60)
}

// ─── Arrival curve ───────────────────────────────────────────────────────────

describe('desiredSpeed (arrive steering)', () => {
  it('is flat at MAX_RETURN_SPEED outside SLOW_RADIUS', () => {
    expect(desiredSpeed(SLOW_RADIUS)).toBe(MAX_RETURN_SPEED)
    expect(desiredSpeed(SLOW_RADIUS * 10)).toBe(MAX_RETURN_SPEED)
  })

  it('tapers linearly to zero inside SLOW_RADIUS', () => {
    expect(desiredSpeed(SLOW_RADIUS / 2)).toBeCloseTo(MAX_RETURN_SPEED / 2, 6)
    expect(desiredSpeed(0)).toBe(0)
  })

  it('is monotonically non-decreasing in distance', () => {
    let prev = -1
    for (let d = 0; d <= SLOW_RADIUS * 2; d += 5) {
      const v = desiredSpeed(d)
      expect(v).toBeGreaterThanOrEqual(prev)
      prev = v
    }
  })

  it('target speed at the sleep gate is small enough to be an invisible snap', () => {
    // Under 0.25px/tick (15px/s) at the moment the letter is frozen to home.
    expect(desiredSpeed(SLEEP_DIST_PX)).toBeLessThan(0.25)
  })

  it('decelerates on approach — the regression this replaced', () => {
    // The old inverse-distance attractor capped force at F_MAX for anything
    // nearer than ~157px, so letters coasted at terminal velocity into a snap.
    // Arrive steering must demand LESS speed as the letter closes in.
    expect(desiredSpeed(20)).toBeLessThan(desiredSpeed(60))
    expect(desiredSpeed(60)).toBeLessThan(desiredSpeed(200))
  })
})

// ─── Reading-order stagger ───────────────────────────────────────────────────

describe('staggerDelay', () => {
  it('starts the first letter immediately', () => {
    expect(staggerDelay(0, 40)).toBe(0)
  })

  it('spreads the last letter by exactly STAGGER_TICKS', () => {
    expect(staggerDelay(39, 40)).toBe(STAGGER_TICKS)
  })

  it('is monotonic in reading order', () => {
    let prev = -1
    for (let i = 0; i < 40; i++) {
      const d = staggerDelay(i, 40)
      expect(d).toBeGreaterThanOrEqual(prev)
      prev = d
    }
  })

  it('handles a single letter without dividing by zero', () => {
    expect(staggerDelay(0, 1)).toBe(0)
  })

  it('leaves headroom under the MAX_TICKS failsafe', () => {
    // Stagger + flight must finish well before the failsafe snaps stragglers,
    // otherwise the last letters in the wave get yanked home instead of landing.
    expect(STAGGER_TICKS).toBeLessThan(MAX_TICKS / 4)
  })
})

// ─── Angular unwind ──────────────────────────────────────────────────────────

describe('normalizeAngle', () => {
  it('leaves angles already inside (-π, π] untouched', () => {
    expect(normalizeAngle(0)).toBe(0)
    expect(normalizeAngle(1)).toBeCloseTo(1, 9)
    expect(normalizeAngle(-1)).toBeCloseTo(-1, 9)
  })

  it('wraps past-half-turn rotations to the short way round', () => {
    expect(normalizeAngle(4)).toBeCloseTo(4 - Math.PI * 2, 9)
    expect(normalizeAngle(-4)).toBeCloseTo(-4 + Math.PI * 2, 9)
  })

  it('collapses whole turns — three spins unwind like none', () => {
    expect(normalizeAngle(Math.PI * 6)).toBeCloseTo(0, 9)
    expect(normalizeAngle(Math.PI * 6 + 0.5)).toBeCloseTo(0.5, 9)
    expect(normalizeAngle(-Math.PI * 6 - 0.5)).toBeCloseTo(-0.5, 9)
  })

  it('always returns a value within (-π, π]', () => {
    for (let a = -20; a <= 20; a += 0.37) {
      const n = normalizeAngle(a)
      expect(n).toBeGreaterThan(-Math.PI - 1e-9)
      expect(n).toBeLessThanOrEqual(Math.PI + 1e-9)
    }
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

  it('drops drag during return so steering does the damping', () => {
    const letter = makeLetter(100, 100)
    Matter.Composite.add(engine.world, letter.body)
    activateAttractor(engine, [letter])
    expect(letter.body.frictionAir).toBe(RETURN_FRICTION_AIR)
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

  it('restores resting drag on settle', () => {
    const letter = makeLetter(100, 100, 105, 100)
    Matter.Composite.add(engine.world, letter.body)
    activateAttractor(engine, [letter])
    step(engine, 200)
    expect(letter.body.isStatic).toBe(true)
    expect(letter.body.frictionAir).toBe(REST_FRICTION_AIR)
  })

  it('pulls a displaced letter toward home over engine ticks', () => {
    const letter = makeLetter(100, 100, 400, 100) // 300px away
    Matter.Composite.add(engine.world, letter.body)
    activateAttractor(engine, [letter])

    const initialDist = Math.abs(letter.body.position.x - letter.homeX)
    step(engine, 30)
    const finalDist = Math.abs(letter.body.position.x - letter.homeX)

    expect(finalDist).toBeLessThan(initialDist)
  })

  it('lands a scattered letter home well inside the failsafe', () => {
    const letter = makeLetter(400, 300, 900, 700) // ~640px away
    Matter.Composite.add(engine.world, letter.body)
    activateAttractor(engine, [letter])

    step(engine, MAX_TICKS - 100)
    expect(letter.body.isStatic).toBe(true)
    expect(letter.body.position.x).toBeCloseTo(400, 3)
    expect(letter.body.position.y).toBeCloseTo(300, 3)
  })

  it('takes the return slowly — no sub-4s dash to home', () => {
    // VQT #4: the reassembly must be worth watching in isolation. A 500px
    // return that finishes inside 240 ticks (4s) is the old mechanical snap.
    const letter = makeLetter(100, 300, 600, 300)
    Matter.Composite.add(engine.world, letter.body)
    activateAttractor(engine, [letter])

    step(engine, 240)
    expect(letter.body.isStatic).toBe(false)
  })

  it('caps speed near the arrival radius instead of coasting in', () => {
    const letter = makeLetter(100, 300, 600, 300)
    Matter.Composite.add(engine.world, letter.body)
    activateAttractor(engine, [letter])

    // Step until the letter is inside the slow radius, sampling speed there.
    let speedInside = Infinity
    for (let i = 0; i < 800; i++) {
      Matter.Engine.update(engine, 1000 / 60)
      if (letter.body.isStatic) break
      const dist = Math.abs(letter.body.position.x - letter.homeX)
      if (dist < SLOW_RADIUS / 2) {
        const { x, y } = letter.body.velocity
        speedInside = Math.min(speedInside, Math.sqrt(x * x + y * y))
      }
    }
    // Inside half the slow radius, target speed is <= half of max.
    expect(speedInside).toBeLessThan(MAX_RETURN_SPEED)
  })

  it('unwinds rotation during flight so settle needs no angle snap', () => {
    const letter = makeLetter(100, 300, 500, 300)
    letter.body.isStatic = false
    Matter.Body.setAngle(letter.body, 2.5)
    Matter.Body.setAngularVelocity(letter.body, 0.2)
    Matter.Composite.add(engine.world, letter.body)
    activateAttractor(engine, [letter])

    step(engine, 200)
    // Whatever happens to position, the letter should be near upright long
    // before it lands — the old code snapped angle to 0 at settle.
    expect(Math.abs(normalizeAngle(letter.body.angle))).toBeLessThan(0.3)
  })

  it('holds a letter in place until its stagger delay elapses', () => {
    const letters = [makeLetter(100, 300, 500, 300), makeLetter(200, 300, 600, 300)]
    letters.forEach((l) => Matter.Composite.add(engine.world, l.body))
    activateAttractor(engine, letters)

    const startX = letters[1].body.position.x
    step(engine, 20) // well inside letter 1's STAGGER_TICKS delay

    // Letter 0 is already moving; letter 1 has not been touched yet.
    expect(letters[0].body.position.x).toBeLessThan(500)
    expect(letters[1].body.position.x).toBeCloseTo(startX, 6)
  })
})

// ─── Cancellation ────────────────────────────────────────────────────────────

describe('cancelAttractor', () => {
  let engine: Matter.Engine

  beforeEach(() => {
    engine = Matter.Engine.create()
    engine.gravity.y = 1
  })

  it('restores world state without snapping letters home', () => {
    const letter = makeLetter(100, 100, 400, 400)
    Matter.Composite.add(engine.world, letter.body)
    activateAttractor(engine, [letter])
    step(engine, 10)

    cancelAttractor(engine)

    expect(engine.gravity.y).toBe(1)
    expect(letter.body.isSensor).toBe(false)
    expect(letter.body.frictionAir).toBe(REST_FRICTION_AIR)
    expect(letter.body.isStatic).toBe(false)
    // Still out in the world, not yanked to home.
    expect(letter.body.position.x).toBeGreaterThan(200)
  })

  it('stops applying force after cancellation', () => {
    const letter = makeLetter(100, 100, 400, 100)
    Matter.Composite.add(engine.world, letter.body)
    activateAttractor(engine, [letter])
    step(engine, 10)
    cancelAttractor(engine)

    // Gravity is back on, so pin the body to isolate horizontal attractor pull.
    engine.gravity.y = 0
    Matter.Body.setVelocity(letter.body, { x: 0, y: 0 })
    const x = letter.body.position.x
    step(engine, 60)

    expect(letter.body.position.x).toBeCloseTo(x, 3)
  })

  it('is a no-op when no return is running', () => {
    expect(() => cancelAttractor(engine)).not.toThrow()
  })

  it('does not stack force fields when activated twice', () => {
    const solo = Matter.Engine.create()
    solo.gravity.y = 1
    const a = makeLetter(100, 100, 400, 100)
    Matter.Composite.add(solo.world, a.body)
    activateAttractor(solo, [a])
    step(solo, 40)
    const soloDist = Math.abs(a.body.position.x - a.homeX)

    const doubled = Matter.Engine.create()
    doubled.gravity.y = 1
    const b = makeLetter(100, 100, 400, 100)
    Matter.Composite.add(doubled.world, b.body)
    activateAttractor(doubled, [b])
    activateAttractor(doubled, [b]) // second idle fires mid-return
    step(doubled, 40)
    const doubledDist = Math.abs(b.body.position.x - b.homeX)

    // Without the WeakMap guard the second listener doubles the pull and the
    // letter arrives measurably faster.
    expect(doubledDist).toBeCloseTo(soloDist, 1)
  })
})

// ─── Constants ───────────────────────────────────────────────────────────────

describe('attractor constants', () => {
  it('F_MAX gives enough authority to reverse a scattered letter', () => {
    // accel/tick = F_MAX * dt² at mass-normalised force, dt = 1000/60.
    const accel = F_MAX * Math.pow(1000 / 60, 2)
    const CLICK_PEAK_SPEED = 14 // px/tick, from input.ts CLICK_IMPULSE at mass=1
    // Should turn a letter around in under 2s rather than fighting for 5s.
    expect(CLICK_PEAK_SPEED / accel).toBeLessThan(120)
  })

  it('SLEEP_DIST_PX is a distance-only gate', () => {
    expect(SLEEP_DIST_PX).toBeGreaterThan(0)
    expect(SLEEP_DIST_PX).toBeLessThanOrEqual(5)
  })

  it('return drag is lighter than resting drag', () => {
    expect(RETURN_FRICTION_AIR).toBeLessThan(REST_FRICTION_AIR)
  })
})
