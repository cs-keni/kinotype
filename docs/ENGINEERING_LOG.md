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
task rather than silently scaffolded. *(Resolved later the same day; see the
"Missing handoff docs" entry below.)*

Also added `test-results/` and `playwright-report/` to `.gitignore`. The
2026-06-30 checkpoint recorded them as already ignored; they were not.

Commit: 1ac0cd1

### Phase 3 — Colorways and compositions

**`src/colorways.ts`** (new). Paper / Night / Blueprint at the exact spec hex
values, applied as `--bg` / `--fg` / `--accent` on `document.documentElement`
before `decompose()` runs — set them after and the first painted frame flashes
the stylesheet default.

Assignment is `getDay() % 3`. Note the consequence, since it is a real design
choice and not an accident: a given weekday is pinned to one palette forever
(Monday is always Night). The spec says "deterministic from the day of the
week", and all three palettes appear across any 7 days with no two adjacent days
repeating. If a weekday should instead rotate across weeks, switch the input to
days-since-epoch; the test at `tests/colorways.test.ts` documents the current
guarantee explicitly so the swap is a deliberate act.

**`src/compositions.ts`** (rewritten). Every composition is now `lines:
string[]`, so a single-line phrase is a one-element array and the haiku stops
being a special case. That collapses `decompose()` to one code path for both.
Added composition 2 (`build things that move`) and composition 4 (`VELOCITY`, 8
letters at display size per spec).

Rotation is a `localStorage` counter rather than `Math.random()` — random
repeats often enough that a returning visitor reads it as broken. Storage access
is wrapped: private browsing throws on access, and a decorative rotation is not
worth failing page load over, so it degrades to composition 1.

**`src/decompose.ts`**. Builds the letter DOM from a composition instead of
reading `textContent`. Structure is `line > glyph`; spaces stay text nodes and
get no body. Switched the container from `role="text"` (Safari-only, not a real
ARIA role) to `role="img"` with the full phrase as `aria-label` — screen readers
get the sentence, the per-letter spans stay `aria-hidden`.

**URL overrides.** `?composition=<id>` and `?colorway=<id>` pin both. This was
forced by testing: with a rotating composition and a weekday palette, the
resting-state screenshot baseline is a coin flip across 12 combinations. Both
fall back to the rotation on an unknown id rather than erroring. A pin does not
consume a rotation step, so pinning does not perturb the cycle for the next
real visit.

**Verified** the DOM restructure is visually benign: the existing
`resting-state.png` baseline still matches unchanged after adding the `.line`
wrapper and `text-align: center`.

Tests 56 → 94 unit, 4 → 9 E2E. New E2E covers three-line haiku stacking,
display-size sizing, on-screen bounds at display size, and that a colorway
reaches painted pixels rather than only the CSS variables.

Commit: 6b9b0ff

### Phase 3 — Letter trails and impact flashes

**`src/effects.ts`** (new). Trails and impact flashes share one canvas beneath
the DOM letters, because both are "paint a mark, let it decay" and sharing the
fade loop means one full-screen fill per frame instead of two.

**VQT #5 compliance.** The backing store is sized at `devicePixelRatio` and the
canvas is faded by drawing a low-opacity background-coloured fill over itself.
Clear-and-redraw is the documented flicker bug on high-DPI displays. `FADE_ALPHA
= 0.15` decays a mark to 5% in ~18 frames (~300ms), inside the spec's 200–400ms
window — there is a unit test that computes this from the constant rather than
trusting the comment.

**No trails during reassembly, for free.** Rather than special-casing the return,
both effects gate on speed: `TRAIL_MIN_SPEED = 3` and `FLASH_MIN_SPEED = 4` both
sit above the attractor's `MAX_RETURN_SPEED = 2.4`. The return is simply too slow
to leave marks. Tests assert the ordering between those constants directly, so
retuning the attractor faster fails the test instead of silently reintroducing
trails during reassembly.

This also solves a subtler problem: letters are sensors during the return and
pass through the floor and walls, and Matter still fires `collisionStart` for
sensors. Without the speed gate the phrase would strobe accent flashes on its
way home.

**Resting cost is zero.** A `remainingFadeFrames` countdown resets whenever a
mark lands and decrements otherwise; at zero the canvas is wiped once and the
loop stops painting entirely. The piece sits at rest most of the time, so
skipping the full-viewport fill there matters. Getting this right required
separating "faded this frame" from "drew a mark this frame" — counting the fade
as painting resets the countdown every frame and the loop never goes quiet.

**Measured** in-browser at 0.008–0.053ms per frame, against syncDOM's 0.070ms
and a 4ms budget. Added a dev-mode frame timer mirroring the renderer's, warning
above 2ms, since a full-viewport fill is the obvious candidate for eating the
budget on a high-DPI display.

Flash radius is 3px, not the spec's literal "one pixel-wide point". A 1px dot is
invisible at DPR 2; 3px is the smallest that still reads as a point rather than
a particle.

Effects degrade to a no-op handle when the 2D context is unavailable, so the
piece works with canvas disabled.

Tests 94 → 112 unit, 9 → 12 E2E. Canvas drawing cannot be unit-tested under
jsdom, so the pure gating logic is exported and tested directly while E2E
verifies real pixels: DPR-scaled backing store, trails appearing on scatter,
canvas blank once the phrase reforms, and accent-coloured pixels from real
boundary impacts. Ran the E2E suite three times to confirm the pixel assertions
are not flaky.

Commit: 2ac939a

### Phase 3 — Collision tuning and sleeping

