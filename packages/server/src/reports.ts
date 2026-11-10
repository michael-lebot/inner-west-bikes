// Reports (§4.3, §4.6): anyone may report a photo, which hides it until Michael restores or deletes it, and Michael
// is emailed. Owns photo_reports. photos.ts changes the photo itself, and closes its reports when it is restored or
// deleted. An email is a side effect after commit (plan §1.4): its reports are claimed by setting notified_at in a
// transaction, it is sent once that commits, and the claim is released if the send fails, for the hourly digest.
import { AppError, REPORT_EMAILS_PER_DAY, REPORT_REASONS, type ReportReason } from '@iwb/shared'
import { db } from './client'
import { sendEmail } from './email'
import type { Prisma } from './generated/prisma/client'
import { countAction } from './limits'
import { hidePhoto } from './photos'
import type { Visitor } from './visitors'

type Report = { photoId: string; requestId: string; reason: ReportReason; visitor: Visitor }

/**
 * Records a report under its browser-made request id (§5.3), and gives its id; null when the same visitor sent that
 * id before for the same photo: a repeat, which does nothing new. The id stored for another photo or visitor is a
 * conflict, and a photo that is deleted, or never was, has gone (assumption 14).
 */
async function claimReport(tx: Prisma.TransactionClient, { photoId, requestId, reason, visitor }: Report) {
  const [report] = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO photo_reports (photo_id, reason, request_id, visitor_hash, ip_hash)
    SELECT id, ${reason}::report_reason, ${requestId}::uuid, ${visitor.visitorHash}, ${visitor.ipHash}
    FROM photos WHERE id = ${photoId}::uuid AND status <> 'deleted'
    ON CONFLICT (request_id) DO NOTHING
    RETURNING id::text`
  if (report) return report.id
  const [first] = await tx.$queryRaw<{ photoId: string; visitorHash: string | null }[]>`
    SELECT photo_id::text AS "photoId", visitor_hash AS "visitorHash" FROM photo_reports
    WHERE request_id = ${requestId}::uuid`
  if (!first) throw new AppError('photo_gone')
  if (first.photoId !== photoId || first.visitorHash !== visitor.visitorHash) throw new AppError('conflict')
  return null
}

/** Sends an email for the reports claimed for it; if that fails, releases them for the next digest and throws. */
async function emailReports(ids: string[], subject: string, text: string) {
  try {
    await sendEmail(subject, text)
  } catch (error) {
    await db.$executeRaw`UPDATE photo_reports SET notified_at = NULL WHERE id = ANY (${ids}::uuid[])`
    throw error
  }
}

/**
 * Claims a new report, inside its transaction, for an email of its own when it is among the first 10 of the UTC day
 * (§4.6, assumption 5). The rest wait for the hourly digest. True when it is claimed.
 */
async function claimEmail(tx: Prisma.TransactionClient, id: string) {
  const [{ today }] = await tx.$queryRaw<[{ today: number }]>`
    SELECT count(*)::int AS today FROM photo_reports WHERE created_at >= date_trunc('day', now(), 'UTC')`
  if (today > REPORT_EMAILS_PER_DAY) return false
  await tx.$executeRaw`UPDATE photo_reports SET notified_at = now() WHERE id = ${id}::uuid`
  return true
}

/**
 * Report (§4.3): the photo stops loading from the next request, unless Michael restored it before, and the report
 * waits for him either way, with an email or in the digest. Answers whether the public can no longer see the photo,
 * as a repeat does too.
 */
export async function reportPhoto(report: Report) {
  const { hidden, emailed } = await db.$transaction(async (tx) => {
    const id = await claimReport(tx, report)
    let emailed: string | undefined
    if (id) {
      // Rolling back takes the report back too.
      await countAction(tx, 'report', report.visitor)
      await hidePhoto(tx, report.photoId)
      if (await claimEmail(tx, id)) emailed = id
    }
    const [photo] = await tx.$queryRaw<{ hidden: boolean }[]>`
      SELECT status <> 'visible' AS hidden FROM photos WHERE id = ${report.photoId}::uuid`
    return { hidden: photo!.hidden, emailed }
  })
  if (emailed) {
    const outcome = hidden
      ? 'The photo is hidden until you restore or delete it.'
      : 'You restored it before, so it stays up.'
    await emailReports(
      [emailed],
      'A photo was reported',
      `Reason: ${REPORT_REASONS[report.reason]}.\n${outcome}`,
    ).catch((error) => console.error('A report email failed; the hourly digest sends it', error))
  }
  return { hidden }
}

const reports = (n: number) => `${n} ${n === 1 ? 'report' : 'reports'}`

/**
 * Hourly step 5 (§5.4): one email for every report not yet emailed, with how many there are for each reason. They are
 * claimed in one statement, so of two runs at once the second finds none. Returns how many it covered.
 */
export async function sendDigest() {
  const claimed = await db.$queryRaw<{ reason: ReportReason; ids: string[] }[]>`
    WITH claimed AS (
      UPDATE photo_reports SET notified_at = now() WHERE notified_at IS NULL RETURNING id, reason)
    SELECT reason, array_agg(id::text) AS ids FROM claimed GROUP BY reason ORDER BY reason`
  const ids = claimed.flatMap((group) => group.ids)
  if (!ids.length) return 0
  const text = [
    `${reports(ids.length)} arrived since the last email.`,
    ...claimed.map((group) => `${REPORT_REASONS[group.reason]}: ${group.ids.length}`),
  ].join('\n')
  await emailReports(ids, `${reports(ids.length)} to review`, text)
  return ids.length
}
