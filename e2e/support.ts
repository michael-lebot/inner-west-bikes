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
