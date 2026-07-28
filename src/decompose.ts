import type { HomePosition } from './types'
import type { Composition } from './compositions'
import { compositionText } from './compositions'

/**
 * Build the letter DOM for a composition and measure every glyph.
 *
 * Structure is always line > glyph, even for a single-line phrase, so the
 * haiku is not a special case. Spaces stay as text nodes: they hold layout but
 * get no physics body.
 *
 * The whole phrase is one `role="img"` labelled with its full text. Screen
 * readers get the sentence; the per-letter spans are hidden from them, because
 * a letter-by-letter reading of a decomposed phrase is noise.
 */
export async function decompose(
  phrase: HTMLElement,
  composition: Composition,
): Promise<HomePosition[]> {
  await document.fonts.ready

  const frauncesLoaded = [...document.fonts].some(
    (f) => f.family === 'Fraunces' && f.status === 'loaded'
  )

  if (!frauncesLoaded) {
    phrase.innerHTML = ''
    phrase.textContent = 'Font failed to load — please refresh.'
    phrase.style.fontFamily = 'Georgia, serif'
    phrase.style.opacity = '1'
    console.error('[kinotype] Fraunces failed to load. Physics body measurements would be wrong.')
    throw new Error('Font load failed')
  }

  const text = compositionText(composition)
  phrase.innerHTML = ''
  phrase.setAttribute('role', 'img')
  phrase.setAttribute('aria-label', text)
  // Drives display-size CSS: a single word is set much larger than a phrase.
  phrase.dataset.kind = composition.kind

  // Word index counts across every line, so no word is ever sprung to a glyph
  // on another line. A space ends a word; so does a line break.
  let wordIndex = 0
  let wordStarted = false
  const wordIndexes: number[] = []

  for (const line of composition.lines) {
    const lineEl = document.createElement('span')
    lineEl.className = 'line'
    for (const char of line) {
      if (char === ' ') {
        if (wordStarted) {
          wordIndex++
          wordStarted = false
        }
        lineEl.appendChild(document.createTextNode(' '))
      } else {
        const glyph = document.createElement('span')
        glyph.className = 'glyph'
        glyph.setAttribute('aria-hidden', 'true')
        glyph.textContent = char
        lineEl.appendChild(glyph)
        wordIndexes.push(wordIndex)
        wordStarted = true
      }
    }
    if (wordStarted) {
      wordIndex++
      wordStarted = false
    }
    phrase.appendChild(lineEl)
  }

  // Font is confirmed loaded — reveal phrase
  phrase.style.opacity = '1'

  // All getBoundingClientRect calls happen after font load and span wrapping
  const glyphs = phrase.querySelectorAll<HTMLSpanElement>('.glyph')
  const homes: HomePosition[] = []

  glyphs.forEach((glyph, i) => {
    const rect = glyph.getBoundingClientRect()
    homes.push({
      char: glyph.textContent ?? '',
      element: glyph,
      homeX: rect.left + rect.width / 2,
      homeY: rect.top + rect.height / 2,
      width: rect.width,
      height: rect.height,
      wordIndex: wordIndexes[i],
    })
  })

  if (import.meta.env.DEV) {
    console.table(
      homes.map((h) => ({
        char: h.char,
        homeX: Math.round(h.homeX),
        homeY: Math.round(h.homeY),
        w: Math.round(h.width),
        h: Math.round(h.height),
      }))
    )
  }

  return homes
}
