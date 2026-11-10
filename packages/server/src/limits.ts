// Rate limits (§6): a counter for each rule in LIMITS, counted inside the write's own transaction. Owns rate_counters.
import { AppError, COUNTER_RETENTION_HOURS, LIMITS } from '@iwb/shared'
import { db } from './client'
import type { Prisma } from './generated/prisma/client'
import type { Visitor } from './visitors'

export type Action = keyof typeof LIMITS

/**
 * Counts one action against each of its limits, and throws `rate_limited` once any is passed. It runs in the write's
 * transaction, so a refused or failed write takes its counts back, and the counter's row lock makes simultaneous
 * requests take turns: two can't pass a limit together. Windows are fixed UTC buckets (assumption 4).
 */
export async function countAction(tx: Prisma.TransactionClient, action: Action, visitor: Visitor, tagId?: string) {
  for (const { per, max, hours } of LIMITS[action]) {
    const subject = {
      visitor: visitor.visitorHash,
      ip: visitor.ipHash,
      visitor_and_tag: `${visitor.visitorHash}:${tagId}`,
    }
    const seconds = hours * 3600
    // The key is action:scope:hash:window, the window being its length and its number since 1970.
    const [counter] = await tx.$queryRaw<{ count: number; retryAfter: number }[]>`
      WITH bucket AS (SELECT floor(extract(epoch FROM now()) / ${seconds})::bigint AS n)
      INSERT INTO rate_counters (key, count, window_start)
      SELECT ${`${action}:${per}:${subject[per]}:${hours}h:`}::text || n, 1, to_timestamp(n * ${seconds}) FROM bucket
      ON CONFLICT (key) DO UPDATE SET count = rate_counters.count + 1
      RETURNING count, ceil(extract(epoch FROM window_start - now()) + ${seconds})::int AS "retryAfter"`
    if (counter!.count > max) throw new AppError('rate_limited', { retryAfter: counter!.retryAfter })
  }
}

/** Hourly step 4 (§5.4): deletes each counter 48 hours after its window starts, with the hash in its key. */
export function deleteOldCounters() {
  return db.$executeRaw`
    DELETE FROM rate_counters WHERE window_start <= now() - ${COUNTER_RETENTION_HOURS} * interval '1 hour'`
}
