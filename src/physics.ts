import Matter from 'matter-js'
import type { HomePosition, PhysicsLetter } from './types'

const DENSITY = 0.002
const MIN_MASS = 0.5
const MAX_MASS = 2.5 // MAX / MIN = 5.0

/**
 * Frames of near-zero motion before a body sleeps.
 *
 * Worth being precise about why this exists, because the obvious reason is
 * wrong. Resting jitter was measured at exactly 0.000px of drift over a second
 * for a 44-letter pile both with and without sleeping — VQT #3 passes on the
 * solver's own stability, and sleeping does not fix a twitch that never happens.
 *
 * What it does buy is idle cost. The Matter runner loops forever once the first
 * interaction starts it, and the piece spends most of its life at rest.
 * Simulating a fully-rested pile costs 0.0305ms/tick awake against 0.0073ms/tick
 * asleep — a 4.2x saving for a page that may sit open in a background tab.
 *
 * Matter's default of 60 (one second of stillness) is kept deliberately.
 * Sleeping sooner risks freezing a letter that is still genuinely drifting,
 * since Matter's motion metric is also low for slow steady movement.
 *
 * The cost is that a sleeping body ignores `applyForce`, so anything that means
 * to move a letter has to wake it first. See `wakeBodies()`.
 */
export const SLEEP_THRESHOLD_FRAMES = 60

export function createEngine(): Matter.Engine {
  const engine = Matter.Engine.create()
  engine.gravity.y = 1
  engine.enableSleeping = true
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
      sleepThreshold: SLEEP_THRESHOLD_FRAMES,
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

export function resetBounds(engine: Matter.Engine): void {
  const all = Matter.Composite.allBodies(engine.world)
  const labels = new Set(['floor', 'wall-left', 'wall-right'])
  all.filter((b) => labels.has(b.label)).forEach((b) => Matter.Composite.remove(engine.world, b))
  addBounds(engine)
}

/**
 * Make letters dynamic and responsive to force.
 *
 * Clearing the sleep flag is not optional: `Matter.Body.applyForce` does not
 * wake a sleeping body, so a letter that dozed off on the floor would silently
 * ignore both the cursor and the attractor. Every path that intends to move a
 * letter goes through here first.
 */
export function wakeBodies(letters: PhysicsLetter[]): void {
  letters.forEach((l) => {
    Matter.Body.setStatic(l.body, false)
    Matter.Sleeping.set(l.body, false)
  })
}
