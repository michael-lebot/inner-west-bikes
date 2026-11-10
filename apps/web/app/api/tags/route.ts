import { createTag, listLiveTags } from '@iwb/server'
import { CreateTagBody } from '@iwb/shared'
import { write } from '@/lib/write'

/**
 * Every live tag, for the map's count, key and pins (§5, §11.3). The page turns their times back into dates with
 * `parseTag`.
 * shortcut: uncached reads, add a CDN cache of a few seconds if traffic passes a few thousand visits a day.
 */
export async function GET() {
  return Response.json({ tags: await listLiveTags() }, { headers: { 'Cache-Control': 'no-store' } })
}

/** A new tag, with the id the browser made for it (§5.3). */
export const POST = write(async ({ request, visitor }) =>
  createTag({ tag: CreateTagBody.parse(await request.json()), visitor }),
)
