# Current Task

**Active:** Phase 1 wrap-up — profiling gate + VQT #3

## What's done
- T1–T11 (scaffold through frame time logger) — all complete
- T9: 38 Vitest unit tests passing
- T10: 3 Playwright E2E tests passing
- T11: rolling 60-frame avg logger in renderer (DEV only), warns if > 4ms

## Profiling gate (before Phase 2)
Run dev server, interact, check console for `[kinotype] syncDOM avg:` lines.
Gate passes when avg < 4ms on mid-tier hardware.

## VQT #3
Letters collide without jitter. Needs manual play-testing in the browser.
If jitter is observed, tune `restitution`, `friction`, or sleep thresholds in physics.ts.

## After gate + VQT #3 pass
Phase 2 begins: variable font axis mapping curve tuning (exponential, not linear).
