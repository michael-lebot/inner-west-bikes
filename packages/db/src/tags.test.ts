import { PROBLEMS, REPORT_REASONS } from '@iwb/shared'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './client'
import { Problem, ReportReason } from './generated/prisma/enums'
import { getLiveTag, listLiveTags, listRecentTags } from './tags'

const LIVE = '5eed0000-0000-4000-8000-000000000001'
const REMOVED = '5eed0000-0000-4000-8000-000000000002'
const TAKEN_DOWN = '5eed0000-0000-4000-8000-000000000003'
const EXPIRED = '5eed0000-0000-4000-8000-000000000004'

function insertTag(id: string, status: string, hoursLeft: number) {
  return db.$executeRaw`
    INSERT INTO tags (id, lat, lng, suburb, street, operator, problem, status, expires_at)
    VALUES (${id}::uuid, -33.904497, 151.171932, 'Marrickville', 'Llewellyn St', 'lime', 'blocking_footpath',
            ${status}::tag_status, now() + ${hoursLeft} * interval '1 hour')`
}

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE tags CASCADE`
  await insertTag(LIVE, 'active', 5)
  await insertTag(REMOVED, 'removed', 5)
  await insertTag(TAKEN_DOWN, 'taken_down', 5)
  await insertTag(EXPIRED, 'active', -1)
})

describe('listLiveTags', () => {
  it('leaves out removed, taken-down and expired tags', async () => {
    expect((await listLiveTags()).map((tag) => tag.id)).toEqual([LIVE])
  })

  it('returns the public fields only, with lat and lng as numbers', async () => {
    const [tag] = await listLiveTags()
    expect(tag).toEqual({
      id: LIVE,
      lat: -33.904497,
      lng: 151.171932,
      suburb: 'Marrickville',
      street: 'Llewellyn St',
      operator: 'lime',
      problem: 'blocking_footpath',
      lastConfirmedAt: expect.any(Date),
      expiresAt: expect.any(Date),
    })
  })
})

describe('getLiveTag', () => {
  it('returns a live tag', async () => {
    expect(await getLiveTag(LIVE)).toMatchObject({ id: LIVE })
  })

  it.each([REMOVED, TAKEN_DOWN, EXPIRED])('returns null for %s, which is not live', async (id) => {
    expect(await getLiveTag(id)).toBeNull()
  })
})

describe('listRecentTags', () => {
  it('lists tags in every state, saying which are live', async () => {
    const tags = await listRecentTags()
    expect(Object.fromEntries(tags.map((tag) => [tag.id, [tag.status, tag.live]]))).toEqual({
      [LIVE]: ['active', true],
      [REMOVED]: ['removed', false],
      [TAKEN_DOWN]: ['taken_down', false],
      [EXPIRED]: ['active', false],
    })
  })
})

describe('database enums', () => {
  it('Problem has the keys of PROBLEMS in config.ts', () => {
    expect(Object.values(Problem)).toEqual(Object.keys(PROBLEMS))
  })

  it('ReportReason has the keys of REPORT_REASONS in config.ts', () => {
    expect(Object.values(ReportReason)).toEqual(Object.keys(REPORT_REASONS))
  })
})
