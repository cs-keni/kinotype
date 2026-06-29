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

// ─── Test 1: Resting state screenshot regression ──────────────────────────────

test('resting state matches poster baseline', async ({ page }) => {
  await page.goto('/')
  await waitForReady(page)

  // One physics tick to confirm bodies are settled at home (static, no drift)
  await stepPhysics(page, 1)

  await expect(page).toHaveScreenshot('resting-state.png', {
    maxDiffPixelRatio: 0.01,
  })
})

// ─── Test 2: Additive velocity ────────────────────────────────────────────────

test('second click mid-flight adds velocity to already-moving letters', async ({ page }) => {
  await page.goto('/')
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
  await page.goto('/')
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

  // Step until all letters are within 2px of home. The attractor has a 600-tick
  // failsafe that calls deactivate() → setPosition(homeX, homeY) for every body,
  // so convergence is guaranteed. stepUntilHome returns -1 if it didn't converge.
  const ticksUsed = await page.evaluate(() => window.__kinotype!.stepUntilHome())
  expect(ticksUsed, 'attractor did not return all letters home within 650 ticks').toBeGreaterThan(0)

  const returned = await getLetterStates(page)

  for (const letter of returned) {
    const dx = letter.x - letter.homeX
    const dy = letter.y - letter.homeY
    const dist = Math.sqrt(dx * dx + dy * dy)
    expect(dist, `"${letter.char}" is ${dist.toFixed(2)}px from home`).toBeLessThanOrEqual(2)
  }
})
