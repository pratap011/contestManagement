import type { FlightDirection, FlightProvider, FlightResult, FlightRole } from '../types'
import { FlightProviderError } from '../types'
import {
  isValidFlightNumber,
  isValidTravelDate,
  normaliseFlightNumber,
  normaliseTerminalLabel,
} from '../validation'

export interface HttpFlightProviderOptions {
  endpoint: string
  timeoutMs: number
  fetchImpl?: typeof fetch
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function readIso(record: Record<string, unknown>, key: string): string | undefined {
  const value = readString(record, key)
  if (!value) return undefined
  // Require an explicit offset so a provider timestamp is never silently
  // interpreted in the passenger's device timezone instead of airport time.
  if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

function readNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function readDirection(value: unknown): FlightDirection | undefined {
  return value === 'departure' || value === 'arrival' ? value : undefined
}

function readProvider(value: unknown): FlightResult['provider'] {
  return value === 'blr-airport-board' || value === 'aerodatabox' ? value : undefined
}

function mapProviderResult(value: unknown): FlightResult | null {
  if (!isRecord(value)) return null
  const rawFlightNumber = readString(value, 'flightNumber')
  if (!rawFlightNumber || !isValidFlightNumber(rawFlightNumber)) return null
  const fetchedAt = readIso(value, 'fetchedAt') ?? new Date().toISOString()
  return {
    flightNumber: normaliseFlightNumber(rawFlightNumber),
    airline: readString(value, 'airline'),
    origin: readString(value, 'origin')?.toUpperCase(),
    destination: readString(value, 'destination')?.toUpperCase(),
    scheduledDeparture: readIso(value, 'scheduledDeparture'),
    scheduledArrival: readIso(value, 'scheduledArrival'),
    estimatedDeparture: readIso(value, 'estimatedDeparture'),
    estimatedArrival: readIso(value, 'estimatedArrival'),
    terminal: normaliseTerminalLabel(readString(value, 'terminal')),
    gate: readString(value, 'gate')?.toUpperCase(),
    gateFloor: readNumber(value, 'gateFloor'),
    status: readString(value, 'status'),
    source: 'provider',
    provider: readProvider(value.provider),
    direction: readDirection(value.direction),
    fetchedAt,
  }
}

/**
 * Calls a server-side proxy. The browser never receives the provider API key.
 * The proxy contract is documented in docs/flight-provider-proxy.md.
 */
export class HttpFlightProvider implements FlightProvider {
  readonly id = 'http-proxy'
  readonly label = 'Live BLR airport board (via server proxy)'
  private readonly endpoint: string
  private readonly timeoutMs: number
  private readonly fetchImpl: typeof fetch

  constructor(options: HttpFlightProviderOptions) {
    this.endpoint = options.endpoint
    this.timeoutMs = options.timeoutMs
    // Bind the browser's fetch to the global object: calling an unbound
    // window.fetch as an object method throws "Illegal invocation" in Chrome.
    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis)
  }

  async searchFlight(
    flightNumber: string,
    date: string,
    role?: FlightRole,
  ): Promise<FlightResult[]> {
    if (!isValidFlightNumber(flightNumber) || !isValidTravelDate(date)) {
      throw new FlightProviderError('invalid', 'Flight number or travel date is invalid.')
    }

    const separator = this.endpoint.includes('?') ? '&' : '?'
    const roleParam = role ? `&role=${encodeURIComponent(role)}` : ''
    const url = `${this.endpoint}${separator}flightNumber=${encodeURIComponent(
      normaliseFlightNumber(flightNumber),
    )}&date=${encodeURIComponent(date)}${roleParam}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const response = await this.fetchImpl(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
        credentials: 'omit',
      })

      if (response.status === 429) {
        throw new FlightProviderError('quota', 'The flight provider request limit has been reached.')
      }
      if (response.status === 401 || response.status === 403) {
        throw new FlightProviderError('unauthorized', 'Flight lookup is not configured correctly.')
      }
      if (!response.ok) {
        throw new FlightProviderError('unavailable', 'Flight lookup is unavailable right now.')
      }

      let body: unknown
      try {
        body = await response.json()
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new FlightProviderError('timeout', 'Flight lookup timed out.')
        }
        throw new FlightProviderError('malformed', 'The flight provider returned malformed data.')
      }

      const rawResults = Array.isArray(body)
        ? body
        : isRecord(body) && Array.isArray(body.results)
          ? body.results
          : null
      if (!rawResults) {
        throw new FlightProviderError('malformed', 'The flight provider returned malformed data.')
      }

      return rawResults
        .map(mapProviderResult)
        .filter((result): result is FlightResult => result !== null)
    } catch (error) {
      if (error instanceof FlightProviderError) throw error
      if (error instanceof Error && error.name === 'AbortError') {
        throw new FlightProviderError('timeout', 'Flight lookup timed out.')
      }
      throw new FlightProviderError('unavailable', 'Flight lookup is unavailable right now.')
    } finally {
      clearTimeout(timer)
    }
  }
}
