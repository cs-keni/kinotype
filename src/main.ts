import './style.css'

async function init() {
  const phrase = document.getElementById('phrase') as HTMLParagraphElement

  await document.fonts.ready

  const frauncesLoaded = [...document.fonts].some(
    (f) => f.family === 'Fraunces' && f.status === 'loaded'
  )

  if (!frauncesLoaded) {
    phrase.textContent = 'Font failed to load. Please refresh.'
    phrase.style.fontFamily = 'Georgia, serif'
    phrase.style.opacity = '1'
    console.error('Fraunces failed to load — physics bodies would be miscalibrated')
    return
  }

  // Reveal phrase after font is confirmed loaded
  phrase.style.opacity = '1'
}

init()
