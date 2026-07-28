import { describe, it, expect, beforeEach } from 'vitest'
import Matter from 'matter-js'
import { centroidOf, initKeyboard, wrapIndex } from '../src/keyboard'
import { applyImpulse } from '../src/input'
import type { PhysicsLetter } from '../src/types'

function makeLetter(homeX: number, homeY: number): PhysicsLetter {
  const body = Matter.Bodies.rectangle(homeX, homeY, 20, 30, { isStatic: false })
  const element = document.createElement('span')
  element.className = 'glyph'
  return { body, element, homeX, homeY, char: 'a', width: 20, height: 30, prevWeight: 300 }
}

function makePhrase(letters: PhysicsLetter[]): HTMLElement {
  const phrase = document.createElement('p')
  letters.forEach((l) => phrase.appendChild(l.element))
  document.body.appendChild(phrase)
  return phrase
}

function press(el: HTMLElement, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  el.dispatchEvent(event)
  return event
}

const selectedIndex = (letters: PhysicsLetter[]) =>
  letters.findIndex((l) => l.element.classList.contains('selected'))

describe('wrapIndex', () => {
  it('wraps past the end back to the start', () => {
    expect(wrapIndex(5, 5)).toBe(0)
    expect(wrapIndex(6, 5)).toBe(1)
  })

  it('wraps before the start round to the end', () => {
    expect(wrapIndex(-1, 5)).toBe(4)
    expect(wrapIndex(-6, 5)).toBe(4)
  })

  it('leaves in-range values alone', () => {
    expect(wrapIndex(3, 5)).toBe(3)
  })

  it('returns -1 for an empty set rather than dividing by zero', () => {
    expect(wrapIndex(0, 0)).toBe(-1)
  })
})

describe('centroidOf', () => {
  it('averages home positions', () => {
    expect(centroidOf([makeLetter(0, 0), makeLetter(100, 50)])).toEqual({ x: 50, y: 25 })
  })

  it('handles an empty set', () => {
    expect(centroidOf([])).toEqual({ x: 0, y: 0 })
  })
})

describe('applyImpulse degenerate direction', () => {
  it('still kicks a letter sitting exactly on the impulse origin', () => {
    // Guarding the divide alone is not enough: a zero-length direction vector
    // produces a zero-magnitude force, so the letter silently ignores the
    // impulse. Routine for a keyboard scatter, whose centroid origin often
    // lands on a middle letter.
    const letter = makeLetter(100, 100)
    applyImpulse([letter], 100, 100)
    expect(letter.body.force.y).toBeLessThan(0) // sent upward
    expect(letter.body.force.x).toBe(0)
  })

  it('pushes away from the origin in the normal case', () => {
    const letter = makeLetter(200, 100)
    applyImpulse([letter], 100, 100)
    expect(letter.body.force.x).toBeGreaterThan(0)
  })
})

