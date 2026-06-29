import Matter from 'matter-js'
import type { PhysicsLetter } from './types'

const MAX_SPEED = 25
const MAX_ANGULAR = 8

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function clamp01(v: number): number {
  return Math.min(Math.max(v, 0), 1)
}

export function startRenderer(engine: Matter.Engine, letters: PhysicsLetter[]): void {
  if (import.meta.env.DEV) {
    const frameTimes = new Float64Array(60)
    let frameCount = 0

    Matter.Events.on(engine, 'afterUpdate', () => {
      const t0 = performance.now()
      syncDOM(letters)
      frameTimes[frameCount % 60] = performance.now() - t0
      frameCount++

      if (frameCount % 60 === 0) {
        let sum = 0
        for (let i = 0; i < 60; i++) sum += frameTimes[i]
        const avg = sum / 60
        const msg = `[kinotype] syncDOM avg: ${avg.toFixed(3)}ms (last 60 frames)`
        avg > 4 ? console.warn(msg + ' — exceeds 4ms budget') : console.log(msg)
      }
    })
  } else {
    Matter.Events.on(engine, 'afterUpdate', () => syncDOM(letters))
  }
}

function syncDOM(letters: PhysicsLetter[]): void {
  // Read all physics state first — no interleaved getBoundingClientRect
  const states = letters.map((l) => {
    const vx = l.body.velocity.x
    const vy = l.body.velocity.y
    return {
      letter: l,
      dx: l.body.position.x - l.homeX,
      dy: l.body.position.y - l.homeY,
      angle: l.body.angle,
      speed: Math.sqrt(vx * vx + vy * vy),
      angularSpeed: Math.abs(l.body.angularVelocity),
    }
  })

  for (const { letter, dx, dy, angle, speed, angularSpeed } of states) {
    // Transform
    letter.element.style.transform = `translate(${dx}px, ${dy}px) rotate(${angle}rad)`

    // Variable font axes
    const t = clamp01(speed / MAX_SPEED)
    const wght = Math.round(lerp(300, 900, t))

    if (Math.abs(wght - letter.prevWeight) >= 2) {
      const soft = Math.round(lerp(100, 0, t))
      const opsz = Math.round(lerp(72, 36, clamp01(angularSpeed / MAX_ANGULAR)))
      letter.element.style.fontVariationSettings = `"wght" ${wght}, "SOFT" ${soft}, "opsz" ${opsz}`
      letter.prevWeight = wght
    }
  }
}
