import { expect, test } from '@playwright/test'

const ADDRESS = 'hello@innerwestbikegraveyard.com'

test('the privacy page opens with the TLDR, and both it and the accessibility page give the contact address', async ({
  page,
}) => {
  await page.goto('/privacy')
  await expect(page.getByRole('main').locator('p').first()).toHaveText(/^TLDR; I used AI to create this app\./)
  for (const path of ['/privacy', '/accessibility']) {
    await page.goto(path)
    await expect(page.getByRole('main').getByRole('link', { name: ADDRESS }), path).toHaveAttribute(
      'href',
      `mailto:${ADDRESS}`,
    )
  }
})
