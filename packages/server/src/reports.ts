// Reports (§4.3, §4.6): anyone may report a photo, which hides it until Michael restores or deletes it, and Michael
// is emailed. Owns photo_reports. photos.ts changes the photo itself, and closes its reports when it is restored or
// deleted. An email is a side effect after commit (plan §1.4): its reports are claimed by setting notified_at in a
// transaction, it is sent once that commits, and the claim is released if the send fails, for the hourly digest.
import {
  AppError,
  CIRCUIT_BREAKER_REPORTS_PER_HOUR,
  REPORT_EMAILS_PER_DAY,
  REPORT_REASONS,
  type ReportReason,
} from '@iwb/shared'
import { db } from './client'
import { sendEmail } from './email'
import type { Prisma } from './generated/prisma/client'
import { countAction } from './limits'
import { hidePhoto, pauseUploads, uploadsPaused } from './photos'
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
 * Claims a new report, inside its transaction, for the email it goes out with, and writes that email (§4.6). The
 * report that makes more than 15 in an hour site-wide pauses photo uploads, and goes with that alert; any other among
 * the first 10 of the UTC day (assumption 5) gets an email of its own. The rest wait for the hourly digest.
 */
async function claimEmail(tx: Prisma.TransactionClient, id: string, reason: ReportReason, hidden: boolean) {
  const [{ today, lastHour }] = await tx.$queryRaw<[{ today: number; lastHour: number }]>`
    SELECT count(*) FILTER (WHERE created_at >= date_trunc('day', now(), 'UTC'))::int AS today,
           count(*) FILTER (WHERE created_at > now() - interval '1 hour')::int AS "lastHour"
    FROM photo_reports WHERE created_at >= least(date_trunc('day', now(), 'UTC'), now() - interval '1 hour')`
  let email: { subject: string; text: string } | undefined
  // Of two at once, the second waits for the first's pause, then finds uploads paused already: one alert.
  if (lastHour > CIRCUIT_BREAKER_REPORTS_PER_HOUR && (await pauseUploads('circuit_breaker', tx)))
    email = {
      subject: 'Photo uploads paused',
      text:
        `More than ${CIRCUIT_BREAKER_REPORTS_PER_HOUR} photos were reported in the last hour, so photo uploads are ` +
        `paused until you resume them. Tags without photos can still be added.\n` +
        `The latest reason: ${REPORT_REASONS[reason]}.`,
    }
  else if (today <= REPORT_EMAILS_PER_DAY)
    email = {
      subject: 'A photo was reported',
      text:
        `Reason: ${REPORT_REASONS[reason]}.\n` +
        (hidden ? 'The photo is hidden until you restore or delete it.' : 'You restored it before, so it stays up.'),
    }
  if (!email) return
  await tx.$executeRaw`UPDATE photo_reports SET notified_at = now() WHERE id = ${id}::uuid`
  return { id, ...email }
}

/**
 * Report (§4.3): the photo stops loading from the next request, unless Michael restored it before, and the report
 * waits for him either way, with an email or in the digest. Answers whether the public can no longer see the photo,
 * as a repeat does too.
 */
export async function reportPhoto(report: Report) {
  const { hidden, email } = await db.$transaction(async (tx) => {
    const id = await claimReport(tx, report)
    if (id) {
      // Rolling back takes the report back too.
      await countAction(tx, 'report', report.visitor)
      await hidePhoto(tx, report.photoId)
    }
    const [photo] = await tx.$queryRaw<{ hidden: boolean }[]>`
      SELECT status <> 'visible' AS hidden FROM photos WHERE id = ${report.photoId}::uuid`
    return { hidden: photo!.hidden, email: id ? await claimEmail(tx, id, report.reason, photo!.hidden) : undefined }
  })
  if (email)
    await emailReports([email.id], email.subject, email.text).catch((error) =>
      console.error('A report email failed; the hourly digest sends it', error),
    )
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
  const lines = [
    `${reports(ids.length)} arrived since the last email.`,
    ...claimed.map((group) => `${REPORT_REASONS[group.reason]}: ${group.ids.length}`),
  ]
  // Said again here, in case the alert that paused them failed.
  if (await uploadsPaused()) lines.push('Photo uploads are paused until you resume them.')
  await emailReports(ids, `${reports(ids.length)} to review`, lines.join('\n'))
  return ids.length
}
