import { expect, type Page, test } from '@playwright/test'
import { expectNoAxeViolations, resetDb, sql } from './support'

test.use({ baseURL: 'http://localhost:3001' })

test.beforeEach(() => resetDb())

const LLEWELLYN = '5eed0000-0000-4000-8000-000000000003'

/** A seeded tag's status and time, read straight from the database. */
async function stored(id: string) {
  const [tag] = await sql(`SELECT status, expires_at FROM tags WHERE id = '${id}'`)
  return tag as { status: string; expires_at: Date }
}

const remove = (id: string, expiresAt = 'expires_at') =>
  sql(`UPDATE tags SET status = 'removed', removed_at = now(), expires_at = ${expiresAt} WHERE id = '${id}'`)

const region = (page: Page, name: string) => page.getByRole('region', { name })

test('lists the recent tags and passes axe on both screens', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL('/tags')
  await expect(page.getByText('No removed tags.')).toBeVisible()
  await expect(region(page, 'Recent tags').getByRole('row')).toHaveCount(1 + 14)
  await expect(page.getByRole('row', { name: /Llewellyn St/ })).toContainText('Yes')
  await expectNoAxeViolations(page)

  await page.getByRole('link', { name: 'Reported photos' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Reported photos')
  await expectNoAxeViolations(page)
})

test('has 44 px nav links with room for the whole focus ring', async ({ page }) => {
  await page.goto('/tags')
  for (const name of ['Reported photos', 'Tags']) {
    const box = await page.getByRole('link', { name }).boundingBox()
    expect(box?.width, name).toBeGreaterThanOrEqual(44)
    expect(box?.height, name).toBeGreaterThanOrEqual(44)
    // The ring is 3 px wide and 2 px out from the link, so it needs 5 px clear above it.
    expect(box?.y, name).toBeGreaterThanOrEqual(5)
  }
})

test('scrolls the tables, not the page, on a 320 px screen, and passes axe there', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await remove(LLEWELLYN)
  for (const path of ['/tags', `/tags/${LLEWELLYN}`]) {
    await page.goto(path)
    expect(await page.evaluate(() => document.documentElement.scrollWidth), path).toBeLessThanOrEqual(320)
    await expectNoAxeViolations(page)
  }
})

test('undo makes a removed tag live again with only the time it had left, and passes axe', async ({ page }) => {
  await remove(LLEWELLYN)
  const before = await stored(LLEWELLYN)
  await page.goto('/tags')
  await region(page, 'Recent removals').getByRole('link', { name: 'Llewellyn St' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Llewellyn St, Marrickville')
  await expect(region(page, 'Events').getByRole('row')).toHaveCount(1 + 1)
  await expectNoAxeViolations(page)

  await page.getByRole('button', { name: 'Undo removal' }).click()
  await expect(page).toHaveURL(`/tags/${LLEWELLYN}?notice=undone`)
  await expect(page.getByText('Undone: the tag is live again, with the time it had left.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Undo removal' })).toHaveCount(0)
  await expect(region(page, 'Events').getByRole('row').last()).toContainText('Undone by admin')
  expect(await stored(LLEWELLYN)).toEqual({ ...before, status: 'active' })
})

test("shows an expired removal as one it can't undo", async ({ page }) => {
  await remove(LLEWELLYN, "now() - interval '1 minute'")
  await page.goto(`/tags/${LLEWELLYN}`)
  await expect(page.getByText("Expired, can't undo.")).toBeVisible()
  await expect(page.getByRole('button', { name: 'Undo removal' })).toHaveCount(0)
})

test('takes a tag down only after asking, and passes axe on the question', async ({ page }) => {
  await page.goto(`/tags/${LLEWELLYN}`)
  await page.getByRole('link', { name: 'Take down…' }).click()
  await expect(
    page.getByText('Take this tag down? It goes off the map for good, and nobody can undo it.'),
  ).toBeVisible()
  await expectNoAxeViolations(page)
  await page.getByRole('link', { name: 'Cancel' }).click()
  await expect(page).toHaveURL(`/tags/${LLEWELLYN}`)
  expect((await stored(LLEWELLYN)).status).toBe('active')

  await page.getByRole('link', { name: 'Take down…' }).click()
  await page.getByRole('button', { name: 'Take down' }).click()
  await expect(page).toHaveURL(`/tags/${LLEWELLYN}?notice=taken_down`)
  await expect(page.getByText('Taken down. It is off the map for good.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Take down…' })).toHaveCount(0)
  expect((await stored(LLEWELLYN)).status).toBe('taken_down')
})

test('refuses a post from another site, or with no origin, and changes nothing', async ({ request }) => {
  await remove(LLEWELLYN)
  const origins: Record<string, string>[] = [
    { origin: 'https://evil.example' },
    { origin: 'http://localhost:3000' },
    {},
  ]
  for (const headers of origins) {
    for (const action of ['undo', 'take-down']) {
      const response = await request.post(`/api/tags/${LLEWELLYN}/${action}`, { headers, maxRedirects: 0 })
      expect(response.status(), `${action} from ${headers.origin}`).toBe(403)
    }
  }
  expect((await stored(LLEWELLYN)).status).toBe('removed')

  const response = await request.post(`/api/tags/${LLEWELLYN}/undo`, {
    headers: { origin: 'http://localhost:3001' },
    maxRedirects: 0,
  })
  expect(response.status()).toBe(303)
  expect(response.headers().location).toBe(`/tags/${LLEWELLYN}?notice=undone`)
})

test('answers 404 to a post for an id that is not a tag id', async ({ request }) => {
  for (const action of ['undo', 'take-down']) {
    const response = await request.post(`/api/tags/not-a-uuid/${action}`, {
      headers: { origin: 'http://localhost:3001' },
      maxRedirects: 0,
    })
    expect(response.status(), action).toBe(404)
  }
})

test('opens a tag from its id or its public link, and says when there is no id', async ({ page }) => {
  await page.goto('/tags')
  const lookup = page.getByRole('textbox', { name: 'Tag id or link' })
  await lookup.fill(`https://graveyard.example/tag/${LLEWELLYN.toUpperCase()}`)
  await lookup.press('Enter')
  await expect(page).toHaveURL(`/tags/${LLEWELLYN}`)

  await page.goto('/tags')
  await lookup.fill('Llewellyn St')
  await page.getByRole('button', { name: 'Find' }).click()
  await expect(lookup).toHaveAccessibleDescription(/That has no tag id in it/)
  await expect(lookup).toHaveAttribute('aria-invalid', 'true')
  await expectNoAxeViolations(page)

  expect((await page.goto('/tags/00000000-0000-4000-8000-000000000000'))?.status()).toBe(404)
})

test('is never indexed and sends its security headers', async ({ request }) => {
  const headers = (await request.get('/tags')).headers()
  expect(headers['x-robots-tag']).toBe('noindex, nofollow')
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'")
  expect(headers['x-content-type-options']).toBe('nosniff')
})
