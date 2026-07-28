import Matter from 'matter-js'
import type { PhysicsLetter } from './types'

// ─── Return choreography ─────────────────────────────────────────────────────
// The return is the thesis of the piece: form arriving out of motion. Measured
// at ~8.9s end to end across a full-viewport scatter (first letter lands ~4.2s,
// last ~8.9s). It is shaped as three overlapping movements —
//
//   1. Lift-off   letters engage in reading order, so the phrase recomposes
//                 left to right instead of moving as one blob.
//   2. Cruise     velocity-matched travel at MAX_RETURN_SPEED.
//   3. Arrival    inside SLOW_RADIUS the target speed tapers to zero, so each
//                 letter decays into home asymptotically. This is the part
//                 that removes the mechanical feel — the old attractor coasted
//                 at terminal velocity straight into a snap.
//
// Angle unwinds toward upright across the whole flight, so the setAngle(0) in
// settleLetter() is a no-op by the time it runs rather than a visible pop.

/** Peak return speed, px/tick @60fps. Drag puts actual cruise ~11% under. */
export const MAX_RETURN_SPEED = 2.4

/** Inside this radius the target speed tapers linearly to zero. Larger =
 *  longer, floatier arrival; smaller = crisper but more mechanical. */
export const SLOW_RADIUS = 70

/** Steering authority ceiling. Caps how hard a letter can fight its own
 *  momentum, so one thrown outward visibly decelerates, turns, then commits. */
export const F_MAX = 0.0008

/** Velocity error → force. accel ≈ STEER_GAIN * dt² * error (~20-tick
 *  convergence at 60fps). */
export const STEER_GAIN = 0.00018

/** Spread of the reading-order lift-off wave, in ticks @60fps (2.5s). */
export const STAGGER_TICKS = 150

/** Low drag during return — steering does the damping, not friction. */
export const RETURN_FRICTION_AIR = 0.006

/** Drag restored on settle; matches the createBodies() default. */
export const REST_FRICTION_AIR = 0.02

/** Snap gate. At arrival the letter is moving <0.1px/tick, so this is
 *  imperceptible. */
export const SLEEP_DIST_PX = 3

/** Pure failsafe at 25s. Choreography finishes ~8.9s, so this must never fire
 *  in practice — it exists only to guarantee the listener is released. */
export const MAX_TICKS = 1500

/** Angular unwind: time constant (ticks), speed ceiling (rad/tick), and how
 *  fast angular velocity is captured toward the target. */
export const UNWIND_TICKS = 60
export const MAX_UNWIND_SPEED = 0.06
export const UNWIND_RESPONSE = 0.04

// One in-flight return per engine. A second activation while one is running
// would stack a second force field on every letter, doubling the pull.
const activeRuns = new WeakMap<Matter.Engine, () => void>()

/** Wrap an angle to (-π, π] so a letter that spun three turns unwinds only the
 *  remainder — visually identical, but 3x less rotation to undo. */
export function normalizeAngle(angle: number): number {
  const twoPi = Math.PI * 2
  let a = angle % twoPi
  if (a > Math.PI) a -= twoPi
  if (a <= -Math.PI) a += twoPi
  return a
}

/** Target approach speed at a given distance: flat at cruise, tapering
 *  linearly to zero inside SLOW_RADIUS. */
export function desiredSpeed(dist: number): number {
  return MAX_RETURN_SPEED * Math.min(1, dist / SLOW_RADIUS)
}

/** Lift-off delay for letter `i` of `n`, in ticks. Reading order — swap the
 *  ratio for distance-based ordering (farthest first) if the wave reads better
 *  that way in play-test. */
export function staggerDelay(i: number, n: number): number {
  if (n <= 1) return 0
  return Math.round((i / (n - 1)) * STAGGER_TICKS)
}

/**
 * Stop an in-flight return without snapping letters home. Called when the user
 * interacts mid-return so the attractor stops fighting the cursor. Gravity and
 * collision response are restored, so letters simply fall from wherever they
 * were. No-op when nothing is running.
 */
export function cancelAttractor(engine: Matter.Engine): void {
  activeRuns.get(engine)?.()
}

