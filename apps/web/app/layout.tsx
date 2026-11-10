import type { Metadata, Viewport } from 'next'
import { headers } from 'next/headers'
import { connection } from 'next/server'
import { Announcer } from '@/components/Announcer'
import { Header } from '@/components/Header'
import { RESTORE_CHOICE } from '@/lib/motion'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'The Inner West E-bike Graveyard', template: '%s · The Inner West E-bike Graveyard' },
}

export const viewport: Viewport = { viewportFit: 'cover' }

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Render every request: proxy.ts makes a new CSP nonce each time.
  await connection()
  const nonce = (await headers()).get('x-nonce') ?? undefined

  return (
    // The script below puts the visitor's Reduce motion choice on <html> before React hydrates it.
    <html lang="en-AU" suppressHydrationWarning>
      <head>
        <link
          rel="preload"
          href="/fonts/atkinson-hyperlegible-latin-400-normal.woff2"
          as="font"
          type="font/woff2"
          crossOrigin=""
        />
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: RESTORE_CHOICE }} />
      </head>
      <body className="flex min-h-dvh flex-col bg-white font-sans text-ink">
        <Header />
        {children}
        <Announcer />
      </body>
    </html>
  )
}
