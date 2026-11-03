import { describe, expect, it } from 'vitest'
import { parseFlightLookupStatus } from './status'

describe('flight lookup status', () => {
  it('parses configured provider coverage', () => {
    const status = parseFlightLookupStatus({
      airports: ['BLR', 'DEL'],
      board: { airports: ['BLR'] },
      provider: {
        id: 'aerodatabox',
        configured: true,
        gateway: 'direct',
        airports: ['BLR', 'DEL'],
        futureDates: true,
        attributionRequired: true,
      },
    })
    expect(status?.provider.configured).toBe(true)
    expect(status?.provider.gateway).toBe('direct')
    expect(status?.provider.airports).toEqual(['BLR', 'DEL'])
  })

  it('treats a malformed or failing response as unknown coverage', () => {
    expect(parseFlightLookupStatus(null)).toBeNull()
    expect(parseFlightLookupStatus({ provider: {} })).toBeNull()
    expect(
      parseFlightLookupStatus({
        airports: [],
        board: { airports: [] },
        provider: { configured: false, gateway: 'other' },
      })?.provider,
    ).toMatchObject({ configured: false, gateway: null, futureDates: false })
  })
})
