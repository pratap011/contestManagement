import { afterEach, describe, expect, it, vi } from 'vitest'
import { AIRPORTS, resolveAirport } from './airports.ts'
import { clearAircraftCache, fetchAircraftPosition } from './aircraft.ts'
import { clearWeatherCache, fetchWeather } from './weather.ts'

afterEach(() => {
  vi.unstubAllGlobals()
  clearWeatherCache()
  clearAircraftCache()
})

describe('airport metadata', () => {
  it('covers the bundled Indian airports with Indian time zones', () => {
    expect(Object.keys(AIRPORTS).sort()).toEqual(['BLR', 'BOM', 'CCU', 'DEL', 'HYD', 'MAA'])
    for (const airport of Object.values(AIRPORTS)) {
      expect(airport.timezone).toBe('Asia/Kolkata')
      expect(airport.bbox.lamin).toBeLessThan(airport.bbox.lamax)
      expect(airport.bbox.lomin).toBeLessThan(airport.bbox.lomax)
    }
  })

  it('defaults to BLR and rejects unknown airports', () => {
    expect(resolveAirport(undefined)?.code).toBe('BLR')
    expect(resolveAirport('del')?.code).toBe('DEL')
    expect(resolveAirport('XXX')).toBeNull()
  })
})

describe('airport-scoped live data', () => {
  it('requests weather for the selected airport coordinates', async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request) =>
      new Response(
        JSON.stringify({
          timezone: 'Asia/Kolkata',
          current: {
            time: '2026-11-02T23:15',
            temperature_2m: 24,
            apparent_temperature: 25,
            relative_humidity_2m: 60,
            precipitation: 0,
            weather_code: 1,
            wind_speed_10m: 8,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    const weather = await fetchWeather('DEL', fetchMock)
    expect(weather.condition).toBe('Mainly clear')
    const url = new URL(String(fetchMock.mock.calls[0][0]))
    expect(url.searchParams.get('latitude')).toBe(String(AIRPORTS.DEL.center.lat))
    expect(url.searchParams.get('longitude')).toBe(String(AIRPORTS.DEL.center.lon))
  })

  it('queries the selected airport bounding box for aircraft positions', async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request) =>
      new Response(JSON.stringify({ states: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const position = await fetchAircraftPosition('6E 5082', 'BOM', fetchMock)
    expect(position.found).toBe(false)
    expect(position.note).toContain('BOM')
    const url = new URL(String(fetchMock.mock.calls[0][0]))
    expect(url.searchParams.get('lamin')).toBe(String(AIRPORTS.BOM.bbox.lamin))
    expect(url.searchParams.get('lomax')).toBe(String(AIRPORTS.BOM.bbox.lomax))
  })
})
