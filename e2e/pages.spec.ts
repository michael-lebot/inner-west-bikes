import { expect, test } from '@playwright/test'
import { expectNoAxeViolations, resetDb, sql } from './support'

const LLEWELLYN_ST = '5eed0000-0000-4000-8000-000000000003'

// The production policy with the default local tiles, so no tile origin in connect-src.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'nonce-NONCE' 'strict-dynamic'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  'worker-src blob:',
  'child-src blob:',
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ')

test.beforeEach(() => resetDb())

test.describe('the map screen shell', () => {
  test('has the header, the map and, on phones, the Map | List toggle, with no CSP errors', async ({
    page,
    isMobile,
  }) => {
    const errors: string[] = []
    page.on('console', (message) => message.type() === 'error' && errors.push(message.text()))
    await page.goto('/')
    await expect(page.getByRole('banner').getByRole('link', { name: 'Why this page exists' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Map', exact: true })).toBeVisible()
    const view = page.getByRole('navigation', { name: 'View' })
    // The side panel lists the tags itself, so it has no toggle (§13).
    if (isMobile) await expect(view.getByRole('link', { name: 'Map' })).toHaveAttribute('aria-current', 'page')
    else await expect(view).toBeHidden()
    await expectNoAxeViolations(page)
    expect(errors).toEqual([])
  })

  test('is sent with the full CSP, a fresh nonce on every script, and the security headers', async ({ request }) => {
    const nonces: string[] = []
    for (const response of [await request.get('/'), await request.get('/')]) {
      const headers = response.headers()
      const csp = headers['content-security-policy'] ?? ''
      const nonce = csp.match(/'nonce-([^']+)'/)?.[1] ?? ''
      expect(nonce).toBeTruthy()
      expect(csp.replace(nonce, 'NONCE')).toBe(CSP)
      expect(headers['x-content-type-options']).toBe('nosniff')
      expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
      expect(headers['permissions-policy']).toBe('geolocation=(self)')
      const scripts = (await response.text()).match(/<script[^>]*>/g) ?? []
      expect(scripts.length).toBeGreaterThan(0)
      for (const script of scripts) expect(script).toContain(`nonce="${nonce}"`)
      nonces.push(nonce)
    }
    expect(nonces[0]).not.toBe(nonces[1])
  })

  test('shows a 3 px focus ring on the header link', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Tab moves through links on desktop browsers')
    await page.goto('/')
    const why = page.getByRole('link', { name: 'Why this page exists' })
    while (!(await why.evaluate((link) => link === document.activeElement))) await page.keyboard.press('Tab')
    await expect(why).toHaveCSS('outline-width', '3px')
    await expect(why).toHaveCSS('outline-style', 'solid')
  })

  test('fits "Why this page exists" on one line on a desktop', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Phones wrap it onto two lines, as the mockup does')
    await page.goto('/')
    const lines = await page.getByRole('link', { name: 'Why this page exists' }).evaluate((link) => {
      const range = document.createRange()
      range.selectNodeContents(link)
      return range.getClientRects().length
    })
    expect(lines).toBe(1)
  })
})

test('pages reflow at 320 px wide with no horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  for (const path of ['/', '/list', `/tag/${LLEWELLYN_ST}`, '/privacy']) {
    await page.goto(path)
    expect(await page.evaluate(() => document.documentElement.scrollWidth), path).toBeLessThanOrEqual(320)
  }
})

