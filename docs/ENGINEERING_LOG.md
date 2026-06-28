# Engineering Log

## 2026-06-28

### T3 — Poster resting state (VQT #1 gate)
Verified: Fraunces Light (wght=300) on cream (#F7F4EE), `centerY=360 = viewportH/2`, 17 letters decomposed, zero JS errors. VQT #1 approved.

### T4 — Physics engine + letter bodies
- **Added `src/physics.ts`**: `createEngine()`, `createBodies()`, `wakeBodies()`, `addBounds()`
- Bodies start as `isStatic: true` — awakened on first user interaction (T6)
- Mass: `clamp(w * h * 0.002, 0.5, 2.5)` — MAX/MIN ratio = 5.0, satisfies spec constraint
- Bounds: floor + two walls, 60px thick to prevent tunneling at high velocity; no ceiling (letters can scatter upward)
- **Updated `src/main.ts`**: calls `createEngine()` + `createBodies()`, stubs for T5 (renderer) and T6 (input)
- `tsc --noEmit`: clean
- PHASES.md: T3 marked `[x]`

Commit: (pending)
