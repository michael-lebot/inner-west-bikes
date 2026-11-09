'use client'
import 'maplibre-gl/dist/maplibre-gl.css'
import { byPlace, CROWDED_PIN_PX, pinLabel, type PublicTag } from '@iwb/shared'
import council from '@iwb/shared/data/council.json'
import maplibregl, { type LngLatBoundsLike } from 'maplibre-gl'
import { Protocol } from 'pmtiles'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PinIcon } from '@/components/PinIcon'
import { HOVER_RING } from '@/components/TagRow'
import { MapControls } from './MapControls'
import { IMAGES } from './patterns'
import { overworldStyle } from './style'

maplibregl.addProtocol('pmtiles', new Protocol().tile)

/** shortcut: HTML markers, switch to a clustered symbol layer plus the list if live tags pass 200 (§11.3). */
const MAX_PINS = 200
/** A pin's button: 44 px square, with the pin's tip at the middle of its bottom edge. */
const PIN_PX = 44
/** The picked pin: outlined like keyboard focus, and bobbing twice (§10.5, §13). */
const SELECTED = 'outline-3 outline-offset-2 outline-focus shadow-[0_0_0_2px_white] motion-safe:animate-bob'

/** Whether the whole button of a pin at this point is inside the map. */
function isInView(map: maplibregl.Map, lng: number, lat: number) {
  const { x, y } = map.project([lng, lat])
  const { clientWidth, clientHeight } = map.getContainer()
  return x >= PIN_PX / 2 && x <= clientWidth - PIN_PX / 2 && y >= PIN_PX && y <= clientHeight
}

type Props = {
  /** The live tags, or undefined until they arrive. */
  tags?: PublicTag[]
  now: Date
  selected?: string
  /** A pin was picked: just that tag, or by tap where pins overlap, every tag within 44 px of it. */
  onPick: (tags: PublicTag[], pin: HTMLElement) => void
  onStatus: (status: 'ready' | 'failed') => void
}

/** The one map (§11.3). MapScreen loads this module with import() after first paint, so no other page carries it. */
export function MapView({ tags, now, selected, onPick, onStatus }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<maplibregl.Map>()
  const [drawn, setDrawn] = useState(false)

  useEffect(() => {
    let created: maplibregl.Map
    try {
      created = new maplibregl.Map({
        container: container.current!,
        style: overworldStyle(),
        // The same framing as the preview it replaces, whose image sits 8 px (p-2) inside the map.
        bounds: council.bbox as LngLatBoundsLike,
        fitBoundsOptions: { padding: 8 },
        maxBounds: council.maxBounds as LngLatBoundsLike,
        minZoom: 11,
        maxZoom: 18,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        fadeDuration: 0,
        maxTileCacheSize: 64,
        attributionControl: false,
        // The canvas is a region inside the map screen's own "Map" region, so it needs a name of its own.
        locale: { 'Map.Title': 'Map: arrow keys move it' },
      })
    } catch {
      // No WebGL.
      onStatus('failed')
      return
    }
    created.touchZoomRotate.disableRotation()
    created.keyboard.disableRotation()
    // When the sheet below grows or shrinks, keep the map still under the header, as if the sheet slid over it.
    let height = container.current!.clientHeight
    created.on('resize', () => {
      // Not the ref: React has cleared it by the time a resize reports the map leaving the page.
      const next = created.getContainer().clientHeight
      created.panBy([0, (next - height) / 2], { animate: false })
      height = next
    })

    let shown = false
    const fail = () => !shown && onStatus('failed')
    created.on('styleimagemissing', ({ id }) => IMAGES[id] && created.addImage(id, ...IMAGES[id]))
    // Before the map shows, a failed style or tile request means it can't show the council. Glyph and later tile
    // errors only cost a label or a tile, so they don't take the map away.
    created.on('error', (event) => ('sourceId' in event || !created.isStyleLoaded()) && fail())
    created.once('load', () => {
      setMap(created)
      created.once('idle', () => {
        shown = true
        onStatus('ready')
        setDrawn(true)
      })
    })
    return () => created.remove()
  }, [onStatus])

  // The picked pin comes into view: from a row in the panel, or when its card has made the map shorter. Only when
  // the pick changes, so the map doesn't jump back to it each time the tags refresh.
  const picked = tags?.find(({ id }) => id === selected)
  const [lng, lat] = picked ? [picked.lng, picked.lat] : []
  useEffect(() => {
    if (!map || lng === undefined || lat === undefined) return
    const reveal = () => !isInView(map, lng, lat) && map.panTo([lng, lat])
    reveal()
    map.once('resize', reveal)
    return () => void map.off('resize', reveal)
  }, [map, selected, lng, lat])

  // Map ready (§11.1): the first tiles drawn, and the pins on them.
  useEffect(() => {
    if (!drawn || !tags || container.current?.hasAttribute('data-map-ready')) return
    performance.mark('map-ready')
    container.current?.setAttribute('data-map-ready', '')
  }, [drawn, tags])

  return (
    <div className="absolute inset-0">
      {/* overflow: clip, not MapLibre's hidden, so focusing a pin off the edge can't scroll the map out of place. */}
      <div ref={container} className="h-full w-full" style={{ overflow: 'clip' }} />
      {map && tags && <Pins map={map} tags={tags} now={now} selected={selected} onPick={onPick} />}
      {map && <MapControls map={map} />}
    </div>
  )
}

