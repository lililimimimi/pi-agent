import { defineConfig, devices } from '@playwright/test'

// The end-to-end tests run the real app in a browser. The backend is replaced by fixtures
// (see e2e/fixtures.ts), so they need no model keys and no running backend.
const PORT = 5179

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  // A retry only in CI, so a flaky first run shows up locally
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
