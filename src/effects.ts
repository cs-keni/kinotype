import Matter from 'matter-js'
import type { PhysicsLetter } from './types'
import type { Colorway } from './colorways'

// ─── Canvas effects: letter trails and impact flashes ────────────────────────
//
// Both live on one canvas beneath the DOM letters, because both are "paint a
// mark, let it decay" and sharing the fade loop means one full-screen fill per
// frame instead of two.
//
// VQT #5: the canvas is sized at devicePixelRatio and faded by drawing a
// low-opacity background-coloured fill over itself each frame. Clearing and
// redrawing flickers on high-DPI displays; filling does not.

/** Fill alpha per frame. 0.15 decays a mark to ~5% in ~18 frames (~300ms),
 *  inside the spec's 200–400ms window. */
export const FADE_ALPHA = 0.15

/** Below this speed a letter leaves no trail. Set above the return's cruise
 *  speed (~2.1px/tick) so reassembly is clean — VQT #5 wants no trails while
 *  the phrase is reforming, and a speed gate gets that for free. */
export const TRAIL_MIN_SPEED = 3

/** Speed at which a trail reaches full opacity. */
export const TRAIL_MAX_SPEED = 18

/** Trails are faint by design — this is the ceiling, not the typical value. */
export const TRAIL_MAX_ALPHA = 0.35

/** Boundary hits below this speed do not flash. Also above the return cruise
 *  speed, so a letter drifting home past a wall stays silent. */
export const FLASH_MIN_SPEED = 4

/** Spec calls for a "one pixel-wide point flash". A literal 1px dot is
 *  invisible at DPR 2, so this is the smallest radius that still reads as a
 *  point rather than a particle. */
export const FLASH_RADIUS = 3

/** Frames a mark needs to fade to invisible. Once no new marks land for this
 *  long the loop stops painting entirely, so a resting page does no canvas
 *  work at all. */
export const FADE_FRAMES = 24

const BOUNDARY_LABELS = new Set(['floor', 'wall-left', 'wall-right'])

/** True when a letter is moving fast enough to smear. */
export function shouldTrail(speed: number): boolean {
  return speed > TRAIL_MIN_SPEED
}

/** True when a boundary hit is energetic enough to be worth marking. */
export function shouldFlash(speed: number): boolean {
  return speed >= FLASH_MIN_SPEED
}

/** Trail opacity ramps from nothing at TRAIL_MIN_SPEED to the ceiling. */
export function trailAlpha(speed: number): number {
  if (!shouldTrail(speed)) return 0
  const t = (speed - TRAIL_MIN_SPEED) / (TRAIL_MAX_SPEED - TRAIL_MIN_SPEED)
  return Math.min(Math.max(t, 0), 1) * TRAIL_MAX_ALPHA
}

/** Backing-store size for a CSS-pixel viewport at a given device pixel ratio. */
export function canvasSizeFor(cssWidth: number, cssHeight: number, dpr: number): {
  width: number
  height: number
} {
  const ratio = Math.max(dpr || 1, 1)
  return { width: Math.round(cssWidth * ratio), height: Math.round(cssHeight * ratio) }
}

