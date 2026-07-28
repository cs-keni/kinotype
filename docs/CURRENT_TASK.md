# Current Task

**Active:** Phase 3 — polish details

## What's done
- Phase 1 complete (T1–T11)
- Phase 2 complete: exponential axis curves (`easeOut`, `EASE_EXPONENT = 0.45`),
  per-letter organic landing, opsz expanded to 9–72, composition 3 haiku,
  `netlify.toml`, debounced window resize handler
- **Reassembly choreography (Phase 3)**: arrive steering, reading-order lift-off
  stagger, angular unwind, cancellable return. Measured 8.9s end to end.
  56 unit tests + 4 E2E passing.

## Next action
**Browser play-test the return.** The numbers hit the 8–12s target but the feel
is unverified — nobody has watched it yet. Judge three things:

1. Does the arrival read as choreography or as drift? Tune `SLOW_RADIUS` (70)
   — larger is floatier, smaller is crisper but more mechanical.
2. Is the reading-order sweep legible? Arrival order is currently organic, since
   distant letters take longer than near ones. If the sweep does not read,
   switch to matched flight times (see `staggerDelay()` and the open question in
   `docs/ENGINEERING_LOG.md` 2026-07-27).
3. Does interrupting mid-return feel right? Moving the mouse now aborts the
   return and letters fall from where they are.

Remember: HMR does not pick up `attractor.ts` / `renderer.ts` edits. Restart with
`lsof -ti :5173 | xargs kill -9 && npm run dev -- --port 5173 &`

## Then
- Letter trails (`#trail-canvas` is already in `index.html`, unwired)
- Impact flashes on boundary collision (`--accent: #C0392B`)
- Compositions 2 and 4, cycle all 4 on reload
- 3 colorways, day-of-week assignment

## Known gap
`docs/AI_CONTEXT.md` and `docs/HANDOFF.md` are referenced by CLAUDE.md but do not
exist. Worth creating before the next handoff.
