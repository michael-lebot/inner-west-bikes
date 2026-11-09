import { gzipSync } from 'node:zlib'
import { expect, type Page, type Request, test } from '@playwright/test'
import { resetDb, sql } from './support'

// SPEC.md §11.1, in compressed bytes as transferred by `next start` (gzip).
// The 120 KB JavaScript budget was reset at M0 (2026-11-09): Next 16.4.5 and React 19.3.1 alone transfer 138,644 B
// gzipped (118,598 B as Brotli, which Vercel serves) on a page with no client components. 150 KiB leaves about
// 15 KiB for the site's own code before the map.
const JS_BEFORE_MAP = 150 * 1024
const FONT_FILES = 2
const FONT_BYTES = 60_000
const TAGS_100_BYTES = 15_000
// Measured in task 2.9 (2026-11-09): 299,546 B, so the 300 KB budget stands.
const MAP_BUNDLE_BYTES = 300_000
// §11.1 left 6 s to be set from M1 measurements. The time is in the network, so this gate leaves the CPU at full
// speed (see the test). In PR 2's review, its network log showed 970 KB moved before the map was ready: the page's
// 200 KB, the map chunk's 300 KB, the bold glyphs' 86 KB and the first view's 350 KB of tiles. That is 5.2 s of
// transfer at 1.47 Mbps, and the page, the map chunk, the tiles' header and the tiles each wait behind a 562 ms round
// trip. It measured 8.4 to 8.5 s on a laptop, so the gate is 14.5 s: the laptop's time is under 60% of it, which
// leaves room for a slower CI runner. Fewer tile or glyph bytes is what would bring it down.
const MAP_READY_MS = 14_500
const FIRST_VIEW_TILE_REQUESTS = 40
const FIRST_VIEW_TILE_BYTES = 1_500_000
// §11.1 says 200 ms. Headless Chromium draws WebGL in software and reads the map's canvas back to composite each
// frame the map takes part in: in a trace of opening a card with the CPU at full speed, 160 ms of the 215 ms frame
// is that read-back (GLES2::ReadPixels). With the GPU (--enable-gpu) the same steps measured 48 ms and 24 ms. With
// the CPU at full speed, opening a card measured 232 to 304 ms on a laptop and a zoom tap 96 to 168 ms, so the lab
// gate is 600 ms, keeping the laptop's time under 60% of it. The real-phone check at M1 (§11.4) holds the 200 ms.
const INTERACTION_MS = 600

const LLEWELLYN_ST = '5eed0000-0000-4000-8000-000000000003'

test.beforeEach(() => resetDb())

/** Every finished request and its compressed size, from now on. */
function recordRequests(page: Page) {
  const finished: Request[] = []
  page.on('requestfinished', (request) => finished.push(request))
  return async () =>
    Promise.all(
      finished.map(async (request) => ({
        request,
        url: new URL(request.url()),
        type: request.resourceType(),
        bytes: (await request.sizes()).responseBodySize,
      })),
    )
}

const sum = (rows: { bytes: number }[]) => rows.reduce((total, row) => total + row.bytes, 0)

/** Lighthouse's mobile preset through DevTools (§11): 4G, and with `cpu`, a mid-range phone's CPU (×4). */
async function throttle(page: Page, cpu: boolean) {
  const cdp = await page.context().newCDPSession(page)
  if (cpu) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 562.5,
    downloadThroughput: (1474.56 * 1024) / 8,
    uploadThroughput: (675 * 1024) / 8,
  })
}

for (const path of ['/', '/list', `/tag/${LLEWELLYN_ST}`]) {
  test(`${path} stays inside the JavaScript and font budgets`, async ({ page }) => {
    const requests = recordRequests(page)
    const html = await (await page.goto(path, { waitUntil: 'networkidle' }))!.text()
    const rows = await requests()

    // The page's own scripts are named in its HTML. Only the map screen loads more, after first paint, and the
    // other pages must never load the map: every script they run counts.
    const scripts = rows.filter((row) => row.type === 'script' && (path !== '/' || html.includes(row.url.pathname)))
    expect(sum(scripts), 'JavaScript bytes before the map').toBeLessThanOrEqual(JS_BEFORE_MAP)
    const fonts = rows.filter((row) => row.type === 'font')
    expect(fonts).toHaveLength(FONT_FILES)
    expect(sum(fonts), 'font bytes').toBeLessThanOrEqual(FONT_BYTES)
  })
}

