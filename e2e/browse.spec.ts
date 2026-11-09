import { expect, test } from '@playwright/test'
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
