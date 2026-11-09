// Settings the browser sees. Each is a literal process.env.NEXT_PUBLIC_* read, so Next inlines it at build time.

/** The map tiles: a file on this site locally, the public Blob store in production. */
export const TILES_URL = process.env.NEXT_PUBLIC_TILES_URL || '/tiles/inner-west.pmtiles'
