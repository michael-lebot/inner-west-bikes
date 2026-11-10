'use client'
import { useEffect, useRef } from 'react'
import { PRIMARY, SECONDARY } from './buttons'

/** A spot inside the council or its 20 m strip, with the street and suburb where() gives it. */
export type Spot = { lat: number; lng: number; street: string; suburb: string }

export const OUTSIDE = 'That spot is outside the Inner West. Tap inside the gold line.'
export const pinOn = (spot: Spot) => `Pin on ${spot.street}, ${spot.suburb}`

/**
 * The placement step's bar (§3): where the pin is, Use this spot and Cancel. Not a dialog: the whole map stays usable
 * beside it, by tap and by the keyboard crosshair (§10.3, §10.4).
 */
export function Placement({
  spot,
  outside,
  onUse,
  onCancel,
}: {
  spot?: Spot
  /** The last tap or arrow key was outside the council and its 20 m strip. */
  outside: boolean
  onUse: () => void
  onCancel: () => void
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => heading.current?.focus(), [])

  return (
    <section aria-labelledby="placement-heading" className="flex flex-col gap-3">
      <h2 id="placement-heading" ref={heading} tabIndex={-1} className="text-lg font-bold">
        Tag a dumped bike
      </h2>
      <p className="min-h-12">{outside ? OUTSIDE : spot ? pinOn(spot) : 'Tap the map where the bike is.'}</p>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={SECONDARY} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className={`${PRIMARY} disabled:opacity-50`} disabled={!spot} onClick={onUse}>
          Use this spot
        </button>
      </div>
    </section>
  )
}
