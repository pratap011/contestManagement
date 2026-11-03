import { appConfig } from '@/config'

export type FlightProviderGateway = 'rapidapi' | 'direct'

export interface FlightLookupAvailability {
  airports: string[]
  board: { airports: string[] }
  provider: {
    id: 'aerodatabox'
    configured: boolean
    gateway: FlightProviderGateway | null
    airports: string[]
    futureDates: boolean
    attributionRequired: boolean
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

/** Parses the server status response and ignores malformed values. */
export function parseFlightLookupStatus(value: unknown): FlightLookupAvailability | null {
  if (!isRecord(value)) return null
  const board = isRecord(value.board) ? value.board : null
  const provider = isRecord(value.provider) ? value.provider : null
  if (!board || !provider) return null
  const gateway =
    provider.gateway === 'rapidapi' || provider.gateway === 'direct'
      ? provider.gateway
      : null
  return {
    airports: readStrings(value.airports),
    board: { airports: readStrings(board.airports) },
    provider: {
      id: 'aerodatabox',
      configured: provider.configured === true,
      gateway,
      airports: readStrings(provider.airports),
      futureDates: provider.futureDates === true,
      attributionRequired: provider.attributionRequired !== false,
    },
  }
}

/** Reads live-flight coverage from the API. Failures are non-blocking for search. */
export async function fetchFlightLookupStatus(
  fetchImpl: typeof fetch = fetch.bind(globalThis),
  timeoutMs = 4000,
): Promise<FlightLookupAvailability | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(`${appConfig.apiBase}/api/flights/status`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
      credentials: 'omit',
    })
    if (!response.ok) return null
    return parseFlightLookupStatus(await response.json())
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
