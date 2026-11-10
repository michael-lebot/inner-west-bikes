import { expect, type Page, test } from '@playwright/test'
import { addPhoto, chip, expectNoAxeViolations, resetDb, sql } from './support'

test.beforeEach(() => resetDb())
test.use({ reducedMotion: 'reduce' })

// The seeded Lime e-bike on Llewellyn St, Marrickville, blocking the footpath.
const LLEWELLYN_ST = '5eed0000-0000-4000-8000-000000000003'
const ALT = 'Photo of a Lime e-bike reported as blocking footpath'
const HIDDEN = 'Photo hidden while we check it'

const dialog = (page: Page) => page.getByRole('dialog')
const announced = (page: Page) => page.locator('#announcer')
const reportLink = (page: Page) => page.getByRole('button', { name: 'Report this photo' })
const thumbnail = (page: Page) => page.getByRole('img', { name: ALT })
const reports = () => sql('SELECT reason::text FROM photo_reports')

/** Opens a tag's card on the map from its pin, as the keyboard does, once its photo has loaded. */
async function openCard(page: Page, id: string) {
  await page.goto('/')
  await expect(page.locator('[data-map-ready]')).toBeAttached()
  await page.locator(`[data-tag="${id}"] button`).focus()
  await page.keyboard.press('Enter')
  await expect.poll(() => thumbnail(page).evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(32)
}

/** Reports the photo the page shows, for `reason`. */
async function report(page: Page, reason: string) {
  await reportLink(page).click()
  await chip(page, reason).click()
  await dialog(page).getByRole('button', { name: 'Report', exact: true }).click()
  await expect(dialog(page)).toBeHidden()
}

test('reports a photo from its card: text takes its place at once, the same size, and its URL is 404', async ({
  page,
}) => {
  const photoId = await addPhoto(LLEWELLYN_ST)
  await openCard(page, LLEWELLYN_ST)
  const { width, height } = (await thumbnail(page).boundingBox())!
  expect((await reportLink(page).boundingBox())?.height).toBeGreaterThanOrEqual(44)

  await reportLink(page).click()
  await expect(dialog(page).getByRole('heading', { name: 'Report this photo' })).toBeFocused()
  // Sent with no reason, the form says what is missing and focuses the first reason.
  await dialog(page).getByRole('button', { name: 'Report', exact: true }).click()
  await expect(dialog(page).getByText('Choose why you are reporting it.')).toBeVisible()
  await expect(dialog(page).getByRole('radio', { name: 'Not a share bike' })).toBeFocused()
  await expectNoAxeViolations(page)
  await chip(page, 'Shows a person, face or number plate').click()
  await dialog(page).getByRole('button', { name: 'Report', exact: true }).click()

  await expect(dialog(page)).toBeHidden()
  await expect(announced(page)).toHaveText('Photo reported and hidden')
  // The link has gone with the photo, so the card's heading has the focus.
  await expect(page.locator('#card-heading')).toBeFocused()
  await expect(reportLink(page)).toHaveCount(0)
  // The same size as the thumbnail, so nothing in the card moves.
  expect(await page.getByText(HIDDEN).boundingBox()).toMatchObject({ width, height })
  expect(await reports()).toEqual([{ reason: 'privacy' }])
  for (const path of [`/photo/${photoId}`, `/photo/${photoId}/thumb`])
    expect((await page.request.get(path)).status(), path).toBe(404)
  await expectNoAxeViolations(page)
})

test('Cancel and Esc close the report form and give the focus back to the link, reporting nothing', async ({
  page,
}) => {
  await addPhoto(LLEWELLYN_ST)
  await openCard(page, LLEWELLYN_ST)
  await reportLink(page).click()
  await dialog(page).getByRole('button', { name: 'Cancel' }).first().click()
  await expect(dialog(page)).toBeHidden()
  await expect(reportLink(page)).toBeFocused()
  await reportLink(page).click()
  await expect(dialog(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog(page)).toBeHidden()
  await expect(reportLink(page)).toBeFocused()
  expect(await reports()).toEqual([])
})

test("reports a photo from its tag's page, which then gives the focus to its heading", async ({ page }) => {
  await addPhoto(LLEWELLYN_ST)
  await page.goto(`/tag/${LLEWELLYN_ST}`)
  await report(page, 'Not a share bike')
  await expect(page.getByText(HIDDEN)).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
  await expect(announced(page)).toHaveText('Photo reported and hidden')
  // Drawn again from the server, the page shows no photo: its tag no longer has one to show.
  await page.reload()
  await expect(thumbnail(page)).toHaveCount(0)
  await expect(reportLink(page)).toHaveCount(0)
  await expectNoAxeViolations(page)
})
