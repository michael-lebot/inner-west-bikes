import { defineConfig } from 'vitest/config'

// Route tests run against real Postgres, in the test database packages/server's tests use, one file at a time.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://iwb:iwb@localhost:54318/iwb_test'

export default defineConfig({
  resolve: { alias: { '@': import.meta.dirname } },
  test: {
    env: { DATABASE_URL: TEST_DATABASE_URL },
    globalSetup: '../../packages/server/test/global-setup.ts',
    fileParallelism: false,
  },
})
