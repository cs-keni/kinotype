import Matter from 'matter-js'
import type { HomePosition, PhysicsLetter } from './types'

const DENSITY = 0.002
const MIN_MASS = 0.5
const MAX_MASS = 2.5 // MAX / MIN = 5.0

export function createEngine(): Matter.Engine {
  const engine = Matter.Engine.create()
  engine.gravity.y = 1
  return engine
}

export function createBodies(engine: Matter.Engine, homes: HomePosition[]): PhysicsLetter[] {
  const letters: PhysicsLetter[] = homes.map((home) => {
    const raw = home.width * home.height * DENSITY
    const mass = Math.min(Math.max(raw, MIN_MASS), MAX_MASS)

    const body = Matter.Bodies.rectangle(home.homeX, home.homeY, home.width, home.height, {
      restitution: 0.3,
      friction: 0.1,
      frictionAir: 0.02,
      mass,
      isStatic: true, // letters hang until first user interaction wakes them
      label: home.char,
    })

    return { ...home, body, prevWeight: 300 }
  })

  Matter.Composite.add(
    engine.world,
    letters.map((l) => l.body),
  )

  addBounds(engine)

  return letters
}

function addBounds(engine: Matter.Engine): void {
  const W = window.innerWidth
  const H = window.innerHeight
  const t = 60 // thick enough to prevent tunneling at high velocities

  const bounds = [
    Matter.Bodies.rectangle(W / 2, H + t / 2, W + t * 2, t, { isStatic: true, label: 'floor' }),
    Matter.Bodies.rectangle(-t / 2, H / 2, t, H + t * 2, { isStatic: true, label: 'wall-left' }),
    Matter.Bodies.rectangle(W + t / 2, H / 2, t, H + t * 2, { isStatic: true, label: 'wall-right' }),
  ]

  Matter.Composite.add(engine.world, bounds)
}

export function wakeBodies(letters: PhysicsLetter[]): void {
  letters.forEach((l) => Matter.Body.setStatic(l.body, false))
}
