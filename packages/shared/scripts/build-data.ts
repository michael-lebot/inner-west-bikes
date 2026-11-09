// Turns the NSW downloads in data/raw/ (from fetch-nsw.ts) into the files the site ships, in data/:
// - council.json: the boundary, its bounding box, the map's bounds, and where the map names each suburb;
// - council-buffered.json: the boundary pushed out 20 m, where tags are accepted (§4.1);
// - places.json: the suburbs and named streets that reach into the buffered boundary, for where().
import { readFileSync, writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import * as turf from '@turf/turf'
import type { BBox, FeatureCollection, LineString, MultiPolygon, Polygon, Position } from 'geojson'
import { BOUNDARY_BUFFER_METERS, STREET_TYPES } from '../src/config.ts'

/**
 * The map can be moved this far past the council's bounding box, and the tiles cover it. Twice as far east and west,
 * because MapLibre keeps the whole view inside the box: a 1920 × 1080 screen needs that width to show all the council.
 */
const PAD_NS_METERS = 2000
const PAD_EW_METERS = 4000
/** Douglas–Peucker tolerance in degrees: about 2 m, far below anything a tap can tell apart. */
const SIMPLIFY = 0.00002

const raw = <T>(name: string) =>
  JSON.parse(readFileSync(new URL(`../data/raw/${name}.geojson`, import.meta.url), 'utf8')) as T

function write(name: string, value: unknown) {
  const json = JSON.stringify(value)
  writeFileSync(new URL(`../data/${name}.json`, import.meta.url), json)
  console.info(`${name}.json: ${json.length} B, ${gzipSync(json).length} B gzipped`)
}

/** Simplified, and rounded to 5 decimal places (about 1 m): any finer is noise after the 2 m simplification. */
const tidy = <T extends Polygon | MultiPolygon | LineString>(geometry: T) =>
  turf.truncate(turf.simplify(geometry, { tolerance: SIMPLIFY }), { precision: 5 })

const round = (box: number[]) => box.map((n) => +n.toFixed(5)) as BBox

// The council, as gazetted, and the 20 m wider area where tags are accepted.
const [council] = raw<FeatureCollection<Polygon>>('council').features
if (!council) throw new Error('data/raw/council.geojson has no polygon')
const boundary = tidy(council.geometry)
const buffered = tidy(turf.buffer(council, BOUNDARY_BUFFER_METERS, { units: 'meters' })!.geometry as Polygon)

const bbox = round(turf.bbox(council))
const [west, south, east, north] = bbox
const padLat = PAD_NS_METERS / 111_320
const padLng = PAD_EW_METERS / 111_320 / Math.cos((((south + north) / 2) * Math.PI) / 180)
const maxBounds = round([west - padLng, south - padLat, east + padLng, north + padLat])

write('council-buffered', buffered)

// Suburbs that reach into the buffered council, including neighbours that only touch the 20 m strip.
/** "MARRICKVILLE" → "Marrickville", "O'NEILL" → "O'Neill", "MCDONALD" → "McDonald". */
const title = (words: string) =>
  words
    .toLowerCase()
    .replace(/(^|[^a-z])([a-z])/g, (_, before: string, letter: string) => before + letter.toUpperCase())
    .replace(/\bMc([a-z])/g, (_, letter: string) => `Mc${letter.toUpperCase()}`)

const suburbs = raw<FeatureCollection<Polygon | MultiPolygon, { suburbname: string }>>('suburbs')
  .features.filter((suburb) => turf.booleanIntersects(suburb, buffered))
  .map((suburb) => ({ name: title(suburb.properties.suburbname), geometry: tidy(suburb.geometry) }))
  .sort((a, b) => a.name.localeCompare(b.name))

// The map names a suburb when at least a quarter of it is inside the council, at the middle of that part. The tiles
// can't do it: they carry suburbs only from zoom 12, and the whole council fits a phone at about 11.7.
const LABELLED_SHARE = 0.25
const labels = suburbs.flatMap(({ name, geometry }) => {
  const inside = turf.intersect(turf.featureCollection([turf.feature(geometry), turf.feature(boundary)]))
  if (!inside || turf.area(inside) < LABELLED_SHARE * turf.area(geometry)) return []
  const middle = turf.centerOfMass(inside)
  const at = turf.booleanPointInPolygon(middle, inside) ? middle : turf.pointOnFeature(inside)
  return [{ name, at: at.geometry.coordinates.map((n) => +n.toFixed(5)) }]
})

write('council', { boundary, bbox, maxBounds, labels })

// Named, open road segments that reach into the buffered council, grouped by name. Tunnels are left out: a bike on
// the street above one belongs to that street.
type Road = {
  roadnamebase: string | null
  roadnametype: string | null
  roadnamesuffix: string | null
  roadontype: number
  operationalstatus: number
}
const IN_TUNNEL = 3
const OPERATIONAL = 1

/** "LLEWELLYN", "STREET" → "Llewellyn St"; "O'NEILL", "LANE", "WEST" → "O'Neill La West". */
function streetName({ roadnamebase, roadnametype, roadnamesuffix }: Road) {
  const type = roadnametype && title(roadnametype)
  return [title(roadnamebase ?? ''), type && (STREET_TYPES[type] ?? type), roadnamesuffix && title(roadnamesuffix)]
    .filter(Boolean)
    .join(' ')
}

const segments = new Map<string, Position[][]>()
for (const road of raw<FeatureCollection<LineString, Road>>('roads').features) {
  const { roadnamebase, roadontype, operationalstatus } = road.properties
  if (!roadnamebase || roadontype === IN_TUNNEL || operationalstatus !== OPERATIONAL) continue
  if (!turf.booleanIntersects(road, buffered)) continue
  const name = streetName(road.properties)
  segments.set(name, [...(segments.get(name) ?? []), road.geometry.coordinates])
}

const same = (a?: Position, b?: Position) => a?.[0] === b?.[0] && a?.[1] === b?.[1]

/** a and b as one line, if they share an end point. */
function join(a: Position[], b: Position[]) {
  if (same(a.at(-1), b[0])) return [...a, ...b.slice(1)]
  if (same(a.at(-1), b.at(-1))) return [...a, ...b.toReversed().slice(1)]
  if (same(a[0], b.at(-1))) return [...b, ...a.slice(1)]
  if (same(a[0], b[0])) return [...b.toReversed(), ...a.slice(1)]
}

/** A street's segments joined end to end, so each point where two meet is stored once: about a third smaller. */
function joinAll(lines: Position[][]) {
  const joined: Position[][] = []
  for (let line of lines) {
    for (let i = joined.length - 1; i >= 0; i--) {
      const longer = join(line, joined[i]!)
      if (!longer) continue
      line = longer
      joined.splice(i, 1)
      i = joined.length
    }
    joined.push(line)
  }
  return joined
}

const streets = [...segments]
  .map(([name, lines]) => ({
    name,
    lines: joinAll(lines).map((line) => tidy({ type: 'LineString', coordinates: line }).coordinates),
  }))
  .sort((a, b) => a.name.localeCompare(b.name))

write('places', { suburbs, streets })
