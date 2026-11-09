import { expect, type Locator, type Page, test } from '@playwright/test'
import { expectNoAxeViolations, resetDb } from './support'

const OUTSIDE = 'That spot is outside the Inner West. Tap inside the gold line.'

test.beforeEach(() => resetDb())
// Instant camera moves, so each tap lands on the map as it will stay.
test.use({ reducedMotion: 'reduce' })

const mapBox = async (page: Page) => (await page.getByRole('region', { name: 'Map', exact: true }).boundingBox())!
/** The new tag's pin: the one marker that isn't a live tag's. */
const newPin = (page: Page) => page.locator('.maplibregl-marker:not([data-tag])')
const bar = (page: Page) => page.locator('#placement-heading + p')

/** Where a pin's tip is: the middle of its bottom edge. */
async function tip(pin: Locator) {
  const box = (await pin.boundingBox())!
  return { x: box.x + box.width / 2, y: box.y + box.height }
}

/** A tap on a phone, a click on the desktop. */
async function tap(page: Page, isMobile: boolean, { x, y }: { x: number; y: number }) {
  if (isMobile) await page.touchscreen.tap(x, y)
  else await page.mouse.click(x, y)
}

async function startTagging(page: Page) {
  await page.goto('/')
  await expect(page.locator('[data-map-ready]')).toBeAttached()
  await page.getByRole('button', { name: 'Tag a dumped bike' }).click()
  await expect(page.getByRole('heading', { name: 'Tag a dumped bike' })).toBeFocused()
}

test.describe('placing the pin', () => {
  test("puts the pin's tip where the map is tapped, and moves it with the next tap", async ({ page, isMobile }) => {
    await startTagging(page)
    await expect(bar(page)).toHaveText('Tap the map where the bike is.')
    await expect(page.getByRole('button', { name: 'Use this spot' })).toBeDisabled()
    const map = await mapBox(page)

    for (const spot of [
      { x: map.x + map.width / 2, y: map.y + map.height / 2 },
      { x: map.x + map.width / 2 - 60, y: map.y + map.height / 2 + 40 },
    ]) {
      await tap(page, isMobile, spot)
      await expect(bar(page)).toHaveText(/^Pin on [\w' ]+, [\w ]+$/)
      const at = await tip(newPin(page))
      expect(Math.abs(at.x - spot.x)).toBeLessThanOrEqual(1)
      expect(Math.abs(at.y - spot.y)).toBeLessThanOrEqual(1)
    }
    await expect(page.locator('#announcer')).toHaveText(await bar(page).innerText())
    await expect(page.getByRole('button', { name: 'Use this spot' })).toBeEnabled()
    await expectNoAxeViolations(page)
  })

  test('zooms in from far out rather than placing, and refuses a spot past the gold line', async ({
    page,
    isMobile,
  }) => {
    await startTagging(page)
    for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Zoom out' }).click()
    const kingSt = page.getByRole('button', { name: /King St, Newtown/ })

    // From far out, a tap only zooms in to street level around it (assumption 20).
    await tap(page, isMobile, await tip(kingSt))
    await expect(newPin(page)).toHaveCount(0)
    await expect(bar(page)).toHaveText('Tap the map where the bike is.')

    // King St is the council's edge: its far side is in the City of Sydney.
    const onKingSt = await tip(kingSt)
    await tap(page, isMobile, onKingSt)
    await expect(bar(page)).toHaveText('Pin on King St, Newtown')
    await tap(page, isMobile, { x: onKingSt.x + 60, y: onKingSt.y })
    await expect(bar(page)).toHaveText(OUTSIDE)
    await expect(page.locator('#announcer')).toHaveText(OUTSIDE)
    // The pin stays where it was accepted.
    expect(await tip(newPin(page))).toEqual(onKingSt)
  })

  test('Cancel ends it, with focus back on "Tag a dumped bike"', async ({ page, isMobile }) => {
    await startTagging(page)
    const map = await mapBox(page)
    await tap(page, isMobile, { x: map.x + map.width / 2, y: map.y + map.height / 2 })
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(newPin(page)).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Tag a dumped bike' })).toBeFocused()
  })

  test.describe('by keyboard', () => {
    test.skip(({ isMobile }) => isMobile, 'the desktop project')

    test('moves the pin 10 m an arrow and 50 m with Shift, and Esc cancels', async ({ page }) => {
      await page.goto('/')
      await expect(page.locator('[data-map-ready]')).toBeAttached()
      await page.getByRole('button', { name: 'Tag a dumped bike' }).focus()
      await page.keyboard.press('Enter')
      await expect(page.getByRole('heading', { name: 'Tag a dumped bike' })).toBeFocused()
      // Back past the map's buttons and pins to the map itself.
      const canvas = page.locator('.maplibregl-canvas')
      for (let i = 0; i < 30 && !(await canvas.evaluate((map) => map === document.activeElement)); i++)
        await page.keyboard.press('Shift+Tab')
      await expect(canvas).toBeFocused()
      await expect(canvas).toHaveAccessibleName(/arrow keys move the pin/)
      await expect(page.getByText('Arrow keys move the pin 10 m, with Shift 50 m.')).toBeVisible()

      // Enter puts the pin at the crosshair, the middle of the map.
      await page.keyboard.press('Enter')
      const map = await mapBox(page)
      const start = await tip(newPin(page))
      expect(start).toEqual({ x: map.x + map.width / 2, y: map.y + map.height / 2 })
      await expect(page.locator('#announcer')).toHaveText(/^Pin on /)

      // At street level a screen pixel is about 2 m.
      const moved = async (key: string, dx: number, dy: number) => {
        const before = await tip(newPin(page))
        await page.keyboard.press(key)
        await expect.poll(async () => (await tip(newPin(page))).x).toBeCloseTo(before.x + dx, 0)
        expect((await tip(newPin(page))).y).toBeCloseTo(before.y + dy, 0)
      }
      await moved('ArrowRight', 5, 0)
      await moved('ArrowDown', 0, 5)
      await moved('Shift+ArrowLeft', -25, 0)
      await moved('Shift+ArrowUp', 0, -25)
      await expectNoAxeViolations(page)

      await page.keyboard.press('Escape')
      await expect(newPin(page)).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Tag a dumped bike' })).toBeFocused()
    })
  })
})
