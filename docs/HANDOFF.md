# Handoff

Current state of the work, who owns what, and what the next agent should pick up.

**Last updated:** 2026-07-27
**Branch:** `main` (all work lands directly on main)

## Where the project stands

**Phases 1–4 are complete.** The piece is feature-complete against the spec's
first four phases: physics, variable-font coupling, all polish details, and the
full mobile/accessibility pass. Phase 5 (Depth) has not been started.

- 142 unit tests, 18 E2E, `tsc --noEmit` clean, `npm run build` clean.
- Deployed via `netlify.toml` (`npm run build` → `dist/`, Node 20).

## The one thing blocking confident progress

**Nobody has watched the reassembly.** The ~9s choreographed return was built,
measured, and tested against numbers — first letter lands at 4.15s, last at
8.90s, inside the 8–12s target — but no human has looked at it. VQT #4 asks
whether it is "worth watching in isolation", and that is not a question tests
can answer.

Everything since then (trails, flashes, sleeping, Phase 4) was built on top of
that unvalidated foundation. None of it depends on the return's *feel*, so
nothing is at risk, but the longer it goes unwatched the more expensive a
retune becomes.

**Open design question, deliberately left for a human.** Arrival order is
organic rather than strictly reading order: a letter early in the phrase but far
from home lands after a later, nearer one, which softens the left-to-right
sweep. Making it exact means giving each letter a speed proportional to its
lift-off distance so all flight times match — a stronger, more deliberate
choreography, but less physical, and it spreads cruise speeds ~13x, which the
`wght` axis mapping would amplify into visible weight differences between
letters. Could read as intentional, could read as broken. The swap point is
`staggerDelay()` in `attractor.ts`.

## Component ownership

| Area | File | Notes |
|---|---|---|
| Return choreography | `attractor.ts` | Arrive steering. Tuning knobs at top of file |
| Variable font axes | `renderer.ts` | `EASE_EXPONENT` is the curve knob |
| Trails + flashes | `effects.ts` | Speed thresholds must stay above `MAX_RETURN_SPEED` |
| Palettes | `colorways.ts` | Day-of-week; a weekday is pinned to one palette |
| Content | `compositions.ts` | 4 pieces, localStorage rotation |
| Input | `input.ts` | Pointer events; hover is mouse-only |
| Keyboard | `keyboard.ts` | Roving tabindex, deliberate spec deviation |

## Animation system

Three systems, deliberately separate:

1. **Scatter** — real Matter.js rigid-body physics. Gravity on, letters collide.
2. **Return** — `attractor.ts` takes over after 3s idle. Gravity off, letters
   become sensors, arrive steering pulls them home in a reading-order wave with
   rotation unwinding to upright. Cancellable at any point by user interaction.
3. **Axis response** — `renderer.ts` maps velocity to wght/SOFT and angular
   velocity to opsz through an `easeOut` curve, every frame, independent of
   which system is driving position.

The canvas layer (`effects.ts`) observes all three but drives none of them.

## Tuning knobs, in the order you will want them

```
attractor.ts  MAX_RETURN_SPEED  2.4   overall return pace
              SLOW_RADIUS       70    larger = floatier arrival, smaller = crisper
              STAGGER_TICKS     150   spread of the reading-order wave
renderer.ts   EASE_EXPONENT     0.45  axis response curve
effects.ts    FADE_ALPHA        0.15  trail decay rate
              TRAIL_MAX_ALPHA   0.35  trail faintness ceiling
```

## Suggested next steps, in priority order

1. **Play-test the return in a browser.** Judge VQT #4 and the arrival-order
   question above. Everything else is downstream of this.
2. **Phase 5 triage.** Four items, and they are not equal:
   - *Constraint springs* (words hold together before scattering) — self-contained
     physics, the natural next build.
   - *Custom composition* (user-typed phrase) — moderate, but it adds a UI
     surface, and the spec's "what to resist" section argues for keeping the
     piece bare.
   - *SVG shatter* (opentype.js outline tracing, triangulation) — large, adds a
     dependency, heavy taste component.
   - *GIF export* — large, adds an encoder dependency, needs a UX decision.
3. **Set `OPENAI_API_KEY`** to unblock the gstack designer for visual mockups
   (tracked in the PHASES backlog).

## Conventions

- Docs update in the same commit as the code. `ENGINEERING_LOG.md` gets an entry
  for every change; this file updates when architecture moves.
- Stage specific files, never `git add -A`.
- Physics assertions are directional, not exact — the runner races manual steps.
- E2E always pins `?composition=&colorway=`.
