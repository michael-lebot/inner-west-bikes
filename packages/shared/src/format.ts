// Names, counts and times as the site writes them. Times are always Sydney's, whatever the device's time zone.
import { OPERATORS, type Operator } from './config'

const MINUTE = 60_000
const HOUR = 60 * MINUTE

const time = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', hour: 'numeric', minute: '2-digit' })
const weekday = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', weekday: 'long' })
const full = new Intl.DateTimeFormat('en-AU', {
  timeZone: 'Australia/Sydney',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
})

/** "Lime e-bike", or "Share e-bike" when the visitor wasn't sure whose it is. */
export const bikeName = (operator: Operator) =>
  operator === 'not_sure' ? 'Share e-bike' : `${OPERATORS[operator].label} e-bike`

/** "1 bike" or "14 bikes". */
export const bikes = (n: number) => `${n} ${n === 1 ? 'bike' : 'bikes'}`

/** "14 bikes in the graveyard". */
export const bikeCount = (n: number) => `${bikes(n)} in the graveyard`

/** The time from one moment to another, rounded down: "31 h", or "40 min" under an hour. */
export function duration(from: Date, to: Date) {
  const ms = to.getTime() - from.getTime()
  return ms < HOUR ? `${Math.max(1, Math.floor(ms / MINUTE))} min` : `${Math.floor(ms / HOUR)} h`
}

/** "3:40 pm Tuesday", in Sydney. */
export const clockTime = (date: Date) => `${time.format(date)} ${weekday.format(date)}`

/** "Tue, 10 Nov, 3:40 pm", in Sydney. */
export const dateTime = (date: Date) => full.format(date)

/** The API returns live tags only, so the browser just drops tags whose time has passed since. */
export const isExpired = (tag: { expiresAt: Date }, now = new Date()) => tag.expiresAt <= now
