'use client'
import { useState } from 'react'

/**
 * A tag's photo (§4.3): the 320 px thumbnail in a fixed box, so nothing moves when it arrives, opening the full size in
 * a new tab. A photo that can't load, because it was reported or its tag has gone since the page was drawn, gives way
 * to text, never a broken image (§10.4).
 */
export function TagPhoto({ id, alt }: { id: string; alt: string }) {
  const [failed, setFailed] = useState(false)

  if (failed)
    return (
      <p className="flex min-h-18 w-24 shrink-0 items-center rounded-lg border border-line p-2 text-sm text-muted">
        Photo no longer shown
      </p>
    )
  return (
    <a href={`/photo/${id}`} target="_blank" className="shrink-0 rounded-lg">
      {/* eslint-disable-next-line @next/next/no-img-element -- served as stored, so next/image would only add JavaScript */}
      <img
        src={`/photo/${id}/thumb`}
        alt={alt}
        width={96}
        height={72}
        onError={() => setFailed(true)}
        className="h-18 w-24 rounded-lg object-cover"
      />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  )
}
