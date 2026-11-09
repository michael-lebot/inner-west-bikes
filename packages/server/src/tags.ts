// Tags (§4.2): the one definition of "live", every read of the tags table, and every transition. Owns tags and
// tag_events. A visitor's write is one transaction: the repeat check, the rate count and one conditional statement,
// with Postgres's now() as the only clock (plan §1.4).
import { AppError, type NewTag, type PublicTag, TAG_LIFETIME_HOURS } from '@iwb/shared'
import { where } from '@iwb/shared/geo'
import { db } from './client'
import { Prisma, type TagEventType, type TagStatus } from './generated/prisma/client'
import { countAction } from './limits'
import type { Visitor } from './visitors'

/** Live: active, and its time has not run out by the database's clock. Expiry is never stored (§4.2). */
const LIVE = Prisma.sql`status = 'active' AND expires_at > now()`
/** A new tag's time, and a sighting's: 48 hours from now, never added on top (§4.2). */
const LIFETIME = Prisma.sql`now() + ${TAG_LIFETIME_HOURS} * interval '1 hour'`

const PUBLIC_FIELDS = Prisma.sql`
  id, lat::float8 AS lat, lng::float8 AS lng, suburb, street, operator, problem,
  last_confirmed_at AS "lastConfirmedAt", expires_at AS "expiresAt"`

type Client = Prisma.TransactionClient
type TagAction = { tagId: string; requestId: string; visitor: Visitor }

export function listLiveTags() {
  return db.$queryRaw<PublicTag[]>`SELECT ${PUBLIC_FIELDS} FROM tags WHERE ${LIVE}`
}

export async function getLiveTag(id: string, client: Client = db) {
  const [tag] = await client.$queryRaw<PublicTag[]>`
    SELECT ${PUBLIC_FIELDS} FROM tags WHERE id = ${id}::uuid AND ${LIVE}`
  return tag ?? null
}

export type RecentTag = PublicTag & { status: TagStatus; live: boolean; createdAt: Date }

/** For the admin app: the latest tags in any state, newest first. */
export function listRecentTags() {
  return db.$queryRaw<RecentTag[]>`
    SELECT ${PUBLIC_FIELDS}, status, (${LIVE}) AS live, created_at AS "createdAt"
    FROM tags ORDER BY created_at DESC LIMIT 100`
}

/**
 * Records a write's event under its browser-made request id (§5.3). False when that id was stored before by the same
 * visitor, for the same action on the same tag: a repeat, which does nothing new. The id stored for anything else is
 * a conflict, and a tag that doesn't exist has gone.
 */
async function claimRequest(tx: Client, { requestId, tagId, type, visitor }: TagAction & { type: TagEventType }) {
  const claimed = await tx.$executeRaw`
    INSERT INTO tag_events (tag_id, type, request_id, visitor_hash, ip_hash)
    SELECT id, ${type}::tag_event_type, ${requestId}::uuid, ${visitor.visitorHash}, ${visitor.ipHash}
    FROM tags WHERE id = ${tagId}::uuid
    ON CONFLICT (request_id) DO NOTHING`
  if (claimed) return true
  const [first] = await tx.$queryRaw<{ tagId: string; type: TagEventType; visitorHash: string | null }[]>`
    SELECT tag_id::text AS "tagId", type, visitor_hash AS "visitorHash" FROM tag_events
    WHERE request_id = ${requestId}::uuid`
  if (!first) throw new AppError('tag_gone')
  if (first.tagId !== tagId || first.type !== type || first.visitorHash !== visitor.visitorHash)
    throw new AppError('conflict')
  return false
}

