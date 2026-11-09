// Photos (§4.3): attaching a tag's one photo, who may see it, deleting it, and whether uploads are paused (§4.6). Owns
// photos, site_state and the photo files. A photo's files are written before its row, and deleted again if the row
// isn't; its row is marked deleted before its files are deleted (plan §1.4).
import { randomUUID } from 'node:crypto'
import { AppError } from '@iwb/shared'
import { deleteFiles, getFile, listFiles, putFile } from './blob'
import { db } from './client'
import { Prisma } from './generated/prisma/client'
import { checkLimits, countAction } from './limits'
import { getLiveTag, LIVE } from './tags'
import type { Visitor } from './visitors'

/** A photo as the web app's processPhoto makes it: the WebP to keep, its thumbnail, and its size in pixels. */
export type NewPhoto = { full: Buffer; thumb: Buffer; width: number; height: number }

/** Photo uploads are paused (§4.6). */
const PAUSED = Prisma.sql`(SELECT uploads_paused_at IS NOT NULL FROM site_state)`
/** The visitor tagged this bike: only they may add its photo (§4.3). For a query on tags. */
const taggedBy = (visitor: Visitor) => Prisma.sql`
  EXISTS (SELECT 1 FROM tag_events
          WHERE tag_id = tags.id AND type = 'created' AND visitor_hash = ${visitor.visitorHash})`

/** Whether photo uploads are paused (§4.6). Tagging without a photo carries on as normal. */
export async function uploadsPaused() {
  const [state] = await db.$queryRaw<{ paused: boolean }[]>`SELECT ${PAUSED} AS paused`
  return state!.paused
}

/**
 * Throws the reason an attach isn't allowed (§4.3), or says whether the tag has its photo already. A photo is checked
 * for before the tag's time, so a repeat after the tag has gone answers with the tag as it is now.
 */
async function hasPhoto(tagId: string, visitor: Visitor) {
  const [tag] = await db.$queryRaw<{ mine: boolean; hasPhoto: boolean; live: boolean; paused: boolean }[]>`
    SELECT ${taggedBy(visitor)} AS mine, EXISTS (SELECT 1 FROM photos WHERE tag_id = tags.id) AS "hasPhoto",
           (${LIVE}) AS live, ${PAUSED} AS paused
    FROM tags WHERE id = ${tagId}::uuid`
  if (!tag) throw new AppError('tag_gone')
  if (!tag.mine) throw new AppError('not_allowed')
  if (tag.hasPhoto) return true
  if (!tag.live) throw new AppError('tag_gone')
  if (tag.paused) throw new AppError('uploads_paused')
  return false
}

/**
 * Attach (§4.3): a live tag's one photo, from the visitor who tagged the bike, while uploads aren't paused, with no
 * deadline. The photo's id is its tag's (§5.3): a tag that has its photo already answers as it is now, so a repeat
 * does nothing new. `makePhoto` decodes and re-encodes the upload, the costly part, so it runs only once every rule
 * and the rate limits allow the photo. The files go next, under random names, then the row, in one statement that
 * tests every rule again; if anything fails, the files are deleted.
 */
export async function attachPhoto({
  tagId,
  visitor,
  makePhoto,
}: {
  tagId: string
  visitor: Visitor
  makePhoto: () => Promise<NewPhoto>
}) {
  if (await hasPhoto(tagId, visitor)) return { tag: await getLiveTag(tagId) }
  await checkLimits('photo', visitor)
  const photo = await makePhoto()
  const [full, thumb] = [`${randomUUID()}.webp`, `${randomUUID()}.webp`]
  try {
    await Promise.all([putFile(full, photo.full), putFile(thumb, photo.thumb)])
    return await db.$transaction(async (tx) => {
      await countAction(tx, 'photo', visitor)
      const attached = await tx.$executeRaw`
        INSERT INTO photos (tag_id, blob_path, thumb_path, width, height, bytes)
        SELECT id, ${full}, ${thumb}, ${photo.width}, ${photo.height}, ${photo.full.length} FROM tags
        WHERE id = ${tagId}::uuid AND ${LIVE} AND ${taggedBy(visitor)} AND NOT ${PAUSED}
        ON CONFLICT (tag_id) DO NOTHING`
      // Rolling back takes the count back too.
      if (!attached) throw new AppError('conflict')
      return { tag: await getLiveTag(tagId, tx) }
    })
  } catch (error) {
    await deleteFiles([full, thumb])
    // Something changed since the check: say what, or answer with the photo another request attached first.
    if (error instanceof AppError && error.code === 'conflict' && (await hasPhoto(tagId, visitor)))
      return { tag: await getLiveTag(tagId) }
    throw error
  }
}

/**
 * A photo's file, or its thumbnail's, as a stream, while the photo is visible and its tag is live (§4.3); otherwise
 * null. It is checked on every request, so a photo that is reported, or whose tag has gone, stops loading at once.
 */
export async function openPhoto(id: string, size: 'full' | 'thumb') {
  const [photo] = await db.$queryRaw<{ blobPath: string; thumbPath: string }[]>`
    SELECT blob_path AS "blobPath", thumb_path AS "thumbPath" FROM photos
    WHERE id = ${id}::uuid AND status = 'visible' AND tag_id IN (SELECT id FROM tags WHERE ${LIVE})`
  return photo ? getFile(size === 'full' ? photo.blobPath : photo.thumbPath) : null
}

/** For the admin app: a photo's file whatever its state or its tag's, until it is deleted. */
export async function openAnyPhoto(id: string) {
  const [photo] = await db.$queryRaw<{ blobPath: string }[]>`
    SELECT blob_path AS "blobPath" FROM photos WHERE id = ${id}::uuid AND status <> 'deleted'`
  return photo ? getFile(photo.blobPath) : null
}

/** Marks the photos `which` picks deleted, then deletes their files, so a half-deleted photo is never served (§4.3). */
async function deletePhotos(which: Prisma.Sql) {
  const deleted = await db.$queryRaw<{ blobPath: string; thumbPath: string }[]>`
    UPDATE photos SET status = 'deleted', deleted_at = now() WHERE status <> 'deleted' AND ${which}
    RETURNING blob_path AS "blobPath", thumb_path AS "thumbPath"`
  await deleteFiles(deleted.flatMap((photo) => [photo.blobPath, photo.thumbPath]))
  return deleted.length
}

/** Take down (§4.2): the tag's photo goes at once. */
export const deleteTagPhoto = (tagId: string) => deletePhotos(Prisma.sql`tag_id = ${tagId}::uuid`)

/** Hourly step 1 (§5.4): the photos of tags whose time has run out, whatever their state, as none can come back. */
export const deleteExpiredPhotos = () =>
  deletePhotos(Prisma.sql`tag_id IN (SELECT id FROM tags WHERE expires_at <= now())`)

/**
 * Hourly step 2 (§5.4): files over an hour old that no photo has, counting a deleted photo's as unused (assumption 16):
 * a failed attach's or a failed deletion's. A file whose row is still being written is younger.
 */
export async function sweepOrphanFiles() {
  const files = await listFiles()
  const orphans = await db.$queryRaw<{ path: string }[]>`
    SELECT path FROM unnest(${files.map((file) => file.path)}::text[],
                            ${files.map((file) => file.uploadedAt)}::timestamptz[]) AS file (path, uploaded_at)
    WHERE uploaded_at < now() - interval '1 hour'
      AND NOT EXISTS (SELECT 1 FROM photos WHERE status <> 'deleted' AND path IN (blob_path, thumb_path))`
  await deleteFiles(orphans.map((orphan) => orphan.path))
  return orphans.length
}
