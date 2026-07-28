# Engineering Log

## 2026-07-27

### Phase 3 — Reassembly choreography (VQT #4)

Reworked the return from an inverse-distance attractor into a choreographed
arrival. The old return read mechanical for four independent reasons, only one
of which was speed:

1. **Too fast.** Terminal velocity ~5.6px/tick (333px/s) put a 500px return
   under 2s against an 8–12s target.
2. **No deceleration.** `F = min(K/(dist+ε), F_MAX)` capped at `F_MAX` for
   anything nearer than ~157px, so letters coasted at terminal velocity right up
   to the 5px sleep gate and then snapped. Constant-velocity arrival is the
   definition of mechanical.
3. **No phrasing.** Every letter engaged on the same tick — one blob move.
4. **Rotational pop.** `setAngle(0)` fired at settle (913f2d7), ending a smooth
   translation with an instant snap to upright.

**Changes to `src/attractor.ts`:**

- **Arrive steering** replaces positional force. The controller now chases a
  *velocity* that tapers linearly to zero inside `SLOW_RADIUS = 70`, so each
  letter decays into home asymptotically. This is what removes the mechanical
  feel. Force = `clamp(velocityError * STEER_GAIN, F_MAX) * mass`.
- **Reading-order stagger**: `staggerDelay(i, n)` spreads lift-off across
  `STAGGER_TICKS = 150` (2.5s) so the phrase recomposes left to right.
- **Angular unwind**: rotation is driven toward upright over the flight
  (`UNWIND_TICKS = 60`), making the settle-time `setAngle(0)` a no-op.
  `normalizeAngle()` wraps to (-π, π] so three spins unwind like none.
- **Retuned**: `MAX_RETURN_SPEED = 2.4`, `RETURN_FRICTION_AIR = 0.006` (steering
  does the damping now, not drag), `F_MAX` 0.0003 → 0.0008 (enough authority to
  reverse a scattered letter in ~1s rather than fighting its momentum for 5s),
  `SLEEP_DIST_PX` 5 → 3, `MAX_TICKS` 600 → 1500.
- **Removed** `K` and `EPSILON` — the inverse-distance law is gone.

**Measured** (40 letters, full-viewport scatter): first letter lands at tick 249
(4.15s), last at 534 (8.90s), 4.75s resolution window. Squarely in the 8–12s
target on a deliberate worst case.

**Latent bug fixed along the way.** `activateAttractor()` registered a new
`afterUpdate` listener on every idle and nothing ever removed the old one. The
600-tick failsafe used to close that window; stretching it to 1500 for a ~9s
return would have let two force fields stack on every letter and double the
pull. Added a module-level `WeakMap<Engine, detach>` so one engine can only have
one return in flight, plus `cancelAttractor(engine)` to abort without snapping
letters home. `input.ts` now takes an `onInteract` callback and fires it from
`ensureRunning()`, so touching the mouse mid-return aborts the attractor instead
of letting it fight the cursor. `main.ts` wires the two together.

Cancellation also zeroes `body.force`: Matter clears forces *before*
`afterUpdate`, so the force the final tick applied is still pending and would
otherwise be consumed one frame after cancellation. Small (~0.06px/tick) but it
made "cancel" not quite mean cancel.

**Tests**: 38 → 56 unit (rewrote `tests/attractor.test.ts` against the new
controller — the old force-formula assertions tested a law that no longer
exists), 3 → 4 E2E. New E2E covers the interrupt path, which crosses
`input.ts` → `main.ts` → `attractor.ts` and no unit test reaches. Added a VQT #4
regression floor: the return must take more than 240 ticks. `tsc --noEmit`
clean, `npm run build` clean.

**Open question for play-test.** Arrival order is organic rather than strictly
reading order — a letter early in the phrase but far from home lands after a
later, nearer one, which softens the left-to-right sweep. Making arrival order
exact would mean giving each letter a speed proportional to its lift-off
distance so all flight times match. That is a stronger, more deliberate
choreography but less physical, and it would spread cruise speeds ~13x across
letters, which the `wght` axis mapping would amplify into visible weight
differences. Needs eyes on it before committing either way; the swap point is
documented at `staggerDelay()`.

