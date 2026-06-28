# Kinotype — Physics-Driven Variable Type

## Concept

Kinotype is a single-page experience built entirely out of type that behaves
like physical matter. Every letter has mass, friction, and restitution. The
page opens with a short phrase hanging in space. Hover over it and the letters
flinch. Click and they scatter — heavy letters fall hard and bounce once, light
letters drift and spin. When you stop touching them, they drift back, slowly,
orbiting their home positions before settling.

The defining mechanic: **letter velocity drives variable font axes in real
time.** A letter moving fast gets heavier — the weight axis increases, the
stroke thickens. A letter decelerating narrows back to its resting weight. The
typeface morphs as the physics resolve. When you release a cluster of letters
and they fall, each one is briefly a different weight from the others because
each has a different speed. As they settle, they converge back to the same
weight together. It looks like the word is breathing.

The content is deliberately short — one phrase, one short poem, a handful of
words. Less text means more visual impact per letter.

---

## The 10-Second Test

The page loads to a white field. Center of screen, one line:

**`motion creates form`**

Rendered in a variable weight serif at optical size, letter-spacing tight,
completely still. Elegant. Not obviously interactive.

The user moves their cursor across the phrase. The letters lean away from the
cursor — not fleeing, just a slight lean, like grass in wind. The weight axis
nudges slightly heavier as each letter reacts. Each letter independent from
the next, so the phrase ripples.

They click. The letters explode outward, each on its own trajectory, each a
different weight in flight. The word is unreadable for a moment. Then the
drift back begins — slow, orbiting, one letter snapping into place at a time.
When the last letter settles, it's heavier than resting weight for one frame,
then relaxes to rest. A small bounce.

They read the phrase again. They click again. That is the goal.

---

## Design Language

**Overall register:** Restrained precision with explosive release. The resting
state is gallery-quality typographic design — the kind of thing you'd see as
an art director's opening title card. The active state is controlled chaos. The
contrast between the two is what makes the experience compelling.

**Typography:** One variable font for the entire experience. The font is
everything here — it carries all the visual weight. Selection criteria:

- Must have a weight axis with significant range (Thin to ExtraBold minimum)
- Must have a width or optical size axis (for the secondary movement dimension)
- Must be beautiful at both extremes of the weight axis
- Must be a typeface that has serious typographic credibility

Strong candidates: **Fraunces** (variable weight + optical + softness axes,
distinctive personality), **Playfair Display Variable** (classic, strong at
heavy weights), **Recursive** (weight + casual axes, works in mono mode).

Final font choice is locked before Phase 1 begins. This is a design decision,
not a technical one, and it shapes everything else.

**Color system:** Near-monochrome. One background, one type color, one accent
for interactive state.

Three colorways:
- **Default (Paper):** `#F7F4EE` background, `#1A1A1A` type, `#C0392B` accent
  on hover/impact state
- **Night:** `#0D0D0D` background, `#F2EDD7` type, `#00E5FF` accent
- **Blueprint:** `#1B3A5F` background, `#FFFFFF` type, `#FFD700` accent

Colorway changes on each page load — deterministic from the day of the week,
so the same user on the same day sees the same colorway, but it shifts across
the week.

**Letter trails:** As letters move, they leave a faint trail — a low-opacity
smear in the direction of motion, rendered on a canvas layer beneath the DOM.
The trail decays in 200–400ms. It's a single pixel wide, the same color as
the type. Fast-moving letters leave long trails; slow letters leave none.
This makes the physics visible and satisfying.

**Impact flashes:** When a letter hits the boundary (floor, walls) and bounces,
the impact point flashes a single frame of the accent color. Not a particle
effect — one frame, one pixel-wide point flash, then gone. Subtle. Rewards
attention.

---

## What Makes It Unrecognizable

**From SplitText + physics demos:** Those split the text and apply CSS
transforms. The letters don't have physics — they follow eased paths. There
is no concept of mass, inertia, or coefficient of restitution. They snap and
bounce on a schedule, not in response to forces. Kinotype has a real physics
engine. Every collision is computed.

