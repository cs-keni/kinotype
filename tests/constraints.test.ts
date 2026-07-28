import { describe, it, expect, beforeEach } from 'vitest'
import Matter from 'matter-js'
import {
  BREAK_DISTANCE_RATIO,
  BREAK_RELATIVE_SPEED,
  SPRING_DAMPING,
  SPRING_STIFFNESS,
  adjacentPairsInWords,
  createWordSprings,
  isOverStrained,
  restLength,
} from '../src/constraints'
import type { PhysicsLetter } from '../src/types'

/** Build letters from a spaced phrase, laid out on one line 40px apart. */
function lettersFor(phrase: string): PhysicsLetter[] {
  const letters: PhysicsLetter[] = []
  let wordIndex = 0
  let x = 100
  for (const char of phrase) {
    if (char === ' ') {
      wordIndex++
      x += 40
      continue
    }
    const body = Matter.Bodies.rectangle(x, 100, 20, 30, { isStatic: false })
    letters.push({
      body,
      element: document.createElement('span'),
      char,
      homeX: x,
      homeY: 100,
      width: 20,
      height: 30,
      prevWeight: 300,
      wordIndex,
    })
    x += 40
  }
  return letters
}

function springCount(engine: Matter.Engine): number {
  return Matter.Composite.allConstraints(engine.world).filter((c) => c.label === 'word-spring')
    .length
}

describe('adjacentPairsInWords', () => {
  it('bonds letters inside a word but never across a space', () => {
    // "ab cd" → one bond in "ab", one in "cd", none between b and c.
    expect(adjacentPairsInWords(lettersFor('ab cd'))).toEqual([
      [0, 1],
      [2, 3],
    ])
  })

  it('gives a single-letter word no bonds, since there is nothing to hold', () => {
    expect(adjacentPairsInWords(lettersFor('a bc'))).toEqual([[1, 2]])
  })

  it('produces n-1 bonds for an n-letter word', () => {
    expect(adjacentPairsInWords(lettersFor('abcde'))).toHaveLength(4)
  })

  it('handles an empty set', () => {
    expect(adjacentPairsInWords([])).toEqual([])
  })

  it('never bonds letters on different lines', () => {
    // decompose() bumps wordIndex at every line break, so letters that happen
    // to be adjacent in the array but on different lines must stay unbonded.
    const letters = lettersFor('ab')
    letters[1].wordIndex = 5
    expect(adjacentPairsInWords(letters)).toEqual([])
  })
})

describe('restLength', () => {
  it('measures the gap between two glyph homes', () => {
    const [a, b] = lettersFor('ab')
    expect(restLength(a, b)).toBeCloseTo(40, 6)
  })
})

describe('isOverStrained', () => {
  /** Two bodies `gap` apart on the x axis, separating at `closingSpeed` px/tick. */
  const bond = (gap: number, separationSpeed = 0, length = 40) =>
    ({
      bodyA: { position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 } },
      bodyB: { position: { x: gap, y: 0 }, velocity: { x: separationSpeed, y: 0 } },
      length,
    }) as never

  it('holds at rest', () => {
    expect(isOverStrained(bond(40))).toBe(false)
  })

  it('holds through a gentle lean', () => {
    expect(isOverStrained(bond(55, 0.05))).toBe(false)
  })

  it('breaks past the distance ratio', () => {
    expect(isOverStrained(bond(40 * BREAK_DISTANCE_RATIO + 1))).toBe(true)
  })

  it('breaks when letters are torn apart fast, even while still close', () => {
    // The rule that matters for a scatter: letters fly in formation, so
    // separation distance barely changes while separation speed spikes.
    expect(isOverStrained(bond(42, BREAK_RELATIVE_SPEED + 1))).toBe(true)
  })

  it('ignores letters rushing together', () => {
    // A bond being compressed is doing its job; only separation tears it.
    expect(isOverStrained(bond(42, -20))).toBe(false)
  })

  it('measures separation along the bond, not raw relative speed', () => {
    // Perpendicular motion is a shear, not a pull, so it must not snap.
    const shearing = {
      bodyA: { position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 } },
      bodyB: { position: { x: 40, y: 0 }, velocity: { x: 0, y: 50 } },
      length: 40,
    } as never
    expect(isOverStrained(shearing)).toBe(false)
  })

  it('treats a bond with a missing body as already broken', () => {
    expect(isOverStrained({ bodyA: null, bodyB: null, length: 40 } as never)).toBe(true)
  })
})

describe('spring constants', () => {
  it('is soft enough that a word visibly flexes before tearing', () => {
    expect(SPRING_STIFFNESS).toBeGreaterThan(0)
    expect(SPRING_STIFFNESS).toBeLessThan(0.2)
  })

  it('is damped, so a flexed word settles instead of ringing', () => {
    expect(SPRING_DAMPING).toBeGreaterThan(0)
  })

  it('breaks well beyond a hover but well inside a click', () => {
    expect(BREAK_DISTANCE_RATIO).toBeGreaterThan(1.2)
    expect(BREAK_DISTANCE_RATIO).toBeLessThan(4)
  })

  it('sets a separation speed between a hover and a scatter', () => {
    // Hover produces ~0.03px/tick, a click impulse ~14. The threshold has to
    // sit in that gap with room on both sides.
    expect(BREAK_RELATIVE_SPEED).toBeGreaterThan(0.5)
    expect(BREAK_RELATIVE_SPEED).toBeLessThan(10)
  })
})

