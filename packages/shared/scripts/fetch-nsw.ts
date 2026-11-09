// Downloads the council boundary, suburbs and road segments from NSW Spatial Services (CC BY 4.0) into data/raw/,
// which is git-ignored. Run `pnpm --filter @iwb/shared data:fetch`, then `data:build`.
import { mkdirSync, writeFileSync } from 'node:fs'

const SERVICES = 'https://portal.spatial.nsw.gov.au/server/rest/services'
const PAGE = 2000
const RAW = new URL('../data/raw/', import.meta.url)
/** The data reaches this far past the council's bounding box, so neighbouring streets and suburbs are included. */
const PAD_METERS = 2000

type Box = [west: number, south: number, east: number, north: number]
type FeatureCollection = { type: 'FeatureCollection'; features: { geometry: { coordinates: unknown } }[] }

async function getJson(url: string) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(90_000) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const body = await response.json()
      if (body.error) throw new Error(JSON.stringify(body.error))
      return body
    } catch (error) {
      if (attempt === 3) throw error
      console.warn(`retrying after: ${error}`)
      await new Promise((resolve) => setTimeout(resolve, attempt * 2000))
    }
  }
}

/** Every feature of one ArcGIS layer matching `where` (and touching `box`), a page of 2,000 at a time. */
async function query(service: string, layer: number, where: string, outFields: string, box?: Box) {
  const features: FeatureCollection['features'] = []
  for (let offset = 0; ; offset += PAGE) {
    const params = new URLSearchParams({
      where,
      outFields,
      outSR: '4326',
      returnGeometry: 'true',
      resultOffset: String(offset),
      resultRecordCount: String(PAGE),
      f: 'geojson',
      ...(box && {
        geometry: box.join(','),
        geometryType: 'esriGeometryEnvelope',
        inSR: '4326',
        spatialRel: 'esriSpatialRelIntersects',
      }),
    })
    const page = await getJson(`${SERVICES}/${service}/FeatureServer/${layer}/query?${params}`)
    features.push(...page.features)
    console.info(`${service}/${layer}: ${features.length} features`)
    if (page.features.length < PAGE && !page.exceededTransferLimit) break
  }
  return { type: 'FeatureCollection', features } as FeatureCollection
}

function save(name: string, collection: FeatureCollection) {
  writeFileSync(new URL(`${name}.geojson`, RAW), JSON.stringify(collection))
}

mkdirSync(RAW, { recursive: true })

const council = await query('NSW_Administrative_Boundaries_Theme', 8, "lganame = 'INNER WEST'", 'lganame')
if (council.features.length !== 1) throw new Error(`expected one Inner West polygon, got ${council.features.length}`)
save('council', council)

const points = (council.features[0]?.geometry.coordinates as number[][][]).flat()
const lngs = points.map(([lng]) => lng ?? 0)
const lats = points.map(([, lat]) => lat ?? 0)
const midLat = ((Math.min(...lats) + Math.max(...lats)) / 2) * (Math.PI / 180)
const padLat = PAD_METERS / 111_320
const padLng = padLat / Math.cos(midLat)
const box: Box = [
  Math.min(...lngs) - padLng,
  Math.min(...lats) - padLat,
  Math.max(...lngs) + padLng,
  Math.max(...lats) + padLat,
]

save('suburbs', await query('NSW_Administrative_Boundaries_Theme', 2, '1=1', 'suburbname', box))
save(
  'roads',
  await query(
    'NSW_Transport_Theme',
    5,
    '1=1',
    'roadnamebase,roadnametype,roadnamesuffix,functionhierarchy,roadontype,operationalstatus',
    box,
  ),
)
