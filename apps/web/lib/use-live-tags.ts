'use client'
import { isExpired, type PublicTag, REFRESH_MINUTES } from '@iwb/shared'
import { useCallback, useEffect, useMemo, useState } from 'react'

const MINUTE = 60_000

/**
 * The live tags (§11.3): fetched on mount, when the tab comes back or regains focus, every 5 minutes while it is
 * visible, and on `refresh()` after the page's own writes. Between fetches, tags drop out as their time runs out.
 * `tags` is undefined until the first fetch succeeds.
 */
export function useLiveTags() {
  const [tags, setTags] = useState<PublicTag[]>()
  const [now, setNow] = useState(() => new Date())

  // A promise chain rather than async/await, so the lint rule can see the state is set later, not in the effect.
  const refresh = useCallback(
    () =>
      Promise.all([
        fetch('/api/tags').then((response) => {
          if (!response.ok) throw new Error(`GET /api/tags: ${response.status}`)
          return response.json()
        }),
        // Zod arrives with the tags rather than with the page, so it isn't JavaScript the first paint waits for.
        import('@iwb/shared/schemas'),
      ])
        .then(([body, { LiveTags }]) => {
          setTags(LiveTags.parse(body).tags)
          setNow(new Date())
        })
        // Offline, or a body that isn't live tags: keep what is showing, and try again at the next refresh.
        .catch(() => {}),
    [],
  )

  useEffect(() => {
    const whenVisible = () => document.visibilityState === 'visible' && refresh()
    refresh()
    document.addEventListener('visibilitychange', whenVisible)
    window.addEventListener('focus', refresh)
    const refreshing = setInterval(whenVisible, REFRESH_MINUTES * MINUTE)
    const ticking = setInterval(() => setNow(new Date()), MINUTE)
    return () => {
      document.removeEventListener('visibilitychange', whenVisible)
      window.removeEventListener('focus', refresh)
      clearInterval(refreshing)
      clearInterval(ticking)
    }
  }, [refresh])

  const live = useMemo(() => tags?.filter((tag) => !isExpired(tag, now)), [tags, now])
  return { tags: live, now, refresh }
}
