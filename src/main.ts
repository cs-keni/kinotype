import './style.css'
import { decompose } from './decompose'
import { createEngine, createBodies } from './physics'

async function init() {
  const phrase = document.getElementById('phrase') as HTMLParagraphElement

  try {
    const homes = await decompose(phrase)
    const engine = createEngine()
    const letters = createBodies(engine, homes)

    if (import.meta.env.DEV) {
      console.log(`[kinotype] ${letters.length} bodies created, runner dormant until first interaction`)
    }

    // T5: startRenderer(engine, letters)
    // T6: initInput(engine, letters)
  } catch {
    // font load failure handled inside decompose()
  }
}

init()
