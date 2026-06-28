import Matter from 'matter-js'
import type { PhysicsLetter } from './types'
import { wakeBodies } from './physics'

const HOVER_RADIUS = 80
const HOVER_FORCE = 0.004
const CLICK_IMPULSE = 0.015
const IDLE_MS = 3000

export function initInput(
  engine: Matter.Engine,
  letters: PhysicsLetter[],
  onIdle: () => void,
): void {
  let runner: Matter.Runner | null = null
  let idleTimer: ReturnType<typeof setTimeout> | null = null

  function ensureRunning(): void {
    if (runner) return
    wakeBodies(letters)
    runner = Matter.Runner.create()
    Matter.Runner.run(runner, engine)
  }

  function resetIdle(): void {
    if (idleTimer !== null) clearTimeout(idleTimer)
    idleTimer = setTimeout(onIdle, IDLE_MS)
  }

  document.addEventListener('mousemove', (e) => {
    ensureRunning()
    resetIdle()
    applyRepulsion(letters, e.clientX, e.clientY)
  })

  document.addEventListener('click', (e) => {
    ensureRunning()
    resetIdle()
    applyScatter(letters, e.clientX, e.clientY)
  })
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

function applyScatter(letters: PhysicsLetter[], cx: number, cy: number): void {
  for (const { body } of letters) {
    const dx = body.position.x - cx
    const dy = body.position.y - cy
    const dist = Math.sqrt(dx * dx + dy * dy) || 1

    // Additive: second click mid-flight adds to existing velocity
    Matter.Body.applyForce(body, body.position, {
      x: (dx / dist) * CLICK_IMPULSE,
      y: (dy / dist) * CLICK_IMPULSE,
    })
  }
}
