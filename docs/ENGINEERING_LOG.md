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

Commit: f37432e (T8 varfont — prior session)

### Attractor tuning — oscillation fix
Root cause of "letters orbit but don't land": `F_MAX=0.001` gave terminal velocity ~55px/tick at close range (dist<3px). Letters whipped through home repeatedly, never satisfying `dist < SLEEP_DIST_PX AND speed < SLEEP_SPEED` simultaneously.

Changes:
- `F_MAX`: 0.001 → 0.0003 — lowers close-range terminal to ~5.6px/tick
- `frictionAir` during return: 0.005 → 0.015 — more damping per tick, faster settling
- `SLEEP_DIST_PX`: 3 → 5 — wider snap radius; at 5px with 5.6px/tick terminal, letters cross within capture zone
- Sleep detection: removed speed condition entirely — purely dist-based. Snap fires when all bodies within 5px regardless of velocity

Combined effect: letters approach home at ≤5.6px/tick, regularly pass inside the 5px threshold, snap cleanly. `setStatic(true)` in deactivate prevents re-fall.

Variable font bolding behavior confirmed intentional: wght lerps 300→900 with speed. Bold on fall, light at rest — working as designed.

Commit: 039c5c8

### Attractor verified in browser (headless, 2 cycles)
- All 17 letters returned to `wght=300`, max translation 0.027px (sub-pixel) after idle attractor
- Second scatter+return cycle identical — `setStatic(true)` re-hang confirmed working
- No oscillation, no re-fall in either cycle

### T9 — Vitest unit tests (38 tests, all passing)
- Installed: `vitest@4.1.9`, `happy-dom@20.10.6`; added `test` + `test:watch` scripts
- `vite.config.ts`: added `test: { environment: 'happy-dom' }`
- `tests/attractor.test.ts` (14 tests): constant regression guards (F_MAX ≤ 0.0003, SLEEP_DIST_PX ≥ 5), force formula at near/far/crossover, direction normalisation, dist-only sleep gate, deactivate cleanup (gravity, sensor, static, position, transform, style)
- `tests/physics.test.ts` (12 tests): MIN_MASS/MAX_MASS clamping, unclamped mid-range, MAX/MIN = 5.0, body count, position, isStatic=true on create, prevWeight=300, label, wakeBodies
- `tests/renderer.test.ts` (12 tests): wght=300/SOFT=100/opsz=72 at rest, wght=900/SOFT=0 at max speed, threshold filter skip + fire, translate + rotate sync

### T10 — Playwright E2E tests (3 tests, all passing)
- Installed: `@playwright/test@1.61.1`; added `test:e2e` script; created `playwright.config.ts`
- Test 1 (resting state screenshot): `toHaveScreenshot('resting-state.png', maxDiffPixelRatio=0.01)` — baseline committed
- Test 2 (additive velocity): two clicks 12 ticks apart; verifies max speed after 2nd click > 50% of max speed before 2nd click
- Test 3 (idle return): scatter → `triggerIdle()` → `stepUntilHome()` → all letters within 2px of home
  - Root cause of original failure: attractor `MAX_TICKS=600` failsafe fires at tick 600 (snaps all bodies to exact home); test was only stepping 480 ticks — just short of the failsafe
  - Fix: added `stepUntilHome(maxTicks=650)` to debug handle — loops calling `Engine.update`, returns when all letters ≤2px from home (guaranteed by tick 601 via failsafe). Runs entirely in-browser, no round-trip overhead per tick. Test 3 now completes in 298ms.
- `main.ts`: debug handle gains `stepUntilHome` alongside `step` + `triggerIdle` + `getLetters`

### fix(attractor): reset body angle to 0 on deactivate
Bug: `deactivate()` called `setPosition(homeX,homeY)` and `setAngularVelocity(0)` but not `setAngle(0)`. Bodies retained residual mid-flight rotation angle. After snap, `syncDOM` re-read the non-zero angle and wrote `rotate(Nrad)` to the CSS transform on the next tick — leaving letters visually tilted at home.

Fix: added `Matter.Body.setAngle(l.body, 0)` between `setPosition` and `setVelocity` in `deactivate()`. All 17 letters now return to `angle=0`, confirmed via headless browser query and screenshot (identical to initial resting state poster). All 41 tests pass (38 unit + 3 E2E).

### T11 — Dev-mode frame time logger
- `renderer.ts`: DEV-gated branch in `startRenderer` wraps `syncDOM` with `performance.now()` timing
- 60-slot `Float64Array` circular buffer; rolling avg logged every 60 frames via `frameCount % 60`
- `console.warn` with "exceeds 4ms budget" suffix when avg > 4ms; `console.log` otherwise
- Prod path unchanged — single `Events.on` with no overhead
- `vite.config.ts`: added `exclude: ['tests/e2e/**']` so Vitest no longer picks up Playwright specs
- tsc clean; 38 unit tests + 3 E2E tests all passing
