import Matter from 'matter-js'
import type { PhysicsLetter } from './types'
import { wakeBodies } from './physics'

const HOVER_RADIUS = 80
const HOVER_FORCE = 0.004
const CLICK_IMPULSE = 0.05   // ~14px/tick initial velocity at mass=1
const IDLE_MS = 3000

export interface InputHandle {
  /**
   * Bring the piece to life: abort any return in flight, wake the bodies, start
   * the runner if it is not already going, and restart the idle countdown.
   * Every interaction path goes through this, including keyboard.
   */
  engage(): void
}

export function initInput(
  engine: Matter.Engine,
  letters: PhysicsLetter[],
  onIdle: () => void,
  onInteract: () => void,
): InputHandle {
  let runner: Matter.Runner | null = null
  let idleTimer: ReturnType<typeof setTimeout> | null = null

  function ensureRunning(): void {
    // Abort any return in flight first. The choreographed return runs ~9s,
    // long enough that the user will often interrupt it; without this the
    // attractor keeps pulling letters home while the cursor pushes them away.
    onInteract()
    // Always wake — bodies may have been re-staticized by attractor deactivate,
    // and a body asleep on the floor ignores applyForce until the flag clears.
    wakeBodies(letters)
    if (runner) return
    runner = Matter.Runner.create()
    Matter.Runner.run(runner, engine)
  }

  function resetIdle(): void {
    if (idleTimer !== null) clearTimeout(idleTimer)
    idleTimer = setTimeout(onIdle, IDLE_MS)
  }

  function engage(): void {
    ensureRunning()
    resetIdle()
  }

  // Pointer events rather than mouse events so touch is a first-class input.
  // Hover repulsion is deliberately mouse-only: a finger has no hover state,
  // and firing repulsion on touchmove would make the letters flee the finger
  // that is trying to hit them.
  document.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return
    engage()
    applyRepulsion(letters, e.clientX, e.clientY)
  })

  // pointerdown covers click and tap in one path. Using it instead of `click`
  // also avoids the double-fire a mouse would produce across both events.
  document.addEventListener('pointerdown', (e) => {
    engage()
    applyImpulse(letters, e.clientX, e.clientY)
  })

  return { engage }
}

function applyRepulsion(letters: PhysicsLetter[], mx: number, my: number): void {
  for (const { body } of letters) {
    const dx = body.position.x - mx
    const dy = body.position.y - my
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist < HOVER_RADIUS && dist > 0) {
      const scale = (1 - dist / HOVER_RADIUS) * HOVER_FORCE
      Matter.Body.applyForce(body, body.position, {
        x: (dx / dist) * scale,
        y: (dy / dist) * scale,
      })
    }
  }
}

/**
 * Radial impulse away from a point. Additive by design: a second press
 * mid-flight stacks on the velocity a letter already has.
 *
 * Exported so the keyboard path can scatter a single focused letter using the
 * same force model as a tap, rather than inventing a second one.
 */
export function applyImpulse(letters: PhysicsLetter[], cx: number, cy: number): void {
  for (const { body } of letters) {
    const dx = body.position.x - cx
    const dy = body.position.y - cy
    const dist = Math.sqrt(dx * dx + dy * dy)

    // A letter sitting exactly on the origin has no direction to fly in.
    // Guarding the divide alone is not enough — a zero-length vector yields a
    // zero-magnitude force, so the letter would silently ignore the impulse.
    // Send it straight up instead. This is rare for a tap but routine for a
    // keyboard scatter, whose origin is the centroid and therefore often sits
    // on top of a middle letter.
    const [ux, uy] = dist < 0.001 ? [0, -1] : [dx / dist, dy / dist]

    Matter.Body.applyForce(body, body.position, {
      x: ux * CLICK_IMPULSE,
      y: uy * CLICK_IMPULSE,
    })
  }
}
