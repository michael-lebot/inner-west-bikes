import { expect, type Page, type Response, test } from '@playwright/test'
import { chip, expectNoAxeViolations, newPin, resetDb, sql } from './support'

test.beforeEach(() => resetDb())
// Instant camera moves, so the map has settled when it is looked at.
test.use({ reducedMotion: 'reduce' })

const dialog = (page: Page) => page.getByRole('dialog')
const announced = (page: Page) => page.locator('#announcer')
const bar = (page: Page) => page.locator('#placement-heading + p')

async function startOnList(page: Page) {
  await page.goto('/list')
  await page.getByRole('button', { name: 'Tag a dumped bike' }).click()
  await expect(page.getByRole('heading', { name: 'Tag a dumped bike' })).toBeFocused()
}

async function startOnMap(page: Page) {
  await page.goto('/')
  await expect(page.locator('[data-map-ready]')).toBeAttached()
  await page.getByRole('button', { name: 'Tag a dumped bike' }).click()
  await expect(page.getByRole('heading', { name: 'Tag a dumped bike' })).toBeFocused()
}

/** Choose by street as far as its second step: the street found by typing and picked. */
async function pickStreet(page: Page, typed: string, street: string) {
  await page.getByRole('button', { name: 'Choose by street' }).click()
  await expect(dialog(page).getByRole('heading', { name: 'Choose by street' })).toBeFocused()
  await dialog(page).getByRole('searchbox', { name: 'Street' }).fill(typed)
  await dialog(page).getByRole('button', { name: street, exact: true }).click()
  await expect(dialog(page).getByRole('heading', { name: street })).toBeFocused()
}

async function findNumber(page: Page, number: string) {
  await dialog(page).getByRole('textbox', { name: 'House number' }).fill(number)
  await dialog(page).getByRole('button', { name: 'Find' }).click()
}

