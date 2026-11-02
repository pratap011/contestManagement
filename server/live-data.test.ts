import { afterEach, describe, expect, it, vi } from 'vitest'
import { searchAeroDataBox, clearAeroDataBoxCache } from './aerodatabox.ts'
import { callsignForFlight, clearAircraftCache, fetchAircraftPosition } from './aircraft.ts'
import { clearQueueCache, parseQueues } from './queues.ts'
import { clearWeatherCache, parseWeather } from './weather.ts'

afterEach(() => {
  vi.unstubAllGlobals()
  clearQueueCache()
  clearWeatherCache()
  clearAircraftCache()
  clearAeroDataBoxCache()
})

describe('airport queue parsing', () => {
  it('converts seconds to minutes and hides sentinel values', () => {
    const parsed = parseQueues(
      {
        data: {
          checkpoints: [
            {
              milestone: 'Terminal Entrance',
              queue: { QueueLength: 99999, WaitDisplay: 99999, isOptional: false },
            },
            {
              milestone: 'Security',
              queue: { QueueLength: 3, WaitDisplay: 90, isOptional: false },
            },
            {
              milestone: 'Emigration',
              queue: { QueueLength: -1, WaitDisplay: -1, isOptional: false },
            },
            { milestone: 'Walk', queue: { QueueLength: -1, WaitDisplay: 300 } },
            {
              milestone: 'Check In',
              queue: { QueueLength: 2, WaitDisplay: 600, isOptional: false },
            },
          ],
        },
      },
      'T1',
      'departure',
      '2026-11-02T10:00:00.000Z',
    )

    expect(parsed.checkpoints.map((checkpoint) => checkpoint.label)).toEqual([
      'Terminal entrance',
      'Security',
      'Emigration',
      'Check-in',
    ])
    expect(parsed.checkpoints[0].waitMinutes).toBeNull()
    expect(parsed.checkpoints[1].waitMinutes).toBe(1.5)
    expect(parsed.checkpoints[2].waitMinutes).toBeNull()
    expect(parsed.totalMinutes).toBe(11.5)
    expect(parsed.source).toBe('blr-airport-qms')
  })

  it('does not add the departure check-in queue to an arrival total', () => {
    const parsed = parseQueues(
      {
        data: {
          checkpoints: [
            { milestone: 'Security', queue: { WaitDisplay: 180, QueueLength: 2 } },
            { milestone: 'Check In', queue: { WaitDisplay: 1800, QueueLength: 20 } },
          ],
        },
      },
      'T2',
      'arrival',
      '2026-11-02T10:00:00.000Z',
    )
    expect(parsed.totalMinutes).toBe(3)
  })

  it('rejects an unexpected queue response', () => {
    expect(() => parseQueues({ data: {} }, 'T1', 'departure', 'now')).toThrow(/no checkpoints/i)
  })
})

describe('weather parsing', () => {
  it('maps an Open-Meteo response', () => {
    const weather = parseWeather({
      timezone: 'Asia/Kolkata',
      current: {
        time: '2026-11-02T23:15',
        temperature_2m: 20.4,
        apparent_temperature: 21,
        relative_humidity_2m: 98,
        precipitation: 0,
        weather_code: 3,
        wind_speed_10m: 1.1,
      },
    })
    expect(weather.condition).toBe('Overcast')
    expect(weather.temperatureC).toBe(20.4)
    expect(weather.source).toBe('open-meteo')
  })
})

describe('aircraft position', () => {
  it('maps common BLR airline codes to ATC callsigns', () => {
    expect(callsignForFlight('6E 5082')).toBe('IGO5082')
    expect(callsignForFlight('AI 508')).toBe('AIC508')
    expect(callsignForFlight('EK 565')).toBe('UAE565')
  })

  it('finds the matching callsign in the BLR bounding box', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            time: 1_760_000_000,
            states: [
              [
                'abc123',
                'IGO5082 ',
                'India',
                1,
                1_760_000_000,
                77.71,
                13.2,
                1200,
                false,
                120,
                90,
                -2,
                null,
                1300,
                null,
                false,
                0,
              ],
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )
    const position = await fetchAircraftPosition('6E 5082')
    expect(position.found).toBe(true)
    expect(position.callsign).toBe('IGO5082')
    expect(position.altitudeMeters).toBe(1200)
    expect(position.onGround).toBe(false)
    expect(position.distanceKm).not.toBeNull()
  })

  it('returns an honest not-found result instead of guessing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ states: null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )
    const position = await fetchAircraftPosition('AI 508')
    expect(position.found).toBe(false)
    expect(position.note).toMatch(/not a schedule or gate source/i)
  })
})

describe('AeroDataBox fallback', () => {
  it('normalises a BLR departure and keeps scheduled/estimated times separate', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify([
            {
              number: '6E 5082',
              status: 'Boarding',
              airline: { name: 'IndiGo' },
              departure: {
                airport: { iata: 'BLR' },
                scheduledTime: { utc: '2026-11-03T13:30:00Z', local: '2026-11-03T19:00:00+05:30' },
                revisedTime: { utc: '2026-11-03T13:50:00Z', local: '2026-11-03T19:20:00+05:30' },
                terminal: '1',
                gate: '33',
              },
              arrival: {
                airport: { iata: 'BOM' },
                scheduledTime: { utc: '2026-11-03T15:30:00Z', local: '2026-11-03T21:00:00+05:30' },
              },
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )
    const results = await searchAeroDataBox(
      '6E 5082',
      '2026-11-03',
      'departure',
      '2026-11-02T10:00:00.000Z',
    )
    expect(results).toHaveLength(1)
    expect(results[0].provider).toBe('aerodatabox')
    expect(results[0].terminal).toBe('T1')
    expect(results[0].gate).toBe('33')
    expect(results[0].status).toBe('Boarding')
    expect(results[0].scheduledDeparture).toBe('2026-11-03T13:30:00.000Z')
    expect(results[0].estimatedDeparture).toBe('2026-11-03T13:50:00.000Z')
  })

  it('ignores flights that do not touch BLR', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify([
            {
              number: 'AI 100',
              status: 'Expected',
              departure: { airport: { iata: 'DEL' } },
              arrival: { airport: { iata: 'LHR' } },
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )
    const results = await searchAeroDataBox(
      'AI 100',
      '2026-11-03',
      'departure',
      '2026-11-02T10:00:00.000Z',
    )
    expect(results).toEqual([])
  })
})
