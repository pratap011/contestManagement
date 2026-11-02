import { describe, expect, it } from 'vitest'
import type { FlightResult } from '@/modules/flights/types'
import type { RouteResult } from '@/modules/navigation/astar'
import { getPoisForTerminal } from '@/modules/airport-directory/search'
import { assessConnection, DEFAULT_CONNECTION_CONTEXT, type ConnectionContext } from './connection'
import {
  facilitiesForGateFloor,
  recommendFacilities,
  type FacilityCandidate,
} from './recommendations'

function flight(overrides: Partial<FlightResult>): FlightResult {
  return { flightNumber: 'AI 508', source: 'manual', ...overrides }
}

const context: ConnectionContext = {
  sameBooking: 'yes',
  baggageThrough: 'yes',
  needsFormalities: 'no',
}

describe('connection duration', () => {
  it('calculates a same-day connection in airport-local time', () => {
    const assessment = assessConnection(
      flight({ scheduledArrival: '2026-11-02T10:20:00+05:30' }),
      flight({ flightNumber: '6E 6162', scheduledDeparture: '2026-11-02T12:40:00+05:30' }),
      context,
    )
    expect(assessment.scheduledMinutes).toBe(140)
    expect(assessment.timingBasis).toBe('scheduled')
    expect(assessment.usableMinutes).toBe(120)
  })

  it('handles an overnight connection across a date boundary', () => {
    const assessment = assessConnection(
      flight({ scheduledArrival: '2026-11-02T23:30:00+05:30' }),
      flight({ scheduledDeparture: '2026-11-03T01:15:00+05:30' }),
      context,
    )
    expect(assessment.scheduledMinutes).toBe(105)
  })

  it('uses UTC instants so an offset/date boundary is explicit', () => {
    const assessment = assessConnection(
      flight({ scheduledArrival: '2026-11-02T18:00:00Z' }),
      flight({ scheduledDeparture: '2026-11-02T19:45:00Z' }),
      context,
    )
    expect(assessment.scheduledMinutes).toBe(105)
  })

  it('keeps scheduled and estimated durations distinct', () => {
    const assessment = assessConnection(
      flight({
        scheduledArrival: '2026-11-02T10:20:00+05:30',
        estimatedArrival: '2026-11-02T10:35:00+05:30',
      }),
      flight({ scheduledDeparture: '2026-11-02T12:40:00+05:30' }),
      context,
    )
    expect(assessment.scheduledMinutes).toBe(140)
    expect(assessment.estimatedMinutes).toBe(125)
    expect(assessment.timingBasis).toBe('scheduled+estimated')
  })

  it('adds an explicit procedure allowance for separate tickets', () => {
    const assessment = assessConnection(
      flight({ scheduledArrival: '2026-11-02T10:20:00+05:30' }),
      flight({ scheduledDeparture: '2026-11-02T12:40:00+05:30' }),
      { sameBooking: 'no', baggageThrough: 'no', needsFormalities: 'unknown' },
    )
    expect(assessment.planningAllowanceMinutes).toBe(40)
    expect(assessment.usableMinutes).toBe(100)
    expect(assessment.warnings.join(' ')).toMatch(/Separate tickets/)
    expect(assessment.warnings.join(' ')).toMatch(/baggage must be collected/)
  })

  it('warns rather than claiming a connection is safe when details are unknown', () => {
    const assessment = assessConnection(
      flight({ scheduledArrival: '2026-11-02T10:20:00+05:30' }),
      flight({ scheduledDeparture: '2026-11-02T12:40:00+05:30' }),
      DEFAULT_CONNECTION_CONTEXT,
    )
    const text = assessment.warnings.join(' ')
    expect(text).not.toMatch(/\bsafe\b/i)
    expect(text).toMatch(/not a guarantee/)
    expect(text).toMatch(/Confirm with your airline/)
    expect(assessment.planningAllowanceMinutes).toBe(20)
  })

  it('warns when terminals differ', () => {
    const assessment = assessConnection(
      flight({ scheduledArrival: '2026-11-02T10:20:00+05:30' }),
      flight({ scheduledDeparture: '2026-11-02T12:40:00+05:30' }),
      context,
      { terminalsDiffer: true },
    )
    expect(assessment.warnings.join(' ')).toMatch(/T1.*T2 transfer guidance/)
  })

  it('does not present a negative duration as usable time', () => {
    const assessment = assessConnection(
      flight({ scheduledArrival: '2026-11-02T12:40:00+05:30' }),
      flight({ scheduledDeparture: '2026-11-02T10:20:00+05:30' }),
      context,
    )
    expect(assessment.scheduledMinutes).toBe(-140)
    expect(assessment.usableMinutes).toBeNull()
    expect(assessment.warnings.join(' ')).toMatch(/not after the arrival/)
  })

  it('marks missing times as unavailable', () => {
    const assessment = assessConnection(flight({}), flight({}), context)
    expect(assessment.timingBasis).toBe('unavailable')
    expect(assessment.usableMinutes).toBeNull()
  })
})

function route(seconds: number): RouteResult {
  return {
    nodeIds: ['a', 'b'],
    edges: [],
    totalDistanceMeters: 0,
    baseWalkingSeconds: seconds,
    estimatedWalkingSeconds: seconds,
    floorTransitions: [],
    hasUnverifiedSegments: true,
    passengerType: 'connecting',
    accessibleOnly: false,
    paceFactor: 1,
  }
}

function candidate(name: string, category: FacilityCandidate['poi']['category'], seconds: number): FacilityCandidate {
  return {
    poi: {
      id: name,
      name,
      category,
      terminalId: 't1',
      floorId: 't1-l2',
      x: 0,
      y: 0,
      nodeId: name,
      source: 'curated-demo',
      verificationStatus: 'unverified',
    },
    fromArrival: route(seconds),
    toDepartureGate: route(seconds),
  }
}

describe('facility recommendations', () => {
  it('keeps the return buffer and excludes facilities that do not fit', () => {
    const recommendations = recommendFacilities(
      [
        candidate('Café', 'food', 300),
        candidate('Lounge', 'lounge', 3000),
        candidate('Gate A3', 'gate', 60),
      ],
      { usableMinutes: 60, returnBufferMinutes: 15 },
    )
    expect(recommendations.map((item) => item.poi.name)).toEqual(['Café'])
    expect(recommendations[0].spareMinutes).toBe(35)
  })

  it('returns nothing when planned usable time is negative', () => {
    expect(
      recommendFacilities([candidate('Café', 'food', 60)], {
        usableMinutes: -10,
        returnBufferMinutes: 15,
      }),
    ).toEqual([])
  })

  it('keeps connecting-passenger suggestions on the departure gate floor', () => {
    const facilities = facilitiesForGateFloor(getPoisForTerminal('t1'), 't1-l2')
    expect(facilities.length).toBeGreaterThan(0)
    expect(facilities.every((poi) => poi.floorId === 't1-l2')).toBe(true)
    expect(facilities.map((poi) => poi.name)).not.toContain('Café')
    expect(facilities.map((poi) => poi.name)).toContain('Food court')
    expect(facilitiesForGateFloor(getPoisForTerminal('t1'), undefined)).toEqual([])
  })

})
