import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sendEmail } from './email'
import { env } from './env'

const fetch = vi.fn(async () => new Response('{"id":"1"}'))
beforeEach(() => {
  vi.stubGlobal('fetch', fetch)
  fetch.mockClear()
})
afterEach(() => {
  vi.unstubAllGlobals()
  Object.assign(env, { RESEND_API_KEY: '', ALERT_EMAIL_TO: undefined })
})

describe('sendEmail', () => {
  it('writes the email to the console without a key, off Vercel, ending with the link to the queue', async () => {
    const logged = vi.spyOn(console, 'info').mockImplementation(() => {})
    await sendEmail('A photo was reported', 'Reason: Other.')
    expect(logged).toHaveBeenCalledWith(
      '[email] A photo was reported\nReason: Other.\n\nReported photos: http://localhost:3001/reports',
    )
    expect(fetch).not.toHaveBeenCalled()
    logged.mockRestore()
  })

  it('sends it to Michael through Resend with the key', async () => {
    Object.assign(env, { RESEND_API_KEY: 're_test', ALERT_EMAIL_TO: 'owner@example.com' })
    await sendEmail('A photo was reported', 'Reason: Other.')
    expect(fetch).toHaveBeenCalledWith('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer re_test', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'onboarding@resend.dev',
        to: 'owner@example.com',
        subject: 'A photo was reported',
        text: 'Reason: Other.\n\nReported photos: http://localhost:3001/reports',
      }),
      signal: expect.any(AbortSignal),
    })
  })

  it('throws when Resend refuses it, or when there is no one to send it to', async () => {
    Object.assign(env, { RESEND_API_KEY: 're_test', ALERT_EMAIL_TO: 'owner@example.com' })
    fetch.mockResolvedValueOnce(new Response('{"message":"Invalid key"}', { status: 401 }))
    await expect(sendEmail('Subject', 'Text')).rejects.toThrow('Resend answered 401')
    Object.assign(env, { ALERT_EMAIL_TO: undefined })
    await expect(sendEmail('Subject', 'Text')).rejects.toThrow('ALERT_EMAIL_TO')
  })
})
