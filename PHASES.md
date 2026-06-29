# Kinotype — PHASES

## Decision Log (from /plan-eng-review, 2026-06-27)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Font | **Fraunces** | Has wght + opsz + SOFT + WONK. SOFT axis (roundness) maps to velocity better than wdth |
| Primary axis | wght **300→900** | Velocity → letter weight. Rest at wght=300 (Light) — poster-quality at rest, full scatter contrast |
| Secondary axis | SOFT 100→0 (inverted) | Fast = sharp/tense, settled = soft/round. Rest at SOFT=100 (max roundness) |
| Tertiary axis | opsz 36→72 (narrow) | Angular velocity → optical size, narrow range to avoid legibility artifact look. Rest at opsz=72 |
| Rest state axes | wght=300, SOFT=100, opsz=72 | Zero-velocity resting values. wght=300 chosen over 100 for poster-quality resting state (design review) |
| Font style | **Upright** (font-style: normal) | Composed, authoritative at rest. Italic reserved for future states |
| Line-height | 1.05 | Tight single-line display — avoids browser default 1.2 gap at large display sizes |
| Load behavior | **Hang on load, physics awakens on first interaction** | Letters start at home positions (static). Physics runner starts on first mousemove or click. Matches "hanging in space" concept |
| Font loading UX | **Hide then fade-in** | `opacity: 0` until `document.fonts.ready`, then `opacity: 1` with 150ms ease-in. No layout shift |
| Hover radius | **80px** | Precise flinch — only nearby letters react. Matches "slight lean, like grass in wind" — not "fleeing" |
| Mass model | Bounding box area | `clamp(w * h * density, MIN_MASS, MAX_MASS)`, MAX/MIN ≤ 5.0 |
| DOM coord system | Relative-to-home | `translate(body.x - homeX, body.y - homeY) rotate(angle)`, `transform-origin: center` |
| Attractor force | `F = clamp(k / (d + ε), 0, F_max)` | Weak far (gentle drift), strong close (snap home) — non-linear |
| Gravity in reassembly | Disabled | `engine.gravity.y = 0` when attractor fires; restored when bodies sleep |
| frictionAir phases | 0.02 (scatter) → 0.005 (return) | Low air resistance during return allows orbiting to emerge naturally |
| Module structure | Flat `src/` | main.ts coordinator + decompose / physics / renderer / attractor / input / types |
| Tests | Vitest + Playwright | Unit: pure functions. E2E: resting state screenshot + mid-flight additive velocity |
| Render batching | Reads before writes | All physics state reads before any DOM writes; skip font write if Δwght < 2 |
| Poster design order | After span wrapping | Span-wrapped version IS the canonical resting state |
| Font load guard | `await document.fonts.ready` | All decompose/measure happens inside this await; fail fast if font 404 |
| opsz rationale note | Narrow range (36–72) | Full range (9–144) risks looking like legibility glitch rather than intentional morph |
| CSS variables | `--bg`, `--fg`, `--accent` | Defined in T1 scaffold; all color usage references these properties |
| Cursor behavior | `cursor: default` on phrase | Preserves "not obviously interactive" quality — hover-flinch is the discovery signal |
| Minimum viewport | 768px+ for Phase 1 | Mobile explicitly deferred to Phase 4 — no responsive layout below 768px |

---

## Phase 1 — Physics Foundation
**Goal:** A working physics demo where letters scatter, return, and interact physically. No variable font coupling yet. Must pass Visual Quality Targets #1 and #3 before declaring done.

### Setup
- [x] **T1 (P1, human: ~2h / CC: ~10min)** — scaffold — Vite + TS project scaffold with flat src/ module structure
  - Files: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/types.ts`, `src/main.ts`
  - `index.html` body: `<main id="stage"><p id="phrase">motion creates form</p></main>` + `<canvas id="trail-canvas"></canvas>`
  - CSS custom properties in `src/style.css`: `--bg: #F7F4EE; --fg: #1A1A1A; --accent: #C0392B;`
  - Layout: `body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: var(--bg); cursor: default; }`
  - `#trail-canvas`: `position: fixed; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: -1;`
  - Verify: `npm run dev` serves the page with no errors

- [x] **T2 (P1, human: ~3h / CC: ~15min)** — decompose — Letter span wrapping + `document.fonts.ready` guard
  - `src/decompose.ts`: wrap each non-space character in `<span aria-hidden="true">`, return `HomePosition[]`
  - Container (`#phrase`): add `aria-label="motion creates form"` and `role="text"` so screen readers read the full phrase
  - Start with `#phrase { opacity: 0; }` in CSS; after `document.fonts.ready` resolves, set `opacity: 1` with 150ms ease-in transition
  - Must `await document.fonts.ready` before any `getBoundingClientRect()` call
  - Font load failure → `console.error` + display user-visible message in the container; do NOT proceed with wrong metrics
  - Verify: each span has correct width/height/centerX/centerY logged to console; phrase fades in on load

