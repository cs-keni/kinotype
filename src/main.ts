import './style.css'
import { decompose } from './decompose'

async function init() {
  const phrase = document.getElementById('phrase') as HTMLParagraphElement

  try {
    const homes = await decompose(phrase)

    if (import.meta.env.DEV) {
      console.log(`[kinotype] decomposed ${homes.length} letters`)
    }
  } catch {
    // Font load failure already handled inside decompose()
  }
}

init()
