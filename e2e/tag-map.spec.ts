import { expect, type Locator, type Page, test } from '@playwright/test'
import { expectNoAxeViolations, resetDb, sql } from './support'

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

/** Places the pin a little way from the map's middle, where no tag is within 25 m. */
async function placeAwayFromTags(page: Page, isMobile: boolean) {
  const map = await mapBox(page)
  await tap(page, isMobile, { x: map.x + map.width / 2 - 120, y: map.y + map.height / 2 + 120 })
  await expect(bar(page)).toHaveText(/^Pin on /)
}

/** Places the pin about 12 m from the seeded tag on Llewellyn St: zoomed out, a tap on its pin zooms in there. */
async function placeBesideLlewellynSt(page: Page, isMobile: boolean) {
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Zoom out' }).click()
  const pin = page.getByRole('button', { name: /Llewellyn St, Marrickville/ })
  await tap(page, isMobile, await tip(pin))
  const at = await tip(pin)
  await tap(page, isMobile, { x: at.x + 6, y: at.y })
  await expect(bar(page)).toHaveText('Pin on Llewellyn St, Marrickville')
}

const dialog = (page: Page) => page.getByRole('dialog')
/** A chip's label, which is what a visitor taps; the radio inside it is visually hidden. */
const chip = (page: Page, name: string) => page.getByRole('radio', { name }).locator('..')

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

test.describe('the dialogs', () => {
  test('ask "Is it one of these?" near a live tag, where "No" carries on to the form', async ({ page, isMobile }) => {
    await startTagging(page)
    await placeBesideLlewellynSt(page, isMobile)
    await page.getByRole('button', { name: 'Use this spot' }).click()
    await expect(dialog(page).getByRole('heading', { name: 'Is it one of these?' })).toBeFocused()
    await expect(dialog(page)).toContainText('Llewellyn St, Marrickville')
    await expectNoAxeViolations(page)

    await page.getByRole('button', { name: "No, it's another bike" }).click()
    await expect(dialog(page).getByRole('heading', { name: 'Tag a dumped bike' })).toBeFocused()
    await expect(dialog(page)).toContainText('Pin on Llewellyn St, Marrickville')
    await expectNoAxeViolations(page)
  })

  test('mark the nearby tag still there with "Yes, this bike"', async ({ page, isMobile }) => {
    await sql(`UPDATE tags SET expires_at = now() + interval '3 hours' WHERE street = 'Llewellyn St'`)
    await startTagging(page)
    await placeBesideLlewellynSt(page, isMobile)
    await page.getByRole('button', { name: 'Use this spot' }).click()
    await page.getByRole('button', { name: 'Yes, this bike' }).click()
    await expect(dialog(page)).toHaveCount(0)
    await expect(page.locator('#announcer')).toHaveText('Marked still there')
    await expect(page.getByRole('button', { name: 'Tag a dumped bike' })).toBeFocused()
    const [tag] = await sql(
      `SELECT expires_at - now() > interval '47 hours' AS reset FROM tags WHERE street = 'Llewellyn St'`,
    )
    expect(tag).toEqual({ reset: true })
    await expect(page.getByRole('heading', { name: '14 bikes in the graveyard' })).toBeVisible()
  })

  test('name what is missing, then add the tag: announced, on the map and counted', async ({ page, isMobile }) => {
    await startTagging(page)
    await placeAwayFromTags(page, isMobile)
    await page.getByRole('button', { name: 'Use this spot' }).click()
    await expect(dialog(page).getByRole('heading', { name: 'Tag a dumped bike' })).toBeFocused()

    await page.getByRole('button', { name: 'Add to the map' }).click()
    await expect(dialog(page)).toContainText('Choose whose bike it is.')
    await expect(dialog(page)).toContainText("Choose what's wrong.")
    await expect(page.getByRole('radio', { name: 'Lime' })).toBeFocused()
    await expect(page.getByRole('group', { name: 'Whose bike?' })).toHaveAccessibleDescription(
      'Choose whose bike it is.',
    )
    await expectNoAxeViolations(page)

    await chip(page, 'Hello').click()
    await chip(page, 'Knocked over').click()
    await expect(page.getByRole('radio', { name: 'Hello' })).toBeChecked()
    await page.getByRole('button', { name: 'Add to the map' }).click()
    await expect(dialog(page)).toHaveCount(0)
    await expect(page.locator('#announcer')).toHaveText('Tag added')
    await expect(page.getByRole('heading', { name: '15 bikes in the graveyard' })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Hello e-bike, knocked over, / })).toHaveCount(2)
    await expect(page.getByRole('button', { name: 'Tag a dumped bike' })).toBeFocused()
  })

  test('keep the answers across Change location', async ({ page, isMobile }) => {
    await startTagging(page)
    await placeAwayFromTags(page, isMobile)
    await page.getByRole('button', { name: 'Use this spot' }).click()
    await chip(page, 'Lime').click()
    await chip(page, 'Blocking footpath').click()

    await page.getByRole('button', { name: 'Change location' }).click()
    await expect(dialog(page)).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Tag a dumped bike' })).toBeFocused()
    const map = await mapBox(page)
    await tap(page, isMobile, { x: map.x + map.width / 2 + 40, y: map.y + map.height / 2 + 40 })
    await page.getByRole('button', { name: 'Use this spot' }).click()
    await expect(page.getByRole('radio', { name: 'Lime' })).toBeChecked()
    await expect(page.getByRole('radio', { name: 'Blocking footpath' })).toBeChecked()
  })

  test.describe('by keyboard', () => {
    test.skip(({ isMobile }) => isMobile, 'the desktop project')

    test('hold Tab inside, leave the rest untouchable, and give focus back on Esc', async ({ page }) => {
      await startTagging(page)
      await placeAwayFromTags(page, false)
      await page.getByRole('button', { name: 'Use this spot' }).click()
      await expect(dialog(page).getByRole('heading', { name: 'Tag a dumped bike' })).toBeFocused()

      // After the last control, focus visits the browser's own toolbar (the page sees body), then comes back.
      const visited = new Set<string>()
      for (let i = 0; i < 20; i++) {
        await page.keyboard.press('Tab')
        visited.add(
          await page.evaluate(() => {
            const at = document.activeElement
            return at === document.body ? 'browser' : at?.closest('dialog') ? 'dialog' : at!.outerHTML.slice(0, 80)
          }),
        )
      }
      expect([...visited].sort()).toEqual(['browser', 'dialog'])
      // A click on the dimmed map's zoom button does nothing.
      const pin = page.locator('.maplibregl-marker:not([data-tag])')
      const before = await tip(pin)
      const zoomIn = (await page.getByRole('button', { name: 'Zoom in', includeHidden: true }).boundingBox())!
      await page.mouse.click(zoomIn.x + zoomIn.width / 2, zoomIn.y + zoomIn.height / 2)
      await page.waitForTimeout(300)
      expect(await tip(pin)).toEqual(before)

      await page.keyboard.press('Escape')
      await expect(dialog(page)).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Tag a dumped bike' })).toBeFocused()
    })
  })
})

