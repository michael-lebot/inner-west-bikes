// What crosses a boundary: request schemas, and the shapes the public site is given. Zod Mini, the smaller build,
// which is all these need. The browser never loads Zod: it sends plain objects, and `parseTag` reads the live tags.
import * as z from 'zod/mini'
import { type Operator, OPERATORS, type Problem, PROBLEMS } from './config'

/** What a schema's `parse` throws on input it refuses: a write answers it with 400 `invalid`. */
export const ZodError = z.core.$ZodError

/** The [id] of a tag URL. */
export const TagParams = z.object({ id: z.uuid() })

/** Still there or Removed: the id the browser made for this one action, kept for its retries (§5.3). */
export const ActionBody = z.object({ requestId: z.uuid() })

/** To 6 decimal places, about 10 cm, as the database stores it; so the server checks the point it stores. */
const coordinate = z.pipe(
  z.number(),
  z.transform((degrees) => Math.round(degrees * 1e6) / 1e6),
)
const operators = Object.keys(OPERATORS).filter((key) => OPERATORS[key as Operator].active) as [Operator, ...Operator[]]

/** A new tag (§4.2, §5.3). The browser makes its id, so sending it again can't make a second tag. */
export const CreateTagBody = z.object({
  id: z.uuid(),
  lat: coordinate,
  lng: coordinate,
  operator: z.enum(operators),
  problem: z.enum(Object.keys(PROBLEMS) as [Problem, ...Problem[]]),
})
export type NewTag = z.infer<typeof CreateTagBody>

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
