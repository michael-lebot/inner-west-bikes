import { expect, type Page, test } from '@playwright/test'
import { expectNoAxeViolations, resetDb, sql } from './support'

const LLEWELLYN_ST = '5eed0000-0000-4000-8000-000000000003'

test.beforeEach(() => resetDb())

test('counts the live tags by operator, and drops one that expires at the next refresh', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '14 bikes in the graveyard' })).toBeVisible()
  await expect(page.getByText('Tags disappear 48 hours after the last sighting.')).toBeVisible()
  await expect(page.getByRole('list', { name: 'Key' }).getByRole('listitem')).toHaveText([
    // After each pin's letter, which is hidden from screen readers.
    /Lime 7$/,
    /Hello 4$/,
    /Ario 3$/,
    /Not sure 0$/,
  ])
  await expect(page.getByRole('region', { name: 'Map', exact: true })).toHaveAccessibleDescription(
    'Map of the Inner West with 14 bikes tagged. A list view is available.',
  )

  await sql(`UPDATE tags SET expires_at = now() WHERE id = '${LLEWELLYN_ST}'`)
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.getByRole('heading', { name: '13 bikes in the graveyard' })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Key' }).getByRole('listitem').first()).toHaveText(/Lime 6$/)
})

test('keeps the newest tags when an older refresh answers last', async ({ page }) => {
  // The first request is answered with the 14 tags of that moment, but only after a newer one has come back.
  let seen: () => void
  const firstSeen = new Promise<void>((resolve) => (seen = resolve))
  let release: () => void
  const released = new Promise<void>((resolve) => (release = resolve))
  let calls = 0
  await page.route('**/api/tags', async (route) => {
    if (++calls > 1) return route.continue()
    const response = await route.fetch()
    seen()
    await released
    await route.fulfill({ response })
  })
  await page.goto('/')
  await firstSeen

  await sql(`UPDATE tags SET expires_at = now() WHERE id = '${LLEWELLYN_ST}'`)
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.getByRole('heading', { name: '13 bikes in the graveyard' })).toBeVisible()

  const stale = page.waitForResponse('**/api/tags')
  release!()
  await stale
  // Nothing to wait for if the stale answer is dropped, so give it the time it would take to show.
  await page.waitForTimeout(500)
  await expect(page.getByRole('heading', { name: '13 bikes in the graveyard' })).toBeVisible()
})

test('fits the map screen to the viewport, so the page never scrolls while the map shows', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('[data-map-ready]')).toBeAttached()
  const [scrollHeight, clientHeight] = await page.evaluate(() => [
    document.documentElement.scrollHeight,
    document.documentElement.clientHeight,
  ])
  expect(scrollHeight).toBe(clientHeight)
  await expectNoAxeViolations(page)
})

test('offers the list when the tiles fail to load', async ({ page }) => {
  await page.route('**/*.pmtiles', (route) => route.abort())
  await page.goto('/')
  await expect(page.getByText("The map couldn't load.")).toHaveText("The map couldn't load. Use the list instead.")
  await expectNoAxeViolations(page)
  await page.getByRole('link', { name: 'Use the list instead.' }).click()
  await expect(page).toHaveURL('/list')
  await expect(page.getByRole('heading', { name: '14 bikes in the graveyard' })).toBeVisible()
})

