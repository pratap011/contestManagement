export type FlightSource = 'provider' | 'manual' | 'demo'

export interface FlightResult {
  flightNumber: string
  airline?: string
  origin?: string
  destination?: string
  scheduledDeparture?: string
  scheduledArrival?: string
  estimatedDeparture?: string
  estimatedArrival?: string
  terminal?: string
  gate?: string
  status?: string
  source: FlightSource
  fetchedAt?: string
}

export interface FlightSearchInput {
  flightNumber: string
  date: string
}

export interface FlightProvider {
  readonly id: string
  readonly label: string
  searchFlight(flightNumber: string, date: string): Promise<FlightResult[]>
}

export type FlightProviderErrorCode =
  | 'timeout'
  | 'quota'
  | 'unavailable'
  | 'malformed'
  | 'unauthorized'
  | 'invalid'

export class FlightProviderError extends Error {
  readonly code: FlightProviderErrorCode

  constructor(code: FlightProviderErrorCode, message: string) {
    super(message)
    this.name = 'FlightProviderError'
    this.code = code
  }
}

export type FlightLookupStatus = 'success' | 'no-results' | 'disabled' | 'error' | 'invalid'

export interface FlightLookupOutcome {
  status: FlightLookupStatus
  results: FlightResult[]
  error?: {
    code: FlightProviderErrorCode | 'validation'
    message: string
  }
}

export type FlightRole = 'departure' | 'arrival' | 'connection'
