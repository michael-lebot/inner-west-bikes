// Tags (§4.2): the one definition of "live" and every read of the tags table.
import type { PublicTag } from '@iwb/shared'
import { db } from './client'
import { Prisma, type TagStatus } from './generated/prisma/client'

/** Live: active, and its time has not run out by the database's clock. Expiry is never stored (§4.2). */
const LIVE = Prisma.sql`status = 'active' AND expires_at > now()`

const PUBLIC_FIELDS = Prisma.sql`
  id, lat::float8 AS lat, lng::float8 AS lng, suburb, street, operator, problem,
  last_confirmed_at AS "lastConfirmedAt", expires_at AS "expiresAt"`

export function listLiveTags() {
  return db.$queryRaw<PublicTag[]>`SELECT ${PUBLIC_FIELDS} FROM tags WHERE ${LIVE}`
}

export async function getLiveTag(id: string) {
  const [tag] = await db.$queryRaw<PublicTag[]>`SELECT ${PUBLIC_FIELDS} FROM tags WHERE id = ${id}::uuid AND ${LIVE}`
  return tag ?? null
}

export type RecentTag = PublicTag & { status: TagStatus; live: boolean; createdAt: Date }

/** For the admin app: the latest tags in any state, newest first. */
export function listRecentTags() {
  return db.$queryRaw<RecentTag[]>`
    SELECT ${PUBLIC_FIELDS}, status, (${LIVE}) AS live, created_at AS "createdAt"
    FROM tags ORDER BY created_at DESC LIMIT 100`
}
