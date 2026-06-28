# Current Task

**Active:** T9 — Vitest unit tests

## What's done
- T1 (scaffold), T2 (decompose), T3 (poster/VQT #1), T4 (physics), T5 (renderer), T6 (input), T7 (attractor), T8 (varfont) — all complete
- Phase 1 core implementation is done — needs VQT #3 (jitter), profiling gate, and interactive testing

## What's next
- Interactive verification: open http://localhost:5174 in a real browser, hover + click to confirm physics + varfont behavior
- T9: Vitest unit tests (attractor force function, mass bounds, axis mapping at rest/max)
- T10: Playwright E2E (resting state screenshot, additive velocity, idle return)
- T11: Dev-mode frame time logger + 4ms profiling gate

## Key constraint
Physics runner (`Matter.Runner`) must NOT start on page load — T6 starts it on first mousemove/click. Letters are static bodies until `wakeBodies()` is called.

## Key constraint
Physics runner (`Matter.Runner`) must NOT start on page load — T6 starts it on first mousemove/click. Letters are static bodies until `wakeBodies()` is called.
