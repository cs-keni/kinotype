import type { Body } from 'matter-js'

export interface HomePosition {
  char: string
  element: HTMLSpanElement
  homeX: number
  homeY: number
  width: number
  height: number
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
