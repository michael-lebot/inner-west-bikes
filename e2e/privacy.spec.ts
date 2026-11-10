import { expect, test } from '@playwright/test'

const ADDRESS = 'hello@innerwestbikegraveyard.com'

test('the privacy page opens with the TLDR, and both it and the accessibility page give the contact address', async ({
  page,
}) => {
  await page.goto('/privacy')
  const tldr = page.getByRole('main').locator('p').first()
  await expect(tldr).toHaveText(/^TLDR; I used AI to create this app\./)
  // Each correction the fact-check made to it (the pull request that wrote this page lists them).
  for (const clause of [
    'bot check uses machine learning',
    'only in your browser',
    'only the spot you confirm is stored',
    'random ID',
    'sees your IP address',
    'scrambled (hashed)',
    "doesn't access your name, email address",
  ])
    await expect(tldr).toContainText(clause)
  for (const path of ['/privacy', '/accessibility']) {
    await page.goto(path)
    await expect(page.getByRole('main').getByRole('link', { name: ADDRESS }), path).toHaveAttribute(
      'href',
      `mailto:${ADDRESS}`,
    )
  }
})
