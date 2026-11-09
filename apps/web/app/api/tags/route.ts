import { listLiveTags } from '@iwb/server'

/**
 * Every live tag, for the map's count, key and pins (§5, §11.3). The page checks the body against `LiveTags`.
 * shortcut: uncached reads, add a CDN cache of a few seconds if traffic passes a few thousand visits a day.
 */
export async function GET() {
  return Response.json({ tags: await listLiveTags() }, { headers: { 'Cache-Control': 'no-store' } })
}
