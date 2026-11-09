'use client'
import { GREYS } from '@iwb/shared'
import Link from 'next/link'
import { useEffect, useState } from 'react'
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

  useEffect(() => {
    // Effects run after the server's HTML has been painted, so the map never delays first paint.
    import('@/map/MapView').then(
      (module) => setMapView(() => module.MapView),
      () => setStatus('failed'),
    )
    const timeout = setTimeout(() => setStatus((now) => (now === 'loading' ? 'failed' : now)), READY_WITHIN_MS)
    return () => clearTimeout(timeout)
  }, [])

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
          Map of the Inner West. A list view is available.
        </p>
        {MapView && status !== 'failed' && <MapView onStatus={setStatus} />}
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
      <div
        id="sheet"
        tabIndex={-1}
        className="flex flex-col gap-3 border-t border-line p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <p className="min-h-7 text-lg font-bold" />
        <ViewToggle current="/" />
      </div>
    </>
  )
}
