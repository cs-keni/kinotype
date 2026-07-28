import { describe, it, expect } from 'vitest'
import {
  COMPOSITIONS,
  compositionById,
  compositionText,
  letterCount,
  nextCycleIndex,
  resolveComposition,
} from '../src/compositions'

/** In-memory stand-in for localStorage. */
function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  }
}

/** Storage that throws on every access, like a blocked privacy mode. */
const hostileStorage = {
  getItem() {
    throw new Error('blocked')
  },
  setItem() {
    throw new Error('blocked')
  },
}

describe('composition set', () => {
  it('ships all four compositions', () => {
    expect(COMPOSITIONS).toHaveLength(4)
    expect(COMPOSITIONS.map((c) => c.id)).toEqual(['motion', 'build', 'haiku', 'velocity'])
  })

  it('has unique ids so ?composition= is unambiguous', () => {
    expect(new Set(COMPOSITIONS.map((c) => c.id)).size).toBe(COMPOSITIONS.length)
  })

  it('carries the spec phrases for compositions 1 and 2', () => {
    expect(compositionById('motion')!.lines).toEqual(['motion creates form'])
    expect(compositionById('build')!.lines).toEqual(['build things that move'])
  })

  it('lays the haiku out as three real lines, not one joined string', () => {
    const haiku = compositionById('haiku')!
    expect(haiku.kind).toBe('haiku')
    expect(haiku.lines).toHaveLength(3)
  })

  it('sets composition 4 as a single word at display size', () => {
    const word = compositionById('velocity')!
    expect(word.kind).toBe('word')
    expect(word.lines).toHaveLength(1)
    expect(word.lines[0]).not.toContain(' ')
    expect(letterCount(word)).toBe(8) // spec: 8 letters at display size
  })

  it('every composition produces at least one physics body', () => {
    for (const c of COMPOSITIONS) expect(letterCount(c)).toBeGreaterThan(0)
  })
})

describe('compositionText', () => {
  it('joins lines with a space for the aria-label', () => {
    expect(compositionText(compositionById('haiku')!)).toBe(
      'the word shakes itself apart into its letters and back into form',
    )
  })

  it('is unchanged for a single-line composition', () => {
    expect(compositionText(compositionById('motion')!)).toBe('motion creates form')
  })
})

describe('letterCount', () => {
  it('excludes spaces, which get no physics body', () => {
    expect(letterCount(compositionById('motion')!)).toBe('motioncreatesform'.length)
  })

  it('counts across all lines of a multi-line composition', () => {
    const haiku = compositionById('haiku')!
    expect(letterCount(haiku)).toBe(haiku.lines.join('').replace(/ /g, '').length)
  })
})

describe('nextCycleIndex', () => {
  it('advances on every call so reloads actually rotate', () => {
    const storage = fakeStorage()
    expect(nextCycleIndex(storage)).toBe(1)
    expect(nextCycleIndex(storage)).toBe(2)
    expect(nextCycleIndex(storage)).toBe(3)
  })

  it('resumes from a persisted value', () => {
    expect(nextCycleIndex(fakeStorage({ 'kinotype:composition-cycle': '41' }))).toBe(42)
  })

  it('recovers from a corrupt stored value instead of returning NaN', () => {
    expect(nextCycleIndex(fakeStorage({ 'kinotype:composition-cycle': 'banana' }))).toBe(1)
  })

  it('returns 0 when storage is unavailable', () => {
    expect(nextCycleIndex(null)).toBe(0)
  })

  it('survives storage that throws on access', () => {
    expect(() => nextCycleIndex(hostileStorage)).not.toThrow()
    expect(nextCycleIndex(hostileStorage)).toBe(0)
  })
})

describe('resolveComposition', () => {
  it('honours an explicit ?composition override', () => {
    expect(resolveComposition('?composition=velocity', fakeStorage()).id).toBe('velocity')
    expect(resolveComposition('?composition=haiku', fakeStorage()).id).toBe('haiku')
  })

  it('ignores an unknown id and falls back to the rotation', () => {
    expect(resolveComposition('?composition=nope', fakeStorage()).id).toBe(COMPOSITIONS[1].id)
  })

  it('does not consume a cycle step when pinned', () => {
    const storage = fakeStorage()
    resolveComposition('?composition=motion', storage)
    // Rotation is untouched, so the next unpinned load still gets index 1.
    expect(resolveComposition('', storage).id).toBe(COMPOSITIONS[1].id)
  })

  it('visits every composition across consecutive reloads', () => {
    const storage = fakeStorage()
    const seen = COMPOSITIONS.map(() => resolveComposition('', storage).id)
    expect(new Set(seen).size).toBe(COMPOSITIONS.length)
  })

  it('never repeats back to back across a full cycle', () => {
    const storage = fakeStorage()
    const seen = Array.from({ length: 12 }, () => resolveComposition('', storage).id)
    for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1])
  })

  it('is deterministic without storage rather than throwing', () => {
    expect(resolveComposition('', null).id).toBe(COMPOSITIONS[0].id)
  })

  it('trims the pool to compositions that fit a small viewport', () => {
    const storage = fakeStorage()
    for (let i = 0; i < 8; i++) {
      const picked = resolveComposition('', storage, 10)
      expect(letterCount(picked)).toBeLessThanOrEqual(10)
    }
  })

  it('falls back to the shortest composition when nothing fits', () => {
    const picked = resolveComposition('', fakeStorage(), 1)
    const shortest = [...COMPOSITIONS].sort((a, b) => letterCount(a) - letterCount(b))[0]
    expect(picked.id).toBe(shortest.id)
  })

  it('still honours a pin that exceeds maxLetters', () => {
    // An explicit link should show what it asked for, small screen or not.
    expect(resolveComposition('?composition=haiku', fakeStorage(), 5).id).toBe('haiku')
  })
})
