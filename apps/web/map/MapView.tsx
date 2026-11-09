'use client'
import 'maplibre-gl/dist/maplibre-gl.css'
import council from '@iwb/shared/data/council.json'
import maplibregl, { type LngLatBoundsLike } from 'maplibre-gl'
import { Protocol } from 'pmtiles'
import { useEffect, useRef, useState } from 'react'
import { MapControls } from './MapControls'
import { IMAGES } from './patterns'
import { overworldStyle } from './style'

maplibregl.addProtocol('pmtiles', new Protocol().tile)

export type MapStatus = 'ready' | 'failed'

/** The one map (§11.3). MapScreen loads this module with import() after first paint, so no other page carries it. */
export function MapView({ onStatus }: { onStatus: (status: MapStatus) => void }) {
  const container = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<maplibregl.Map>()

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
      })
    } catch {
      // No WebGL.
      onStatus('failed')
      return
    }
    created.touchZoomRotate.disableRotation()
    created.keyboard.disableRotation()

    let ready = false
    const fail = () => !ready && onStatus('failed')
    created.on('styleimagemissing', ({ id }) => IMAGES[id] && created.addImage(id, ...IMAGES[id]))
    // Before the map is ready, a failed style or tile request means it can't show the council. Glyph and later tile
    // errors only cost a label or a tile, so they don't take the map away.
    created.on('error', (event) => ('sourceId' in event || !created.isStyleLoaded()) && fail())
    created.once('load', () => {
      setMap(created)
      created.once('idle', () => {
        ready = true
        performance.mark('map-ready')
        container.current?.setAttribute('data-map-ready', '')
        onStatus('ready')
      })
    })
    return () => created.remove()
  }, [onStatus])

  return (
    <div className="absolute inset-0">
      {/* overflow: clip, not MapLibre's hidden, so focusing a pin off the edge can't scroll the map out of place. */}
      <div ref={container} className="h-full w-full" style={{ overflow: 'clip' }} />
      {map && <MapControls map={map} />}
    </div>
  )
}
