import type { PhysicsLetter } from './types'
import { applyImpulse } from './input'

// ─── Keyboard access ─────────────────────────────────────────────────────────
//
// The spec asks for "Tab to focus a letter, Space to scatter that letter". Taken
// literally that means 50+ tab stops on spans that are `aria-hidden`, which is
// two accessibility problems at once: a focusable element hidden from assistive
// tech is a known antipattern, and tabbing 50 times to cross one phrase is
// hostile to anyone navigating by keyboard.
//
// This implements the standard equivalent — roving tabindex, the same pattern a
// toolbar or radio group uses. The phrase is one tab stop; arrows move a
// selection within it; Space scatters. Same capability, one stop in the tab
// order, and the `role="img"` label still carries the full text to a screen
// reader.

const HINT_ID = 'kinotype-keyboard-hint'

const HINT_TEXT =
  'Interactive typography. Press Space to scatter the whole phrase. ' +
  'Use arrow keys to select a single letter, then Space to scatter just that one. ' +
  'Press Escape to clear the selection.'

/** Keys that move the selection, mapped to their offset. */
const STEP: Record<string, number> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
}

/** Average home position — the origin a keyboard scatter pushes away from. */
export function centroidOf(letters: PhysicsLetter[]): { x: number; y: number } {
  if (letters.length === 0) return { x: 0, y: 0 }
  let x = 0
  let y = 0
  for (const l of letters) {
    x += l.homeX
    y += l.homeY
  }
  return { x: x / letters.length, y: y / letters.length }
}

/** Wrap an index into range, so arrowing past either end cycles. */
export function wrapIndex(index: number, length: number): number {
  if (length === 0) return -1
  return ((index % length) + length) % length
}

export interface KeyboardHandle {
  stop: () => void
}

export function initKeyboard(
  phrase: HTMLElement,
  letters: PhysicsLetter[],
  engage: () => void,
  /** Fired when Space/Enter applies an impulse. See initInput's onScatter. */
  onScatter: () => void = () => {},
): KeyboardHandle {
  phrase.tabIndex = 0

  // Screen readers get the phrase from role="img" + aria-label; this adds the
  // controls, which are otherwise undiscoverable.
  const hint = document.createElement('span')
  hint.id = HINT_ID
  hint.textContent = HINT_TEXT
  hint.style.cssText =
    'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;' +
    'clip:rect(0 0 0 0);white-space:nowrap;border:0;'
  phrase.insertAdjacentElement('afterend', hint)
  phrase.setAttribute('aria-describedby', HINT_ID)

  let selected = -1

  function paintSelection(): void {
    letters.forEach((l, i) => l.element.classList.toggle('selected', i === selected))
  }

  function select(index: number): void {
    selected = wrapIndex(index, letters.length)
    paintSelection()
  }

  function scatter(): void {
    engage()
    onScatter()
    const centroid = centroidOf(letters)

    if (selected < 0) {
      applyImpulse(letters, centroid.x, centroid.y)
      return
    }

    // Push the one selected letter away from the phrase centre, the same way
    // a tap at the middle of the composition would.
    applyImpulse([letters[selected]], centroid.x, centroid.y)
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.altKey || e.ctrlKey || e.metaKey) return

    if (e.key in STEP) {
      e.preventDefault()
      select(selected < 0 ? (STEP[e.key] > 0 ? 0 : letters.length - 1) : selected + STEP[e.key])
      return
    }

    switch (e.key) {
      case 'Home':
        e.preventDefault()
        select(0)
        return
      case 'End':
        e.preventDefault()
        select(letters.length - 1)
        return
      case ' ':
      case 'Spacebar': // legacy key name, still emitted by older Edge
      case 'Enter':
        // Space scrolls the page by default, which would fight the piece.
        e.preventDefault()
        scatter()
        return
      case 'Escape':
        e.preventDefault()
        selected = -1
        paintSelection()
        return
    }
  }

  function onBlur(): void {
    selected = -1
    paintSelection()
  }

  phrase.addEventListener('keydown', onKeyDown)
  phrase.addEventListener('blur', onBlur)

  return {
    stop() {
      phrase.removeEventListener('keydown', onKeyDown)
      phrase.removeEventListener('blur', onBlur)
      phrase.removeAttribute('tabindex')
      phrase.removeAttribute('aria-describedby')
      hint.remove()
      selected = -1
      paintSelection()
    },
  }
}
