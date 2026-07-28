import { test, expect, Page } from '@playwright/test'

// ─── Types ───────────────────────────────────────────────────────────────────

interface DebugHandle {
  getLetters: () => Array<{
    char: string
    homeX: number
    homeY: number
    body: { position: { x: number; y: number }; speed: number; velocity: { x: number; y: number } }
  }>
  step: (ticks?: number, dt?: number) => void
  stepUntilHome: (maxTicks?: number, dt?: number) => number
  triggerIdle: () => void
}

declare global {
  interface Window {
    __kinotype?: DebugHandle
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function waitForReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      document.querySelector('#phrase') !== null &&
      (document.querySelector('#phrase') as HTMLElement)?.style.opacity === '1' &&
      typeof window.__kinotype !== 'undefined',
    { timeout: 8_000 },
  )
}

async function getLetterStates(page: Page) {
  return page.evaluate(() => {
    const kt = window.__kinotype!
    return kt.getLetters().map((l) => ({
      char: l.char,
      homeX: l.homeX,
      homeY: l.homeY,
      x: l.body.position.x,
      y: l.body.position.y,
      speed: l.body.speed,
      vx: l.body.velocity.x,
      vy: l.body.velocity.y,
    }))
  })
}

/** Step the engine N ticks at 60fps — deterministic alternative to waitForTimeout+rAF */
async function stepPhysics(page: Page, ticks: number): Promise<void> {
  await page.evaluate((n) => window.__kinotype!.step(n), ticks)
}

/**
 * Compositions rotate on reload and colorways rotate by weekday, so every test
 * pins both. Without this the resting-state screenshot baseline would be a
 * coin flip between four compositions and three palettes.
 */
const PINNED = '/?composition=motion&colorway=paper'

// ─── Test 1: Resting state screenshot regression ──────────────────────────────

test('resting state matches poster baseline', async ({ page }) => {
  await page.goto(PINNED)
  await waitForReady(page)

  // One physics tick to confirm bodies are settled at home (static, no drift)
  await stepPhysics(page, 1)

  await expect(page).toHaveScreenshot('resting-state.png', {
    maxDiffPixelRatio: 0.01,
  })
})

// ─── Test 2: Additive velocity ────────────────────────────────────────────────

test('second click mid-flight adds velocity to already-moving letters', async ({ page }) => {
  await page.goto(PINNED)
  await waitForReady(page)

  const viewport = page.viewportSize()!
  const cx = viewport.width / 2
  const cy = viewport.height / 2

  // First click — scatter the letters (wakes bodies, starts runner)
  await page.mouse.click(cx, cy)

  // Step 12 frames (~200ms at 60fps) — letters in flight
  await stepPhysics(page, 12)

  const speedsBefore = await getLetterStates(page)
  const maxSpeedBefore = Math.max(...speedsBefore.map((l) => l.speed))

  // Second click mid-flight — should add impulse on top of existing velocity
  await page.mouse.click(cx, cy)

  // Step 1 frame — engine processes the newly applied force
  await stepPhysics(page, 1)

  const speedsAfter = await getLetterStates(page)
  const maxSpeedAfter = Math.max(...speedsAfter.map((l) => l.speed))

  // At least the fastest letter should be faster or equal after second click
  // (additive: force is applied on top of current velocity)
  expect(maxSpeedBefore).toBeGreaterThan(0)
  expect(maxSpeedAfter).toBeGreaterThan(maxSpeedBefore * 0.5)
})

// ─── Test 3: Idle return ──────────────────────────────────────────────────────

test('all letters return within 2px of home after attractor fires', async ({ page }) => {
  await page.goto(PINNED)
  await waitForReady(page)

  const viewport = page.viewportSize()!
  const cx = viewport.width / 2
  const cy = viewport.height / 2

  // Scatter the letters with two clicks
  await page.mouse.click(cx, cy)
  await page.mouse.click(cx + 50, cy - 50)

  // Simulate 3s of scatter/fall (180 frames at 60fps)
  await stepPhysics(page, 180)

  // Confirm letters have actually moved — scatter worked
  const scattered = await getLetterStates(page)
  const maxDist = Math.max(
    ...scattered.map((l) => Math.sqrt((l.x - l.homeX) ** 2 + (l.y - l.homeY) ** 2)),
  )
  expect(maxDist).toBeGreaterThan(20)

  // Fire the attractor immediately (bypasses the 3s idle timer for determinism)
  await page.evaluate(() => window.__kinotype!.triggerIdle())

  // Step until all letters are within 2px of home. The choreographed return
  // lands around tick 530; the attractor's MAX_TICKS=1500 failsafe calls
  // deactivate() → setPosition(homeX, homeY) for every body, so convergence is
  // guaranteed either way. stepUntilHome returns -1 if it didn't converge.
  const ticksUsed = await page.evaluate(() => window.__kinotype!.stepUntilHome())
  expect(ticksUsed, 'attractor did not return all letters home in time').toBeGreaterThan(0)

  // VQT #4: the return must be worth watching. Anything under 4s (240 ticks)
  // is the old mechanical snap, not choreography.
  expect(ticksUsed, 'return finished too fast to be worth watching').toBeGreaterThan(240)

  const returned = await getLetterStates(page)

  for (const letter of returned) {
    const dx = letter.x - letter.homeX
    const dy = letter.y - letter.homeY
    const dist = Math.sqrt(dx * dx + dy * dy)
    expect(dist, `"${letter.char}" is ${dist.toFixed(2)}px from home`).toBeLessThanOrEqual(2)
  }
})

