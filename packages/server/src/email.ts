// The email seam (plan §1.7): Michael's alerts go through Resend's API when there is a key, and otherwise, off Vercel,
// to the console. Nothing else knows which. An alert carries no visitor data and no photo, only a link to the queue.
import { env, local } from './env'

/** Resend gets this long to accept an email, so a report never waits on it for longer. */
const TIMEOUT_MS = 10_000

/**
 * Emails Michael `text` under `subject`, with the link to Reported photos at the end (§4.6). Throws when the email
 * isn't accepted, or can't be sent, so the caller can release its claim for the next digest.
 */
export async function sendEmail(subject: string, text: string) {
  const { RESEND_API_KEY: key, ALERT_EMAIL_TO: to, ALERT_EMAIL_FROM: from, ADMIN_URL: admin } = env
  const body = `${text}\n\nReported photos: ${admin}/reports`
  if (!key && local) return console.info(`[email] ${subject}\n${body}`)
  if (!key || !to || !admin) throw new Error('Set RESEND_API_KEY, ALERT_EMAIL_TO and ADMIN_URL to send email')
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, text: body }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`Resend answered ${response.status}`)
}
