import { execSync } from 'node:child_process'
import type { TestProject } from 'vitest/node'

/** Brings the test database up to the latest migration, creating it if needed. Tests empty the tables they use. */
export default function setup(project: TestProject) {
  const url = project.config.env.DATABASE_URL ?? ''
  if (!new URL(url).pathname.endsWith('_test')) throw new Error(`Tests truncate tables; refusing to run on ${url}`)
  execSync('prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: url },
    stdio: ['ignore', 'ignore', 'inherit'],
  })
}
