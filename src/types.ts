import type { Body } from 'matter-js'

export interface HomePosition {
  char: string
  element: HTMLSpanElement
  homeX: number
  homeY: number
  width: number
  height: number
  /**
   * Index of the word this glyph belongs to, counting across every line.
   * Letters sharing a word are sprung together so the word holds as a unit
   * until something pulls hard enough to break it.
   */
  wordIndex: number
}

export interface PhysicsLetter extends HomePosition {
  body: Body
  prevWeight: number
}

export interface PhysicsState {
  x: number
  y: number
  angle: number
  speed: number
  angularSpeed: number
}
