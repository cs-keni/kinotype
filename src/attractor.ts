import Matter from 'matter-js'
import type { PhysicsLetter } from './types'

// Tuning constants — empirical; adjust during VQT #3 pass
// terminal_velocity (px/tick) ≈ (force * 277.8) / frictionAir
// K=0.05, frictionAir=0.015 → ~3px/tick at d=300, ~5.6px/tick close (F_MAX cap)
export const K = 0.05
export const EPSILON = 10
export const F_MAX = 0.0003    // low cap prevents close-range oscillation
export const SLEEP_DIST_PX = 5 // snap when within 5px — speed irrelevant at that scale

export function activateAttractor(engine: Matter.Engine, letters: PhysicsLetter[]): () => void {
  engine.gravity.y = 0
  letters.forEach((l) => {
    l.body.frictionAir = 0.015  // higher than 0.005 for stable settling without orbit kill
    // Sensors don't generate collision response — letters pass through each other
    // during return so each goes straight to its own home without pile-up jitter
    l.body.isSensor = true
  })

  let listenerActive = true
  let tickCount = 0
  const MAX_TICKS = 600 // 10s failsafe at 60fps

  function tick() {
    if (!listenerActive) return
    if (++tickCount >= MAX_TICKS) { deactivate(); return }

    let allAsleep = true

    for (const l of letters) {
      const { body, homeX, homeY } = l
      const dx = homeX - body.position.x
      const dy = homeY - body.position.y
      const dist = Math.sqrt(dx * dx + dy * dy)

      // Non-linear attractor: weak far, strong close, capped.
      // Scale by body.mass so all letters share the same effective acceleration
      // (a = F*m / m = F) regardless of glyph size. Without this, heavy letters
      // (mass=2.5) get 5× less acceleration than light ones and miss the sleep
      // threshold, hitting the MAX_TICKS failsafe and teleporting home.
      const forceMag = Math.min(K / (dist + EPSILON), F_MAX) * body.mass
      Matter.Body.applyForce(body, body.position, {
        x: (dx / (dist || 1)) * forceMag,
        y: (dy / (dist || 1)) * forceMag,
      })

      if (dist > SLEEP_DIST_PX) {
        allAsleep = false
      }
    }

    if (allAsleep) {
      deactivate()
    }
  }

  function deactivate() {
    listenerActive = false
    Matter.Events.off(engine, 'afterUpdate', tick)
    engine.gravity.y = 1
    letters.forEach((l) => {
      l.body.frictionAir = 0.02
      l.body.isSensor = false
      Matter.Body.setPosition(l.body, { x: l.homeX, y: l.homeY })
      Matter.Body.setAngle(l.body, 0)
      Matter.Body.setVelocity(l.body, { x: 0, y: 0 })
      Matter.Body.setAngularVelocity(l.body, 0)
      // Re-hang: make static so gravity doesn't pull them down again
      Matter.Body.setStatic(l.body, true)
      l.element.style.transform = ''
    })
  }

  Matter.Events.on(engine, 'afterUpdate', tick)

  return deactivate
}
