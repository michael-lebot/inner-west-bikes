// Settings the browser sees. Each is a literal process.env.NEXT_PUBLIC_* read, so Next inlines it at build time.
// next.config.ts imports this file, so a bad value fails the build and `next start` rather than the map.

/** The map tiles: a file on this site locally, the public Blob store in production. */
export const TILES_URL = process.env.NEXT_PUBLIC_TILES_URL || '/tiles/inner-west.pmtiles'

// A path on this site, or an http(s) URL whose origin the CSP can allow.
if (!/^\/(?!\/)/.test(TILES_URL) && !(URL.canParse(TILES_URL) && /^https?:$/.test(new URL(TILES_URL).protocol)))
  throw new Error(`NEXT_PUBLIC_TILES_URL must be a path starting with / or an http(s) URL, not "${TILES_URL}"`)
