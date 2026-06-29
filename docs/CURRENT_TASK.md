# Current Task

**Active:** Phase 2 — variable font axis curve tuning

## What's done
- T1–T11 complete (Phase 1 fully shipped)
- Exponential axis curves landed: `easeOut(t) = Math.pow(t, 0.45)` applied to speed→wght/SOFT and angularSpeed→opsz
- 38 unit tests passing

## In progress
- **opsz range assessment**: current 36–72 may be too narrow; expand toward 9–144 if it reads as intentional morph rather than legibility glitch. Needs browser play-test.
- **Composition 3 haiku**: original haiku on making/motion/form theme — to be written.
- **Deploy config**: `netlify.toml` or `vercel.json` (unblocked).
- **Window resize handler**: re-run `decompose()`, update homeX/homeY, move bodies.

## Next action
Run dev server and interact to assess curve feel. Adjust `EASE_EXPONENT` (currently 0.45) if needed. Then check opsz range.
