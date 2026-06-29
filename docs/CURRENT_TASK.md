# Current Task

**Active:** T11 — Dev-mode frame time logger

## What's done
- T1–T8 (scaffold through varfont) — all complete
- Attractor settling fix verified in browser (039c5c8): no oscillation, no re-fall, 2 cycles confirmed
- T9 (Vitest unit tests): 38 tests passing
- T10 (Playwright E2E): 3 tests passing — resting state screenshot, additive velocity, idle return

## What's next
- T11: Dev-mode frame time logger
  - In `renderer.ts` (guarded by `import.meta.env.DEV`)
  - `performance.mark()` per tick; rolling 60-frame avg logged to console
  - `console.warn` if avg frame time > 4ms (fontVariationSettings budget)
  - **Profiling gate:** avg frame time < 4ms before Phase 2 begins

## Key constraint
Physics runner (`Matter.Runner`) must NOT start on page load — T6 starts it on first mousemove/click. Letters are static bodies until `wakeBodies()` is called.
