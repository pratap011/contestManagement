import { describe, expect, it, vi } from 'vitest'
import { DemoFlightProvider, findDemoFlights } from './providers/demo'
import { HttpFlightProvider } from './providers/http'
import { createManualFlight } from './providers/manual'
import { lookupFlights } from './service'
import type { FlightProvider, FlightResult } from './types'
import { FlightProviderError } from './types'
import {
  isValidFlightNumber,
  isValidTravelDate,
  normaliseFlightNumber,
  validateManualFlight,
} from './validation'

describe('flight input validation', () => {
  it('normalises common flight numbers', () => {
    expect(normaliseFlightNumber('6e2134')).toBe('6E 2134')
    expect(normaliseFlightNumber(' ai-508 ')).toBe('AI 508')
    expect(isValidFlightNumber('UK864')).toBe(true)
    expect(isValidFlightNumber('1234')).toBe(false)
    expect(isValidFlightNumber('A')).toBe(false)
  })

  it('rejects impossible calendar dates', () => {
    expect(isValidTravelDate('2026-11-02')).toBe(true)
    expect(isValidTravelDate('2024-02-29')).toBe(true)
    expect(isValidTravelDate('2026-02-29')).toBe(false)
    expect(isValidTravelDate('02-11-2026')).toBe(false)
  })

  it('validates required manual fields', () => {
    const errors = validateManualFlight(
      {
        flightNumber: 'bad',
        airline: '',
        origin: 'BLR',
        destination: 'BLR',
        terminal: 'T1',
        gate: '',
        localDateTime: 'not-a-time',
      },
      'departure',
      'Asia/Kolkata',
    )
    expect(errors.flightNumber).toBeDefined()
    expect(errors.destination).toBeDefined()
    expect(errors.localDateTime).toBeDefined()

    const badCodes = validateManualFlight(
      {
        flightNumber: '6E 2134',
        airline: '',
        origin: 'X',
        destination: 'BLR1',
        terminal: '',
        gate: '',
        localDateTime: '2026-11-02T20:00',
      },
      'departure',
      'Asia/Kolkata',
    )
    expect(badCodes.origin).toBeDefined()
    expect(badCodes.destination).toBeDefined()
  })
})

describe('demo flight provider', () => {
  it('returns deterministic BLR demo schedules', () => {
    const results = findDemoFlights('6E 2134', '2026-11-02')
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      flightNumber: '6E 2134',
      airline: 'IndiGo',
      origin: 'BLR',
      destination: 'DEL',
      terminal: 'T1',
      gate: 'A3',
      source: 'demo',
    })
    expect(results[0].scheduledDeparture).toBe('2026-11-02T14:30:00.000Z')
    expect(results[0].scheduledArrival).toBe('2026-11-02T16:55:00.000Z')
  })

  it('returns no result for an unknown flight instead of inventing one', async () => {
    const provider = new DemoFlightProvider()
    await expect(provider.searchFlight('ZZ 9999', '2026-11-02')).resolves.toEqual([])
    expect(findDemoFlights('AI 508', 'not-a-date')).toEqual([])
  })
})

describe('manual flight provider', () => {
  it('creates a user-entered flight in airport-local time', () => {
    const flight = createManualFlight(
      {
        flightNumber: '6e2134',
        airline: 'IndiGo',
        origin: 'blr',
        destination: 'del',
        terminal: '1',
        gate: 'a3',
        localDateTime: '2026-11-02T20:00',
      },
      'departure',
      'Asia/Kolkata',
    )
    expect(flight).toMatchObject({
      flightNumber: '6E 2134',
      origin: 'BLR',
      destination: 'DEL',
      terminal: 'T1',
      gate: 'A3',
      source: 'manual',
    })
    expect(flight.scheduledDeparture).toBe('2026-11-02T14:30:00.000Z')
  })
})

