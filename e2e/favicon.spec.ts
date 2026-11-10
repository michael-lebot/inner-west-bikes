import { expect, test, type Page } from '@playwright/test'

// The headstone's colours as a canvas reads them back: grey edge, grey face, green ground, and the cross in the
// header's night slate. Then a clear pixel.
const NIGHT = '31,42,54,255'
const HEADSTONE = ['154,165,177,255', '196,204,212,255', '60,154,58,255', NIGHT]
const CLEAR = '0,0,0,0'

/** The icons the page names, in order. */
const icons = (page: Page) =>
  page.locator('link[rel="icon"], link[rel="apple-touch-icon"]').evaluateAll((links) =>
    links.map((link) => ({
      rel: link.getAttribute('rel'),
      type: link.getAttribute('type'),
      sizes: link.getAttribute('sizes'),
      href: link.getAttribute('href')!,
    })),
  )

/** The image at `href` as the browser draws it at `size` × `size` px: each pixel's colour, row by row. */
const draw = (page: Page, href: string, size: number) =>
  page.evaluate(
    async ([href, size]) => {
      const image = new Image()
      image.src = href
      await image.decode()
      const context = new OffscreenCanvas(size, size).getContext('2d')!
      context.drawImage(image, 0, 0, size, size)
      const { data } = context.getImageData(0, 0, size, size)
      const pixel = (i: number) => data.slice(4 * i, 4 * i + 4).join()
      return Array.from({ length: size }, (_, y) => Array.from({ length: size }, (_, x) => pixel(y * size + x)))
    },
    [href, size] as const,
  )

/** `rows` with each pixel made a `factor` × `factor` square. */
const scale = (rows: string[][], factor: number): string[][] =>
  rows.flatMap((row) => Array(factor).fill(row.flatMap((pixel) => Array(factor).fill(pixel))))

// Every page has them; the list's is the lightest.
test.beforeEach(({ page }) => page.goto('/list'))

test('names the headstone SVG for tabs, favicon.ico for older browsers, and the home-screen icon', async ({
  page,
  request,
}) => {
  const links = await icons(page)
  expect(links.map(({ href, ...link }) => ({ ...link, path: href.split('?')[0] }))).toEqual([
    { rel: 'icon', type: 'image/x-icon', sizes: '32x32', path: '/favicon.ico' },
    { rel: 'icon', type: 'image/svg+xml', sizes: 'any', path: '/icon.svg' },
    { rel: 'apple-touch-icon', type: 'image/png', sizes: '180x180', path: '/apple-icon.png' },
  ])
  for (const { type, href } of links) {
    const response = await request.get(href)
    expect(response.headers()['content-type']).toBe(type)
    // Like the fonts, they skip proxy.ts, so no visitor cookie stops a cache keeping them.
    expect(response.headers()['set-cookie']).toBeUndefined()
  }
})

test("draws the header's headstone in the tab", async ({ page, request }) => {
  const [, svg] = await icons(page)
  const paths = (markup: string) => markup.match(/fill="#\w+" d="[^"]+"/g)
  expect(paths(await (await request.get(svg!.href)).text())).toEqual(
    paths(await page.getByRole('banner').locator('svg').innerHTML()),
  )
})

test('draws every icon in whole pixels of the 16 px tab icon', async ({ page }) => {
  const [ico, svg, apple] = await icons(page)
  const tab = await draw(page, svg!.href, 16)
  // Only the headstone's colours and clear: no blended edges.
  expect(new Set(tab.flat())).toEqual(new Set([...HEADSTONE, CLEAR]))
  // Each pixel twice the size on a 2× screen, and in favicon.ico.
  expect(await draw(page, svg!.href, 32)).toEqual(scale(tab, 2))
  expect(await draw(page, ico!.href, 32)).toEqual(scale(tab, 2))
  // Ten times the size on an iPhone home screen, on the night slate with a 10 px margin, as iOS allows no clear.
  const home = await draw(page, apple!.href, 180)
  expect(new Set(home.flat())).toEqual(new Set(HEADSTONE))
  expect(home.slice(10, 170).map((row) => row.slice(10, 170))).toEqual(
    scale(tab, 10).map((row) => row.map((pixel) => (pixel === CLEAR ? NIGHT : pixel))),
  )
})
