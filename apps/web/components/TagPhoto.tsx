'use client'
import { useSyncExternalStore } from 'react'

/**
 * The photos this page has seen stop showing, each with the text in its place: one that failed to load, because it
 * was reported or its tag went since the page was drawn, and one this visitor reported. Kept for the page's life, so a
 * photo and its report link agree, and a card opened again says the same.
 */
const gone = new Map<string, string>()
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Puts `text` in a photo's place wherever this page shows it, which takes its report link away too. */
export function photoGone(id: string, text: string) {
  gone.set(id, text)
  for (const listener of listeners) listener()
}

/** The text in a photo's place on this page, or undefined while it shows. */
export const usePhotoGone = (id: string) =>
  useSyncExternalStore(
    subscribe,
    () => gone.get(id),
    () => undefined,
  )

/**
 * A tag's photo (§4.3): the 320 px thumbnail in a fixed box, so nothing moves when it arrives, opening the full size in
 * a new tab. A photo that stops showing gives way to text in a box the same size, never a broken image (§10.4).
 */
export function TagPhoto({ id, alt }: { id: string; alt: string }) {
  const text = usePhotoGone(id)

  if (text)
    return (
      <p className="flex min-h-18 w-24 shrink-0 items-center rounded-lg border border-line px-1.5 py-1 text-sm text-muted">
        {text}
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
        onError={() => photoGone(id, 'Photo no longer shown')}
        className="h-18 w-24 rounded-lg object-cover"
      />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  )
}
