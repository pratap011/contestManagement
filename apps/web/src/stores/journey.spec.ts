import { describe, expect, it } from 'vitest'
import { isSavedJourney } from './journey'

const context = {
  sameBooking: 'yes',
  baggageThrough: 'yes',
  needsFormalities: 'no',
}

const flight = {
  flightNumber: '6E 2134',
  source: 'demo',
  terminal: 'T1',
}

describe('saved journey validation', () => {
  it('accepts a valid departing journey', () => {
    expect(
      isSavedJourney({
        kind: 'departing',
        departure: flight,
        arrival: null,
        connection: null,
        context,
        terminalId: 't1',
        confirmedAt: '2026-11-02T00:00:00.000Z',
      }),
    ).toBe(true)
  })

  it('accepts a legacy journey without a terminal override', () => {
    expect(
      isSavedJourney({
        kind: 'departing',
        departure: flight,
        arrival: null,
        connection: null,
        context,
        confirmedAt: '2026-11-02T00:00:00.000Z',
      }),
    ).toBe(true)
  })

  it('accepts a layover with both flights', () => {
    expect(
      isSavedJourney({
        kind: 'layover',
        departure: null,
        arrival: { ...flight, flightNumber: 'AI 508' },
        connection: { ...flight, flightNumber: '6E 6162' },
        context,
        confirmedAt: '2026-11-02T00:00:00.000Z',
      }),
    ).toBe(true)
  })

  it('rejects malformed storage values', () => {
    expect(isSavedJourney(null)).toBe(false)
    expect(isSavedJourney({ kind: 'departing' })).toBe(false)
    expect(
      isSavedJourney({
        kind: 'layover',
        arrival: flight,
        connection: null,
        context,
      }),
    ).toBe(false)
    expect(
      isSavedJourney({
        kind: 'departing',
        departure: { flightNumber: '6E 2134', source: 'unknown' },
        context,
      }),
    ).toBe(false)
    expect(
      isSavedJourney({
        kind: 'departing',
        departure: flight,
        context: { sameBooking: 'maybe' },
      }),
    ).toBe(false)
  })
})
