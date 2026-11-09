import { describe, expect, it } from 'vitest'
import { bikeCount, bikeName, clockTime, dateTime, duration, isExpired } from './format'

describe('bikeCount', () => {
  it('uses the singular for one bike', () => {
    expect(bikeCount(1)).toBe('1 bike in the graveyard')
  })

  it('uses the plural for any other number', () => {
    expect(bikeCount(0)).toBe('0 bikes in the graveyard')
    expect(bikeCount(14)).toBe('14 bikes in the graveyard')
  })
})

describe('bikeName', () => {
  it("names the operator's e-bike", () => {
    expect(bikeName('lime')).toBe('Lime e-bike')
  })

  it('calls it a share e-bike when the operator is not known', () => {
    expect(bikeName('not_sure')).toBe('Share e-bike')
  })
})

describe('duration', () => {
  const start = new Date('2026-11-09T00:00:00Z')
  const after = (minutes: number) => new Date(start.getTime() + minutes * 60_000)

  it('gives whole hours, rounded down', () => {
    expect(duration(start, after(31 * 60 + 59))).toBe('31 h')
  })

  it('gives minutes under an hour, and never less than one', () => {
    expect(duration(start, after(40))).toBe('40 min')
    expect(duration(start, after(0))).toBe('1 min')
  })
})

describe('clockTime', () => {
  it('reads the time in Sydney during daylight saving (UTC+11)', () => {
    expect(clockTime(new Date('2026-11-10T04:40:00Z'))).toBe('3:40 pm Tuesday')
  })

  it('reads the time in Sydney outside daylight saving (UTC+10)', () => {
    expect(clockTime(new Date('2026-07-07T05:40:00Z'))).toBe('3:40 pm Tuesday')
  })
})

describe('dateTime', () => {
  it('gives the day, date and time in Sydney', () => {
    expect(dateTime(new Date('2026-11-10T04:40:00Z'))).toBe('Tue, 10 Nov, 3:40 pm')
  })
})

describe('isExpired', () => {
  const now = new Date('2026-11-09T12:00:00Z')

  it('is false until expiresAt', () => {
    expect(isExpired({ expiresAt: new Date('2026-11-09T12:00:01Z') }, now)).toBe(false)
  })

  it('is true from expiresAt on', () => {
    expect(isExpired({ expiresAt: now }, now)).toBe(true)
  })
})
