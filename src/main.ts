import './style.css'
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
    }
  } catch {
    // font load failure handled inside decompose()
  }
}

init()
