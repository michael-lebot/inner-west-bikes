// Reports (§4.3, §4.6): anyone may report a photo, which hides it until Michael restores or deletes it. Owns
// photo_reports. photos.ts changes the photo itself, and closes its reports when it is restored or deleted.
import { AppError, type ReportReason } from '@iwb/shared'
import { db } from './client'
import type { Prisma } from './generated/prisma/client'
import { countAction } from './limits'
import { hidePhoto } from './photos'
import type { Visitor } from './visitors'

type Report = { photoId: string; requestId: string; reason: ReportReason; visitor: Visitor }

/**
 * Records a report under its browser-made request id (§5.3). False when the same visitor sent that id before for the
 * same photo: a repeat, which does nothing new. The id stored for another photo or visitor is a conflict, and a photo
 * that is deleted, or never was, has gone (assumption 14).
 */
async function claimReport(tx: Prisma.TransactionClient, { photoId, requestId, reason, visitor }: Report) {
  const claimed = await tx.$executeRaw`
    INSERT INTO photo_reports (photo_id, reason, request_id, visitor_hash, ip_hash)
    SELECT id, ${reason}::report_reason, ${requestId}::uuid, ${visitor.visitorHash}, ${visitor.ipHash}
    FROM photos WHERE id = ${photoId}::uuid AND status <> 'deleted'
    ON CONFLICT (request_id) DO NOTHING`
  if (claimed) return true
  const [first] = await tx.$queryRaw<{ photoId: string; visitorHash: string | null }[]>`
    SELECT photo_id::text AS "photoId", visitor_hash AS "visitorHash" FROM photo_reports
    WHERE request_id = ${requestId}::uuid`
  if (!first) throw new AppError('photo_gone')
  if (first.photoId !== photoId || first.visitorHash !== visitor.visitorHash) throw new AppError('conflict')
  return false
}

/**
 * Report (§4.3): the photo stops loading from the next request, unless Michael restored it before, and the report
 * waits for him either way. Answers whether the public can no longer see the photo, as a repeat does too.
 */
export function reportPhoto(report: Report) {
  return db.$transaction(async (tx) => {
    if (await claimReport(tx, report)) {
      // Rolling back takes the report back too.
      await countAction(tx, 'report', report.visitor)
      await hidePhoto(tx, report.photoId)
    }
    const [photo] = await tx.$queryRaw<{ hidden: boolean }[]>`
      SELECT status <> 'visible' AS hidden FROM photos WHERE id = ${report.photoId}::uuid`
    return { hidden: photo!.hidden }
  })
}
