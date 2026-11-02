import { describe, expect, it } from 'vitest'
import { TRANSFER_SCENARIOS, TRANSFER_SOURCE, transferWarnings } from './transfer'

describe('Connections by BLR transfer guidance', () => {
  it('covers the three international/domestic transfer combinations', () => {
    expect(TRANSFER_SCENARIOS.map((scenario) => scenario.id)).toEqual([
      'international-domestic',
      'domestic-international',
      'international-international',
    ])
    for (const scenario of TRANSFER_SCENARIOS) {
      expect(scenario.steps.length).toBeGreaterThan(3)
      expect(scenario.checks.length).toBeGreaterThan(0)
    }
  })

  it('keeps the official airport source and both shuttle stops', () => {
    expect(TRANSFER_SOURCE.url).toContain('bengaluruairport.com')
    expect(TRANSFER_SOURCE.t1ShuttleStop).toMatch(/Relay/)
    expect(TRANSFER_SOURCE.t2ShuttleStop).toMatch(/P16/)
  })

  it('adds conservative warnings for separate tickets, baggage and terminal changes', () => {
    const warnings = transferWarnings(
      { sameBooking: 'no', baggageThrough: 'no', needsFormalities: 'yes' },
      true,
    )
    expect(warnings.join(' ')).toMatch(/Separate tickets/)
    expect(warnings.join(' ')).toMatch(/baggage is not checked through/)
    expect(warnings.join(' ')).toMatch(/changes terminals/)
  })

  it('does not imply a connection is safe when context is unknown', () => {
    const warnings = transferWarnings(
      { sameBooking: 'unknown', baggageThrough: 'unknown', needsFormalities: 'unknown' },
      false,
    )
    expect(warnings.join(' ')).toMatch(/still unknown/)
    expect(warnings.join(' ')).not.toMatch(/safe|guaranteed/i)
  })
})
