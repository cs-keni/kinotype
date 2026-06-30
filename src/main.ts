import './style.css'
import Matter from 'matter-js'
import { decompose } from './decompose'
import { createEngine, createBodies, resetBounds } from './physics'
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
    // Resize: re-home letters to new viewport layout.
    // Only runs when all letters are static (at rest) — skipped mid-scatter
    // because getBoundingClientRect includes the CSS translate offset, which
    // would give wrong home positions for in-flight bodies.
    let resizeTimer: ReturnType<typeof setTimeout>
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        if (letters.some((l) => !l.body.isStatic)) return

        // Clear transforms so rects reflect layout position, not scatter offset
        letters.forEach((l) => { l.element.style.transform = '' })
        const rects = letters.map((l) => l.element.getBoundingClientRect())

        letters.forEach((l, i) => {
          const rect = rects[i]
          l.homeX = rect.left + rect.width / 2
          l.homeY = rect.top + rect.height / 2
          l.width = rect.width
          l.height = rect.height
          Matter.Body.setPosition(l.body, { x: l.homeX, y: l.homeY })
        })

        resetBounds(engine)
      }, 200)
    })
  } catch {
    // font load failure handled inside decompose()
  }
}

init()