**From other interactive typography experiments:** Nobody has coupled variable
font axes to physics state in real time. The weight-follows-velocity mechanic
does not exist anywhere in production. This is the innovation. Everything else
is supporting infrastructure.

**The specific detail that proves it:** Play with Kinotype for 30 seconds, then
play with any CSS split-text animation. In Kinotype, if you click a letter that
is in mid-air from a previous interaction, the new force adds to its existing
velocity — it doesn't reset. In a CSS animation, it resets. The physics is real.

---

## Technical Stack

| Layer | Technology | Reason |
|-------|------------|--------|
| Physics engine | Matter.js | Best documented 2D rigid body for JS; handles compound bodies, constraints, events |
| Letter measurement | DOM + `getBoundingClientRect()` | Measure each glyph's rendered position and size to place physics bodies |
| DOM rendering | CSS `transform: translate() rotate()` | Letters stay as DOM elements for crisp subpixel text rendering |
| Variable font control | CSS `font-variation-settings` via custom properties | Animated by direct property mutation in the physics update loop |
| Trail rendering | HTML5 Canvas 2D (below DOM layer) | DOM trails would be too expensive; canvas is cheap per pixel |
| Physics-to-font coupling | Custom mapping function in the update loop | Velocity magnitude → weight axis value, angular velocity → width/slant axis |
| Framework | Vite + vanilla TS | No abstraction over the DOM; direct manipulation in the update tick |

**Physics body architecture:**
Each letter is a rectangle physics body, sized to the letter's bounding box.
The body has:
- `mass`: proportional to the letter's visual weight (heavier font weight at
  rest = more mass). A capital M has more mass than a lowercase i.
