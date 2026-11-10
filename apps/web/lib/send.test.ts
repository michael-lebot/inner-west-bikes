import { ERRORS, SEND_FAILED } from '@iwb/shared'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { send } from './send'

const fetch = vi.fn<typeof globalThis.fetch>()
const BODY = { requestId: '0a9e0000-0000-4000-8000-000000000001' }

const answer = (status: number, body: object, headers: Record<string, string> = {}) =>
  Promise.resolve(Response.json(body, { status, headers }))
const failure = (code: keyof typeof ERRORS, headers?: Record<string, string>) =>
  answer(ERRORS[code].status, { error: { code, message: ERRORS[code].message } }, headers)

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('fetch', fetch)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  fetch.mockReset()
})

/** Sends, letting every wait run, and says how long the waits took. */
async function sendAll() {
  const start = Date.now()
  const result = send('/api/tags/x/removed', BODY)
  await vi.runAllTimersAsync()
  return { result: await result, waited: Date.now() - start }
}

it('tries a dropped connection three times in all, with the same body, then says it couldn’t send', async () => {
  fetch.mockRejectedValue(new TypeError('Failed to fetch'))
  const { result, waited } = await sendAll()
  expect(result).toEqual({ ok: false, error: { code: 'failed', message: SEND_FAILED } })
  expect(fetch).toHaveBeenCalledTimes(3)
  expect(new Set(fetch.mock.calls.map(([, init]) => init?.body))).toEqual(new Set([JSON.stringify(BODY)]))
  expect(waited).toBe(500 + 1500)
})

it('tries a server error again, and gives the answer of the try that gets through', async () => {
  fetch.mockReturnValueOnce(answer(500, {})).mockReturnValueOnce(answer(200, { tag: null }))
  expect((await sendAll()).result).toEqual({ ok: true, data: { tag: null } })
  expect(fetch).toHaveBeenCalledTimes(2)
})

it.each(['invalid', 'conflict', 'tag_gone'] as const)('never tries %s again', async (code) => {
  fetch.mockReturnValue(failure(code))
  expect((await sendAll()).result).toEqual({ ok: false, error: { code, message: ERRORS[code].message } })
  expect(fetch).toHaveBeenCalledTimes(1)
})

it('waits for Retry-After on a 429 that ends within 30 seconds', async () => {
  fetch.mockReturnValueOnce(failure('rate_limited', { 'Retry-After': '12' })).mockReturnValueOnce(answer(200, {}))
  const { result, waited } = await sendAll()
  expect(result).toEqual({ ok: true, data: {} })
  expect(waited).toBe(12_000)
})

it('gives the limit message at once when the wait is longer', async () => {
  fetch.mockReturnValue(failure('rate_limited', { 'Retry-After': '3600' }))
  expect((await sendAll()).result).toEqual({
    ok: false,
    error: { code: 'rate_limited', message: ERRORS.rate_limited.message },
  })
  expect(fetch).toHaveBeenCalledTimes(1)
})

it('reads a 429 without our error body, such as the firewall’s, as the limit', async () => {
  fetch.mockReturnValue(Promise.resolve(new Response('Too Many Requests', { status: 429 })))
  expect((await sendAll()).result).toEqual({
    ok: false,
    error: { code: 'rate_limited', message: ERRORS.rate_limited.message },
  })
})

/** A 200 whose body is cut off on the way, after the server has made the change. */
const lostBody = () => Promise.resolve(new Response('{"tag":', { status: 200 }))

it('tries again when a success’s body is lost, and gives the answer of the try that gets through', async () => {
  fetch.mockReturnValueOnce(lostBody()).mockReturnValueOnce(answer(200, { tag: null }))
  expect((await sendAll()).result).toEqual({ ok: true, data: { tag: null } })
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(new Set(fetch.mock.calls.map(([, init]) => init?.body))).toEqual(new Set([JSON.stringify(BODY)]))
})

it('says it couldn’t send, rather than throwing, when every success’s body is lost', async () => {
  fetch.mockImplementation(lostBody)
  const { result, waited } = await sendAll()
  expect(result).toEqual({ ok: false, error: { code: 'failed', message: SEND_FAILED } })
  expect(fetch).toHaveBeenCalledTimes(3)
  expect(waited).toBe(500 + 1500)
})
