import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from './client'
import { runHourly } from './hourly'
import { clearOldHashes } from './visitors'

// The real first step, watched, so a test can make it fail once.
vi.mock('./visitors', async (importOriginal) => {
  const visitors = await importOriginal<typeof import('./visitors')>()
  return { ...visitors, clearOldHashes: vi.fn(visitors.clearOldHashes) }
})

const TAG = '5eed0000-0000-4000-8000-000000000001'
const PHOTO = '5eed0000-0000-4000-8000-0000000000f1'
// Request ids name the rows: 0b… past 30 days with hashes, 0c… past 30 days already cleared, 0d… inside 30 days.
const OLD = '0b000000-0000-4000-8000-000000000000'
const CLEARED = '0c000000-0000-4000-8000-000000000000'
const RECENT = '0d000000-0000-4000-8000-000000000000'

/** Rows of every kind the job looks at, on both sides of each age it acts on. */
async function seed() {
  await db.$executeRaw`TRUNCATE tags, rate_counters, daily_salts CASCADE`
  await db.$executeRaw`
    INSERT INTO tags (id, lat, lng, suburb, street, operator, problem, expires_at)
    VALUES (${TAG}::uuid, -33.904497, 151.171932, 'Marrickville', 'Llewellyn St', 'lime', 'blocking_footpath',
            now() + interval '1 hour')`
  await db.$executeRaw`
    INSERT INTO tag_events (tag_id, type, request_id, visitor_hash, ip_hash, at)
    VALUES (${TAG}::uuid, 'created', ${OLD}::uuid, 'visitor', 'ip', now() - interval '30 days 1 minute'),
           (${TAG}::uuid, 'still_there', ${CLEARED}::uuid, NULL, NULL, now() - interval '31 days'),
           (${TAG}::uuid, 'removed', ${RECENT}::uuid, 'visitor', 'ip', now() - interval '29 days 23 hours')`
  await db.$executeRaw`
    INSERT INTO photos (id, tag_id, blob_path, thumb_path, width, height, bytes)
    VALUES (${PHOTO}::uuid, ${TAG}::uuid, 'photo.webp', 'thumb.webp', 2048, 1536, 300000)`
  await db.$executeRaw`
    INSERT INTO photo_reports (photo_id, reason, request_id, visitor_hash, ip_hash, created_at)
    VALUES (${PHOTO}::uuid, 'other', ${OLD}::uuid, 'visitor', 'ip', now() - interval '30 days 1 minute'),
           (${PHOTO}::uuid, 'other', ${RECENT}::uuid, 'visitor', 'ip', now() - interval '29 days 23 hours')`
  await db.$executeRaw`
    INSERT INTO rate_counters (key, count, window_start)
    VALUES ('old', 1, now() - interval '48 hours 1 minute'), ('recent', 1, now() - interval '47 hours 59 minutes')`
  // A salt's day starts at midnight UTC: two days back has started 48 hours ago or more, yesterday hasn't.
  await db.$executeRaw`
    INSERT INTO daily_salts (day, salt)
    SELECT (now() AT TIME ZONE 'utc')::date - back, 'salt' FROM generate_series(0, 3) AS back`
}

/** Everything the job may change, in a fixed order. */
const rows = async () => ({
  events: await db.$queryRaw`SELECT request_id::text, visitor_hash, ip_hash FROM tag_events ORDER BY request_id`,
  reports: await db.$queryRaw`SELECT request_id::text, visitor_hash, ip_hash FROM photo_reports ORDER BY request_id`,
  counters: await db.$queryRaw`SELECT key FROM rate_counters ORDER BY key`,
  salts: await db.$queryRaw`SELECT (now() AT TIME ZONE 'utc')::date - day AS back FROM daily_salts ORDER BY back`,
})

beforeEach(seed)

describe('runHourly', () => {
  it('clears hashes past 30 days and deletes counters and salts past 48 hours, keeping the rest (§5.4 steps 3, 4)', async () => {
    expect(await runHourly()).toEqual({
      done: { clearOldHashes: 2, deleteOldCounters: 1, deleteOldSalts: 2 },
      failed: [],
    })
    expect(await rows()).toEqual({
      events: [
        { request_id: OLD, visitor_hash: null, ip_hash: null },
        { request_id: CLEARED, visitor_hash: null, ip_hash: null },
        { request_id: RECENT, visitor_hash: 'visitor', ip_hash: 'ip' },
      ],
      reports: [
        { request_id: OLD, visitor_hash: null, ip_hash: null },
        { request_id: RECENT, visitor_hash: 'visitor', ip_hash: 'ip' },
      ],
      counters: [{ key: 'recent' }],
      salts: [{ back: 0 }, { back: 1 }],
    })
  })

  it('runs the steps after one that fails, and names it', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(clearOldHashes).mockRejectedValueOnce(new Error('connection lost'))
    expect(await runHourly()).toEqual({
      done: { deleteOldCounters: 1, deleteOldSalts: 2 },
      failed: ['clearOldHashes'],
    })
    expect(await rows()).toMatchObject({ counters: [{ key: 'recent' }], salts: [{ back: 0 }, { back: 1 }] })
    expect(logged).toHaveBeenCalledWith('Hourly step clearOldHashes failed', expect.any(Error))
    logged.mockRestore()
  })

  it('§5.5 hourly job twice: two runs in a row and two runs at once leave the same rows as one run', async () => {
    await runHourly()
    const once = await rows()

    await seed()
    await runHourly()
    expect(await runHourly()).toEqual({
      done: { clearOldHashes: 0, deleteOldCounters: 0, deleteOldSalts: 0 },
      failed: [],
    })
    expect(await rows()).toEqual(once)

    await seed()
    await Promise.all([runHourly(), runHourly()])
    expect(await rows()).toEqual(once)
  })
})
