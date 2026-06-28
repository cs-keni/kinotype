import type { HomePosition } from './types'

export async function decompose(phrase: HTMLParagraphElement): Promise<HomePosition[]> {
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

  const text = phrase.textContent ?? ''

  // Replace text with span-wrapped characters; spaces stay as text nodes
  phrase.innerHTML = ''
  for (const char of text) {
    if (char === ' ') {
      phrase.appendChild(document.createTextNode(' '))
    } else {
      const span = document.createElement('span')
      span.setAttribute('aria-hidden', 'true')
      span.textContent = char
      phrase.appendChild(span)
    }
  }

  // Font is confirmed loaded — reveal phrase
  phrase.style.opacity = '1'

  // All getBoundingClientRect calls happen after font load and span wrapping
  const spans = phrase.querySelectorAll<HTMLSpanElement>('span')
  const homes: HomePosition[] = []

  for (const span of spans) {
    const rect = span.getBoundingClientRect()
    homes.push({
      char: span.textContent ?? '',
      element: span,
      homeX: rect.left + rect.width / 2,
      homeY: rect.top + rect.height / 2,
      width: rect.width,
      height: rect.height,
    })
  }

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
