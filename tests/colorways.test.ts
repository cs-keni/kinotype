import { describe, it, expect } from 'vitest'
import {
  COLORWAYS,
  applyColorway,
  colorwayById,
  colorwayForDate,
  resolveColorway,
} from '../src/colorways'

describe('colorway palette', () => {
  it('ships all three colorways from the spec', () => {
    expect(COLORWAYS.map((c) => c.id)).toEqual(['paper', 'night', 'blueprint'])
  })

  it('matches the spec hex values exactly', () => {
    expect(colorwayById('paper')).toMatchObject({ bg: '#F7F4EE', fg: '#1A1A1A', accent: '#C0392B' })
    expect(colorwayById('night')).toMatchObject({ bg: '#0D0D0D', fg: '#F2EDD7', accent: '#00E5FF' })
    expect(colorwayById('blueprint')).toMatchObject({
      bg: '#1B3A5F',
      fg: '#FFFFFF',
      accent: '#FFD700',
    })
  })

  it('gives every colorway a distinct background and type colour', () => {
    for (const c of COLORWAYS) {
      expect(c.bg.toLowerCase()).not.toBe(c.fg.toLowerCase())
      expect(c.accent.toLowerCase()).not.toBe(c.bg.toLowerCase())
    }
  })

  it('returns undefined for an unknown id', () => {
    expect(colorwayById('chartreuse')).toBeUndefined()
  })
})

describe('day-of-week assignment', () => {
  it('is stable for the same day', () => {
    const a = colorwayForDate(new Date('2026-07-27T09:00:00'))
    const b = colorwayForDate(new Date('2026-07-27T23:30:00'))
    expect(a.id).toBe(b.id)
  })

  it('uses all three colorways across a week', () => {
    const week = Array.from({ length: 7 }, (_, i) =>
      colorwayForDate(new Date(2026, 6, 26 + i)).id,
    )
    expect(new Set(week).size).toBe(3)
  })

  it('pins a given weekday to one palette, week after week', () => {
    // Deliberate: the spec says "deterministic from the day of the week", so
    // Monday is always Night. Visitors who come back on the same weekday get a
    // consistent piece; variety comes from visiting on different days. Switch
    // to days-since-epoch if a given weekday should rotate across weeks.
    const mondays = [0, 1, 2].map((w) => colorwayForDate(new Date(2026, 6, 27 + w * 7)).id)
    expect(new Set(mondays).size).toBe(1)
  })

  it('adjacent days never repeat a palette', () => {
    const week = Array.from({ length: 7 }, (_, i) => colorwayForDate(new Date(2026, 6, 26 + i)).id)
    for (let i = 1; i < week.length; i++) expect(week[i]).not.toBe(week[i - 1])
  })
})

describe('resolveColorway', () => {
  const monday = new Date('2026-07-27T12:00:00')

  it('honours an explicit ?colorway override', () => {
    expect(resolveColorway('?colorway=night', monday).id).toBe('night')
    expect(resolveColorway('?colorway=blueprint', monday).id).toBe('blueprint')
  })

  it('falls back to the rotation for an unknown id rather than throwing', () => {
    expect(resolveColorway('?colorway=nope', monday).id).toBe(colorwayForDate(monday).id)
  })

  it('falls back to the rotation when no override is present', () => {
    expect(resolveColorway('', monday).id).toBe(colorwayForDate(monday).id)
    expect(resolveColorway('?other=1', monday).id).toBe(colorwayForDate(monday).id)
  })
})

describe('applyColorway', () => {
  it('writes the CSS custom properties every other style reads', () => {
    const root = document.createElement('div')
    applyColorway(colorwayById('night')!, root)

    expect(root.style.getPropertyValue('--bg')).toBe('#0D0D0D')
    expect(root.style.getPropertyValue('--fg')).toBe('#F2EDD7')
    expect(root.style.getPropertyValue('--accent')).toBe('#00E5FF')
  })

  it('tags the element so CSS and tests can assert the active palette', () => {
    const root = document.createElement('div')
    applyColorway(colorwayById('blueprint')!, root)
    expect(root.dataset.colorway).toBe('blueprint')
  })

  it('fully replaces a previously applied colorway', () => {
    const root = document.createElement('div')
    applyColorway(colorwayById('night')!, root)
    applyColorway(colorwayById('paper')!, root)

    expect(root.style.getPropertyValue('--bg')).toBe('#F7F4EE')
    expect(root.dataset.colorway).toBe('paper')
  })
})