/** Create (§4.2): inside the council or its 20 m strip, which where() decides here again, whatever the browser said. */
export async function createTag({ tag, visitor }: { tag: NewTag; visitor: Visitor }) {
  const { inside, suburb, street } = where(tag.lat, tag.lng)
  if (!inside) throw new AppError('outside_area')
  return db.$transaction(async (tx) => {
    // The tag goes in before its created event, which refers to it; the id is the event's request id. A repeat
    // inserts nothing, and the claim then finds the first create.
    await tx.$executeRaw`
      INSERT INTO tags (id, lat, lng, suburb, street, operator, problem, expires_at)
      VALUES (${tag.id}::uuid, ${tag.lat}, ${tag.lng}, ${suburb}, ${street}, ${tag.operator}, ${tag.problem}::problem,
              ${LIFETIME})
      ON CONFLICT (id) DO NOTHING`
    if (await claimRequest(tx, { requestId: tag.id, tagId: tag.id, type: 'created', visitor }))
      await countAction(tx, 'create', visitor)
    return { tag: await getLiveTag(tag.id, tx) }
  })
}

/** Still there (§4.2): a live tag's 48 hours start again from now. */
export function confirmStillThere({ tagId, requestId, visitor }: TagAction) {
  return db.$transaction(async (tx) => {
    if (!(await claimRequest(tx, { requestId, tagId, type: 'still_there', visitor })))
      return { tag: await getLiveTag(tagId, tx) }
    await countAction(tx, 'still_there', visitor, tagId)
    const [tag] = await tx.$queryRaw<PublicTag[]>`
      UPDATE tags SET last_confirmed_at = now(), expires_at = ${LIFETIME}, confirm_count = confirm_count + 1
      WHERE id = ${tagId}::uuid AND ${LIVE} RETURNING ${PUBLIC_FIELDS}`
    // Rolling back takes the event and the counts back too.
    if (!tag) throw new AppError('tag_gone')
    return { tag }
  })
}

/** Removed (§4.2): a live tag goes at once. Its time is left alone, so an undo gives back only what was left. */
export function markRemoved({ tagId, requestId, visitor }: TagAction) {
  return db.$transaction(async (tx) => {
    if (!(await claimRequest(tx, { requestId, tagId, type: 'removed', visitor })))
      return { tag: await getLiveTag(tagId, tx) }
    await countAction(tx, 'removed', visitor)
    // Of two at once, the second waits for the first's row lock, then finds the tag no longer active.
    const removed = await tx.$executeRaw`
      UPDATE tags SET status = 'removed', removed_at = now() WHERE id = ${tagId}::uuid AND ${LIVE}`
    if (!removed) throw new AppError('tag_gone')
    return { tag: null }
  })
}

/** An admin's event, in the statement that makes the change. Admin actions get a server-made request id. */
const withEvent = (type: TagEventType, change: Prisma.Sql) => Prisma.sql`
  WITH changed AS (${change} RETURNING id)
  INSERT INTO tag_events (tag_id, type, request_id) SELECT id, ${type}::tag_event_type, gen_random_uuid() FROM changed`

/** Undo removal (admin, §4.2): only while the tag's time hasn't run out, and with only the time it had left. */
export async function undoRemoval(tagId: string) {
  const undone = await db.$executeRaw(
    withEvent(
      'restored',
      Prisma.sql`UPDATE tags SET status = 'active', removed_at = NULL
                 WHERE id = ${tagId}::uuid AND status = 'removed' AND expires_at > now()`,
    ),
  )
  if (undone) return 'undone'
  const [tag] = await db.$queryRaw<{ status: TagStatus }[]>`SELECT status FROM tags WHERE id = ${tagId}::uuid`
  return tag?.status === 'removed' ? 'expired' : 'not_removed'
}

/** Take down (admin, §4.2): final, whatever the tag's state. False when it was already down. */
export async function takeDown(tagId: string) {
  const taken = await db.$executeRaw(
    withEvent(
      'taken_down',
      Prisma.sql`UPDATE tags SET status = 'taken_down' WHERE id = ${tagId}::uuid AND status <> 'taken_down'`,
    ),
  )
  return taken === 1
}
