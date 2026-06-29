# Current Task

**Active:** T10 — Playwright E2E tests

## What's done
- T1–T8 (scaffold through varfont) — all complete
- Attractor settling fix verified in browser (039c5c8): no oscillation, no re-fall, 2 cycles confirmed
- T9 (Vitest unit tests): 38 tests passing — attractor constants/force/sleep/integration, physics mass bounds + body state, renderer axis mapping at rest/max + threshold filter + transform sync

## What's next
- T10: Playwright E2E — resting state screenshot regression, additive velocity, idle return (all bodies within 2px of home)
- T11: Dev-mode frame time logger + 4ms profiling gate

## Key constraint
Physics runner (`Matter.Runner`) must NOT start on page load — T6 starts it on first mousemove/click. Letters are static bodies until `wakeBodies()` is called.
