import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 15_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: 'http://localhost:5177',
    headless: true,
    ...devices['Desktop Chrome'],
  },
  // Dev server must already be running (started externally or via webServer below)
  webServer: {
    command: 'npm run dev -- --port 5177',
    url: 'http://localhost:5177',
    reuseExistingServer: true,
    timeout: 15_000,
  },
})
