'use client'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { PRIMARY, SECONDARY } from './buttons'

// Loaded when it opens, out of the JavaScript before the map (§11.1).
const StreetPicker = lazy(() => import('./StreetPicker').then((module) => ({ default: module.StreetPicker })))

/** A spot inside the council or its 20 m strip, with the street and suburb where() gives it. */
export type Spot = { lat: number; lng: number; street: string; suburb: string }

export const OUTSIDE = 'That spot is outside the Inner West. Tap inside the gold line.'
export const pinOn = (spot: Spot) => `Pin on ${spot.street}, ${spot.suburb}`

/**
 * The placement step's bar (§3): where the pin is, the other ways to set it, Use this spot and Cancel. Not a dialog:
 * the whole map stays usable beside it, by tap and by the keyboard crosshair (§10.3, §10.4). Without the map, as on
 * /list, the other ways are all there is.
 */
export function Placement({
  spot,
  note,
  withMap = true,
  onChoose,
  onUse,
  onCancel,
}: {
  spot?: Spot
  /** Said in place of the spot: why the last tap or arrow key placed no pin. */
  note?: string
  withMap?: boolean
  /** A spot chosen by street, which needs no confirming on the map: the form comes next. */
  onChoose: (spot: Spot) => void
  onUse: () => void
  onCancel: () => void
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => heading.current?.focus(), [])
  const [choosing, setChoosing] = useState(false)
  const chooseButton = useRef<HTMLButtonElement>(null)

  const stopChoosing = () => {
    flushSync(() => setChoosing(false))
    chooseButton.current?.focus()
  }

  return (
    <section aria-labelledby="placement-heading" className="flex flex-col gap-3">
      <h2 id="placement-heading" ref={heading} tabIndex={-1} className="text-lg font-bold">
        Tag a dumped bike
      </h2>
      <p className="min-h-12">
        {note ?? (spot ? pinOn(spot) : withMap ? 'Tap the map where the bike is.' : 'Choose the street it is on.')}
      </p>
      <button ref={chooseButton} type="button" className={SECONDARY} onClick={() => setChoosing(true)}>
        Choose by street
      </button>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={SECONDARY} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className={`${PRIMARY} disabled:opacity-50`} disabled={!spot} onClick={onUse}>
          Use this spot
        </button>
      </div>
      {choosing && (
        <Suspense>
          <StreetPicker
            onUse={(chosen) => {
              setChoosing(false)
              onChoose(chosen)
            }}
            onCancel={stopChoosing}
          />
        </Suspense>
      )}
    </section>
  )
}