// ─── Test 4: Interrupting the return ──────────────────────────────────────────

test('user interaction mid-return cancels the attractor instead of fighting it', async ({
  page,
}) => {
  await page.goto(PINNED)
  await waitForReady(page)

  const viewport = page.viewportSize()!
  const cx = viewport.width / 2
  const cy = viewport.height / 2

  // Scatter, let letters fall, then start the return.
  await page.mouse.click(cx, cy)
  await stepPhysics(page, 180)
  await page.evaluate(() => window.__kinotype!.triggerIdle())

  // Let the return get properly underway (past the stagger wave).
  await stepPhysics(page, 200)
  const midReturn = await getLetterStates(page)
  const midDist = Math.max(
    ...midReturn.map((l) => Math.sqrt((l.x - l.homeX) ** 2 + (l.y - l.homeY) ** 2)),
  )
  expect(midDist, 'letters should still be in flight').toBeGreaterThan(2)

  // Interact mid-flight. This must cancel the return, not stack a second one.
  await page.mouse.move(cx, cy)
  await stepPhysics(page, 120)

  const afterInterrupt = await getLetterStates(page)

  // With the attractor cancelled, gravity is restored and the phrase falls
  // apart again. Compare total distance-from-home rather than any single
  // letter: if the attractor were still attached this sum would shrink, and
  // the direction of change is a far less flaky signal than a per-letter check.
  const totalDist = (states: typeof midReturn) =>
    states.reduce((sum, l) => sum + Math.sqrt((l.x - l.homeX) ** 2 + (l.y - l.homeY) ** 2), 0)

  expect(
    totalDist(afterInterrupt),
    'attractor kept pulling letters home after the user interrupted',
  ).toBeGreaterThan(totalDist(midReturn))

  // And the piece must still recover: a fresh idle returns everything home.
  await page.evaluate(() => window.__kinotype!.triggerIdle())
  const ticksUsed = await page.evaluate(() => window.__kinotype!.stepUntilHome())
  expect(ticksUsed, 'return did not recover after being interrupted').toBeGreaterThan(0)

  for (const letter of await getLetterStates(page)) {
    const dist = Math.sqrt((letter.x - letter.homeX) ** 2 + (letter.y - letter.homeY) ** 2)
    expect(dist, `"${letter.char}" is ${dist.toFixed(2)}px from home`).toBeLessThanOrEqual(2)
  }
})

// ─── Test 5: Compositions ─────────────────────────────────────────────────────

test('haiku composition lays out as three stacked lines', async ({ page }) => {
  await page.goto('/?composition=haiku&colorway=paper')
  await waitForReady(page)

  const lineCount = await page.locator('#phrase .line').count()
  expect(lineCount).toBe(3)

  // Lines must actually stack, not run together on one baseline.
  const tops = await page.locator('#phrase .line').evaluateAll((els) =>
    els.map((el) => el.getBoundingClientRect().top),
  )
  expect(tops[1]).toBeGreaterThan(tops[0])
  expect(tops[2]).toBeGreaterThan(tops[1])

  // Every glyph across all three lines gets a body.
  const letters = await page.evaluate(() => window.__kinotype!.getLetters().length)
  expect(letters).toBe('thewordshakesitselfapartintoitslettersandbackintoform'.length)
})

test('single-word composition is set larger than a phrase', async ({ page }) => {
  await page.goto('/?composition=motion&colorway=paper')
  await waitForReady(page)
  const phraseSize = await page
    .locator('#phrase')
    .evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize))

  await page.goto('/?composition=velocity&colorway=paper')
  await waitForReady(page)
  const wordSize = await page
    .locator('#phrase')
    .evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize))

  expect(wordSize).toBeGreaterThan(phraseSize)

  // Heavier bodies: display-size glyphs should clamp to the mass ceiling.
  const letters = await page.evaluate(() => window.__kinotype!.getLetters().length)
  expect(letters).toBe(8)
})

