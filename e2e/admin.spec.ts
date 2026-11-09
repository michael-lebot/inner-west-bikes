import { expect, test } from '@playwright/test'
import { expectNoAxeViolations, resetDb } from './support'

test.use({ baseURL: 'http://localhost:3001' })

test.beforeEach(() => resetDb())

test('lists the recent tags and passes axe on both screens', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL('/tags')
  await expect(page.getByRole('row')).toHaveCount(1 + 14)
  await expect(page.getByRole('row', { name: /Llewellyn St/ })).toContainText('Yes')
  await expectNoAxeViolations(page)

  await page.getByRole('link', { name: 'Reported photos' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Reported photos')
  await expectNoAxeViolations(page)
})

test('is never indexed and sends its security headers', async ({ request }) => {
  const headers = (await request.get('/tags')).headers()
  expect(headers['x-robots-tag']).toBe('noindex, nofollow')
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'")
  expect(headers['x-content-type-options']).toBe('nosniff')
})
