import { config, type AeroDataBoxGateway } from './config.ts'
import type { FlightDirection, ProviderFlight } from './flights.ts'
import {
  compactFlightNumber,
  FlightProviderError,
  isValidFlightNumber,
  normaliseFlightNumber,
} from './flights.ts'
import { fetchJson, isRecord, readString, UpstreamError } from './upstream.ts'

interface CacheEntry {
  expiresAt: number
  value: ProviderFlight[]
}

const cache = new Map<string, CacheEntry>()

/** Builds the gateway-specific auth headers without exposing the key to the browser. */
export function buildAeroDataBoxHeaders(options: {
  key: string
  gateway: AeroDataBoxGateway
  host?: string | null
}): Record<string, string> {
  if (options.gateway === 'direct') return { 'X-Api-Key': options.key }
  return {
    'X-RapidAPI-Key': options.key,
    ...(options.host ? { 'X-RapidAPI-Host': options.host } : {}),
  }
}

const STATUS_LABELS: Record<string, string> = {
  Unknown: 'Status unknown',
  Expected: 'Scheduled',
  EnRoute: 'En route',
  CheckIn: 'Check-in open',
  Boarding: 'Boarding',
  GateClosed: 'Gate closed',
  Departed: 'Departed',
  Delayed: 'Delayed',
  Approaching: 'Approaching',
  Arrived: 'Arrived',
  Canceled: 'Cancelled',
  Diverted: 'Diverted',
  CanceledUncertain: 'Possibly cancelled',
}

function formatStatus(value: string | undefined): string | undefined {
  if (!value) return undefined
  return STATUS_LABELS[value] ?? value
}

function readIso(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

function readMovementTime(movement: Record<string, unknown>, key: string): string | undefined {
  const value = movement[key]
  if (!isRecord(value)) return undefined
  return readIso(value.utc) ?? readIso(value.local)
}

function normaliseTerminal(value: string | undefined): string | undefined {
  if (!value) return undefined
  const match = value.trim().toUpperCase().match(/^(?:TERMINAL\s*)?T?([1-9])$/)
  return match ? `T${match[1]}` : undefined
}

function readAirportIata(movement: Record<string, unknown>): string | undefined {
  const airport = movement.airport
  if (!isRecord(airport)) return undefined
  return readString(airport, 'iata')?.toUpperCase()
}

function toProviderFlight(
  row: unknown,
  direction: FlightDirection | undefined,
  fetchedAt: string,
  airportCode: string,
): ProviderFlight | null {
  if (!isRecord(row)) return null
  const number = readString(row, 'number')
  if (!number || !isValidFlightNumber(number)) return null
  const departure = isRecord(row.departure) ? row.departure : null
  const arrival = isRecord(row.arrival) ? row.arrival : null
  if (!departure || !arrival) return null
  const target = airportCode.toUpperCase()
  const departureIsTarget = readAirportIata(departure) === target
  const arrivalIsTarget = readAirportIata(arrival) === target
  const rowDirection: FlightDirection | null = departureIsTarget
    ? 'departure'
    : arrivalIsTarget
      ? 'arrival'
      : null
  if (!rowDirection) return null
  if (direction && direction !== rowDirection) return null

  const movement = rowDirection === 'departure' ? departure : arrival
  const airline = isRecord(row.airline) ? row.airline : null
  const flight: ProviderFlight = {
    flightNumber: normaliseFlightNumber(number),
    airline: airline ? readString(airline, 'name') : undefined,
    origin: readAirportIata(departure),
    destination: readAirportIata(arrival),
    terminal: normaliseTerminal(readString(movement, 'terminal')),
    gate: readString(movement, 'gate')?.toUpperCase(),
    status: formatStatus(readString(row, 'status')),
    source: 'provider',
    provider: 'aerodatabox',
    direction: rowDirection,
    fetchedAt,
  }
  if (rowDirection === 'departure') {
    flight.scheduledDeparture = readMovementTime(departure, 'scheduledTime')
    flight.estimatedDeparture =
      readMovementTime(departure, 'revisedTime') ??
      readMovementTime(departure, 'predictedTime')
  } else {
    flight.scheduledArrival = readMovementTime(arrival, 'scheduledTime')
    flight.estimatedArrival =
      readMovementTime(arrival, 'revisedTime') ??
      readMovementTime(arrival, 'predictedTime')
  }
  return flight
}

/**
 * Optional schedule/status fallback for dates or airports the current-day BLR
 * board does not cover. AeroDataBox's free plan is non-commercial and requires
 * attribution, so the UI labels it as the source.
 */
export async function searchAeroDataBox(
  flightNumber: string,
  date: string,
  direction: FlightDirection | undefined,
  fetchedAt: string,
  airportCode = 'BLR',
  fetchImpl: typeof fetch = fetch,
): Promise<ProviderFlight[]> {
  if (!config.aerodataboxKey) return []
  const key = `${airportCode.toUpperCase()}|${compactFlightNumber(flightNumber)}|${date}|${direction ?? 'both'}`
  const cached = cache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.value
  const authHeaders = buildAeroDataBoxHeaders({
    key: config.aerodataboxKey,
    gateway: config.aerodataboxGateway,
    host: config.aerodataboxHost,
  })

  const url = new URL(
    `${config.aerodataboxBaseUrl.replace(/\/$/, '')}/flights/number/${encodeURIComponent(
      compactFlightNumber(flightNumber),
    )}/${encodeURIComponent(date)}`,
  )
  url.searchParams.set('dateLocalRole', 'Both')

  let body: unknown
  try {
    body = await fetchJson(
      url.toString(),
      {
        timeoutMs: config.flightProviderTimeoutMs,
        service: 'AeroDataBox',
        headers: authHeaders,
      },
      fetchImpl,
    )
  } catch (error) {
    if (error instanceof UpstreamError) {
      if (error.code === 'notfound') {
        cache.set(key, { expiresAt: Date.now() + config.flightCacheTtlMs, value: [] })
        return []
      }
      const code =
        error.code === 'quota' || error.code === 'timeout' || error.code === 'unauthorized'
          ? error.code
          : 'unavailable'
      throw new FlightProviderError(code, error.message)
    }
    throw new FlightProviderError('unavailable', 'AeroDataBox is unavailable.')
  }

  if (body === null) {
    cache.set(key, { expiresAt: Date.now() + config.flightCacheTtlMs, value: [] })
    return []
  }
  if (!Array.isArray(body)) {
    throw new FlightProviderError('malformed', 'AeroDataBox returned an unexpected shape.')
  }
  const results = body
    .map((row) => toProviderFlight(row, direction, fetchedAt, airportCode))
    .filter((flight): flight is ProviderFlight => flight !== null)
  cache.set(key, {
    expiresAt:
      Date.now() +
      (results.length ? config.aerodataboxCacheTtlMs : config.flightCacheTtlMs),
    value: results,
  })
  return results
}

/** Test helper: clears the process-local AeroDataBox cache. */
export function clearAeroDataBoxCache(): void {
  cache.clear()
}