describe('initKeyboard', () => {
  let letters: PhysicsLetter[]
  let phrase: HTMLElement
  let engaged: number

  beforeEach(() => {
    document.body.innerHTML = ''
    letters = [makeLetter(100, 100), makeLetter(140, 100), makeLetter(180, 100)]
    phrase = makePhrase(letters)
    engaged = 0
  })

  function start() {
    return initKeyboard(phrase, letters, () => void engaged++)
  }

  it('makes the phrase exactly one tab stop', () => {
    start()
    expect(phrase.tabIndex).toBe(0)
    // The glyphs themselves must stay out of the tab order — 50+ stops to
    // cross one phrase is hostile, and they are aria-hidden besides.
    letters.forEach((l) => expect(l.element.hasAttribute('tabindex')).toBe(false))
  })

  it('describes the controls for assistive tech', () => {
    start()
    const id = phrase.getAttribute('aria-describedby')
    expect(id).toBeTruthy()
    const hint = document.getElementById(id!)
    expect(hint?.textContent).toMatch(/arrow keys/i)
    expect(hint?.textContent).toMatch(/space/i)
  })

  it('starts with nothing selected', () => {
    start()
    expect(selectedIndex(letters)).toBe(-1)
  })

  it('selects the first letter on ArrowRight from nothing', () => {
    start()
    press(phrase, 'ArrowRight')
    expect(selectedIndex(letters)).toBe(0)
  })

  it('selects the last letter on ArrowLeft from nothing', () => {
    start()
    press(phrase, 'ArrowLeft')
    expect(selectedIndex(letters)).toBe(2)
  })

  it('moves the selection with arrows and wraps at both ends', () => {
    start()
    press(phrase, 'ArrowRight')
    press(phrase, 'ArrowRight')
    expect(selectedIndex(letters)).toBe(1)
    press(phrase, 'ArrowRight')
    press(phrase, 'ArrowRight')
    expect(selectedIndex(letters)).toBe(0) // wrapped past the end
    press(phrase, 'ArrowLeft')
    expect(selectedIndex(letters)).toBe(2) // wrapped past the start
  })

  it('treats vertical arrows as horizontal, since the phrase reads in one axis', () => {
    start()
    press(phrase, 'ArrowDown')
    expect(selectedIndex(letters)).toBe(0)
    press(phrase, 'ArrowUp')
    expect(selectedIndex(letters)).toBe(2)
  })

  it('jumps to the ends with Home and End', () => {
    start()
    press(phrase, 'End')
    expect(selectedIndex(letters)).toBe(2)
    press(phrase, 'Home')
    expect(selectedIndex(letters)).toBe(0)
  })

  it('only ever marks one letter selected', () => {
    start()
    press(phrase, 'ArrowRight')
    press(phrase, 'ArrowRight')
    expect(letters.filter((l) => l.element.classList.contains('selected'))).toHaveLength(1)
  })

  it('clears the selection on Escape', () => {
    start()
    press(phrase, 'ArrowRight')
    press(phrase, 'Escape')
    expect(selectedIndex(letters)).toBe(-1)
  })

  it('clears the selection when focus leaves', () => {
    start()
    press(phrase, 'ArrowRight')
    phrase.dispatchEvent(new FocusEvent('blur'))
    expect(selectedIndex(letters)).toBe(-1)
  })

  it('scatters on Space and prevents the page from scrolling', () => {
    start()
    const event = press(phrase, ' ')
    expect(engaged).toBe(1)
    expect(event.defaultPrevented).toBe(true)
  })

  it('accepts Enter as well as Space', () => {
    start()
    press(phrase, 'Enter')
    expect(engaged).toBe(1)
  })

  it('moves every letter when nothing is selected', () => {
    start()
    const before = letters.map((l) => ({ ...l.body.velocity }))
    press(phrase, ' ')
    // Force is applied but not yet integrated, so check body.force directly.
    letters.forEach((l, i) => {
      expect(l.body.force.x !== 0 || l.body.force.y !== 0, `letter ${i} got no impulse`).toBe(true)
      expect(l.body.velocity).toEqual(before[i])
    })
  })

  it('moves only the selected letter when one is selected', () => {
    start()
    press(phrase, 'ArrowRight')
    press(phrase, 'ArrowRight') // select index 1
    press(phrase, ' ')

    expect(letters[1].body.force.x !== 0 || letters[1].body.force.y !== 0).toBe(true)
    expect(letters[0].body.force).toEqual({ x: 0, y: 0 })
    expect(letters[2].body.force).toEqual({ x: 0, y: 0 })
  })

  it('ignores keys held with a modifier, so browser shortcuts still work', () => {
    start()
    press(phrase, ' ', { metaKey: true })
    press(phrase, 'ArrowRight', { ctrlKey: true })
    expect(engaged).toBe(0)
    expect(selectedIndex(letters)).toBe(-1)
  })

  it('leaves unhandled keys alone for the browser', () => {
    start()
    const event = press(phrase, 'Tab')
    expect(event.defaultPrevented).toBe(false)
  })

  it('fully detaches on stop()', () => {
    const handle = start()
    press(phrase, 'ArrowRight')
    handle.stop()

    expect(phrase.hasAttribute('tabindex')).toBe(false)
    expect(phrase.hasAttribute('aria-describedby')).toBe(false)
    expect(selectedIndex(letters)).toBe(-1)

    press(phrase, ' ')
    expect(engaged).toBe(0)
  })
})
