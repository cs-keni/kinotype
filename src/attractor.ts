import Matter from 'matter-js'
import type { PhysicsLetter } from './types'

// Tuning constants — empirical; adjust during VQT #3 pass
// K must account for Matter.js deltaTime² scaling (~278 at 60fps):
//   terminal_velocity (px/tick) = (K / dist) * 277.8 / frictionAir
//   At d=300, frictionAir=0.005 → ~9 px/tick return speed
export const K = 0.05
export const EPSILON = 10
export const F_MAX = 0.001
export const SLEEP_DIST_PX = 3
export const SLEEP_SPEED = 0.5

export function activateAttractor(engine: Matter.Engine, letters: PhysicsLetter[]): () => void {
  engine.gravity.y = 0
  letters.forEach((l) => {
    l.body.frictionAir = 0.005
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

      // Non-linear attractor: weak far, strong close, capped
      const forceMag = Math.min(K / (dist + EPSILON), F_MAX)
      Matter.Body.applyForce(body, body.position, {
        x: (dx / (dist || 1)) * forceMag,
        y: (dy / (dist || 1)) * forceMag,
      })

      const speed = Math.sqrt(body.velocity.x ** 2 + body.velocity.y ** 2)
      if (dist > SLEEP_DIST_PX || speed > SLEEP_SPEED) {
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