test.describe('Choose by street', () => {
  test('on /list, finds a house by its number and tags it, sending the spot but never the number', async ({ page }) => {
    const scripts: Response[] = []
    page.on('response', (response) => response.request().resourceType() === 'script' && scripts.push(response))
    await startOnList(page)
    await page.getByRole('button', { name: 'Choose by street' }).click()
    const search = dialog(page).getByRole('searchbox', { name: 'Street' })
    await search.fill('llew')
    await expect(dialog(page).getByText('5 streets match.')).toBeVisible()
    await expect(announced(page)).toHaveText('5 streets match.')
    await expect(dialog(page).getByRole('list', { name: 'Streets' }).getByRole('button')).toHaveText([
      'Llewellyn La, Marrickville',
      'Llewellyn St, Balmain',
      'Llewellyn St, Marrickville',
      'Llewellyn St, Newtown',
      'Little Llewellyn St, Balmain',
    ])
    await expectNoAxeViolations(page)

    await dialog(page).getByRole('button', { name: 'Llewellyn St, Marrickville' }).click()
    await expect(dialog(page).getByRole('heading', { name: 'Llewellyn St, Marrickville' })).toBeFocused()
    await findNumber(page, '9999')
    const unknown = "We don't have number 9999 on Llewellyn St. Try another number, or pick the nearest corner."
    await expect(dialog(page).getByRole('textbox', { name: 'House number' })).toHaveAccessibleDescription(unknown)
    await expect(announced(page)).toHaveText(unknown)
    await expectNoAxeViolations(page)

    await findNumber(page, '12')
    await expect(dialog(page).getByText('12 Llewellyn St, Marrickville')).toBeFocused()
    await expectNoAxeViolations(page)
    const posted = page.waitForRequest('/api/tags')
    await dialog(page).getByRole('button', { name: 'Use this spot' }).click()
    // About 110 m from the live tag on Llewellyn St, so the form comes straight away.
    await expect(dialog(page).getByRole('heading', { name: 'Tag a dumped bike' })).toBeFocused()
    await expect(dialog(page)).toContainText('Pin on Llewellyn St, Marrickville')
    await chip(page, 'Lime').click()
    await chip(page, 'Damaged').click()
    await dialog(page).getByRole('button', { name: 'Add to the map' }).click()
    await expect(announced(page)).toHaveText('Tag added')
    await expect(page.getByRole('heading', { name: '15 bikes in the graveyard' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Tag a dumped bike' })).toBeFocused()

    // The tag is the point and the street where() names, as any other (§10.3); the number stays in the browser.
    const body = (await posted).postDataJSON()
    expect(Object.keys(body).sort()).toEqual(['id', 'lat', 'lng', 'operator', 'problem'])
    expect(await sql(`SELECT suburb, street FROM tags WHERE id = '${body.id}'`)).toEqual([
      { suburb: 'Marrickville', street: 'Llewellyn St' },
    ])
    // And /list never loads the map (§10.3).
    for (const script of scripts) expect(await script.text()).not.toContain('maplibre')
  })

  test('on /list, lists the corners in order along the street, and asks about a live tag at the one chosen', async ({
    page,
  }) => {
    await startOnList(page)
    await pickStreet(page, 'llewellyn st marr', 'Llewellyn St, Marrickville')
    await expect(dialog(page).getByRole('list', { name: 'Or the nearest corner' }).getByRole('button')).toHaveText([
      'near Enmore Rd',
      'near Scouller La',
      'near Black St',
      "near O'Connor La",
      'near Juliett St',
      'near Shelleys La',
      'near Lynch La',
    ])
    await dialog(page).getByRole('button', { name: 'near Juliett St' }).click()
    await expect(dialog(page).getByText('Near the corner of Llewellyn St and Juliett St, Marrickville')).toBeFocused()

    // Back to the street, then on again.
    await dialog(page).getByRole('button', { name: 'Back' }).click()
    await expect(dialog(page).getByRole('heading', { name: 'Llewellyn St, Marrickville' })).toBeFocused()
    await dialog(page).getByRole('button', { name: 'near Juliett St' }).click()
    await dialog(page).getByRole('button', { name: 'Use this spot' }).click()
    // The seeded tag on Llewellyn St is 3 m from the corner.
    await expect(dialog(page).getByRole('heading', { name: 'Is it one of these?' })).toBeFocused()
    await dialog(page).getByRole('button', { name: "No, it's another bike" }).click()
    // The street a tag records is always the one nearest its point, which here is the cross street (assumption 10).
    await expect(dialog(page)).toContainText('Pin on Juliett St, Marrickville')
  })

  test('on the map, puts the pin there behind the form, where Change location lets a tap move it', async ({
    page,
    isMobile,
  }) => {
    await startOnMap(page)
    await pickStreet(page, 'llew', 'Llewellyn St, Marrickville')
    await findNumber(page, '12')
    await dialog(page).getByRole('button', { name: 'Use this spot' }).click()
    await expect(dialog(page).getByRole('heading', { name: 'Tag a dumped bike' })).toBeFocused()
    // The map behind the form shows the pin: in the strip above it on a phone, beside the panel on the desktop.
    const map = (await page.getByRole('region', { name: 'Map', exact: true }).boundingBox())!
    const pin = (await newPin(page).boundingBox())!
    expect(pin.y).toBeGreaterThanOrEqual(map.y)
    expect(pin.x).toBeGreaterThanOrEqual(map.x)
    expect(pin.x + pin.width).toBeLessThanOrEqual(map.x + map.width)

    await dialog(page).getByRole('button', { name: 'Change location' }).click()
    await expect(page.getByRole('heading', { name: 'Tag a dumped bike' })).toBeFocused()
    await expect(bar(page)).toHaveText('Pin on Llewellyn St, Marrickville')
    const at = (await newPin(page).boundingBox())!
    const spot = { x: at.x + at.width / 2 + 30, y: at.y + at.height }
    if (isMobile) await page.touchscreen.tap(spot.x, spot.y)
    else await page.mouse.click(spot.x, spot.y)
    await expect.poll(async () => (await newPin(page).boundingBox())!.x).toBeCloseTo(at.x + 30, 0)
  })

  test('closes on Cancel or Esc, leaving the placement bar as it was', async ({ page }) => {
    await startOnMap(page)
    for (const close of ['Cancel', 'Escape']) {
      await page.getByRole('button', { name: 'Choose by street' }).click()
      await expect(dialog(page).getByRole('heading', { name: 'Choose by street' })).toBeFocused()
      if (close === 'Cancel') await dialog(page).getByRole('button', { name: 'Cancel' }).click()
      else await page.keyboard.press('Escape')
      await expect(dialog(page)).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Choose by street' })).toBeFocused()
      await expect(bar(page)).toHaveText('Tap the map where the bike is.')
    }
  })

  test('keeps the search box and the streets above an on-screen keyboard', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'the phone projects')
    await startOnList(page)
    await page.getByRole('button', { name: 'Choose by street' }).click()
    await dialog(page).getByRole('searchbox', { name: 'Street' }).fill('llew')
    // An on-screen keyboard shrinks the visual viewport only, as it does on iOS and on Android.
    const keyboardTop = await page.evaluate(() => {
      const shown = innerHeight - 300
      Object.defineProperty(visualViewport, 'height', { get: () => shown })
      visualViewport!.dispatchEvent(new Event('resize'))
      return shown
    })
    const bottom = async () => {
      const box = (await dialog(page).boundingBox())!
      return box.y + box.height
    }
    await expect.poll(bottom).toBeCloseTo(keyboardTop, 0)
    for (const shown of [
      dialog(page).getByRole('searchbox', { name: 'Street' }),
      dialog(page).getByRole('button', { name: 'Llewellyn La, Marrickville' }),
    ]) {
      const box = (await shown.boundingBox())!
      expect(box.y + box.height).toBeLessThanOrEqual(keyboardTop)
    }
  })

  test.describe('by keyboard', () => {
    test.skip(({ isMobile }) => isMobile, 'the desktop project')

    test('types, Tabs to a street and a number, and uses the spot', async ({ page }) => {
      await page.goto('/list')
      await page.getByRole('button', { name: 'Tag a dumped bike' }).focus()
      await page.keyboard.press('Enter')
      await page.keyboard.press('Tab')
      await expect(page.getByRole('button', { name: 'Choose by street' })).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(dialog(page).getByRole('heading', { name: 'Choose by street' })).toBeFocused()
      await page.keyboard.press('Tab')
      await page.keyboard.press('Tab')
      await expect(dialog(page).getByRole('searchbox', { name: 'Street' })).toBeFocused()
      await page.keyboard.type('llewellyn st marr')
      await page.keyboard.press('Tab')
      await expect(dialog(page).getByRole('button', { name: 'Llewellyn St, Marrickville' })).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(dialog(page).getByRole('heading', { name: 'Llewellyn St, Marrickville' })).toBeFocused()
      await page.keyboard.press('Tab')
      await page.keyboard.press('Tab')
      await expect(dialog(page).getByRole('textbox', { name: 'House number' })).toBeFocused()
      await page.keyboard.type('12')
      await page.keyboard.press('Enter')
      await expect(dialog(page).getByText('12 Llewellyn St, Marrickville')).toBeFocused()
      await page.keyboard.press('Tab')
      await page.keyboard.press('Tab')
      await expect(dialog(page).getByRole('button', { name: 'Use this spot' })).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(dialog(page).getByRole('heading', { name: 'Tag a dumped bike' })).toBeFocused()
    })
  })
})
