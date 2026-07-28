// Colorways (Phase 3). Near-monochrome: one background, one type colour, one
// accent reserved for interactive state (impact flashes).
//
// Assignment is deterministic from the day of the week, so the same visitor on
// the same day always sees the same palette, but it shifts across the week.
// Seven days over three colorways means the cycle does not align to the week —
// each weekday lands on a different palette than it did last week.

export interface Colorway {
  /** Stable key, usable as a `?colorway=` override. */
  id: 'paper' | 'night' | 'blueprint'
  name: string
  bg: string
  fg: string
  accent: string
}

export const COLORWAYS: Colorway[] = [
  { id: 'paper', name: 'Paper', bg: '#F7F4EE', fg: '#1A1A1A', accent: '#C0392B' },
  { id: 'night', name: 'Night', bg: '#0D0D0D', fg: '#F2EDD7', accent: '#00E5FF' },
  { id: 'blueprint', name: 'Blueprint', bg: '#1B3A5F', fg: '#FFFFFF', accent: '#FFD700' },
]

/** Colorway for a given date. `getDay()` is 0=Sunday through 6=Saturday. */
export function colorwayForDate(date: Date): Colorway {
  return COLORWAYS[date.getDay() % COLORWAYS.length]
}

/** Look up a colorway by id. Returns undefined for an unknown id. */
export function colorwayById(id: string): Colorway | undefined {
  return COLORWAYS.find((c) => c.id === id)
}

/**
 * Resolve which colorway to show. An explicit `?colorway=<id>` wins over the
 * day-of-week rotation — E2E needs a deterministic palette for the resting
 * state screenshot baseline, and it doubles as a way to link a specific look.
 * An unrecognised id falls back to the rotation rather than erroring.
 */
export function resolveColorway(search: string, date: Date = new Date()): Colorway {
  const requested = new URLSearchParams(search).get('colorway')
  return (requested ? colorwayById(requested) : undefined) ?? colorwayForDate(date)
}

/** Write a colorway to the CSS custom properties every other style reads. */
export function applyColorway(colorway: Colorway, root: HTMLElement): void {
  root.style.setProperty('--bg', colorway.bg)
  root.style.setProperty('--fg', colorway.fg)
  root.style.setProperty('--accent', colorway.accent)
  root.dataset.colorway = colorway.id
}