- `restitution`: 0.3 (moderate bounce — not super-bouncy, not dead)
- `friction`: 0.1 (letters slide when they hit the floor)
- `frictionAir`: 0.02 (air resistance — letters don't drift forever)

Home position attractor: a custom Matter.js force applied each tick,
proportional to the distance from the letter's original position. The
attractor is weak at long distances (doesn't feel like a rubber band)
and stronger at short distances (snaps into final position with a
small overshoot-and-settle). The spring constant is tuned empirically.

**Variable font update loop:**
```ts
Matter.Events.on(engine, 'afterUpdate', () => {
  letters.forEach((letter) => {
    const speed = Matter.Vector.magnitude(letter.body.velocity)
    const angularSpeed = Math.abs(letter.body.angularVelocity)

    // Weight axis: 100 at rest → 900 at max speed (capped)
    const weight = lerp(100, 900, clamp(speed / MAX_SPEED, 0, 1))

    // Width axis: narrow when fast, wide when settled
    const width = lerp(75, 125, 1 - clamp(speed / MAX_SPEED, 0, 1))

    letter.element.style.fontVariationSettings =
      `"wght" ${weight}, "wdth" ${width}`

    // Sync DOM position to physics body
    const { x, y } = letter.body.position
    const angle = letter.body.angle
    letter.element.style.transform =
      `translate(${x}px, ${y}px) rotate(${angle}rad)`
  })
})
```

This runs every physics tick (60fps). The variable font update is the
performance-critical path — CSS property mutation on 50+ elements per frame
needs to stay cheap. Profile this early.

---

## Visual Quality Targets

1. **The resting state must be beautiful with no interaction.** Take a screenshot
   of Kinotype with no cursor present. That image should look like a professional
   typographic poster. If it doesn't, the font choice, sizing, spacing, or
   colorway is wrong. Fix it before building the physics.

2. **The weight-follows-velocity must be subtle at low speeds and dramatic at
   high speeds.** At normal hover-speed interaction, the weight change should
   be almost imperceptible — a slight thickening. At full scatter-speed (after
   a hard click), letters should be noticeably heavier than their resting state.
   The curve is exponential, not linear.

3. **Letters must collide with each other, not pass through.** This is enabled
   in Matter.js by default but needs tuning — the collision detection for many
   small bodies can produce jitter. If letters stack and jitter against each
   other, the scene is disturbing rather than beautiful. Tune damping and
   sleep threshold to prevent jitter.

4. **The reassembly must be worth watching.** Scatter is 1 second. Reassembly
   takes 8–12 seconds. During that time, letters orbit, drift, circle, and
   gradually reduce their radius until they snap home. The reassembly is not
   just the reverse of the scatter — it has its own choreography driven by the
   attractor spring. Test this in isolation. If you don't want to watch it
   complete, it needs more tuning.

5. **Letter trails must not flicker.** Canvas trails that flicker on high-DPI
   displays are a common mistake. Draw to the canvas at `devicePixelRatio`
   scale. Fade the trail by drawing a low-opacity black fill over the entire
   canvas each frame — not by clearing and redrawing (clearing causes flicker).

---

## Content — The Phrases

The text matters. These are the compositions Kinotype ships with:

**Composition 1 (default):** `motion creates form`
— Statement about the project itself. Short enough that each word can scatter
   as a unit. Three words, three physics clusters.

**Composition 2:** `build things that move`
— Personal. Four words. Slightly longer arc when scattered.

**Composition 3:** A short haiku (3 lines, 5-7-5 syllables).
— The multi-line layout is a different physics challenge (letters from
   different lines interact). Choose the haiku in Phase 2 once the single-line
   physics is solid. It should feel earned, not decorative.

**Composition 4:** A single word in a large display size.
— `VELOCITY` or `WEIGHT` or `FORM`. 8 letters at display size (96px+).
   Each letter massive. The physics feel heavy and slow. Contrast with the
   lighter compositions.

Compositions cycle on page reload. The user sees a different composition each
visit.

---

## Feature Breakdown

### Phase 1 — Physics Foundation (Weeks 1–4)
- [ ] Font selection finalized (design decision, not technical) — **RESOLVED: Fraunces**
- [ ] Letter decomposition: measure each glyph, create Matter.js bodies
- [ ] **Hang on load**: letters are at home positions (static) until first interaction. Physics runner starts on first mousemove or click.
- [ ] Mouse force: pointer repels letters within **80px radius**
- [ ] Click: impulse radiating from click point (also awakens physics if not started)
- [ ] DOM render loop: physics position drives CSS transform
- [ ] Attractor: letters drift home after 3s idle

### Phase 2 — Variable Font Coupling (Weeks 5–8)
- [ ] Variable font axes inventoried for chosen font
- [ ] Velocity → weight axis mapping live in the update loop
- [ ] Secondary axis (width or slant) mapped to angular velocity
- [ ] Tuning: the mapping curves adjusted until the effect feels right
      (subtle at low speed, dramatic at high speed)
- [ ] Resting state: letterforms return to their default axis values as
      velocity approaches zero

### Phase 3 — Polish Details (Weeks 9–14)
- [ ] Letter trails: canvas layer, fading trail on moving letters
- [ ] Impact flashes: single-frame accent color at collision points
- [ ] Collision tuning: letters collide without jitter, stack naturally
- [ ] Reassembly choreography: attractor tuned, the 8–12 second return is
      worth watching
- [ ] Compositions 1–4 implemented, cycle on reload
- [ ] Colorways: all 3 implemented, day-of-week assignment

### Phase 4 — Mobile and Accessibility (Weeks 15–20)
- [ ] Touch: tap to scatter, no hover effect (hover is cursor-only)
- [ ] Reduced letter count on mobile (fewer physics bodies = better performance)
- [ ] Reduced motion: letters move to their resting position directly,
      no scatter, no physics. The variable font breathing (slow axis
      interpolation at rest) remains as the only motion.
- [ ] Keyboard: Tab to focus a letter, Space to apply scatter impulse to
      focused letter. Experience is navigable without cursor.

### Phase 5 — Depth (Months 5+)
- [ ] SVG shatter: import `opentype.js`, trace glyph outlines for one
      composition, triangulate polygons, scatter as rigid-body shards on
      hard impact. This is the "nuclear" interaction — triggered by a specific
      gesture (double-click), not the default behavior.
- [ ] Constraint system: letters in a word connected by invisible springs
      that resist before breaking. The word holds together slightly before
      scattering on click.
- [ ] Export: capture a 3-second GIF of the scatter + early reassembly.
      Download as a shareable artifact.
- [ ] Custom composition: a text input where the user types their own short
      phrase and runs it through the physics. 

---

## Key Design Decisions

1. **The resting state is the primary design artifact.** Not the scatter. A
   beautiful, still typographic composition that then becomes physically alive
   is more impressive than a physics playground that happens to use type.
   Design the still state first. Build the physics second.

2. **One font, one composition at a time.** Don't add multi-font support or
   a font picker. The constraint forces the physics and the typography to be
   perfectly calibrated together. Changing the font would require re-tuning
   the physics parameters.

3. **Weight-follows-velocity is the innovation. Everything else is craft.**
   If something is slow to implement and it's not the variable font coupling,
   it can wait. The mechanic is what gets shared.

4. **Letters collide with each other.** This is not negotiable. Letters
   passing through each other looks wrong and undermines the physical
   reality of the experience.

5. **No instructions, no tooltips.** The hover-flinch behavior at low cursor
   speed is the affordance signal. The user discovers that clicking scatters.
   The first time it happens is a surprise. The surprise is the experience.

---

## Open Questions

- **Font final selection:** ~~Fraunces vs Playfair Display Variable vs Recursive.~~
  **RESOLVED: Fraunces.** Has wght + opsz + SOFT + WONK axes. SOFT axis
  (letterform roundness/sharpness) maps to velocity better than wdth (which
  Playfair lacks entirely). Playfair ruled out — no secondary axis. Recursive
  ruled out — insufficient typographic credibility.
- **Letter mass model:** ~~Proportional to bounding box area (simpler) vs.~~
  ~~proportional to ink coverage estimated from font weight (more accurate but~~
  ~~complex).~~
  **RESOLVED: Bounding box area for Phase 1.**
  `mass = clamp(width * height * DENSITY_CONSTANT, MIN_MASS, MAX_MASS)`
  with MAX_MASS / MIN_MASS ≤ 5.0 to prevent extreme mass spreads between
  thin letters (i, l) and wide letters (M, W). Upgrade to ink coverage in
  Phase 2 if thin letters feel erratic.
- **Composition 3 haiku:** Write it in Phase 2 once the single-line physics
  is done. The haiku should be original and thematically consistent with the
  other phrases (about making, motion, form). Not about nature generically.

---

## Resolved Technical Decisions (from /plan-eng-review, 2026-06-27)

**Variable font axis mapping (Fraunces-specific):**
```ts
const speed = Math.sqrt(vx*vx + vy*vy)
const angularSpeed = Math.abs(body.angularVelocity)

// Rest state: wght=300, SOFT=100, opsz=72 (at zero velocity)
// Scatter state: wght→900, SOFT→0, opsz→36 (at MAX_SPEED / MAX_ANGULAR)
const weight = lerp(300, 900, clamp(speed / MAX_SPEED, 0, 1))  // 300=Light at rest, 900=Black at speed
const soft   = lerp(100, 0,   clamp(speed / MAX_SPEED, 0, 1))  // inverted: 100=round at rest, 0=sharp at speed
const opsz   = lerp(72,  36,  clamp(angularSpeed / MAX_ANGULAR, 0, 1)) // narrow range only

element.style.fontVariationSettings = `"wght" ${weight}, "SOFT" ${soft}, "opsz" ${opsz}`
```
`wdth` is replaced by `SOFT` (Fraunces has no wdth). Rest weight is 300 (Light), not 100 (Thin) — wght=300
gives poster-quality presence at rest while retaining dramatic contrast at scatter (300→900). `opsz` range
deliberately narrow (36–72, not 9–144) — full range reads as legibility glitch, not intentional morph.

**DOM coordinate system:**
```ts
// transform-origin: center center (CSS)
// Home positions captured from getBoundingClientRect() center after span wrapping
letter.element.style.transform =
  `translate(${body.position.x - letter.homeX}px, ${body.position.y - letter.homeY}px) rotate(${body.angle}rad)`
```
At rest, transform is `translate(0,0) rotate(0)` — clean identity state.
Matter.js world coordinates match page coordinates (px from containing element).

**Attractor force function:**
```ts
// Called in Matter.Events.on(engine, 'beforeUpdate')
const dx = letter.homeX - body.position.x
const dy = letter.homeY - body.position.y
const d = Math.sqrt(dx*dx + dy*dy)
if (d < 0.5) return // at home

const F = Math.min(ATTRACTOR_K / (d + ATTRACTOR_EPSILON), ATTRACTOR_F_MAX)
const nx = dx / d, ny = dy / d  // unit vector toward home
Matter.Body.applyForce(body, body.position, { x: nx * F, y: ny * F })
```
Non-linear: weak at long distance (gentle drift), strong at close range
(snap-in with overshoot). Standard springs are the opposite — this is intentional.

**Gravity / attractor phase transitions:**
- **Scatter phase:** `engine.gravity.y = 1`, `frictionAir = 0.02`
- **Return phase (attractor fires after 3s idle):**
  `engine.gravity.y = 0`, `frictionAir = 0.005` on all bodies.
  Low frictionAir allows lateral momentum to persist → orbiting emerges
  naturally from centripetal force + momentum (no separate angular mechanism needed).
- **Settled phase (bodies sleeping):** Restore `engine.gravity.y = 1`,
  `frictionAir = 0.02`.

**Poster design order:**
The resting state is designed AFTER span decomposition is applied. The
span-wrapped version is the canonical resting state — it accounts for any
slight kerning/ligature difference from wrapping. "motion creates form" has
no common ligature pairs in Fraunces, so visual impact is minimal.

**Font load guard:**
```ts
await document.fonts.ready  // MUST precede all getBoundingClientRect() calls
// If Fraunces fails to load: display user-visible error, do NOT proceed
// Physics bodies calibrated to wrong glyph sizes = silent miscalibration bug
```

**Render loop batching:**
```ts
// In afterUpdate handler — reads BEFORE writes
const states = letters.map(l => ({
  x: l.body.position.x, y: l.body.position.y, angle: l.body.angle,
  speed: Matter.Vector.magnitude(l.body.velocity),
  angularSpeed: Math.abs(l.body.angularVelocity)
}))

// Then writes (no interleaved getBoundingClientRect)
letters.forEach((l, i) => {
  const s = states[i]
  l.element.style.transform = `translate(${s.x - l.homeX}px, ${s.y - l.homeY}px) rotate(${s.angle}rad)`
  if (Math.abs(computedWeight(s.speed) - l.prevWeight) >= 2) {
    l.element.style.fontVariationSettings = computeAxes(s)
    l.prevWeight = computedWeight(s.speed)
  }
})
```
CSS on each letter span: `will-change: transform, font-variation-settings`

**Performance gate (Phase 1 → Phase 2):**
Measure frame time with `performance.mark()` in dev mode. Average must be
< 4ms/frame before Phase 2 (full axis-per-frame commitment) begins. If > 4ms:
throttle `fontVariationSettings` updates to every 2nd frame (mutations at 30fps
while physics runs at 60fps) and re-profile.

**Module structure:**
```
src/
  main.ts          — coordinator: wires all modules
  types.ts         — HomePosition, PhysicsLetter, PhysicsState
  decompose.ts     — span wrapping, getBoundingClientRect measurement
  physics.ts       — Matter.js engine, body creation, impulse helpers
  renderer.ts      — afterUpdate handler, DOM sync, font axis updates
  attractor.ts     — non-linear force, phase transitions, idle timer
  input.ts         — mousemove repulsion, click impulse, idle timer reset
public/fonts/      — Fraunces variable font files
```

---

## Estimated Investment

Minimum shippable, impressive version: **3–5 months**
SVG shatter, constraint system, export, custom composition: **10–14 months**
