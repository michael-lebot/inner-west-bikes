// Counts and times as the site writes them. Times are always Sydney's, whatever the device's time zone.

const MINUTE = 60_000
const HOUR = 60 * MINUTE

const time = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', hour: 'numeric', minute: '2-digit' })
const weekday = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', weekday: 'long' })

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

/** The API returns live tags only, so the browser just drops tags whose time has passed since. */
export const isExpired = (tag: { expiresAt: Date }, now = new Date()) => tag.expiresAt <= now
