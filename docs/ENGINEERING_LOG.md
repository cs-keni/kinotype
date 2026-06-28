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

Commits: e54dc31 (T4), 33317d0 (T5+T6)

### T7 — Non-linear home attractor
- **Added `src/attractor.ts`**: `activateAttractor()` fires after 3s idle (callback from input.ts)
- On activate: `gravity.y = 0`, `frictionAir = 0.005` on all bodies
- Per-tick force: `F = min(K / (dist + ε), F_MAX)` toward home — non-linear, orbital reassembly emerges
- All-bodies-sleep detection: when all letters within 2px of home AND speed < 0.5, snaps to exact home, restores gravity + frictionAir
- Exported tuning constants: `K`, `EPSILON`, `F_MAX` — empirical tuning in VQT #3 pass

### T8 — Three-axis Fraunces variable font mapping
- **Updated `src/renderer.ts`**: axis writes happen AFTER transform writes in same tick
- `wght = lerp(300, 900, clamp(speed/25, 0, 1))` — Light at rest, Black at max speed
- `SOFT = lerp(100, 0, ...)` — inverted: round at rest, sharp when fast
- `opsz = lerp(72, 36, clamp(angularSpeed/8, 0, 1))` — narrow range only
- Skip write guard: `|newWght - prevWght| < 2` avoids pointless micro-updates
- `tsc --noEmit`: clean

Commit: (pending)