/** Parse `#RRGGBB` into an `rgba()` string at the given alpha. */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const r = Number.parseInt(full.slice(0, 2), 16)
  const g = Number.parseInt(full.slice(2, 4), 16)
  const b = Number.parseInt(full.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export interface EffectsHandle {
  /** Re-scale the backing store. Call on viewport resize. */
  resize: () => void
  /** Detach listeners and clear the canvas. */
  stop: () => void
}

/**
 * Start drawing trails and impact flashes for a set of letters.
 *
 * Returns a no-op handle when the 2D context is unavailable (jsdom, or a
 * browser with canvas disabled). The piece is fully functional without it —
 * effects are decoration, never a hard dependency.
 */
export function startEffects(
  engine: Matter.Engine,
  letters: PhysicsLetter[],
  canvas: HTMLCanvasElement,
  colorway: Colorway,
): EffectsHandle {
  const ctx = canvas.getContext('2d')
  if (!ctx) return { resize: () => {}, stop: () => {} }

  const fade = withAlpha(colorway.bg, FADE_ALPHA)
  const flashColor = colorway.accent

  // Previous position per letter, so a trail is a segment rather than a dot.
  // Seeded to current positions so the first frame cannot draw a streak from
  // the origin.
  let prev = letters.map((l) => ({ x: l.body.position.x, y: l.body.position.y }))
  const flashes: Array<{ x: number; y: number }> = []

  // Counts down from FADE_FRAMES whenever a mark lands. At zero the canvas is
  // known-blank and the loop does nothing — a resting page burns no fill rate.
  let remainingFadeFrames = 0

  function resize(): void {
    const { width, height } = canvasSizeFor(window.innerWidth, window.innerHeight, window.devicePixelRatio)
    canvas.width = width
    canvas.height = height
    const ratio = Math.max(window.devicePixelRatio || 1, 1)
    ctx!.setTransform(ratio, 0, 0, ratio, 0, 0)
    // Backing-store resize blanks the canvas, so any in-flight fade is gone.
    remainingFadeFrames = 0
  }

  function onCollision(event: Matter.IEventCollision<Matter.Engine>): void {
    for (const pair of event.pairs) {
      const { bodyA, bodyB } = pair
      const aIsBound = BOUNDARY_LABELS.has(bodyA.label)
      const bIsBound = BOUNDARY_LABELS.has(bodyB.label)
      // Letter-on-letter and bound-on-bound are not impacts we mark.
      if (aIsBound === bIsBound) continue

      const letter = aIsBound ? bodyB : bodyA
      const { x, y } = letter.velocity
      if (!shouldFlash(Math.sqrt(x * x + y * y))) continue

      const support = pair.collision?.supports?.[0]
      flashes.push(support ? { x: support.x, y: support.y } : { ...letter.position })
    }
  }

  function draw(): void {
    // Fade first, so marks drawn this frame land at full strength. Note this
    // must NOT count as painting: if it did, the countdown would reset every
    // frame and the loop would never go quiet.
    const wasFading = remainingFadeFrames > 0
    if (wasFading) {
      ctx!.fillStyle = fade
      ctx!.fillRect(0, 0, window.innerWidth, window.innerHeight)
      remainingFadeFrames--
    }

    let drewMark = false

    ctx!.lineWidth = 1
    ctx!.lineCap = 'round'

    for (let i = 0; i < letters.length; i++) {
      const { x, y } = letters[i].body.position
      const vx = letters[i].body.velocity.x
      const vy = letters[i].body.velocity.y
      const alpha = trailAlpha(Math.sqrt(vx * vx + vy * vy))

      if (alpha > 0) {
        ctx!.strokeStyle = withAlpha(colorway.fg, alpha)
        ctx!.beginPath()
        ctx!.moveTo(prev[i].x, prev[i].y)
        ctx!.lineTo(x, y)
        ctx!.stroke()
        drewMark = true
      }

      prev[i].x = x
      prev[i].y = y
    }

    if (flashes.length > 0) {
      ctx!.fillStyle = flashColor
      for (const f of flashes) {
        ctx!.beginPath()
        ctx!.arc(f.x, f.y, FLASH_RADIUS, 0, Math.PI * 2)
        ctx!.fill()
      }
      flashes.length = 0
      drewMark = true
    }

    if (drewMark) {
      remainingFadeFrames = FADE_FRAMES
    } else if (wasFading && remainingFadeFrames === 0) {
      // The fade approaches zero alpha asymptotically but never reaches it.
      // One clear at the end removes the residue and leaves the canvas known-
      // blank, which is what lets the loop skip work entirely while at rest.
      ctx!.clearRect(0, 0, window.innerWidth, window.innerHeight)
    }
  }

  // Dev-only frame timer, mirroring the syncDOM logger in renderer.ts. A
  // full-viewport fill every frame is the obvious candidate for blowing the
  // 4ms budget, so it gets measured rather than assumed cheap.
  const tick =
    import.meta.env.DEV
      ? (() => {
          const frameTimes = new Float64Array(60)
          let frameCount = 0
          return () => {
            const t0 = performance.now()
            draw()
            frameTimes[frameCount % 60] = performance.now() - t0
            frameCount++
            if (frameCount % 60 === 0) {
              let sum = 0
              for (let i = 0; i < 60; i++) sum += frameTimes[i]
              const avg = sum / 60
              // Only report while actually painting — a resting page draws
              // nothing and would otherwise spam zeros into the console.
              if (avg > 0.001) {
                const msg = `[kinotype] effects avg: ${avg.toFixed(3)}ms (last 60 frames)`
                avg > 2 ? console.warn(msg + ' — over half the 4ms frame budget') : console.log(msg)
              }
            }
          }
        })()
      : draw

  resize()
  Matter.Events.on(engine, 'afterUpdate', tick)
  Matter.Events.on(engine, 'collisionStart', onCollision)

  return {
    resize,
    stop() {
      Matter.Events.off(engine, 'afterUpdate', tick)
      Matter.Events.off(engine, 'collisionStart', onCollision)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      prev = []
      flashes.length = 0
    },
  }
}