function Pins({
  map,
  tags,
  now,
  selected,
  onPick,
}: Omit<Props, 'onStatus'> & { map: maplibregl.Map; tags: PublicTag[] }) {
  const shown = useMemo(() => tags.toSorted(byPlace).slice(0, MAX_PINS), [tags])

  // Pins that arrive with a refresh are added last: move each after the one before it, so Tab follows the list.
  useEffect(() => {
    let previous: Element | null = null
    for (const { id } of shown) {
      const pin = map.getCanvasContainer().querySelector(`[data-tag="${id}"]`)
      if (pin && previous && previous.nextElementSibling !== pin) previous.after(pin)
      previous = pin ?? previous
    }
  }, [map, shown])

  const pick = (tag: PublicTag, pin: HTMLElement, byKeyboard: boolean) => {
    // From the keyboard each pin is its own stop, so only a tap can mean several.
    if (byKeyboard) return onPick([tag], pin)
    const at = map.project([tag.lng, tag.lat])
    onPick(
      shown.filter((other) => map.project([other.lng, other.lat]).dist(at) < CROWDED_PIN_PX),
      pin,
    )
  }

  return shown.map((tag) => (
    <Pin key={tag.id} map={map} tag={tag} label={pinLabel(tag, now)} selected={tag.id === selected} onPick={pick} />
  ))
}

function Pin({
  map,
  tag,
  label,
  selected,
  onPick,
}: {
  map: maplibregl.Map
  tag: PublicTag
  label: string
  selected: boolean
  onPick: (tag: PublicTag, pin: HTMLElement, byKeyboard: boolean) => void
}) {
  const [element] = useState(() => {
    const div = document.createElement('div')
    div.dataset.tag = tag.id
    return div
  })

  useEffect(() => {
    const marker = new maplibregl.Marker({ element, anchor: 'bottom' }).setLngLat([tag.lng, tag.lat]).addTo(map)
    // MapLibre makes the marker itself a button named "Map marker"; the real button is inside it.
    element.removeAttribute('role')
    element.removeAttribute('aria-label')
    return () => void marker.remove()
  }, [map, element, tag.lng, tag.lat])

  return createPortal(
    <button
      type="button"
      aria-label={label}
      aria-expanded={selected}
      className={`flex size-11 cursor-pointer items-end justify-center ${HOVER_RING} ${selected ? SELECTED : ''}`}
      // A click from Enter or Space has no pointer position, so detail is 0.
      onClick={(event) => onPick(tag, event.currentTarget, event.detail === 0)}
      // Focusing a pin off the edge of the map, as Tab does, brings it into view (§4.1).
      onFocus={() => !isInView(map, tag.lng, tag.lat) && map.panTo([tag.lng, tag.lat])}
    >
      <PinIcon operator={tag.operator} />
    </button>,
    element,
  )
}