// The two time gates leave the CPU at full speed. Headless Chromium already draws the map's WebGL in software on the
// CPU, which no phone does, and slowing that CPU fourfold too put both gates over on GitHub's runner (CI run
// 42586706684) for a reason a phone doesn't have. The byte and request gates keep the full profile.
test('the map is ready in time over 4G', async ({ page }) => {
  await throttle(page, false)
  await page.goto('/')
  await expect(page.locator('[data-map-ready]')).toBeAttached({ timeout: 30_000 })
  const ready = await page.evaluate(() => performance.getEntriesByName('map-ready')[0]!.startTime)
  test.info().annotations.push({ type: 'measured', description: `map ready ${Math.round(ready)} ms` })
  expect(ready, 'ms from navigation to map ready').toBeLessThanOrEqual(MAP_READY_MS)
})

test('a mid-range phone over 4G loads the map from a 300 KB bundle and 40 tiles', async ({ page }) => {
  await throttle(page, true)
  const requests = recordRequests(page)
  const html = await (await page.goto('/'))!.text()
  await expect(page.locator('[data-map-ready]')).toBeAttached({ timeout: 30_000 })
  const rows = await requests()

  // After first paint come the map's chunks, which carry MapLibre's name, and Zod, which the tag fetch loads.
  // MapLibre's worker is a blob: inside the map's chunk, so its bytes are already counted.
  const later = rows.filter(
    (row) => row.type === 'script' && row.url.protocol !== 'blob:' && !html.includes(row.url.pathname),
  )
  const bodies = await Promise.all(later.map(async (row) => (await row.request.response())!.text()))
  const kinds = later.map((row, i) =>
    bodies[i]!.includes('maplibregl') ? 'map' : bodies[i]!.includes('ZodError') ? 'zod' : row.url.pathname,
  )
  expect(
    kinds.filter((kind) => kind !== 'map' && kind !== 'zod'),
    'other scripts after first paint',
  ).toEqual([])
  const map = later.filter((_, i) => kinds[i] === 'map')

  // The tiles file's header, directories and tiles, all range requests on the one file.
  const tiles = rows.filter((row) => row.url.pathname.endsWith('.pmtiles'))
  test.info().annotations.push({
    type: 'measured',
    description: `map bundle ${sum(map)} B, first view ${tiles.length} tile requests ${sum(tiles)} B`,
  })
  expect(sum(map), 'map bundle bytes').toBeLessThanOrEqual(MAP_BUNDLE_BYTES)
  expect(tiles.length, 'first view tile requests').toBeLessThanOrEqual(FIRST_VIEW_TILE_REQUESTS)
  expect(sum(tiles), 'first view tile bytes').toBeLessThanOrEqual(FIRST_VIEW_TILE_BYTES)
})

test('opening a card and tapping zoom each reach the next paint in time', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('[data-map-ready]')).toBeAttached({ timeout: 30_000 })
  await page.evaluate(() => {
    const durations: number[] = ((window as unknown as { durations: number[] }).durations = [])
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as PerformanceEventTiming[])
        if (entry.interactionId) durations.push(entry.duration)
      // durationThreshold is missing from TypeScript's DOM types.
    }).observe({ type: 'event', durationThreshold: 16 } as PerformanceObserverInit)
  })

  /** The slowest event of an interaction, from input to the next paint. Under 16 ms, nothing is reported. */
  const timed = async (act: () => Promise<void>) => {
    await page.evaluate(() => ((window as unknown as { durations: number[] }).durations.length = 0))
    await act()
    // Event Timing entries arrive after the paint they measure.
    await page.waitForTimeout(500)
    return page.evaluate(() => Math.max(0, ...(window as unknown as { durations: number[] }).durations))
  }

  const openCard = await timed(async () => {
    await page.getByRole('button', { name: /Liverpool Rd, Ashfield/ }).click()
    await expect(page.getByRole('heading', { name: 'Hello e-bike' })).toBeVisible()
  })
  const zoom = await timed(() => page.getByRole('button', { name: 'Zoom in' }).click())
  test.info().annotations.push({ type: 'measured', description: `open a card ${openCard} ms, zoom tap ${zoom} ms` })
  expect(openCard, 'ms from tapping a pin to its card').toBeLessThanOrEqual(INTERACTION_MS)
  expect(zoom, 'ms from tapping + to the next paint').toBeLessThanOrEqual(INTERACTION_MS)
})

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
