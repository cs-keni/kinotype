import { describe, it, expect, beforeEach } from 'vitest'
import Matter from 'matter-js'
import { startRenderer } from '../src/renderer'
import type { PhysicsLetter } from '../src/types'

function makeLetter(homeX = 100, homeY = 100): PhysicsLetter {
  const body = Matter.Bodies.rectangle(homeX, homeY, 20, 30, { isStatic: false })
  const element = document.createElement('span') as HTMLSpanElement
  return { body, element, homeX, homeY, char: 'a', width: 20, height: 30, prevWeight: 300 }
}

function triggerSync(engine: Matter.Engine): void {
  Matter.Events.trigger(engine, 'afterUpdate', {})
}

// ─── Axis mapping at rest (speed = 0) ────────────────────────────────────────

describe('renderer axis mapping at rest', () => {
  let engine: Matter.Engine
  let letter: PhysicsLetter

  beforeEach(() => {
    engine = Matter.Engine.create()
    letter = makeLetter()
    // Prime prevWeight away from 300 so the threshold filter fires on the first sync
    letter.prevWeight = 400
    Matter.Composite.add(engine.world, letter.body)
    startRenderer(engine, [letter])

    // At rest: velocity is 0/0 — set explicitly to be certain
    Matter.Body.setVelocity(letter.body, { x: 0, y: 0 })
    triggerSync(engine)
  })

  it('sets wght=300 (Light) at zero speed', () => {
    expect(letter.element.style.fontVariationSettings).toContain('"wght" 300')
  })

  it('sets SOFT=100 at zero speed', () => {
    expect(letter.element.style.fontVariationSettings).toContain('"SOFT" 100')
  })

  it('sets opsz=72 when angular velocity is zero', () => {
    expect(letter.element.style.fontVariationSettings).toContain('"opsz" 72')
  })

  it('sets transform to translate(0px, 0px) when at home position', () => {
    expect(letter.element.style.transform).toContain('translate(0px, 0px)')
  })
})

// ─── Axis mapping at max speed ────────────────────────────────────────────────

describe('renderer axis mapping at max speed', () => {
  const MAX_SPEED = 25

  let engine: Matter.Engine
  let letter: PhysicsLetter

  beforeEach(() => {
    engine = Matter.Engine.create()
    letter = makeLetter()
    Matter.Composite.add(engine.world, letter.body)
    startRenderer(engine, [letter])

    Matter.Body.setVelocity(letter.body, { x: MAX_SPEED, y: 0 })
    triggerSync(engine)
  })

  it('sets wght=900 (Black) at max speed', () => {
    expect(letter.element.style.fontVariationSettings).toContain('"wght" 900')
  })

  it('sets SOFT=0 at max speed', () => {
    expect(letter.element.style.fontVariationSettings).toContain('"SOFT" 0')
  })
})

// ─── wght threshold filter ────────────────────────────────────────────────────

describe('renderer wght threshold', () => {
  it('skips fontVariationSettings update when wght change is < 2', () => {
    const engine = Matter.Engine.create()
    const letter = makeLetter()
    letter.prevWeight = 300
    Matter.Composite.add(engine.world, letter.body)
    startRenderer(engine, [letter])

    // speed that maps to wght ≈ 301 (t = 1/600 → wght = 300 + 1)
    // clamp01(1/600) * 600 → wght = 301, diff from prevWeight(300) = 1 → skipped
    const tinySpeed = (1 / 600) * 25
    Matter.Body.setVelocity(letter.body, { x: tinySpeed, y: 0 })
    triggerSync(engine)

    // fontVariationSettings should not have been set (still default empty or unchanged)
    const fvs = letter.element.style.fontVariationSettings
    expect(fvs === '' || fvs.includes('"wght" 300')).toBe(true)
  })

  it('does update fontVariationSettings when wght change is >= 2', () => {
    const engine = Matter.Engine.create()
    const letter = makeLetter()
    letter.prevWeight = 300
    Matter.Composite.add(engine.world, letter.body)
    startRenderer(engine, [letter])

    // speed that maps to wght ≈ 312 (t = 2/100)
    const speed = (12 / 600) * 25
    Matter.Body.setVelocity(letter.body, { x: speed, y: 0 })
    triggerSync(engine)

    expect(letter.element.style.fontVariationSettings).not.toBe('')
  })
})

// ─── Transform sync ───────────────────────────────────────────────────────────

describe('renderer transform sync', () => {
  it('reflects body displacement as CSS translate', () => {
    const engine = Matter.Engine.create()
    const letter = makeLetter(100, 100)
    Matter.Composite.add(engine.world, letter.body)
    startRenderer(engine, [letter])

    Matter.Body.setPosition(letter.body, { x: 150, y: 120 })
    triggerSync(engine)

    expect(letter.element.style.transform).toContain('translate(50px, 20px)')
  })

  it('reflects body rotation as CSS rotate', () => {
    const engine = Matter.Engine.create()
    const letter = makeLetter(100, 100)
    Matter.Composite.add(engine.world, letter.body)
    startRenderer(engine, [letter])

    Matter.Body.setAngle(letter.body, Math.PI / 4)
    triggerSync(engine)

    expect(letter.element.style.transform).toContain(`rotate(${Math.PI / 4}rad)`)
  })
})
