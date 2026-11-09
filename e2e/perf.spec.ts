import { expect, test, type Response } from '@playwright/test'
import { resetDb } from './support'

// SPEC.md §11.1, in compressed bytes as transferred by `next start` (gzip).
// The 120 KB JavaScript budget was reset at M0 (2026-11-09): Next 16.4.5 and React 19.3.1 alone transfer 138,644 B
// gzipped (118,598 B as Brotli, which Vercel serves) on a page with no client components. 150 KiB leaves about
// 15 KiB for the site's own code before the map.
const JS_BEFORE_MAP = 150 * 1024
const FONT_FILES = 2
const FONT_BYTES = 60 * 1024

test.beforeEach(() => resetDb())

for (const path of ['/', '/list']) {
  test(`${path} stays inside the JavaScript and font budgets`, async ({ page }) => {
    const responses: Response[] = []
    page.on('response', (response) => responses.push(response))
    await page.goto(path, { waitUntil: 'networkidle' })

    const sized = await Promise.all(
      responses.map(async (response) => ({
        type: response.request().resourceType(),
        bytes: (await response.request().sizes()).responseBodySize,
      })),
    )
    const total = (type: string) => sized.filter((r) => r.type === type).reduce((sum, r) => sum + r.bytes, 0)

    expect(total('script'), 'JavaScript bytes').toBeLessThanOrEqual(JS_BEFORE_MAP)
    expect(sized.filter((r) => r.type === 'font')).toHaveLength(FONT_FILES)
    expect(total('font'), 'font bytes').toBeLessThanOrEqual(FONT_BYTES)
  })
}
