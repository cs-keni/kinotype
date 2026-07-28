import Matter from 'matter-js'
import type { PhysicsLetter } from './types'

// ─── Word springs ────────────────────────────────────────────────────────────
//
// Adjacent letters inside a word are sprung to each other, so a word behaves as
// a unit until something pulls hard enough to tear it apart.
//
// Two things release a bond, and both are needed.
//
// 1. **A scatter releases every bond.** The spec's phrasing is "words hold
//    together *before* scattering" — cohesion is the pre-scatter state, and
//    scattering is what ends it. This is not a shortcut for missing physics:
//    strain alone cannot do the job. A radial impulse pushes adjacent letters
//    in nearly the same direction at nearly the same speed, so a word flies in
//    formation and barely stretches at all. Measured across a full 240-tick
//    scatter, only 1 of 14 bonds tore at the default stiffness, and still only
//    3 of 14 with stiffness dropped 6x and the speed threshold dropped 6x.
//    Without an explicit release, "springs on" would mean words never come
//    apart, which quietly deletes letter-level physics.
//
// 2. **Strain releases individual bonds.** This covers everything that is not
//    a scatter: a letter dragged away by a collision, or one word slammed into
//    another. A glancing hit can break some bonds and leave others, so a word
//    can lose a letter and keep the rest.

/** Spring stiffness. Low enough that a word visibly flexes before it tears. */
export const SPRING_STIFFNESS = 0.06

/** Damping, so a flexed word settles instead of oscillating. */
export const SPRING_DAMPING = 0.08

/**
 * A bond snaps once the two letters are this many times their rest distance
 * apart. This catches a slow, strong pull.
 *
 * On its own it is not enough. A radial impulse pushes adjacent letters in
 * nearly the same direction at nearly the same speed, so a word flies as a
 * coherent unit and the *separation* between its letters barely changes —
 * measured across 240 ticks of a full scatter, not one bond reached even 2x.
 * Distance alone makes words permanently rigid, which loses letter-level
 * physics entirely.
 */
export const BREAK_DISTANCE_RATIO = 1.6

/**
 * A bond also snaps when its two letters are moving apart faster than this, in
 * px/tick. This is the rule that actually fires on a scatter.
 *
 * The two regimes separate cleanly, which is why the threshold is safe: a hover
 * produces relative speeds around 0.03px/tick, a click around 14. Anything in
 * between reads as "pulled hard enough to tear".
 */
export const BREAK_RELATIVE_SPEED = 3

export interface WordSprings {
  /** Bonds still intact. */
  readonly active: Matter.Constraint[]
  /** Remove every bond — used while the attractor is steering letters home. */
  clear: () => void
  /** Restore a full set of bonds, e.g. once the phrase has reformed. */
  rebuild: () => void
  /** Detach the strain watcher and remove all bonds. */
  stop: () => void
}

/** Index pairs of adjacent letters that share a word. */
export function adjacentPairsInWords(letters: PhysicsLetter[]): Array<[number, number]> {
  const pairs: Array<[number, number]> = []
  for (let i = 1; i < letters.length; i++) {
    if (letters[i].wordIndex === letters[i - 1].wordIndex) pairs.push([i - 1, i])
  }
  return pairs
}

/** Rest length of a bond: how far apart the two glyphs sit when at home. */
export function restLength(a: PhysicsLetter, b: PhysicsLetter): number {
  return Math.hypot(b.homeX - a.homeX, b.homeY - a.homeY)
}

/**
 * True when a bond should snap: either stretched too far, or being torn apart
 * too fast. Separation alone misses a scatter, because the letters fly in
 * formation; closing speed alone would miss a slow, relentless pull.
 */
export function isOverStrained(constraint: Matter.Constraint): boolean {
  const a = constraint.bodyA
  const b = constraint.bodyB
  if (!a || !b) return true

  const dx = b.position.x - a.position.x
  const dy = b.position.y - a.position.y
  const dist = Math.hypot(dx, dy)

  if (dist > (constraint.length ?? 0) * BREAK_DISTANCE_RATIO) return true
  if (dist === 0) return false

  // Component of relative velocity along the bond. Positive means separating;
  // letters rushing *together* should not snap the bond that is holding them.
  const rvx = b.velocity.x - a.velocity.x
  const rvy = b.velocity.y - a.velocity.y
  const separationSpeed = (rvx * dx + rvy * dy) / dist

  return separationSpeed > BREAK_RELATIVE_SPEED
}

/**
 * Spring every word in the composition together and watch for bonds that
 * stretch past breaking.
 *
 * A single-letter word gets no bonds, which is correct — there is nothing to
 * hold it to.
 */
export function createWordSprings(
  engine: Matter.Engine,
  letters: PhysicsLetter[],
): WordSprings {
  const pairs = adjacentPairsInWords(letters)
  let active: Matter.Constraint[] = []

  function build(): void {
    active = pairs.map(([i, j]) =>
      Matter.Constraint.create({
        bodyA: letters[i].body,
        bodyB: letters[j].body,
        length: restLength(letters[i], letters[j]),
        stiffness: SPRING_STIFFNESS,
        damping: SPRING_DAMPING,
        label: 'word-spring',
      }),
    )
    if (active.length > 0) Matter.Composite.add(engine.world, active)
  }

  function clear(): void {
    active.forEach((c) => Matter.Composite.remove(engine.world, c))
    active = []
  }

  function watchStrain(): void {
    if (active.length === 0) return
    const survivors: Matter.Constraint[] = []
    for (const c of active) {
      if (isOverStrained(c)) Matter.Composite.remove(engine.world, c)
      else survivors.push(c)
    }
    active = survivors
  }

  build()
  Matter.Events.on(engine, 'afterUpdate', watchStrain)

  return {
    get active() {
      return active
    },
    clear,
    rebuild() {
      clear()
      build()
    },
    stop() {
      Matter.Events.off(engine, 'afterUpdate', watchStrain)
      clear()
    },
  }
}