describe('createWordSprings', () => {
  let engine: Matter.Engine
  let letters: PhysicsLetter[]

  beforeEach(() => {
    engine = Matter.Engine.create()
    engine.gravity.y = 0
    letters = lettersFor('ab cd')
    letters.forEach((l) => Matter.Composite.add(engine.world, l.body))
  })

  it('adds a bond per adjacent pair within each word', () => {
    const springs = createWordSprings(engine, letters)
    expect(springs.active).toHaveLength(2)
    expect(springCount(engine)).toBe(2)
  })

  it('sets each bond rest length to the letters home separation', () => {
    const springs = createWordSprings(engine, letters)
    springs.active.forEach((c) => expect(c.length).toBeCloseTo(40, 6))
  })

  it('holds a word together through a gentle nudge', () => {
    const springs = createWordSprings(engine, letters)
    Matter.Body.applyForce(letters[0].body, letters[0].body.position, { x: -0.002, y: 0 })
    for (let i = 0; i < 60; i++) Matter.Engine.update(engine, 1000 / 60)

    expect(springs.active, 'a gentle nudge must not tear a word apart').toHaveLength(2)
    // The partner should have been dragged along rather than left behind.
    expect(letters[1].body.position.x).toBeLessThan(letters[1].homeX)
  })

  it('breaks a bond when letters are pulled far enough apart', () => {
    const springs = createWordSprings(engine, letters)
    Matter.Body.setPosition(letters[0].body, { x: -400, y: 100 })
    Matter.Engine.update(engine, 1000 / 60)

    expect(springs.active).toHaveLength(1)
    expect(springCount(engine)).toBe(1)
  })

  it('breaks only the over-strained bond, leaving the rest of the phrase intact', () => {
    // Fresh engine: the beforeEach letters start at the same coordinates, and
    // leaving them in the world has the two sets colliding into each other.
    engine = Matter.Engine.create()
    engine.gravity.y = 0
    const word = lettersFor('abc de')
    word.forEach((l) => Matter.Composite.add(engine.world, l.body))
    const springs = createWordSprings(engine, word)
    expect(springs.active).toHaveLength(3) // a-b, b-c, d-e

    // Pull "a" just past its break distance (rest 40, ratio 1.6 → 64), gently
    // enough that the yank it gives "b" stays under the separation-speed rule.
    Matter.Body.setPosition(word[0].body, { x: word[0].homeX - 40, y: 100 })
    Matter.Engine.update(engine, 1000 / 60)

    expect(springs.active, 'b-c and d-e should survive a local tear').toHaveLength(2)
  })

  it('cascades when a letter is torn away violently', () => {
    // Documented, not accidental. A bond that is still attached when its
    // partner is flung a long way drags that partner hard enough to break the
    // next bond along, so a word unzips rather than losing one letter. This is
    // the behaviour a hard click produces, and it reads as the word ripping.
    engine = Matter.Engine.create()
    engine.gravity.y = 0
    const word = lettersFor('abc')
    word.forEach((l) => Matter.Composite.add(engine.world, l.body))
    const springs = createWordSprings(engine, word)
    expect(springs.active).toHaveLength(2)

    Matter.Body.setPosition(word[0].body, { x: -400, y: 100 })
    Matter.Engine.update(engine, 1000 / 60)

    expect(springs.active).toHaveLength(0)
  })

  it('clear() removes every bond from the world', () => {
    const springs = createWordSprings(engine, letters)
    springs.clear()
    expect(springs.active).toHaveLength(0)
    expect(springCount(engine)).toBe(0)
  })

  it('rebuild() restores bonds that had broken', () => {
    const springs = createWordSprings(engine, letters)
    Matter.Body.setPosition(letters[0].body, { x: -400, y: 100 })
    Matter.Engine.update(engine, 1000 / 60)
    expect(springs.active).toHaveLength(1)

    // Put it back home, as the attractor would, then reform.
    Matter.Body.setPosition(letters[0].body, { x: letters[0].homeX, y: letters[0].homeY })
    springs.rebuild()

    expect(springs.active).toHaveLength(2)
    expect(springCount(engine)).toBe(2)
  })

  it('rebuild() does not double up bonds', () => {
    const springs = createWordSprings(engine, letters)
    springs.rebuild()
    springs.rebuild()
    expect(springCount(engine)).toBe(2)
  })

  it('rebuild() picks up moved home positions after a resize', () => {
    const springs = createWordSprings(engine, letters)
    letters[1].homeX = letters[0].homeX + 90
    springs.rebuild()
    expect(springs.active[0].length).toBeCloseTo(90, 6)
  })

  it('stop() detaches the strain watcher and clears the world', () => {
    const springs = createWordSprings(engine, letters)
    springs.stop()
    expect(springCount(engine)).toBe(0)

    // The watcher must not resurrect or throw on subsequent ticks.
    expect(() => Matter.Engine.update(engine, 1000 / 60)).not.toThrow()
    expect(springCount(engine)).toBe(0)
  })

  it('is a no-op for a composition with no multi-letter words', () => {
    engine = Matter.Engine.create()
    engine.gravity.y = 0
    const singles = lettersFor('a b c')
    singles.forEach((l) => Matter.Composite.add(engine.world, l.body))
    const springs = createWordSprings(engine, singles)
    expect(springs.active).toHaveLength(0)
    expect(() => Matter.Engine.update(engine, 1000 / 60)).not.toThrow()
  })
})