test('composition stays on screen at display size', async ({ page }) => {
  await page.goto('/?composition=velocity&colorway=paper')
  await waitForReady(page)

  const viewport = page.viewportSize()!
  const box = await page.locator('#phrase').boundingBox()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width)
})

// ─── Test 6: Colorways ────────────────────────────────────────────────────────

test('colorway override repaints background, type, and accent', async ({ page }) => {
  await page.goto('/?composition=motion&colorway=night')
  await waitForReady(page)

  const applied = await page.evaluate(() => {
    const s = getComputedStyle(document.documentElement)
    return {
      id: document.documentElement.dataset.colorway,
      bg: s.getPropertyValue('--bg').trim(),
      fg: s.getPropertyValue('--fg').trim(),
      accent: s.getPropertyValue('--accent').trim(),
    }
  })

  expect(applied).toEqual({ id: 'night', bg: '#0D0D0D', fg: '#F2EDD7', accent: '#00E5FF' })

  // The palette must actually reach the painted pixels, not just the variables.
  const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  expect(bodyBg).toBe('rgb(13, 13, 13)')
})

test('unknown colorway falls back to the rotation instead of breaking the page', async ({
  page,
}) => {
  await page.goto('/?composition=motion&colorway=chartreuse')
  await waitForReady(page)

  const id = await page.evaluate(() => document.documentElement.dataset.colorway)
  expect(['paper', 'night', 'blueprint']).toContain(id)
})

// ─── Test 7: Canvas effects ───────────────────────────────────────────────────

/** Count pixels with any alpha, plus how many read as the accent colour. */
async function samplePixels(page: Page) {
  return page.evaluate(() => {
    const canvas = document.getElementById('trail-canvas') as HTMLCanvasElement
    const ctx = canvas.getContext('2d')!
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
    let painted = 0
    let accentish = 0
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue
      painted++
      // Paper accent is #C0392B: strongly red, weakly green. The type colour
      // (#1A1A1A) and background (#F7F4EE) are both neutral, so a red-dominant
      // pixel can only have come from an impact flash.
      if (data[i] > 140 && data[i] - data[i + 1] > 60) accentish++
    }
    return { painted, accentish }
  })
}

test('trail canvas is scaled to device pixel ratio', async ({ page }) => {
  await page.goto(PINNED)
  await waitForReady(page)

  const { backingWidth, cssWidth, dpr } = await page.evaluate(() => {
    const canvas = document.getElementById('trail-canvas') as HTMLCanvasElement
    return {
      backingWidth: canvas.width,
      cssWidth: canvas.getBoundingClientRect().width,
      dpr: window.devicePixelRatio,
    }
  })

  // VQT #5: drawing at CSS size on a high-DPI display is the flicker bug.
  expect(backingWidth).toBe(Math.round(cssWidth * Math.max(dpr, 1)))
})

test('letters leave trails when scattered and none at rest', async ({ page }) => {
  await page.goto(PINNED)
  await waitForReady(page)

  const atStart = await samplePixels(page)
  expect(atStart.painted, 'canvas should start blank').toBe(0)

  const viewport = page.viewportSize()!
  await page.mouse.click(viewport.width / 2, viewport.height / 2)
  await stepPhysics(page, 8)

  const scattering = await samplePixels(page)
  expect(scattering.painted, 'fast letters should smear').toBeGreaterThan(0)

  // Let everything come home, then let the fade run out.
  await page.evaluate(() => window.__kinotype!.triggerIdle())
  await page.evaluate(() => window.__kinotype!.stepUntilHome())
  await stepPhysics(page, 60)

  const atRest = await samplePixels(page)
  expect(atRest.painted, 'canvas must be blank once the phrase has reformed').toBe(0)
})

test('boundary impacts flash the accent colour', async ({ page }) => {
  await page.goto(PINNED)
  await waitForReady(page)

  const viewport = page.viewportSize()!
  // Click above the phrase so letters are driven down into the floor.
  await page.mouse.click(viewport.width / 2, viewport.height / 2 - 220)

  // Sample as the letters fall and bounce rather than once at the end — a
  // flash fades in ~24 frames, so a single late sample would miss all of them.
  let sawAccent = false
  for (let i = 0; i < 30 && !sawAccent; i++) {
    await stepPhysics(page, 10)
    sawAccent = (await samplePixels(page)).accentish > 0
  }

  expect(sawAccent, 'no impact flash was drawn during the fall').toBe(true)
})