Went looking for the resting jitter this task assumes and did not find any.
Measured a 44-letter pile stacked four deep on the floor, let it fully settle,
then summed positional drift over the following second: **0.000px, with and
without sleeping**. VQT #3 passes on Matter's solver stability alone. There is
no twitch to prevent, and any change sold as a jitter fix here would be fiction.

Enabled `engine.enableSleeping` regardless, for a reason that does hold up:
idle cost. `Matter.Runner` loops forever once the first interaction starts it,
and the piece spends nearly all its life at rest. Simulating that rested pile
costs **0.0305ms/tick awake against 0.0073ms/tick asleep**, a 4.2x saving that a
backgrounded tab keeps collecting. Kept Matter's default 60-frame threshold:
sleeping sooner risks freezing a letter that is still genuinely drifting, since
the motion metric is also low for slow steady movement.

The sharp edge is that `Matter.Body.applyForce` does **not** wake a sleeping
body. A letter that dozed off on the floor would silently ignore the cursor, and
worse, ignore the attractor — the return fires after 3s of idle, which is longer
than the 1s sleep threshold, so by then most of the phrase is asleep. Every
letter would have been dragged home by the `MAX_TICKS` failsafe instead of
flying. Both `wakeBodies()` and `activateAttractor()` now clear the sleep flag,
with a unit test that puts a letter to sleep and asserts it still flies home.

Tests 112 → 116 unit.

Commit: c5a1ea4

### Phase 4 — Touch, keyboard, reduced motion, mobile

**Touch.** Migrated `input.ts` from mouse events to pointer events. `pointerdown`
handles click and tap on one path, which also removes the double-fire a mouse
produced across `pointerdown` and `click`. Hover repulsion is gated to
`pointerType === 'mouse'`: a finger has no hover state, and running repulsion on
touchmove makes letters flee the finger trying to hit them. Added `touch-action:
none` so a tap-drag does not pan the page while the physics it just started
is still running.

**Keyboard — deliberate deviation from the spec.** The spec asks for "Tab to
focus a letter, Space to scatter that letter". Implemented literally that is
50+ tab stops on spans that are `aria-hidden`, which is two accessibility
problems at once: focusable elements hidden from assistive tech are a known
antipattern, and tabbing 50 times to cross one phrase is hostile. Built the
standard equivalent instead — roving tabindex, the pattern a toolbar uses. One
tab stop on the phrase, arrows rove the selection, Space scatters, Escape
clears, Home/End jump. Same capability, one stop in the tab order, and the
`role="img"` label still carries the full sentence. A visually-hidden
`aria-describedby` hint states the controls, which are otherwise
undiscoverable.

Space with nothing selected scatters the whole phrase; with a letter selected it
scatters that one. Either way it wakes every body, exactly as a click does — the
impulse is what is targeted, not the waking. Worth knowing when reading the E2E:
"did letters move" cannot isolate a single-letter scatter, because gravity drops
the whole phrase the moment anything wakes. The test uses horizontal
displacement instead, since gravity is purely vertical.

**Bug found while testing the keyboard path.** `applyImpulse` guarded its
normalisation with `|| 1`, which prevents a divide-by-zero but produces a
*zero-magnitude* force — so a letter sitting exactly on the impulse origin
silently ignored the impulse entirely. Rare for a tap, but routine for a
keyboard scatter, whose origin is the phrase centroid and therefore often sits
on top of a middle letter. Now falls back to a straight-up direction. This fixes
clicking precisely on a letter's centre too, which had the same dead spot.

**Reduced motion** is a hard gate rather than a softening: no runner, no input,
no keyboard, no canvas. The piece stays the poster it loads as. The only motion
is CSS, a 600ms `font-variation-settings` ease on hover, which is exactly the
"slow axis interpolation only" the spec permits. Content is not degraded — the
`role="img"` label still carries the phrase. This closes the known Phase 1 gap
tracked in the TODO backlog.

**Mobile letter count.** Under 768px the composition pool is trimmed to ≤20
letters, so a narrow screen never draws the three-line haiku.

Tests 116 → 142 unit, 12 → 18 E2E. New E2E drives real touch (`hasTouch`
context), real keyboard, a `reducedMotion: 'reduce'` context asserting zero
movement and an unpainted canvas, and a 480px viewport asserting the shorter
composition.

One flake worth recording: a single E2E run died with `SIGTRAP` inside V8's
optimizing compiler thread in the Playwright *worker* process, not the browser.
Did not reproduce across five subsequent full runs. Treated as a Node JIT crash
unrelated to this code; noted here in case it recurs.

Commit: 9eaa89a

### Missing handoff docs created

`docs/AI_CONTEXT.md` and `docs/HANDOFF.md` are both named in CLAUDE.md as
required reading at the start of every session, and neither had ever existed.
Flagged twice today before writing them, since scaffolding two architecture docs
is a scope decision rather than a side effect of a code change.

`AI_CONTEXT.md` documents the module map, boot order (which is order-dependent —
the colorway must be applied before anything paints), the render pipeline, and
specifically the **load-bearing decisions**: the ones where the obvious change
breaks something non-obvious. Four of those have already bitten during this
session's work: the one-attractor-per-engine WeakMap, `applyForce` not waking
sleeping bodies, effect thresholds needing to stay above `MAX_RETURN_SPEED`, and
fading the canvas by filling rather than clearing.

`HANDOFF.md` records project state, component ownership, the three separate
animation systems and how they hand off to each other, the tuning knobs in the
order someone will want them, and the honest blocker: nobody has watched the
reassembly yet.

Commit: (pending)

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
