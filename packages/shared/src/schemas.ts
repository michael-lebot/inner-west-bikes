// What crosses a boundary: request schemas, and the shapes the public site is given. Zod Mini, because the map
// screen downloads it to parse the live tags: about a third of classic Zod's size.
import * as z from 'zod/mini'
import { OPERATORS, type Operator, PROBLEMS, type Problem } from './config'

/** The [id] of a tag URL. */
export const TagParams = z.object({ id: z.uuid() })

/** A live tag as the public site sees it. It never carries visitor data. JSON carries its times as strings. */
export const PublicTag = z.object({
  id: z.uuid(),
  lat: z.number(),
  lng: z.number(),
  suburb: z.string(),
  street: z.string(),
  operator: z.literal(Object.keys(OPERATORS) as Operator[]),
  problem: z.literal(Object.keys(PROBLEMS) as Problem[]),
  lastConfirmedAt: z.coerce.date(),
  expiresAt: z.coerce.date(),
})
export type PublicTag = z.infer<typeof PublicTag>

/** The body of `GET /api/tags`. */
export const LiveTags = z.object({ tags: z.array(PublicTag) })
