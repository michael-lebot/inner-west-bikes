'use client'
import { nearbyTags, type PublicTag, type TagJson } from '@iwb/shared'
import { useState } from 'react'
import { MatchDialog } from './MatchDialog'
import type { Spot } from './Placement'
import { type Draft, TagForm } from './TagForm'

/**
 * The steps after a spot is chosen (§3): "Is it one of these?" when live tags are within 25 m, then the form. It stays
 * mounted from the start of tagging to the end, so the answers and the tag's id outlive Change location.
 */
export function TagFlow({
  spot,
  tags,
  now,
  apply,
  onChangeLocation,
  onClose,
}: {
  /** The chosen spot, or undefined while the pin is being placed. */
  spot?: Spot
  tags: PublicTag[]
  now: Date
  apply: (id: string, tag: TagJson | null) => void
  onChangeLocation: () => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<Draft>(() => ({ id: crypto.randomUUID() }))
  // The spot the visitor said "No, it's another bike" for.
  const [another, setAnother] = useState<Spot>()

  if (!spot) return null
  const nearby = another === spot ? [] : nearbyTags(spot, tags)
  return nearby.length ? (
    <MatchDialog tags={nearby} now={now} apply={apply} onNo={() => setAnother(spot)} onClose={onClose} />
  ) : (
    <TagForm
      spot={spot}
      draft={draft}
      onDraft={setDraft}
      apply={apply}
      onChangeLocation={onChangeLocation}
      onClose={onClose}
    />
  )
}
