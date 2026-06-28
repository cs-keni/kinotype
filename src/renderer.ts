import Matter from 'matter-js'
import type { PhysicsLetter } from './types'

export function startRenderer(engine: Matter.Engine, letters: PhysicsLetter[]): void {
  Matter.Events.on(engine, 'afterUpdate', () => syncDOM(letters))
}

function syncDOM(letters: PhysicsLetter[]): void {
  // Read all physics state first, then write to DOM — no interleaved getBoundingClientRect
  const states = letters.map((l) => ({
    letter: l,
    dx: l.body.position.x - l.homeX,
    dy: l.body.position.y - l.homeY,
    angle: l.body.angle,
  }))

  for (const { letter, dx, dy, angle } of states) {
    letter.element.style.transform = `translate(${dx}px, ${dy}px) rotate(${angle}rad)`
  }
}