export function activateAttractor(engine: Matter.Engine, letters: PhysicsLetter[]): () => void {
  // Cancel any return already in flight on this engine before starting another.
  activeRuns.get(engine)?.()

  engine.gravity.y = 0
  letters.forEach((l) => {
    l.body.frictionAir = RETURN_FRICTION_AIR
    // Sensors don't generate collision response — letters pass through each
    // other during return so each goes straight home without pile-up jitter.
    l.body.isSensor = true
    // The attractor fires after 3s of idle, by which point letters resting on
    // the floor have almost certainly fallen asleep. applyForce does not wake a
    // sleeping body, so without this they would ignore the return entirely and
    // get yanked home by the MAX_TICKS failsafe instead of flying.
    Matter.Sleeping.set(l.body, false)
  })

  const delays = letters.map((_, i) => staggerDelay(i, letters.length))

  let listenerActive = true
  let tickCount = 0

  function tick() {
    if (!listenerActive) return
    if (++tickCount >= MAX_TICKS) {
      deactivate()
      return
    }

    let remaining = 0

    for (let i = 0; i < letters.length; i++) {
      const l = letters[i]
      if (l.body.isStatic) continue // already landed

      // Hold: the letter hangs where it is until its turn in the wave.
      if (tickCount < delays[i]) {
        remaining++
        continue
      }

      const { body, homeX, homeY } = l
      const dx = homeX - body.position.x
      const dy = homeY - body.position.y
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist <= SLEEP_DIST_PX) {
        settleLetter(l)
        continue
      }

      remaining++

      // Arrive steering: chase a velocity that tapers to zero at home, rather
      // than a position. Scaled by mass so every glyph shares one acceleration
      // profile regardless of size.
      const target = desiredSpeed(dist)
      const errX = (dx / dist) * target - body.velocity.x
      const errY = (dy / dist) * target - body.velocity.y
      const errMag = Math.sqrt(errX * errX + errY * errY)

      if (errMag > 0) {
        const mag = Math.min(errMag * STEER_GAIN, F_MAX) * body.mass
        Matter.Body.applyForce(body, body.position, {
          x: (errX / errMag) * mag,
          y: (errY / errMag) * mag,
        })
      }

      unwind(body)
    }

    if (remaining === 0) deactivate()
  }

  /** Drive rotation toward upright so arrival needs no angle snap. */
  function unwind(body: Matter.Body): void {
    const err = normalizeAngle(body.angle)
    const target = Math.min(Math.max(-err / UNWIND_TICKS, -MAX_UNWIND_SPEED), MAX_UNWIND_SPEED)
    Matter.Body.setAngularVelocity(
      body,
      body.angularVelocity + (target - body.angularVelocity) * UNWIND_RESPONSE,
    )
  }

  function settleLetter(l: PhysicsLetter): void {
    Matter.Body.setPosition(l.body, { x: l.homeX, y: l.homeY })
    Matter.Body.setAngle(l.body, 0)
    Matter.Body.setVelocity(l.body, { x: 0, y: 0 })
    Matter.Body.setAngularVelocity(l.body, 0)
    Matter.Body.setStatic(l.body, true)
    l.body.isSensor = false
    l.body.frictionAir = REST_FRICTION_AIR
    l.element.style.transform = ''
  }

  /** Release the tick listener and restore world state. Leaves positions alone. */
  function detach() {
    if (!listenerActive) return
    listenerActive = false
    Matter.Events.off(engine, 'afterUpdate', tick)
    engine.gravity.y = 1
    letters.forEach((l) => {
      if (!l.body.isStatic) {
        l.body.isSensor = false
        l.body.frictionAir = REST_FRICTION_AIR
        // Matter clears forces before afterUpdate, so the force this run's last
        // tick applied is still pending and would be consumed one frame after
        // cancellation. Drop it so cancel really means "stop influencing".
        l.body.force.x = 0
        l.body.force.y = 0
      }
    })
    if (activeRuns.get(engine) === detach) activeRuns.delete(engine)
  }

  /** Natural completion: release, then snap any straggler to exact home. */
  function deactivate() {
    detach()
    letters.forEach((l) => {
      if (!l.body.isStatic) settleLetter(l)
    })
  }

  activeRuns.set(engine, detach)
  Matter.Events.on(engine, 'afterUpdate', tick)

  return deactivate
}