describe('HTTP flight provider', () => {
  const input = ['6E 2134', '2026-11-02'] as const

  it('maps a successful proxy response and normalises values', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request) =>
      new Response(
        JSON.stringify({
          results: [
            {
              flightNumber: '6E 2134',
              airline: 'IndiGo',
              origin: 'blr',
              destination: 'del',
              scheduledDeparture: '2026-11-02T20:00:00+05:30',
              terminal: '1',
              gate: 'a3',
              gateFloor: 1,
              provider: 'blr-airport-board',
              direction: 'departure',
            },
          ],
        }),
        { status: 200 },
      ),
    )
    const provider = new HttpFlightProvider({
      endpoint: 'https://example.test/api/flights',
      timeoutMs: 500,
      fetchImpl,
    })
    const results = await provider.searchFlight(...input, 'departure')
    expect(results[0]).toMatchObject({
      flightNumber: '6E 2134',
      source: 'provider',
      origin: 'BLR',
      destination: 'DEL',
      terminal: 'T1',
      gate: 'A3',
      gateFloor: 1,
      provider: 'blr-airport-board',
      direction: 'departure',
    })
    expect(results[0].scheduledDeparture).toBe('2026-11-02T14:30:00.000Z')
    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain('role=departure')
  })

  it('drops provider timestamps without an explicit timezone offset', async () => {
    const provider = new HttpFlightProvider({
      endpoint: 'https://example.test/api/flights',
      timeoutMs: 500,
      fetchImpl: vi.fn(async () =>
        new Response(
          JSON.stringify({
            results: [
              {
                flightNumber: '6E 2134',
                scheduledDeparture: '2026-11-02T20:00:00',
                terminal: 'T1',
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    })
    const results = await provider.searchFlight(...input)
    expect(results[0].scheduledDeparture).toBeUndefined()
  })

  it('surfaces quota exhaustion', async () => {
    const provider = new HttpFlightProvider({
      endpoint: 'https://example.test/api/flights',
      timeoutMs: 500,
      fetchImpl: vi.fn(async () => new Response('', { status: 429 })),
    })
    await expect(provider.searchFlight(...input)).rejects.toMatchObject({ code: 'quota' })
  })

  it('surfaces authentication/configuration errors', async () => {
    const provider = new HttpFlightProvider({
      endpoint: 'https://example.test/api/flights',
      timeoutMs: 500,
      fetchImpl: vi.fn(async () => new Response('', { status: 401 })),
    })
    await expect(provider.searchFlight(...input)).rejects.toMatchObject({ code: 'unauthorized' })
  })

  it('surfaces an outage', async () => {
    const provider = new HttpFlightProvider({
      endpoint: 'https://example.test/api/flights',
      timeoutMs: 500,
      fetchImpl: vi.fn(async () => new Response('', { status: 503 })),
    })
    await expect(provider.searchFlight(...input)).rejects.toMatchObject({ code: 'unavailable' })
  })

  it('rejects malformed responses', async () => {
    const provider = new HttpFlightProvider({
      endpoint: 'https://example.test/api/flights',
      timeoutMs: 500,
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({ nope: true }), { status: 200 })),
    })
    await expect(provider.searchFlight(...input)).rejects.toMatchObject({ code: 'malformed' })
  })

  it('times out instead of hanging the review screen', async () => {
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const error = new Error('aborted')
            error.name = 'AbortError'
            reject(error)
          })
        }),
    )
    const provider = new HttpFlightProvider({
      endpoint: 'https://example.test/api/flights',
      timeoutMs: 5,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    await expect(provider.searchFlight(...input)).rejects.toMatchObject({ code: 'timeout' })
  })

  it('keeps the timeout active while reading the response body', async () => {
    const fetchImpl = vi.fn(
      async (_url: string, init?: RequestInit) =>
        ({
          status: 200,
          ok: true,
          json: () =>
            new Promise((_resolve, reject) => {
              init?.signal?.addEventListener('abort', () => {
                const error = new Error('aborted')
                error.name = 'AbortError'
                reject(error)
              })
            }),
        }) as Response,
    )
    const provider = new HttpFlightProvider({
      endpoint: 'https://example.test/api/flights',
      timeoutMs: 5,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    await expect(provider.searchFlight(...input)).rejects.toMatchObject({ code: 'timeout' })
  })
})

describe('flight lookup service', () => {
  const input = { flightNumber: '6E 2134', date: '2026-11-02' }
  const flight: FlightResult = {
    flightNumber: '6E 2134',
    source: 'provider',
    scheduledDeparture: '2026-11-02T14:30:00.000Z',
  }

  it('keeps manual fallback available when lookup is disabled', async () => {
    const outcome = await lookupFlights(input, { provider: null, enabled: false })
    expect(outcome.status).toBe('disabled')
    expect(outcome.results).toEqual([])
  })

  it('returns provider matches', async () => {
    const provider: FlightProvider = {
      id: 'test',
      label: 'test',
      searchFlight: async () => [flight],
    }
    const outcome = await lookupFlights(input, { provider, enabled: true })
    expect(outcome.status).toBe('success')
    expect(outcome.results).toHaveLength(1)
  })

  it('does not silently substitute a different flight', async () => {
    const provider: FlightProvider = {
      id: 'test',
      label: 'test',
      searchFlight: async () => [{ ...flight, flightNumber: 'AI 508' }],
    }
    const outcome = await lookupFlights(input, { provider, enabled: true })
    expect(outcome.status).toBe('no-results')
  })

  it('maps provider failures to a non-blocking outcome', async () => {
    const provider: FlightProvider = {
      id: 'test',
      label: 'test',
      searchFlight: async () => {
        throw new FlightProviderError('quota', 'limit')
      },
    }
    const outcome = await lookupFlights(input, { provider, enabled: true })
    expect(outcome.status).toBe('error')
    expect(outcome.error?.message).toContain('Manual entry')
  })

  it('rejects invalid search input before calling a provider', async () => {
    const searchFlight = vi.fn()
    const provider: FlightProvider = { id: 'test', label: 'test', searchFlight }
    const outcome = await lookupFlights(
      { flightNumber: 'nope', date: '2026-99-99' },
      { provider, enabled: true },
    )
    expect(outcome.status).toBe('invalid')
    expect(searchFlight).not.toHaveBeenCalled()
  })
})
