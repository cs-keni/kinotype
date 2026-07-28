# Handoff

Current state of the work, who owns what, and what the next agent should pick up.

**Last updated:** 2026-07-27 (second pass)
**Branch:** `main` (all work lands directly on main)

## Where the project stands

**Phases 1–4 are complete**, plus one of the four Phase 5 items.

- 172 unit tests, 24 E2E, `tsc --noEmit` clean, `npm run build` clean.
- Deployed via `netlify.toml` (`npm run build` → `dist/`, Node 20).

Phase 5 status: **constraint springs done** but opt-in via `?springs=on` and off
by default — it changes the core feel and wants a human eye before it becomes
the default. SVG shatter, GIF export, and custom composition are untouched.

Two bugs were fixed underneath the springs work, both pre-existing:
letters left as sensors after a no-op return (they would fall through the floor
on the next interaction), and landed letters creeping a few px off home
(Matter applies a stale `positionImpulse` to static bodies), which meant the
reformed poster was visibly not the poster.

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
| Word springs | `constraints.ts` | Opt-in `?springs=on`; two release mechanisms |

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
constraints.ts SPRING_STIFFNESS 0.06  how rigid a word is
              BREAK_RELATIVE_SPEED 3  how easily strain tears a bond
```

## URL overrides

`?composition=<id>` `?colorway=<id>` `?springs=on`. All three exist so a
specific look can be pinned — E2E depends on the first two, since a rotating
composition against a weekday palette makes the screenshot baseline a coin flip
across 12 combinations.

## Suggested next steps, in priority order

1. **Play-test the return in a browser.** Judge VQT #4 and the arrival-order
   question above. Everything else is downstream of this.
2. **Decide on word springs.** Open `?springs=on` next to the default and pick.
   If they stay, flip the default in `main.ts`; if not, delete
   `constraints.ts` and its `wordIndex` plumbing in `decompose.ts`.
3. **Remaining Phase 5**, deliberately not started — each needs a decision
   before code:
   - *Custom composition* (user-typed phrase) — moderate, but it adds a UI
     surface, and the spec's "what to resist" section argues for keeping the
     piece bare. Decide whether the piece should have chrome at all.
   - *SVG shatter* (opentype.js outline tracing, triangulation) — large, adds a
     dependency, heavy taste component.
   - *GIF export* — large, adds an encoder dependency, needs a UX decision
     (where does the button live in a piece with no chrome?).
4. **Set `OPENAI_API_KEY`** to unblock the gstack designer for visual mockups
   (tracked in the PHASES backlog).

## Conventions

- Docs update in the same commit as the code. `ENGINEERING_LOG.md` gets an entry
  for every change; this file updates when architecture moves.
- Stage specific files, never `git add -A`.
- Physics assertions are directional, not exact — the runner races manual steps.
- E2E always pins `?composition=&colorway=`.
