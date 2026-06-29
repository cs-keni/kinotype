import './style.css'
import Matter from 'matter-js'
import { decompose } from './decompose'
import { createEngine, createBodies } from './physics'
import { startRenderer } from './renderer'
import { initInput } from './input'
import { activateAttractor } from './attractor'

async function init() {
  const phrase = document.getElementById('phrase') as HTMLParagraphElement

  try {
    const homes = await decompose(phrase)
    const engine = createEngine()
    const letters = createBodies(engine, homes)
    startRenderer(engine, letters)
    initInput(engine, letters, () => activateAttractor(engine, letters))

    if (import.meta.env.DEV) {
      console.log(`[kinotype] ready — ${letters.length} letters, runner starts on first interaction`)
      console.table(letters.map((l) => ({ char: l.char, homeX: l.homeX, homeY: l.homeY })))
      // Expose debug handle for E2E tests — dev builds only, never ships to prod
      ;(window as Window & { __kinotype?: unknown }).__kinotype = {
        getLetters: () => letters,
        step: (ticks = 60, dt = 1000 / 60) => {
          for (let i = 0; i < ticks; i++) {
            Matter.Engine.update(engine, dt)
          }
        },
        // Step until all letters are within 2px of home. Returns tick count on
        // success, -1 on timeout. The attractor 600-tick failsafe snaps all
        // bodies to exact home, so convergence is guaranteed before maxTicks=650.
        stepUntilHome: (maxTicks = 650, dt = 1000 / 60) => {
          for (let i = 0; i < maxTicks; i++) {
            Matter.Engine.update(engine, dt)
            const allHome = letters.every((l) => {
              const dx = l.body.position.x - l.homeX
              const dy = l.body.position.y - l.homeY
              return Math.sqrt(dx * dx + dy * dy) <= 2
            })
            if (allHome) return i + 1
          }
          return -1
        },
        triggerIdle: () => activateAttractor(engine, letters),
      }
    }
  } catch {
    // font load failure handled inside decompose()
  }
}

init()
