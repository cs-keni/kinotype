// Compositions (Phase 3). Four pieces that cycle on reload, so a repeat visitor
// gets a different one each time.
//
// `lines` is always an array — a single-line phrase is just a one-element one.
// That keeps decompose() on one code path instead of special-casing the haiku,
// whose three lines are a genuinely different physics problem (letters from
// different lines collide with each other on the way down).

export type CompositionKind = 'phrase' | 'haiku' | 'word'

export interface Composition {
  /** Stable key, usable as a `?composition=` override. */
  id: string
  kind: CompositionKind
  lines: string[]
}

export const COMPOSITIONS: Composition[] = [
  { id: 'motion', kind: 'phrase', lines: ['motion creates form'] },
  { id: 'build', kind: 'phrase', lines: ['build things that move'] },
  {
    id: 'haiku',
    kind: 'haiku',
    lines: ['the word shakes itself', 'apart into its letters', 'and back into form'],
  },
  // Eight letters at display size. Each body is heavy, so the physics read
  // slow and deliberate — deliberate contrast with the lighter phrases.
  { id: 'velocity', kind: 'word', lines: ['VELOCITY'] },
]

/** Full text of a composition, for `aria-label`. Lines join with a space. */
export function compositionText(composition: Composition): string {
  return composition.lines.join(' ')
}

/** Number of physics bodies a composition produces (spaces are not bodies). */
export function letterCount(composition: Composition): number {
  return composition.lines.join('').replace(/\s/g, '').length
}

export function compositionById(id: string): Composition | undefined {
  return COMPOSITIONS.find((c) => c.id === id)
}

/**
 * Advance the reload cycle and return the next index. Persisted so the
 * composition actually rotates across visits rather than landing at random —
 * random repeats often enough to read as broken.
 *
 * Storage is optional: private browsing and blocked storage both throw, and a
 * decorative rotation is not worth failing the page load over. Without it every
 * visit shows the first eligible composition.
 */
export function nextCycleIndex(storage: Pick<Storage, 'getItem' | 'setItem'> | null): number {
  const KEY = 'kinotype:composition-cycle'
  if (!storage) return 0
  try {
    const next = (Number.parseInt(storage.getItem(KEY) ?? '', 10) || 0) + 1
    storage.setItem(KEY, String(next))
    return next
  } catch {
    return 0
  }
}

/**
 * Resolve which composition to show.
 *
 * `?composition=<id>` wins over the rotation — E2E pins it so the resting-state
 * screenshot stays deterministic, and it doubles as a shareable link to one
 * piece. An unrecognised id falls back to the rotation.
 *
 * `maxLetters` trims the pool on small viewports (Phase 4): fewer, larger
 * bodies read better than a dense phrase crammed into a narrow screen. If
 * nothing fits, the shortest composition wins rather than returning nothing.
 */
export function resolveComposition(
  search: string,
  storage: Pick<Storage, 'getItem' | 'setItem'> | null = null,
  maxLetters = Number.POSITIVE_INFINITY,
): Composition {
  const requested = new URLSearchParams(search).get('composition')
  const pinned = requested ? compositionById(requested) : undefined
  if (pinned) return pinned

  const eligible = COMPOSITIONS.filter((c) => letterCount(c) <= maxLetters)
  if (eligible.length === 0) {
    return [...COMPOSITIONS].sort((a, b) => letterCount(a) - letterCount(b))[0]
  }

  return eligible[nextCycleIndex(storage) % eligible.length]
}