test.describe('Still there and Removed', () => {
  const LLEWELLYN_ST = '5eed0000-0000-4000-8000-000000000003'
  const status = () => sql(`SELECT status FROM tags WHERE id = '${LLEWELLYN_ST}'`).then(([tag]) => tag.status)
  // Times are shown in whole hours, rounded down: just restarted, 48 hours read as 47.
  const RESTARTED = '47 h'
  const row = (page: Page, street: string) =>
    page.getByRole('listitem').filter({ has: page.getByRole('link', { name: new RegExp(street) }) })

  test('on the card: Still there restarts the 48 hours, and Removed takes the pin away', async ({
    page,
    browserName,
  }) => {
    await page.goto('/')
    await expect(page.locator('[data-map-ready]')).toBeAttached()
    // By keyboard, as on a phone this pin overlaps others and a tap opens the chooser.
    await page.getByRole('button', { name: /Llewellyn St, Marrickville/ }).focus()
    await page.keyboard.press('Enter')
    const card = page.getByRole('region', { name: 'Lime e-bike' })
    await expect(card).toContainText(/Disappears in (39|40) h/)
    await expectNoAxeViolations(page)

    await card.getByRole('button', { name: 'Still there' }).click()
    await expect(page.locator('#announcer')).toHaveText('Marked still there')
    await expect(card).toContainText(`Disappears in ${RESTARTED}`)
    // Focus stays in the sheet: on the button, or, as Safari doesn't focus a tapped button, on the sheet around it.
    expect(await page.locator('#sheet').evaluate((sheet) => sheet.contains(document.activeElement))).toBe(true)

    await card.getByRole('button', { name: 'Removed' }).click()
    await expect(page.locator('#announcer')).toHaveText('Removed.')
    await expect(card).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Llewellyn St, Marrickville/ })).toHaveCount(0)
    const count = page.getByRole('heading', { name: '13 bikes in the graveyard' })
    await expect(count).toBeVisible()
    // The count takes the focus the button had. Safari never gave it to the button, so it stays on the sheet.
    if (browserName !== 'webkit') await expect(count).toBeFocused()
    expect(await status()).toBe('removed')
  })

  test('on /list: each row has both, and the fourth removal of the day meets the limit', async ({ page }) => {
    await page.goto('/list')
    await row(page, 'Llewellyn St').getByRole('button', { name: 'Still there' }).click()
    await expect(page.locator('#announcer')).toHaveText('Marked still there')
    await expect(row(page, 'Llewellyn St').getByRole('link')).toContainText(`${RESTARTED} left`)
    await expectNoAxeViolations(page)

    for (const street of ['Llewellyn St', 'Norton St', 'Marion St']) {
      await row(page, street).getByRole('button', { name: 'Removed' }).click()
      await expect(row(page, street).getByText('Removed.')).toBeFocused()
    }
    await row(page, 'Illawarra Rd').getByRole('button', { name: 'Removed' }).click()
    await expect(row(page, 'Illawarra Rd')).toContainText("You've reached the limit for now. Try again later.")
    await expect(page.locator('#announcer')).toHaveText("You've reached the limit for now. Try again later.")
    await expectNoAxeViolations(page)

    await page.reload()
    await expect(page.getByRole('heading', { name: '11 bikes in the graveyard' })).toBeVisible()
    await expect(row(page, 'Illawarra Rd')).toHaveCount(1)
  })

  test("on a tag's page: Still there, then Removed", async ({ page }) => {
    await page.goto(`/tag/${LLEWELLYN_ST}`)
    await page.getByRole('button', { name: 'Still there' }).click()
    await expect(page.getByText(`Disappears in ${RESTARTED}`)).toBeVisible()
    await page.getByRole('button', { name: 'Removed' }).click()
    await expect(page.getByText('Removed.')).toBeFocused()
    expect(await status()).toBe('removed')
    await page.reload()
    await expect(page.getByRole('heading', { name: 'This tag has gone' })).toBeVisible()
  })

  test('say so when the tag has already gone', async ({ page }) => {
    await page.goto(`/tag/${LLEWELLYN_ST}`)
    await sql(`UPDATE tags SET expires_at = now() WHERE id = '${LLEWELLYN_ST}'`)
    await page.getByRole('button', { name: 'Still there' }).click()
    await expect(page.getByText('This tag has already gone.')).toBeFocused()
    await expect(page.locator('#announcer')).toHaveText('This tag has already gone.')
  })
})
