// The one wrapper for the admin app's form posts (plan §1.4). Its pages post plain HTML forms, so they need no client
// JavaScript; the answer is a 303 back to a page with a notice, so reloading it doesn't post again.
import { ZodError } from '@iwb/shared'

/**
 * Refuses a post from any other site, which could otherwise ride on Michael's Vercel sign-in, then runs `run` and
 * sends the browser to the page it returns. A URL whose id `run` refuses is a 404, as no tag has it.
 */
export function action(run: (params: Promise<unknown>) => Promise<string>) {
  return async (request: Request, { params }: { params: Promise<unknown> }) => {
    if (request.headers.get('origin')?.split('//')[1] !== request.headers.get('host'))
      return new Response("Only this site's own forms can post here.", { status: 403 })
    try {
      return new Response(null, { status: 303, headers: { Location: await run(params) } })
    } catch (error) {
      if (error instanceof ZodError) return new Response('Not found.', { status: 404 })
      throw error
    }
  }
}
