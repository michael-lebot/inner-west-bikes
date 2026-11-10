import { readFileSync } from 'node:fs'
import { AxeBuilder } from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'
import pg from 'pg'

export const E2E_DATABASE_URL = 'postgresql://iwb:iwb@localhost:54318/iwb_e2e'
const SEED = readFileSync(new URL('../packages/server/prisma/seed.sql', import.meta.url), 'utf8')

/** Runs SQL against the end-to-end database. */
export async function sql(text: string) {
  const client = new pg.Client(E2E_DATABASE_URL)
  await client.connect()
  try {
    return (await client.query(text)).rows
  } finally {
    await client.end()
  }
}

/** Empties every table, puts back the unpaused site_state row, and loads the seed: 14 live tags. */
export const resetDb = () =>
  sql(`TRUNCATE tags, rate_counters, daily_salts, site_state CASCADE; INSERT INTO site_state (id) VALUES (1); ${SEED}`)

/**
 * Fails on any WCAG 2.2 A or AA violation axe finds, whatever impact it gives it (§10.6). The map's pins alone are
 * spared the target-size rule: they sit where the bikes are, so they may overlap, and overlapping pins open a
 * chooser (§10.5), which is 2.5.8's "equivalent" exception.
 */
export async function expectNoAxeViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .disableRules(['target-size'])
    .analyze()
  const targets = await new AxeBuilder({ page }).withRules(['target-size']).exclude('[data-tag]').analyze()
  expect(
    [...violations, ...targets.violations].map(
      (v) => `${v.id}: ${v.nodes.map((node) => node.target.join(' ')).join(', ')}`,
    ),
  ).toEqual([])
}

/** Opens the map screen, once its map is ready, or /list, and starts tagging there. */
export async function startTagging(page: Page, path: '/' | '/list' = '/') {
  await page.goto(path)
  if (path === '/') await expect(page.locator('[data-map-ready]')).toBeAttached()
  await page.getByRole('button', { name: 'Tag a dumped bike' }).click()
  await expect(page.getByRole('heading', { name: 'Tag a dumped bike' })).toBeFocused()
}

/** The placement bar's line: where the pin is, or why there is none. */
export const bar = (page: Page) => page.locator('#placement-heading + p')

export const mapBox = async (page: Page) =>
  (await page.getByRole('region', { name: 'Map', exact: true }).boundingBox())!

/** A tap on a phone, a click on the desktop. */
export async function tap(page: Page, isMobile: boolean, { x, y }: { x: number; y: number }) {
  if (isMobile) await page.touchscreen.tap(x, y)
  else await page.mouse.click(x, y)
}

/** A chip's label, which is what a visitor taps; the radio inside it is visually hidden. */
export const chip = (page: Page, name: string) => page.getByRole('radio', { name }).locator('..')

/** The new tag's pin: the one marker that isn't a live tag's. */
export const newPin = (page: Page) => page.locator('.maplibregl-marker:not([data-tag])')

/** The id of the one tag a test added: the seeded ones start 5eed. */
export const newTagId = async () => (await sql(`SELECT id FROM tags WHERE id::text NOT LIKE '5eed%'`))[0].id as string

/** A tag's events, oldest first. */
export const tagEvents = (id: string) =>
  sql(`SELECT type FROM tag_events WHERE tag_id = '${id}' ORDER BY at`).then((rows) => rows.map((row) => row.type))

/**
 * Undoes a tag's removal in the admin app beside the public site, as Michael would (§4.6): the tag's public link
 * pasted into the lookup, then Undo removal.
 */
export async function undoInAdmin(page: Page, id: string) {
  const admin = await page.context().newPage()
  await admin.goto('http://localhost:3001/tags')
  const lookup = admin.getByRole('textbox', { name: 'Tag id or link' })
  await lookup.fill(`http://localhost:3000/tag/${id}`)
  await lookup.press('Enter')
  await admin.getByRole('button', { name: 'Undo removal' }).click()
  await expect(admin.getByText('Undone: the tag is live again, with the time it had left.')).toBeVisible()
  await admin.close()
}
