import { ERRORS, type ErrorCode, SEND_FAILED } from '@iwb/shared'

/** The waits before the second and the third try (§5.3). */
const BACKOFF_MS = [500, 1500]
/** A 429 is tried again only when its limit's window ends this soon (assumption 7). */
const MAX_RETRY_AFTER_SECONDS = 30

export type SendError = { code: ErrorCode | 'failed'; message: string }
export type Sent<T> = { ok: true; data: T } | { ok: false; error: SendError }

/**
 * POSTs one action's body, made once with its request id, and tries again only what could still succeed (§5.3): a
 * dropped connection, a server error, or a 429 whose window ends within 30 seconds. Three tries at most; any other
 * answer comes back at once. The server answers a repeat with the first result, so a retry can't act twice.
 */
export async function send<T>(path: string, body: object): Promise<Sent<T>> {
  const init = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  for (let tries = 1; ; tries++) {
    const response = await fetch(path, init).catch(() => null)
    if (response?.ok) return { ok: true, data: await response.json() }
    const retryAfter = Number(response?.headers.get('Retry-After') ?? Infinity)
    const wait =
      !response || response.status >= 500
        ? BACKOFF_MS[tries - 1]
        : response.status === 429 && retryAfter <= MAX_RETRY_AFTER_SECONDS
          ? retryAfter * 1000
          : undefined
    if (wait === undefined || tries === 3) return { ok: false, error: await failure(response) }
    await new Promise((resolve) => setTimeout(resolve, wait))
  }
}

/** Our own error, or "Couldn't send…" for anything else; the firewall's 429 has no body of ours (§6). */
async function failure(response: Response | null): Promise<SendError> {
  const body = response && response.status < 500 ? await response.json().catch(() => null) : null
  if (body?.error) return body.error
  if (response?.status === 429) return { code: 'rate_limited', message: ERRORS.rate_limited.message }
  return { code: 'failed', message: SEND_FAILED }
}
