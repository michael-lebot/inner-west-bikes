// Choose by street (§10.3): every street in each suburb with the corners along it, and its house numbers, which load
// one suburb at a time. Entry "@iwb/shared/picker": the browser loads it with import() when the street picker opens,
// and a suburb's numbers when a street in it is chosen (§11.1).
import { ADDRESSES } from '../data/addresses'
import picker from '../data/picker.json'

/** A corner's cross street or a house number, and where it is. */
export type Place = [name: string, lat: number, lng: number]
/** A street in one suburb, and its corners in order along it. */
export type Street = { street: string; suburb: string; corners: Place[] }

const STREETS = picker as Street[]

/** In lower case and words, without apostrophes: "O'Connor La" is "oconnor", "la". */
const words = (text: string) =>
  text
    .toLowerCase()
    .replaceAll("'", '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
const WORDS = STREETS.map(({ street, suburb }) => words(`${street} ${suburb}`))

/**
 * The streets with a word that starts with each word typed: "llew marr" finds Llewellyn St, Marrickville. Names that
 * start with the first word come first, so "llew" lists Llewellyn St before Little Llewellyn St.
 */
export function searchStreets(query: string) {
  const typed = words(query)
  if (!typed.length) return []
  const found = STREETS.filter((_, i) => typed.every((word) => WORDS[i]!.some((name) => name.startsWith(word))))
  const leads = ({ street }: Street) => words(street)[0]!.startsWith(typed[0]!)
  return [...found.filter(leads), ...found.filter((street) => !leads(street))]
}

/** A street's house numbers, from its suburb's file. */
export async function loadHouseNumbers({ street, suburb }: Street) {
  const steps = ((await ADDRESSES[suburb]?.())?.default as Record<string, Place[]> | undefined)?.[street] ?? []
  // Each point is the step from the one before, in 1e-5 degrees (scripts/build-data.ts).
  let [lat, lng] = [0, 0]
  return steps.map(([number, dLat, dLng]): Place => {
    lat += dLat
    lng += dLng
    return [number, lat / 1e5, lng / 1e5]
  })
}

/**
 * The house a typed number names (§10.3): the same number, or else a lettered one (12A) or a range that holds it
 * (10-14). Null when there is none.
 */
export function matchHouseNumber(numbers: Place[], typed: string) {
  const wanted = typed.trim().toUpperCase()
  const n = parseInt(wanted)
  if (!n) return null
  const holds = (number: string) => {
    const [from = NaN, to = from] = number.split('-').map((end) => parseInt(end))
    return from <= n && n <= to
  }
  return numbers.find(([number]) => number === wanted) ?? numbers.find(([number]) => holds(number)) ?? null
}