test.describe('the list', () => {
  test('shows every live tag once, grouped by suburb, in order', async ({ page }) => {
    await page.goto('/list')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('14 bikes in the graveyard')
    const rows = page.getByRole('main').getByRole('listitem').getByRole('link')
    await expect(rows).toHaveCount(14)
    expect(new Set(await rows.evaluateAll((links) => links.map((link) => link.getAttribute('href')))).size).toBe(14)

    const groups = await page.getByRole('heading', { level: 2 }).allTextContents()
    expect(groups).toContain('Marrickville · 3')
    const suburbs = groups.map((group) => group.split(' · ')[0] ?? '')
    expect(suburbs).toEqual(suburbs.toSorted((a, b) => a.localeCompare(b)))
    const marrickville = page.getByRole('main').locator('section').filter({ hasText: 'Marrickville · 3' })
    await expect(marrickville.locator('b')).toHaveText(['Illawarra Rd', 'Llewellyn St', 'Sydenham Rd'])
    await expectNoAxeViolations(page)
  })

  test('opens a tag page from a row, and links to the text pages from its footer', async ({ page }) => {
    await page.goto('/list')
    await page.getByRole('link', { name: /Llewellyn St/ }).click()
    await expect(page).toHaveURL(`/tag/${LLEWELLYN_ST}`)
    await page.goBack()
    await page.getByRole('contentinfo').getByRole('link', { name: 'Privacy' }).click()
    await expect(page).toHaveURL('/privacy')
  })

  test('makes every link at least 44 × 44 px, and lines the footer up with the column', async ({ page }) => {
    await page.goto('/list')
    const small = await page.getByRole('link').evaluateAll((links) =>
      links.flatMap((link) => {
        const { width, height } = link.getBoundingClientRect()
        return width < 44 || height < 44 ? [`${link.textContent}: ${width} × ${height}`] : []
      }),
    )
    expect(small).toEqual([])
    const column = await page.getByRole('main').boundingBox()
    const footer = await page.getByRole('contentinfo').getByRole('navigation').boundingBox()
    expect(footer?.x).toBe(column?.x)
  })

  test('shows the empty state when no tag is live', async ({ page }) => {
    await sql('TRUNCATE tags CASCADE')
    await page.goto('/list')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('No bikes in the graveyard right now.')
    await expectNoAxeViolations(page)
  })

  test.describe('without JavaScript', () => {
    test.use({ javaScriptEnabled: false })

    test('still lists every tag', async ({ page }) => {
      await page.goto('/list')
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('14 bikes in the graveyard')
      await expect(page.getByRole('main').getByRole('listitem')).toHaveCount(14)
    })
  })
})

test.describe('the tag page', () => {
  test('shows a live tag', async ({ page }) => {
    await page.goto(`/tag/${LLEWELLYN_ST}`)
    // The accessible name leaves out the decorative pin and its letter.
    await expect(page.getByRole('heading', { level: 1, name: 'Lime e-bike', exact: true })).toBeVisible()
    await expect(page.getByRole('main')).toContainText('Blocking footpath')
    await expect(page.getByRole('main')).toContainText('Llewellyn St, Marrickville')
    await expect(page.getByRole('main')).toContainText(/Last seen \d+ h ago/)
    await expect(page.getByRole('main')).toContainText(/Disappears in \d+ h/)
    await expectNoAxeViolations(page)
  })

  test('is a 404 saying "This tag has gone" for a removed, unknown or malformed id', async ({ page }) => {
    await sql(`UPDATE tags SET status = 'removed' WHERE id = '${LLEWELLYN_ST}'`)
    for (const id of [LLEWELLYN_ST, '00000000-0000-4000-8000-000000000000', 'not-a-uuid']) {
      const response = await page.goto(`/tag/${id}`)
      expect(response?.status(), id).toBe(404)
      // Both the server's HTML and the hydrated page name it, not "Tagged bike".
      expect(await response?.text(), id).toContain('<title>This tag has gone')
      await expect(page).toHaveTitle(/^This tag has gone/)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('This tag has gone')
    }
    await expectNoAxeViolations(page)
  })
})

test('the text pages each say the site is being built, have one h1 and headings in order, and pass axe', async ({
  page,
}) => {
  for (const path of ['/why', '/accessibility', '/privacy', '/terms']) {
    await page.goto(path)
    await expect(page.getByRole('main'), path).toContainText('This site is still being built.')
    const levels = await page.locator('h1, h2, h3, h4').evaluateAll((headings) => headings.map((h) => +h.tagName[1]!))
    expect(levels[0], path).toBe(1)
    expect(
      levels.filter((level) => level === 1),
      path,
    ).toHaveLength(1)
    levels.forEach((level, i) => expect(level - (levels[i - 1] ?? 0), path).toBeLessThanOrEqual(1))
    await expectNoAxeViolations(page)
  }
  await page.goto('/why')
  await expect(page.getByRole('main')).toContainText('Placeholder: Michael will supply this text.')
})

test('an unknown address is a 404', async ({ page }) => {
  const response = await page.goto('/no-such-page')
  expect(response?.status()).toBe(404)
  await expect(page).toHaveTitle(/^Page not found/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found')
  await expectNoAxeViolations(page)
})
