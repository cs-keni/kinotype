import Matter from 'matter-js'
import type { PhysicsLetter } from './types'

// Tuning constants — empirical; adjust during VQT #3 pass
export const K = 0.00015
export const EPSILON = 10
export const F_MAX = 0.008
export const SLEEP_DIST_PX = 2
export const SLEEP_SPEED = 0.5

export function activateAttractor(engine: Matter.Engine, letters: PhysicsLetter[]): () => void {
  engine.gravity.y = 0
  letters.forEach((l) => {
    l.body.frictionAir = 0.005
  })

  let listenerActive = true

  function tick() {
    if (!listenerActive) return

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
      // Snap exactly to home and zero velocity to avoid residual drift
      Matter.Body.setPosition(l.body, { x: l.homeX, y: l.homeY })
      Matter.Body.setVelocity(l.body, { x: 0, y: 0 })
      Matter.Body.setAngularVelocity(l.body, 0)
      l.element.style.transform = ''
    })
  }

  Matter.Events.on(engine, 'afterUpdate', tick)

  return deactivate
}