test.describe('pins', () => {
  const pins = (page: Page) =>
    page.getByRole('region', { name: 'Map', exact: true }).getByRole('button', { name: /e-bike/ })

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('[data-map-ready]')).toBeAttached()
  })

  test('are one button per live tag, named in full, in suburb then street order', async ({ page }) => {
    await expect(pins(page)).toHaveCount(14)
    const names = await pins(page).evaluateAll((buttons) => buttons.map((button) => button.ariaLabel ?? ''))
    expect(names[0]).toMatch(
      /^Hello e-bike, blocking footpath, Liverpool Rd, Ashfield, disappears in 1 hour, at \d{1,2}:\d\d [ap]m \w+day$/,
    )
    const places = names.map((name) => name.split(', ').slice(2, 4).reverse().join(', '))
    expect(places).toEqual(places.toSorted())
  })

  test('select a lone pin on tap, and a focused pin on Enter even where pins overlap', async ({ page }) => {
    const ashfield = page.getByRole('button', { name: /Liverpool Rd, Ashfield/ })
    await ashfield.click()
    await expect(ashfield).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByRole('heading', { name: /bikes here/ })).toHaveCount(0)

    const norton = page.getByRole('button', { name: /Norton St, Leichhardt/ })
    await norton.focus()
    await page.keyboard.press('Enter')
    await expect(norton).toHaveAttribute('aria-expanded', 'true')
    await expect(ashfield).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByRole('heading', { name: /bikes here/ })).toHaveCount(0)
  })

  test('bob twice when selected, and not at all under reduced motion', async ({ page }) => {
    const ashfield = page.getByRole('button', { name: /Liverpool Rd, Ashfield/ })
    await ashfield.click()
    expect(await ashfield.evaluate((pin) => getComputedStyle(pin).animationIterationCount)).toBe('2')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    expect(await ashfield.evaluate((pin) => getComputedStyle(pin).animationName)).toBe('none')
  })

  test('tapped where they overlap, offer "2 bikes here" to choose from', async ({ page }) => {
    const norton = page.getByRole('button', { name: /Norton St, Leichhardt/ })
    // Marion St's pin covers part of Norton St's: the tap lands on whichever is on top.
    await norton.click({ force: true })
    const chooser = page.getByRole('heading', { name: '2 bikes here' })
    await expect(chooser).toBeFocused()
    await expectNoAxeViolations(page)
    await page.keyboard.press('Escape')
    await expect(chooser).toHaveCount(0)
    expect(await page.evaluate(() => document.activeElement?.ariaLabel)).toMatch(/Leichhardt/)

    await norton.click({ force: true })
    await page.getByRole('link', { name: /Marion St/ }).click()
    await expect(chooser).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Marion St, Leichhardt/ })).toHaveAttribute('aria-expanded', 'true')
  })

  test('can be reached from off screen with Move map and the zoom buttons alone', async ({ page }) => {
    // Instant camera moves, so each tap has landed before the next.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Zoom in' }).click()
    const balmain = page.getByRole('button', { name: /Darling St, Balmain/ })
    await expect(balmain).not.toBeInViewport()

    await page.getByRole('button', { name: 'Move map' }).click()
    const map = (await page.getByRole('region', { name: 'Map', exact: true }).boundingBox())!
    const towardsPin = async () => {
      const pin = (await balmain.boundingBox())!
      if (pin.y < map.y) return 'Move up'
      if (pin.y + pin.height > map.y + map.height) return 'Move down'
      if (pin.x < map.x) return 'Move left'
      if (pin.x + pin.width > map.x + map.width) return 'Move right'
    }
    for (let i = 0, arrow = await towardsPin(); arrow && i < 20; i++, arrow = await towardsPin())
      await page.getByRole('button', { name: arrow, exact: true }).click()
    await expect(balmain).toBeInViewport()
  })

  test('pan into view when focused off screen, without scrolling the page', async ({ page }) => {
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Zoom in' }).click()
    const balmain = page.getByRole('button', { name: /Darling St, Balmain/ })
    await expect(balmain).not.toBeInViewport()
    await balmain.focus()
    await expect(balmain).toBeInViewport()
    expect(await page.evaluate(() => [scrollX, scrollY])).toEqual([0, 0])
  })
})

