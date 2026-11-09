// What crosses a boundary: request schemas, and the shapes the public site is given. Zod Mini, the smaller build,
// which is all these need. The browser never loads Zod: `parseTag` reads the live tags.
import * as z from 'zod/mini'
import type { Operator, Problem } from './config'

/** The [id] of a tag URL. */
export const TagParams = z.object({ id: z.uuid() })

/** A live tag as the public site sees it. It never carries visitor data. */
export type PublicTag = {
  id: string
  lat: number
  lng: number
  suburb: string
  street: string
  operator: Operator
  problem: Problem
  lastConfirmedAt: Date
  expiresAt: Date
}
