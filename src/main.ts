import './style.css'
import Matter from 'matter-js'
import { decompose } from './decompose'
import { createEngine, createBodies, resetBounds } from './physics'
import { startRenderer } from './renderer'
import { initInput } from './input'
import { activateAttractor, cancelAttractor } from './attractor'
import { applyColorway, resolveColorway } from './colorways'
import { resolveComposition } from './compositions'
import { startEffects } from './effects'
import { initKeyboard } from './keyboard'
import { createWordSprings } from './constraints'

/**
 * Narrower than this and a long phrase becomes a wall of small glyphs, so the
 * composition pool is trimmed to shorter pieces. Matches the spec's 768px
 * minimum for the full desktop layout.
 */
const SMALL_VIEWPORT_PX = 768

/** Letter budget on a small viewport — enough for a short phrase, not a haiku. */
const SMALL_VIEWPORT_MAX_LETTERS = 20

/**
 * localStorage throws outright in some privacy modes, and the composition
 * rotation is decorative. Never let it take the page down.
 */
function safeStorage(): Storage | null {
  try {
    const probe = '__kinotype_probe__'
    window.localStorage.setItem(probe, probe)
    window.localStorage.removeItem(probe)
    return window.localStorage
  } catch {
    return null
  }
}

async function init() {
  const phrase = document.getElementById('phrase') as HTMLElement

  // Colour before layout: the palette must be on the root element before the
  // phrase fades in, or the first frame flashes the stylesheet default.
  const colorway = resolveColorway(window.location.search)
  applyColorway(colorway, document.documentElement)

  // Reduced motion is a hard gate, not a softening: no runner, no scatter, no
  // canvas. The piece stays the poster it starts as. Axis interpolation on
  // hover is handled in CSS, which is the only motion this mode allows.
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

  try {
    const maxLetters =
      window.innerWidth < SMALL_VIEWPORT_PX
        ? SMALL_VIEWPORT_MAX_LETTERS
        : Number.POSITIVE_INFINITY
    const composition = resolveComposition(window.location.search, safeStorage(), maxLetters)
    const homes = await decompose(phrase, composition)
    const engine = createEngine()
    const letters = createBodies(engine, homes)
    startRenderer(engine, letters)

    const trailCanvas = document.getElementById('trail-canvas') as HTMLCanvasElement | null
    const effects =
      trailCanvas && !reducedMotion ? startEffects(engine, letters, trailCanvas, colorway) : null

    // Word springs are opt-in via `?springs=on`, deliberately OFF by default.
    //
    // They change the core feel: a hover drags a whole word rather than leaning
    // one letter, and scattering a single letter tugs its neighbours until the
    // bond tears. That is the spec's intent for Phase 5, but whether it is an
    // improvement is a judgement nobody has made yet by looking at it. Shipping
    // it on by default would silently change the piece. The flag makes the
    // comparison one keystroke instead of a rebuild.
    const springsEnabled = new URLSearchParams(window.location.search).get('springs') === 'on'
    const springs = !reducedMotion && springsEnabled ? createWordSprings(engine, letters) : null

    // Single entry point for starting a return, so the debug handle and the
    // idle timer cannot drift apart. Bonds would fight the attractor, which
    // steers every letter individually, so they drop for the flight and
    // reattach only once the phrase has actually reformed.
    const startReturn = () => {
      springs?.clear()
      activateAttractor(engine, letters, () => springs?.rebuild())
    }

    if (!reducedMotion) {
      const releaseSprings = () => springs?.clear()
      const input = initInput(
        engine,
        letters,
        startReturn,
        () => cancelAttractor(engine),
        releaseSprings,
      )
      initKeyboard(phrase, letters, input.engage, releaseSprings)
    }

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
        // success, -1 on timeout. The choreographed return lands ~570 ticks
        // after activation; the attractor MAX_TICKS=1500 failsafe snaps all
        // bodies to exact home, so convergence is guaranteed before maxTicks.
        stepUntilHome: (maxTicks = 1600, dt = 1000 / 60) => {
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
        triggerIdle: startReturn,
        // Live count of intact word bonds. Exposed because the alternative —
        // inferring cohesion from sub-pixel displacement — is perturbed by the
        // real-time runner racing manual steps, and makes for flaky tests.
        springCount: () =>
          Matter.Composite.allConstraints(engine.world).filter((c) => c.label === 'word-spring')
            .length,
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
        // The canvas backing store is tied to the viewport, not to letter
        // state, so it rescales even mid-scatter when re-homing is skipped.
        effects?.resize()

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
        // Spring rest lengths are derived from home positions, which just
        // moved. Stale lengths would have the springs hauling letters away
        // from their new homes.
        springs?.rebuild()
      }, 200)
    })
  } catch {
    // font load failure handled inside decompose()
  }
}

init()