test.describe('the tag card', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('[data-map-ready]')).toBeAttached()
  })

  test('opens from a pin by keyboard with focus on its heading, and Esc gives focus back to the pin', async ({
    page,
  }) => {
    const pin = page.getByRole('button', { name: /Liverpool Rd, Ashfield/ })
    await pin.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: 'Hello e-bike' })).toBeFocused()
    await expect(page.getByText('Liverpool Rd, Ashfield')).toBeVisible()
    await expect(page.getByText(/^Last seen \d+ h ago$/)).toBeVisible()
    await expectNoAxeViolations(page)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('heading', { name: 'Hello e-bike' })).toHaveCount(0)
    await expect(pin).toBeFocused()
  })

  test('closes on Esc while focus is back on the map, as it is not a dialog', async ({ page }) => {
    const pin = page.getByRole('button', { name: /Liverpool Rd, Ashfield/ })
    await pin.focus()
    await page.keyboard.press('Enter')
    await page.getByRole('button', { name: 'Zoom in' }).focus()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('heading', { name: 'Hello e-bike' })).toHaveCount(0)
    await expect(pin).toBeFocused()
  })

  test.describe('on a phone', () => {
    test.skip(({ isMobile }) => !isMobile, 'phones only')

    test('opens at half height, and shrinks to one line and back by tap and by flick', async ({ page }) => {
      await page.getByRole('button', { name: /Liverpool Rd, Ashfield/ }).click()
      const sheet = page.locator('#sheet')
      const viewport = page.viewportSize()!
      expect((await sheet.boundingBox())!.height).toBeGreaterThan(viewport.height * 0.45)

      const handle = page.getByRole('button', { name: 'Shrink card' })
      await expect(handle).toHaveAttribute('aria-expanded', 'true')
      await handle.click()
      const expand = page.getByRole('button', { name: 'Expand card' })
      await expect(expand).toHaveAttribute('aria-expanded', 'false')
      await expect(page.getByRole('heading', { name: 'Hello e-bike · Blocking footpath · Liverpool Rd' })).toBeVisible()
      await expect(page.getByText(/^Last seen/)).toBeHidden()
      expect((await sheet.boundingBox())!.height).toBeLessThan(viewport.height * 0.25)
      await expand.click()
      await expect(page.getByText(/^Last seen/)).toBeVisible()

      // A flick on the handle switches when the finger lifts: down shrinks the card, up brings it back.
      const flick = async (name: string, dy: number) => {
        const box = (await page.getByRole('button', { name }).boundingBox())!
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
        await page.mouse.down()
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + dy, { steps: 4 })
        await page.mouse.up()
      }
      await flick('Shrink card', 40)
      await expect(expand).toBeVisible()
      await flick('Expand card', -40)
      await expect(handle).toBeVisible()

      // A drag on the card's content is left to scrolling, and never switches it.
      const details = (await page.getByText(/^Last seen/).boundingBox())!
      await page.mouse.move(details.x + 10, details.y + 5)
      await page.mouse.down()
      await page.mouse.move(details.x + 10, details.y + 65, { steps: 4 })
      await page.mouse.up()
      await expect(handle).toHaveAttribute('aria-expanded', 'true')
    })
  })
})

test.describe('the desktop panel', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop only')

  test("lists the tags beside the map, and opens a row's card in place, outlining its pin", async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('[data-map-ready]')).toBeAttached()
    const panel = page.locator('#sheet')
    expect((await panel.boundingBox())!).toMatchObject({ x: 0, width: 380 })
    await expect(page.getByRole('navigation', { name: 'View' })).toBeHidden()
    await expect(panel.getByRole('heading', { name: 'Ashfield, 1 bike' })).toBeVisible()

    await panel.getByRole('link', { name: /Liverpool Rd/ }).click()
    await expect(page.getByRole('heading', { name: 'Hello e-bike' })).toBeFocused()
    await expect(page.getByRole('button', { name: 'Shrink card' })).toBeHidden()
    const pin = page.getByRole('button', { name: /Liverpool Rd, Ashfield/ })
    await expect(pin).toHaveAttribute('aria-expanded', 'true')
    expect(await pin.evaluate((button) => getComputedStyle(button).outlineWidth)).toBe('3px')

    await page.getByRole('button', { name: 'Close' }).click()
    await expect(panel.getByRole('heading', { name: 'Ashfield, 1 bike' })).toBeVisible()
    await expect(pin).toBeFocused()
  })
})