**Docs still missing.** `docs/AI_CONTEXT.md` and `docs/HANDOFF.md` are named in
CLAUDE.md but do not exist in this repo. Not created here — flagged as its own
task rather than silently scaffolded.

Also added `test-results/` and `playwright-report/` to `.gitignore`. The
2026-06-30 checkpoint recorded them as already ignored; they were not.

Commit: 1ac0cd1

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

## 2026-06-30

### Deploy config + window resize handler
**netlify.toml**: `npm run build` → `dist/`, Node 20. No redirects needed (single static page, no SPA routing).

**Resize handler** (`main.ts`): debounced at 200ms. Guard: skips if any letter is not static (in-flight scatter would give wrong rects since `getBoundingClientRect` includes the CSS translate offset). At rest: clears all transforms (write), reads all rects in one pass (read), restores nothing (transforms were '' anyway at rest), updates `homeX/homeY/width/height` on each PhysicsLetter, calls `setPosition` to move the static body, then `resetBounds` to rebuild floor + walls for new viewport size.

**`resetBounds`** added to `physics.ts`: filters `Composite.allBodies` by label (floor/wall-left/wall-right), removes them, re-adds with current `window.innerWidth/Height`.

tsc clean, 38 tests passing.

### Phase 2 — Composition 3 haiku locked
"the word shakes itself / apart into its letters / and back into form" (5/7/5). Added `src/compositions.ts` with typed `Composition[]` array — composition 1 ("motion creates form") and composition 3 (haiku) are in. Compositions 2 and 4 are TBD placeholders. Phase 3 will wire up the cycling and multi-line haiku layout.

### Phase 2 — opsz range expanded to 9–72
Expanded opsz spin end from 36 to 9 (Fraunces minimum). Rest stays at 72 (VQT #1 approved). At max angular velocity letters now hit full optical-size minimum — assessed in browser, reads as intentional morph. Named constants `OPSZ_REST` and `OPSZ_SPIN` added to renderer.ts for easy future tuning.

## 2026-06-29

### fix(attractor): per-letter landing replaces global allAsleep snap
Previous approach: waited for ALL 17 letters to be within 5px simultaneously, then called `deactivate()` which snapped every letter to home. Slower orbiters dragged the system to tick 600, causing a visible teleport of the whole group.

New approach: each letter snaps to home the moment it individually crosses 5px (`settleLetter(l)` sets it static, clears sensor/transform). `deactivate()` is called when the last active letter lands (`remainingActive === 0`), or at tick 600 as a failsafe for any genuinely stuck letters. The failsafe now only snaps outliers, not all 17.

Also retained `forceMag *= body.mass` from the previous fix so heavy letters converge at the same rate. All 38 unit tests pass.

### Phase 2 — Exponential axis curve (easeOut, exponent=0.45)
Replaced linear `t` with `easeOut(t) = Math.pow(t, 0.45)` for all three variable font axes in `renderer.ts`. Effect: at 10% of MAX_SPEED, wght is already ~33% of the way to Black (vs 10% linear); at 50% speed, wght sits at ~73% (vs 50%). Letters that merely flinch already look noticeably bolder — the morph reads at subtle interaction levels. Angular velocity → opsz gets the same easing.

Updated threshold skip test (`renderer.test.ts`): switched from a linear-speed-derived "wght≈301" setup to `prevWeight=899 + MAX_SPEED → wght=900 → diff=1 → skip`, which is curve-agnostic.

All 38 unit tests pass.

### T11 — Dev-mode frame time logger
- `renderer.ts`: DEV-gated branch in `startRenderer` wraps `syncDOM` with `performance.now()` timing
- 60-slot `Float64Array` circular buffer; rolling avg logged every 60 frames via `frameCount % 60`
- `console.warn` with "exceeds 4ms budget" suffix when avg > 4ms; `console.log` otherwise
- Prod path unchanged — single `Events.on` with no overhead
- `vite.config.ts`: added `exclude: ['tests/e2e/**']` so Vitest no longer picks up Playwright specs
- tsc clean; 38 unit tests + 3 E2E tests all passing
