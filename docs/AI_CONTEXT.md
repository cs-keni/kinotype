# AI Context — Kinotype

Read this before writing code. It covers the architecture, the rendering
pipeline, and the decisions that are load-bearing (the ones where the obvious
change breaks something non-obvious).

## What this is

A physics-based typography piece. A phrase hangs as a poster until you touch it;
letters scatter under real rigid-body physics, their variable-font axes respond
to velocity, and after 3s of stillness they fly home on a choreographed ~9s
return. Thesis: **motion creates form**.

Stack: Vite + TypeScript, Matter.js for physics, Fraunces variable font, DOM
letters (not canvas) with a canvas layer underneath for trails. No framework.

## Module map

Flat `src/`, one concern each. `main.ts` is the only coordinator.

| Module | Owns |
|---|---|
| `main.ts` | Boot order, resize handling, dev debug handle, reduced-motion gate |
| `colorways.ts` | 3 palettes, day-of-week assignment, `?colorway=` override |
| `compositions.ts` | 4 compositions, reload rotation, `?composition=` override |
| `decompose.ts` | Builds the letter DOM from a composition, measures every glyph |
| `physics.ts` | Engine, bodies, world bounds, sleeping, `wakeBodies()` |
| `renderer.ts` | `afterUpdate` → DOM transforms + variable-font axes |
| `attractor.ts` | The return: arrive steering, stagger, angular unwind, cancel |
| `input.ts` | Pointer events, hover repulsion, radial impulse, idle timer |
| `keyboard.ts` | Roving-tabindex selection, Space to scatter |
| `effects.ts` | Trail + impact-flash canvas |

## Boot order (order matters)

1. Resolve and **apply the colorway before anything paints**. Applying it after
   `decompose()` makes the first frame flash the stylesheet default.
2. Resolve the composition (URL pin > localStorage rotation, trimmed by viewport).
3. `decompose()` — `await document.fonts.ready`, build `line > glyph` DOM,
   reveal, then measure. Every `getBoundingClientRect()` must happen after the
   font loads or the physics bodies get wrong dimensions.
4. Create engine + bodies, start the renderer.
5. If motion is allowed: start effects, input, keyboard.

## Rendering pipeline

`Matter.Events.on(engine, 'afterUpdate')` drives everything. Two listeners:
`syncDOM` in `renderer.ts` and `draw` in `effects.ts`.

`syncDOM` reads **all** physics state into an array before writing **any** DOM,
so no layout read is interleaved with a write. Per letter it writes:

- `transform: translate(x - homeX, y - homeY) rotate(angle)` — coordinates are
  always relative to home, never absolute.
- `font-variation-settings` for wght / SOFT / opsz, but **only if `|Δwght| ≥ 2`**.
  That guard exists because font-variation writes are the expensive part.

Axis mapping is non-linear: `easeOut(t) = t^0.45`, so the response is dramatic at
low speed and plateaus at high speed. At rest this lands exactly on wght=300,
SOFT=100, opsz=72 — the poster values.

Budget: syncDOM ~0.07ms/frame, effects 0.008–0.053ms/frame, against 4ms.

## Load-bearing decisions

These are the ones where changing the obvious thing breaks something else.

**The attractor is velocity control, not position control.** It chases a target
*speed* that tapers linearly to zero inside `SLOW_RADIUS`. That taper is the
entire reason the arrival does not read mechanical. Replacing it with a
positional spring brings back the coast-then-snap.

**One attractor per engine, enforced by a `WeakMap`.** `activateAttractor` fires
on every idle. Without the guard, a second activation stacks a second
`afterUpdate` listener and doubles the pull on every letter.

**`applyForce` does not wake a sleeping body.** Sleeping is on
(`enableSleeping`) for idle cost. Any path that intends to move a letter must
clear the sleep flag first — `wakeBodies()` and `activateAttractor()` both do.
Forget this and letters silently ignore input.

**Effects gate on speed, and the thresholds must stay above
`MAX_RETURN_SPEED`.** That is what keeps the reassembly clean (VQT #5) without
special-casing it. It also keeps letters quiet while they pass through bounds as
sensors during the return, which still fires `collisionStart`. Tests assert the
constant ordering directly.

**Canvas fades by filling, never by clearing.** Clear-and-redraw flickers on
high-DPI displays. The backing store is sized at `devicePixelRatio`.

**Letters are sensors during the return** so they pass through each other and go
straight home without pile-up jitter.

**Force is mass-normalised** (`forceMag *= body.mass`) so every glyph shares one
acceleration profile regardless of size. Without it, heavy letters lag.

## Data shapes

```ts
HomePosition  { char, element, homeX, homeY, width, height }
PhysicsLetter { ...HomePosition, body: Matter.Body, prevWeight: number }
Composition   { id, kind: 'phrase'|'haiku'|'word', lines: string[] }
Colorway      { id, name, bg, fg, accent }
```

`lines` is always an array — a single-line phrase is a one-element array. This is
deliberate: it keeps `decompose()` on one code path instead of special-casing
the haiku.

## Testing

- **Unit** (Vitest, jsdom): pure functions and physics integration. jsdom has no
  canvas 2D context, so `effects.ts` exports its gating logic as pure functions
  and `startEffects` degrades to a no-op handle.
- **E2E** (Playwright): anything needing real layout, real pixels, or real
  input. Always pin `?composition=&colorway=` — otherwise the screenshot
  baseline is a coin flip across 12 combinations.
- Physics assertions should be **directional, not exact**. The Matter runner
  runs in real time alongside manual `step()` calls, so exact tick counts drift.

## Gotchas

- **HMR does not pick up `attractor.ts` / `renderer.ts` edits.** Vite caches the
  transformed modules. Restart:
  `lsof -ti :5173 | xargs kill -9 && npm run dev -- --port 5173 &`
- Playwright targets port **5177**, not 5173.
- Resize is debounced 200ms and **skips re-homing while letters are in flight**,
  because `getBoundingClientRect()` includes the scatter transform. The canvas
  still rescales.
