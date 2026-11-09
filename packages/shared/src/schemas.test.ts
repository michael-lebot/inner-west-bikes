import { describe, expect, it } from 'vitest'
import { PublicTag } from './schemas'

describe('PublicTag', () => {
  it('turns the times that JSON made strings back into dates', () => {
    const tag = {
      id: '5eed0000-0000-4000-8000-000000000003',
      lat: -33.904497,
      lng: 151.171932,
      suburb: 'Marrickville',
      street: 'Llewellyn St',
      operator: 'lime',
      problem: 'blocking_footpath',
      lastConfirmedAt: new Date('2026-11-09T01:00:00Z'),
      expiresAt: new Date('2026-11-11T01:00:00Z'),
    }
    expect(PublicTag.parse(JSON.parse(JSON.stringify(tag)))).toEqual(tag)
  })
})
