# Current Task

**Active:** T5 — renderer (`src/renderer.ts`)

## What's done
- T1 (scaffold), T2 (decompose), T3 (poster/VQT #1), T4 (physics engine + bodies) — all complete

## What's next
- T5: `src/renderer.ts` — `Matter.Events.on(engine, 'afterUpdate', syncDOM)`, reads-before-writes DOM sync, relative-to-home transforms
- T6: `src/input.ts` — mousemove repulsion (80px), click impulse, lazy runner start
- T7: `src/attractor.ts` — non-linear home attractor, phase transitions
- T8: variable font axis mapping in renderer.ts

## Key constraint
Physics runner (`Matter.Runner`) must NOT start on page load — T6 starts it on first mousemove/click. Letters are static bodies until `wakeBodies()` is called.
