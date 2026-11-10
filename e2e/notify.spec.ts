import { expect, type Page, test } from '@playwright/test'
import { expectNoAxeViolations, resetDb, sql } from './support'

test.beforeEach(() => resetDb())

// The seeded Lime e-bike on Llewellyn St, Marrickville, blocking the footpath, and the Ario one on Marion St.
const LLEWELLYN_ST = '5eed0000-0000-4000-8000-000000000003'
const MARION_ST = '5eed0000-0000-4000-8000-000000000002'
const MESSAGE =
  'I am reporting that there is a Lime e-bike blocking the footpath near Llewellyn St, Marrickville.\n\n' +
  'Coordinates: -33.904497, 151.171932\n' +
  `Tagged on The Inner West E-bike Graveyard: http://localhost:3000/tag/${LLEWELLYN_ST}`
const HREF =
  'mailto:support-au@li.me?subject=Lime%20e-bike%2C%20blocking%20footpath%2C%20Llewellyn%20St%2C%20Marrickville' +
  `&body=${encodeURIComponent(MESSAGE.replaceAll('\n', '\r\n'))}`

const cta = (page: Page) => page.getByText('Notify the service provider?')
const emailLink = (page: Page, operator = 'Lime') => page.getByRole('link', { name: `Email ${operator}` })
const message = (page: Page) => page.getByRole('textbox', { name: 'Message' })
const copy = (page: Page) => page.getByRole('button', { name: 'Copy message' })

test.describe('Notify the service provider?', () => {
  test('opens on the tag page to an email to the operator, and the message to copy, read-only', async ({ page }) => {
    await page.goto(`/tag/${LLEWELLYN_ST}`)
    await expect(emailLink(page)).toBeHidden()
    await cta(page).click()
    await expect(emailLink(page)).toHaveAttribute('href', HREF)
    await expect(
      page.getByText('Opens your own email app, addressed to support-au@li.me. This site sends nothing.'),
    ).toBeVisible()
    await expect(message(page)).toHaveValue(MESSAGE)
    await expect(message(page)).not.toBeEditable()
    // It comes after the questions the page is for, so they keep their place at the top.
    const below = async (page: Page) =>
      (await cta(page).boundingBox())!.y > (await page.getByRole('button', { name: 'Removed' }).boundingBox())!.y
    expect(await below(page)).toBe(true)
    await expectNoAxeViolations(page)
  })

  test('copies the message and says so', async ({ page, context, browserName }) => {
    // Only Chromium lets a test read the clipboard back; WebKit still has to copy and say so.
    if (browserName === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto(`/tag/${LLEWELLYN_ST}`)
    await cta(page).click()
    await copy(page).click()
    await expect(page.locator('#announcer')).toHaveText('Copied')
    await expect(page.getByText('Copied', { exact: true })).toBeVisible()
    if (browserName === 'chromium') expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(MESSAGE)
  })

  test("is on a pin's card too, by keyboard, writing to that tag's operator", async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('[data-map-ready]')).toBeAttached()
    await page.locator(`[data-tag="${MARION_ST}"] button`).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: 'Ario e-bike' })).toBeFocused()
    await cta(page).focus()
    await page.keyboard.press('Enter')
    await expect(emailLink(page, 'Ario')).toHaveAttribute(
      'href',
      /^mailto:feedback@ario\.com\?subject=Ario%20e-bike%2C%20in%20park%20or%20reserve%2C%20Marion%20St%2C%20Leichhardt&body=/,
    )
    await expect(message(page)).toHaveValue(
      'I am reporting that there is an Ario e-bike left in a park or reserve near Marion St, Leichhardt.\n\n' +
        'Coordinates: -33.883891, 151.155464\n' +
        `Tagged on The Inner West E-bike Graveyard: http://localhost:3000/tag/${MARION_ST}`,
    )
    // The message, then Copy, follow the link in the tab order.
    await emailLink(page, 'Ario').focus()
    await page.keyboard.press('Tab')
    await expect(message(page)).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(copy(page)).toBeFocused()
    await expectNoAxeViolations(page)
  })

  test('is left out when the visitor was not sure whose bike it is', async ({ page }) => {
    await sql(`UPDATE tags SET operator = 'not_sure' WHERE id = '${LLEWELLYN_ST}'`)
    await page.goto(`/tag/${LLEWELLYN_ST}`)
    await expect(page.getByRole('heading', { name: 'Share e-bike' })).toBeVisible()
    await expect(cta(page)).toHaveCount(0)
  })

  test.describe('without JavaScript', () => {
    test.use({ javaScriptEnabled: false })

    test('still opens, with the link and the message to select, and no Copy button that would do nothing', async ({
      page,
    }) => {
      await page.goto(`/tag/${LLEWELLYN_ST}`)
      await cta(page).click()
      await expect(emailLink(page)).toHaveAttribute('href', HREF)
      await expect(message(page)).toHaveValue(MESSAGE)
      await expect(copy(page)).toBeHidden()
    })
  })
})
