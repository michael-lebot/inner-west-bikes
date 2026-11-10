import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

const turbo = JSON.parse(readFileSync(new URL('../../../turbo.json', import.meta.url), 'utf8'))

it('loads on Vercel with only the variables turbo.json passes through, as `next build` there loads it', () => {
  // A process of its own, as Turbo hides every other variable from the build. A URL is a valid value for each.
  const passed = (turbo.globalPassThroughEnv as string[]).map((name) => [name, 'https://example.com'])
  const load = () =>
    execFileSync(process.execPath, ['--input-type=module', '--eval', "await import('./src/env.ts')"], {
      cwd: new URL('..', import.meta.url),
      env: { VERCEL: '1', ...Object.fromEntries(passed) },
      stdio: 'pipe',
    })
  expect(load).not.toThrow()
})
