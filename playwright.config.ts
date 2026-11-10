import { defineConfig, devices } from '@playwright/test'
import { E2E_DATABASE_URL } from './e2e/support'

// End-to-end tests run against production builds (`pnpm build` first) of both apps on the iwb_e2e database.
export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/global-setup.ts',
  // The tests share one database and one IP address, so they run one at a time.
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://localhost:3000', trace: 'retain-on-failure' },
  projects: [
    { name: 'iphone', use: devices['iPhone 13'], testIgnore: ['admin*.spec.ts', 'perf.spec.ts'] },
    { name: 'pixel', use: devices['Pixel 7'], testIgnore: ['admin*.spec.ts'] },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
      testIgnore: ['perf.spec.ts'],
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @iwb/web start',
      url: 'http://localhost:3000',
      env: { DATABASE_URL: E2E_DATABASE_URL },
    },
    {
      command: 'pnpm --filter @iwb/admin start',
      // Playwright starts the servers before global setup creates the database: check a page that doesn't read it.
      url: 'http://localhost:3001/reports',
      env: { DATABASE_URL: E2E_DATABASE_URL },
    },
  ],
})
