import { gzipSync } from 'node:zlib'
import { expect, test, type Response } from '@playwright/test'
import { resetDb, sql } from './support'

// SPEC.md §11.1, in compressed bytes as transferred by `next start` (gzip).
// The 120 KB JavaScript budget was reset at M0 (2026-11-09): Next 16.4.5 and React 19.3.1 alone transfer 138,644 B
// gzipped (118,598 B as Brotli, which Vercel serves) on a page with no client components. 150 KiB leaves about
// 15 KiB for the site's own code before the map.
const JS_BEFORE_MAP = 150 * 1024
const FONT_FILES = 2
const FONT_BYTES = 60_000
const TAGS_100_BYTES = 15_000

test.beforeEach(() => resetDb())

for (const path of ['/', '/list']) {
  test(`${path} stays inside the JavaScript and font budgets`, async ({ page }) => {
    const responses: Response[] = []
    page.on('response', (response) => responses.push(response))
    const html = await (await page.goto(path, { waitUntil: 'networkidle' }))?.text()

    const sized = await Promise.all(
      responses.map(async (response) => ({
        type: response.request().resourceType(),
        // The page's own scripts are named in its HTML; the map's arrive later, through import().
        beforeMap: html?.includes(new URL(response.url()).pathname),
        bytes: (await response.request().sizes()).responseBodySize,
      })),
    )
    const total = (type: string) => sized.filter((r) => r.type === type).reduce((sum, r) => sum + r.bytes, 0)

    const beforeMap = sized.filter((r) => r.type === 'script' && r.beforeMap).reduce((sum, r) => sum + r.bytes, 0)
    expect(beforeMap, 'JavaScript bytes before the map').toBeLessThanOrEqual(JS_BEFORE_MAP)
    expect(sized.filter((r) => r.type === 'font')).toHaveLength(FONT_FILES)
    expect(total('font'), 'font bytes').toBeLessThanOrEqual(FONT_BYTES)
  })
}

test('/api/tags sends 100 live tags in 15 KB or less, gzipped', async ({ request }) => {
  // The 14 seeded tags, and 86 more copied from them with new ids, nearby points and their own times.
  await sql(`
    INSERT INTO tags (id, lat, lng, suburb, street, operator, problem, last_confirmed_at, expires_at)
    SELECT gen_random_uuid(), lat + random() / 1000, lng + random() / 1000, suburb, street, operator, problem,
           seen, seen + interval '48 hours'
    FROM (SELECT *, now() - random() * interval '47 hours' AS seen FROM tags, generate_series(1, 7)) AS copies
    LIMIT 86`)
  const response = await request.get('/api/tags')
  expect((await response.json()).tags).toHaveLength(100)
  // next start doesn't compress route handlers (Vercel does), so the test gzips the body itself.
  expect(gzipSync(await response.body()).length, 'gzipped bytes').toBeLessThanOrEqual(TAGS_100_BYTES)
})