- [x] **T3 (P1, human: ~1h / CC: ~10min)** — poster — Resting state poster design
  - Runs AFTER span decomposition is applied (span-wrapped version is canonical)
  - Typography: Fraunces, `font-style: normal` (upright), `font-size: clamp(48px, 8vw, 96px)`, `letter-spacing: -0.02em`, `line-height: 1.05`
  - Rest-state variable font axes: `font-variation-settings: 'wght' 300, 'SOFT' 100, 'opsz' 72`
  - Colors: `color: var(--fg)` (#1A1A1A) on `background: var(--bg)` (#F7F4EE). Accent (#C0392B) unused in Phase 1 — deferred to Phase 3 (impact flashes)
  - Layout: phrase horizontally and vertically centered in 100vh viewport (CSS flex, set in T1)
  - `cursor: default` on all elements — no pointer cursor anywhere
  - Physics world bounds: `window.innerWidth × window.innerHeight` — walls and floor align with viewport edges
  - Minimum viewport support: 768px+ (mobile deferred to Phase 4)
  - Screenshot must look like a professional typographic poster with zero interaction
  - Visual Quality Target #1 gate: do NOT proceed to physics until this screenshot is approved

### Core Physics
- [x] **T4 (P1, human: ~2h / CC: ~15min)** — physics — Matter.js engine + letter bodies
  - `src/physics.ts`: `createEngine()`, `createBodies(homes: HomePosition[])`
  - Body params: `restitution: 0.3`, `friction: 0.1`, `frictionAir: 0.02`, `gravity.y: 1`
  - Mass: `clamp(width * height * DENSITY_CONSTANT, MIN_MASS, MAX_MASS)` — MAX/MIN ≤ 5.0
  - Body position: center at `(homeX, homeY)`
  - Letters collide with each other AND the floor/wall bounds

- [x] **T5 (P1, human: ~3h / CC: ~20min)** — renderer — RAF render loop (DOM sync)
  - `src/renderer.ts`: `Matter.Events.on(engine, 'afterUpdate', syncDOM)`
  - All physics reads BEFORE all DOM writes (no interleaved getBoundingClientRect)
  - Transform: `translate(body.x - homeX, body.y - homeY) rotate(body.angle)`, `transform-origin: center`
  - CSS on each letter span: `will-change: transform, font-variation-settings`
  - Physics runner (`Matter.Runner`) does NOT start on page load — starts on first user interaction (mousemove or click in `src/input.ts`)
  - Physics world bounds: floor at `window.innerHeight`, walls at 0 and `window.innerWidth`
  - Verify: on page load, letters hang at home positions (no physics). On first mousemove/click, physics awakens and letters react

- [x] **T6 (P1, human: ~1h / CC: ~10min)** — input — Mouse repulsion + click impulse
  - `src/input.ts`: `mousemove` → repulsion force within **80px radius** (precise flinch — nearby letters only); `click` → radial impulse
  - First `mousemove` or `click` starts the physics runner (`Matter.Runner.run`)
  - Both events reset the idle timer
  - Verify: hover causes letter lean within ~80px only; click causes scatter; second click mid-flight ADDS velocity

### Return Mechanic
- [x] **T7 (P1, human: ~3h / CC: ~20min)** — attractor — Non-linear home attractor + phase transitions
  - `src/attractor.ts`: activate after 3s idle
  - On activate: `engine.gravity.y = 0`; set `frictionAir = 0.005` on all bodies
  - Force per body per tick: `F = clamp(k / (dist + EPSILON), 0, F_MAX)` toward home
  - Direction: normalized vector from `body.position` to `homePosition`
  - On all bodies sleeping: `engine.gravity.y = 1`; restore `frictionAir = 0.02`; detach listener
  - Tuning constants: `k`, `EPSILON`, `F_MAX` as named exports — empirical tuning expected
  - Verify: letters orbit and spiral home (not straight-line return); overshoot-and-settle visible

### Variable Font Coupling (moved from Phase 2 into Phase 1 foundation)
- [x] **T8 (P1, human: ~2h / CC: ~15min)** — varfont — Three-axis Fraunces mapping in renderer
  - Add to `syncDOM` in `renderer.ts` AFTER batched transform writes
  - `speed = √(vx² + vy²)`, `angularSpeed = |angularVelocity|`
  - `wght = lerp(300, 900, clamp(speed / MAX_SPEED, 0, 1))` — rest at 300 (Light), max at 900 (Black)
  - `SOFT = lerp(100, 0, clamp(speed / MAX_SPEED, 0, 1))` — inverted, sharp at speed; rest at 100 (max round)
  - `opsz = lerp(72, 36, clamp(angularSpeed / MAX_ANGULAR, 0, 1))` — narrow range only; rest at 72
  - Skip write if `|newWght - prevWght| < 2` (avoid pointless micro-updates)
  - Verify: letters visibly change weight on scatter; return to wght=300 SOFT=100 opsz=72 on reassembly

### Tests
- [x] **T9 (P2, human: ~2h / CC: ~20min)** — tests-unit — Vitest unit tests
  - `tests/attractor.test.ts`: `F(d=500) < 0.001`, `F(d=10) > 0.1`, direction points toward home
  - `tests/physics.test.ts`: mass within MIN/MAX bounds, MAX/MIN ≤ 5.0
  - `tests/renderer.test.ts`: at home → `translate(0,0) rotate(0)`; at rest → wght=300, SOFT=100, opsz=72; max speed → wght=900, SOFT=0

- [x] **T10 (P2, human: ~3h / CC: ~25min)** — tests-e2e — Playwright E2E tests
  - Resting state screenshot regression (approved poster is the baseline)
  - Mid-flight additive velocity: click, wait 200ms, click again → `body.velocity.magnitude` at 2nd click > magnitude just before 2nd click
  - Idle return: click, wait 4s, verify all bodies within 2px of home position

- [ ] **T11 (P2, human: ~1h / CC: ~10min)** — profiling — Dev-mode frame time logger
  - In `renderer.ts` (guarded by `import.meta.env.DEV`)
  - `performance.mark()` per tick; log rolling avg every 60 frames
  - `console.warn` if avg frame time > 4ms (indicates fontVariationSettings budget exceeded)
  - **Profiling gate:** avg frame time < 4ms on mid-tier hardware before Phase 2 begins

---

## Phase 2 — Variable Font Coupling (Weeks 5–8)
_Start only after Phase 1 profiling gate passes._

- [ ] Tune axis mapping curves (exponential, not linear per spec requirement)
- [ ] Resting state: letterforms return to default axis values as velocity → 0
- [ ] Assess opsz range — expand from 36–72 if it looks intentional, not broken
- [ ] Write composition 3 haiku (original, thematic: making / motion / form)

---

## Phase 3 — Polish Details (Weeks 9–14)
_Visual Quality Targets #2, #3, #4, #5 all land here._

- [ ] Letter trails: canvas layer, DPR-scaled, fade via low-opacity fill (not clear)
- [ ] Impact flashes: single-frame accent color at boundary collision points
- [ ] Collision tuning: jitter prevention, sleep threshold
- [ ] Reassembly choreography: 8–12 second return, worth watching in isolation
- [ ] Compositions 1–4, cycle on reload
- [ ] All 3 colorways, day-of-week assignment

---

## Phase 4 — Mobile and Accessibility (Weeks 15–20)

- [ ] Touch: tap to scatter; no hover (cursor-only)
- [ ] Reduced letter count on mobile
- [ ] Reduced motion: no physics, slow axis interpolation only
- [ ] Keyboard: Tab + Space to scatter focused letter

---

## Phase 5 — Depth (Months 5+)

- [ ] SVG shatter: opentype.js glyph outline tracing, double-click trigger
- [ ] Constraint springs: words hold together before scattering
- [ ] GIF export: 3-second scatter + early reassembly
- [ ] Custom composition: user-typed phrase

---

## TODO Backlog

- [ ] **Deploy config**: `netlify.toml` or `vercel.json` with Vite build output. Blocked by: Phase 1 complete.
- [ ] **Window resize handler**: re-run `decompose()`, update `homeX/homeY`, move bodies to new positions. Blocked by: attractor complete (T7).
- [ ] **Dev frame time logger**: see T11 — tracked as a Phase 1 sub-task.
- [ ] **`@media (prefers-reduced-motion)` handler**: Known Phase 1 gap. Currently letters scatter/physics-animate for all users regardless of OS reduced-motion setting. Fix: detect preference on init; if set, skip runner start entirely (letters stay static; only CSS axis interpolation at rest). Implement in Phase 4 with full accessibility pass.
- [ ] **OpenAI API key for gstack designer**: Design review used HTML mockup fallback because the gstack designer binary requires an OpenAI key (`OPENAI_API_KEY`). Set up key to unlock visual mockup generation for future design passes.

---

## Visual Quality Gate Checklist (before Phase 1 → Phase 2)

- [ ] VQT #1: Resting state screenshot looks like a typographic poster _(poster design task, T3)_
- [ ] VQT #3: Letters collide without jitter _(tuning during T4/T5)_
- [ ] Profiling gate: avg frame time < 4ms at 60fps _(T11)_
- [ ] Mid-flight additive velocity test passes _(T10 Playwright)_
- [ ] Font load failure shows user-visible message _(T2)_

VQT #2 (subtle at low speed, dramatic at high), #4 (reassembly worth watching), #5 (no flicker trails) deferred to Phase 3.

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Outside Voice | `/plan-eng-review` | Independent 2nd opinion (Claude subagent) | 1 | issues_found | 8 findings, all addressed in plan |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 13 issues, 0 critical gaps unresolved |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAR | score: 5/10 → 9/10, 8 decisions made |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

**VERDICT:** ENG CLEARED + DESIGN CLEARED — ready to implement.

NO UNRESOLVED DECISIONS
