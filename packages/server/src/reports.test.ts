import { rm } from 'node:fs/promises'
import { beforeEach, describe, expect, it } from 'vitest'
import { listFiles } from './blob'
import { db } from './client'
import { env } from './env'
import { attachPhoto, deleteExpiredPhotos, deletePhoto, openPhoto, restorePhoto } from './photos'
import { reportPhoto } from './reports'
import { markRemoved, takeDown, undoRemoval } from './tags'
import type { Visitor } from './visitors'

const TAG = '5eed0000-0000-4000-8000-000000000001'
const alice: Visitor = { visitorHash: 'a'.repeat(64), ipHash: '1'.repeat(64) }
const bob: Visitor = { visitorHash: 'b'.repeat(64), ipHash: '2'.repeat(64) }

let photoId: string
/** Bob reports the photo, or `visitor` does, with a request id of its own unless one is given. */
const report = (visitor = bob, requestId = crypto.randomUUID()) =>
  reportPhoto({ photoId, requestId, reason: 'privacy', visitor })

const status = async () =>
  (await db.$queryRaw<{ status: string }[]>`SELECT status::text FROM photos WHERE id = ${photoId}::uuid`)[0]!.status
const reports = () =>
  db.$queryRaw<{ reason: string; resolution: string | null; resolved: boolean }[]>`
    SELECT reason::text, resolution::text, resolved_at IS NOT NULL AS resolved FROM photo_reports ORDER BY created_at`
const counts = async () =>
  (await db.$queryRaw<{ count: number }[]>`SELECT count FROM rate_counters WHERE key LIKE 'report:%'`).map(
    (counter) => counter.count,
  )
const shown = async () => !!(await openPhoto(photoId, 'thumb'))

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE tags, rate_counters CASCADE`
  await rm(env.LOCAL_BLOB_DIR, { recursive: true, force: true })
  await db.$executeRaw`
    INSERT INTO tags (id, lat, lng, suburb, street, operator, problem, expires_at)
    VALUES (${TAG}::uuid, -33.904497, 151.171932, 'Marrickville', 'Llewellyn St', 'lime', 'damaged',
            now() + interval '1 hour')`
  await db.$executeRaw`
    INSERT INTO tag_events (tag_id, type, request_id, visitor_hash, ip_hash)
    VALUES (${TAG}::uuid, 'created', ${TAG}::uuid, ${alice.visitorHash}, ${alice.ipHash})`
  const photo = { full: Buffer.from('full'), thumb: Buffer.from('thumb'), width: 1600, height: 1200 }
  photoId = (await attachPhoto({ tagId: TAG, visitor: alice, makePhoto: async () => photo })).tag!.photoId!
})

describe('reportPhoto', () => {
  it('hides the photo, so it stops loading on the very next request, and records the report', async () => {
    expect(await shown()).toBe(true)
    expect(await report()).toEqual({ hidden: true })
    expect(await shown()).toBe(false)
    expect(await status()).toBe('hidden')
    expect(await reports()).toEqual([{ reason: 'privacy', resolution: null, resolved: false }])
    expect(await counts()).toEqual([1, 1])
  })

  it('§5.5 repeats: a report sent again with the same id answers the current state, with one row and one count', async () => {
    const requestId = crypto.randomUUID()
    const first = await report(bob, requestId)
    expect(await report(bob, requestId)).toEqual(first)
    expect(await reports()).toHaveLength(1)
    expect(await counts()).toEqual([1, 1])
  })

  it('refuses the same id from another visitor', async () => {
    const requestId = crypto.randomUUID()
    await report(bob, requestId)
    await expect(report(alice, requestId)).rejects.toMatchObject({ code: 'conflict' })
  })

  it('records a report on a photo already hidden, changing nothing else (assumption 14)', async () => {
    await report()
    expect(await report(alice)).toEqual({ hidden: true })
    expect(await reports()).toHaveLength(2)
    expect(await status()).toBe('hidden')
  })

  it('says a deleted photo has gone, recording nothing, but answers a repeat of an earlier report', async () => {
    const requestId = crypto.randomUUID()
    await report(bob, requestId)
    await deletePhoto(photoId)
    await expect(report()).rejects.toMatchObject({ code: 'photo_gone' })
    expect(await report(bob, requestId)).toEqual({ hidden: true })
    expect(await reports()).toHaveLength(1)
    photoId = '00000000-0000-4000-8000-000000000000'
    await expect(report()).rejects.toMatchObject({ code: 'photo_gone' })
  })

  it('stops a visitor at 5 reports a day, keeping nothing of the refused one', async () => {
    for (let i = 0; i < 5; i++) await report()
    await expect(report()).rejects.toMatchObject({ code: 'rate_limited' })
    expect(await reports()).toHaveLength(5)
  })

  it('§5.5 photo and tag together: report → remove → undo leaves the photo hidden', async () => {
    await report()
    await markRemoved({ tagId: TAG, requestId: crypto.randomUUID(), visitor: bob })
    expect(await undoRemoval(TAG)).toBe('undone')
    expect(await status()).toBe('hidden')
    expect(await shown()).toBe(false)
  })

  it('§5.5 photo and tag together: a restored photo is not hidden by a later report, which is still recorded', async () => {
    await report()
    expect(await restorePhoto(photoId)).toBe(true)
    expect(await shown()).toBe(true)
    expect(await report(alice)).toEqual({ hidden: false })
    expect(await shown()).toBe(true)
    expect(await reports()).toEqual([
      { reason: 'privacy', resolution: 'restored', resolved: true },
      { reason: 'privacy', resolution: null, resolved: false },
    ])
  })
})

describe('restorePhoto', () => {
  it('shows a hidden photo again and closes its open reports as restored, in one statement', async () => {
    await report()
    await report(alice)
    expect(await restorePhoto(photoId)).toBe(true)
    expect(await status()).toBe('visible')
    expect((await reports()).map((row) => row.resolution)).toEqual(['restored', 'restored'])
  })

  it('refuses a deleted photo, leaving its reports as they are', async () => {
    await report()
    await deletePhoto(photoId)
    expect(await restorePhoto(photoId)).toBe(false)
    expect(await status()).toBe('deleted')
    expect((await reports()).map((row) => row.resolution)).toEqual(['deleted'])
  })
})

describe('closing reports when a photo is deleted', () => {
  it('deletePhoto marks the photo deleted, closes its reports as deleted, then deletes its files', async () => {
    await report()
    expect(await deletePhoto(photoId)).toBe(1)
    expect(await status()).toBe('deleted')
    expect(await reports()).toEqual([{ reason: 'privacy', resolution: 'deleted', resolved: true }])
    expect(await listFiles()).toEqual([])
  })

  it('Take down closes them as deleted (assumption 15)', async () => {
    await report()
    await takeDown(TAG)
    expect((await reports()).map((row) => row.resolution)).toEqual(['deleted'])
  })

  it("the hourly job's expiry deletion closes them as expired, leaving reports already closed alone", async () => {
    await report()
    await restorePhoto(photoId)
    await report(alice)
    await db.$executeRaw`UPDATE tags SET expires_at = now() WHERE id = ${TAG}::uuid`
    expect(await deleteExpiredPhotos()).toBe(1)
    expect((await reports()).map((row) => row.resolution)).toEqual(['restored', 'expired'])
  })
})
