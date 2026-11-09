'use client'
import { bikeCount, bikes, GREYS, type PublicTag, TAG_LIFETIME_HOURS } from '@iwb/shared'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useLiveTags } from '@/lib/use-live-tags'
import { CrowdChooser } from './CrowdChooser'
import { Legend } from './Legend'
import { TagCard } from './TagCard'
import { TagList } from './TagList'
import { ViewToggle } from './ViewToggle'

type MapModule = typeof import('@/map/MapView')
type Status = 'loading' | 'ready' | 'failed'

/** The map gives up if it isn't ready this long after it starts loading (§11.2). */
const READY_WITHIN_MS = 15_000

/**
 * The map screen. First paint is the static preview of the council; MapLibre loads after it, and replaces the
 * preview once the map is ready. If it can't load, the preview stays and the list is offered instead (§11.2).
 */
export function MapScreen() {
  const [status, setStatus] = useState<Status>('loading')
  const [MapView, setMapView] = useState<MapModule['MapView']>()
  const { tags, now, refresh } = useLiveTags()
  const [selected, setSelected] = useState<string>()
  const [crowd, setCrowd] = useState<string[]>()
  // The pin that opened the chooser, which gets focus back when it closes.
  const opener = useRef<HTMLElement>(null)
  const count = useRef<HTMLHeadingElement>(null)

  // The card and the chooser show the tags as they are now. A refresh that takes away the open tag, or every tag in
  // the chooser, closes it.
  const card = tags?.find((tag) => tag.id === selected)
  const crowded = tags?.filter((tag) => crowd?.includes(tag.id))
  if (tags && selected && !card) setSelected(undefined)
  if (tags && crowd && !crowded?.length) setCrowd(undefined)

  // Closed that way, it takes the focus with it: keep the focus in the sheet, on the count.
  const open = !!card || !!crowded?.length
  const wasOpen = useRef(false)
  useEffect(() => {
    if (wasOpen.current && !open && document.activeElement === document.body) count.current?.focus()
    wasOpen.current = open
  }, [open])

  const select = (tag: PublicTag) => {
    setCrowd(undefined)
    setSelected(tag.id)
  }

  const closeCard = () => {
    setSelected(undefined)
    // Back to the card's pin (§10.4), or to the sheet when there is no map.
    ;(
      document.querySelector<HTMLElement>(`[data-tag="${selected}"] button`) ?? document.getElementById('sheet')
    )?.focus()
  }

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>
    // Hydration can run before the first paint, so wait for a frame and then a task: the shell and the preview are on
    // screen before the map's 300 KB, the tags and Zod start loading. A tab opened in the background starts when it is
    // first shown.
    const frame = requestAnimationFrame(() => {
      timeout = setTimeout(() => setStatus((current) => (current === 'loading' ? 'failed' : current)), READY_WITHIN_MS)
      setTimeout(() => {
        refresh()
        import('@/map/MapView').then(
          (module) => setMapView(() => module.MapView),
          () => setStatus('failed'),
        )
      })
    })
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(timeout)
    }
  }, [refresh])

  return (
    <>
      {/* Around the preview, the grey the map draws outside the council. */}
      <section
        aria-label="Map"
        aria-describedby="map-summary"
        className="relative min-h-0 flex-1 overflow-clip"
        style={{ backgroundColor: GREYS[2] }}
      >
        <a
          href="#sheet"
          className="absolute top-2 left-2 z-10 rounded-[10px] bg-white px-3 py-2.5 font-bold not-focus:sr-only"
        >
          Skip to the list
        </a>
        <p id="map-summary" className="sr-only">
          Map of the Inner West{tags && ` with ${bikes(tags.length)} tagged`}. A list view is available.
        </p>
        {MapView && status !== 'failed' && (
          <MapView
            tags={tags}
            now={now}
            selected={selected}
            onPick={(picked, pin) => {
              opener.current = pin
              if (picked.length > 1) setCrowd(picked.map((tag) => tag.id))
              else if (picked[0]) select(picked[0])
            }}
            onStatus={setStatus}
          />
        )}
        {status !== 'ready' && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- a static file sized by CSS: next/image would only add JavaScript */}
            <img
              src="/preview.webp"
              alt=""
              fetchPriority="high"
              className="absolute inset-0 h-full w-full object-contain p-2"
            />
            <p role="status" className="absolute inset-x-2 top-2 w-fit rounded-[10px] bg-white px-3 py-2">
              {status === 'failed' ? (
                <>
                  The map couldn&apos;t load.{' '}
                  <Link href="/list" className="underline underline-offset-2">
                    Use the list instead.
                  </Link>
                </>
              ) : (
                'Loading map…'
              )}
            </p>
          </>
        )}
      </section>
      {/* Below the map on a phone, as tall as what it shows; beside it in the side-panel layout (§12, §13). */}
      <div
        id="sheet"
        tabIndex={-1}
        className="z-10 flex max-h-[60dvh] flex-col gap-3 overflow-y-auto overscroll-contain border-t border-line bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-4px_12px_rgb(0_0_0/0.08)] wide:max-h-none wide:w-95 wide:shrink-0 wide:border-t-0 wide:border-r wide:shadow-[4px_0_12px_rgb(0_0_0/0.08)]"
      >
        {crowded?.length ? (
          <CrowdChooser
            tags={crowded}
            now={now}
            onSelect={select}
            onClose={() => {
              setCrowd(undefined)
              opener.current?.focus()
            }}
          />
        ) : card ? (
          <TagCard key={card.id} tag={card} now={now} onClose={closeCard} />
        ) : (
          <>
            {/* Each line keeps its height while the tags load, so nothing moves when they arrive. */}
            <div>
              <h2 ref={count} tabIndex={-1} className="min-h-7 text-lg font-bold">
                {tags && (tags.length ? bikeCount(tags.length) : 'No bikes in the graveyard right now.')}
              </h2>
              <p className="text-sm text-muted">Tags disappear {TAG_LIFETIME_HOURS} hours after the last sighting.</p>
            </div>
            <Legend tags={tags} />
            {/* The panel has room for the list itself, so it needs no List toggle (§13). */}
            <div className="wide:hidden">
              <ViewToggle current="/" />
            </div>
            {tags && (
              <div className="hidden wide:block">
                <TagList tags={tags} now={now} onSelect={select} />
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
