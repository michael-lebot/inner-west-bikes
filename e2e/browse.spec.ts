import { expect, type Page, test } from '@playwright/test'
import { resetDb, sql } from './support'

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
    await page.keyboard.press('Escape')
    await expect(chooser).toHaveCount(0)
    expect(await page.evaluate(() => document.activeElement?.ariaLabel)).toMatch(/Leichhardt/)

    await norton.click({ force: true })
    await page.getByRole('link', { name: /Marion St/ }).click()
    await expect(chooser).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Marion St, Leichhardt/ })).toHaveAttribute('aria-expanded', 'true')
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
