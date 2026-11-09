import type { NextConfig } from 'next'

export default {
  // The workspace packages are TypeScript source; Next compiles them with the app.
  transpilePackages: ['@iwb/db', '@iwb/shared'],
  // Photos are served exactly as stored (§4.3), and this leaves no image-resizing endpoint to abuse.
  images: { unoptimized: true },
  poweredByHeader: false,
} satisfies NextConfig
