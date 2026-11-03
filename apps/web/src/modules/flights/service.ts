import { appConfig } from '@/config'
import type {
  FlightLookupOutcome,
  FlightProvider,
  FlightRole,
  FlightSearchInput,
} from './types'
import { FlightProviderError } from './types'
import { HttpFlightProvider } from './providers/http'
import {
  isValidFlightNumber,
  isValidTravelDate,
  normaliseFlightNumber,
} from './validation'

const ERROR_COPY: Record<string, string> = {
  timeout: 'Live flight lookup timed out. You can enter the flight details manually.',
  quota: 'The live lookup request limit has been reached. Manual entry is still available.',
  unauthorized: 'The live flight service rejected this deployment. Use manual entry or demo flights.',
  unavailable: 'Live flight lookup is unavailable. Manual entry is still available.',
  malformed: 'The live provider returned data we could not read. Please enter details manually.',
  invalid: 'The flight number or travel date is invalid.',
}

export function createConfiguredFlightProvider(airportCode = 'BLR'): FlightProvider | null {
  if (!appConfig.providerLookupEnabled) return null
  return new HttpFlightProvider({
    endpoint: appConfig.providerEndpoint,
    timeoutMs: appConfig.providerTimeoutMs,
    airportCode,
  })
}

export async function lookupFlights(
  input: FlightSearchInput,
  options: { provider: FlightProvider | null; enabled: boolean; role?: FlightRole },
): Promise<FlightLookupOutcome> {
  if (!isValidFlightNumber(input.flightNumber) || !isValidTravelDate(input.date)) {
    return {
      status: 'invalid',
      results: [],
      error: {
        code: 'validation',
        message: 'Enter a valid flight number and travel date before searching.',
      },
    }
  }
  if (!options.enabled || !options.provider) {
    return { status: 'disabled', results: [] }
  }

  try {
    const results = await options.provider.searchFlight(
      normaliseFlightNumber(input.flightNumber),
      input.date,
      options.role,
    )
    const wanted = normaliseFlightNumber(input.flightNumber)
    // Never silently substitute a different flight for the requested number.
    const matching = results.filter(
      (result) => normaliseFlightNumber(result.flightNumber) === wanted,
    )
    if (!matching.length) return { status: 'no-results', results: [] }
    return {
      status: 'success',
      results: matching,
      provider: matching[0]?.provider,
      fetchedAt: matching[0]?.fetchedAt,
    }
  } catch (error) {
    if (error instanceof FlightProviderError) {
      return {
        status: 'error',
        results: [],
        error: {
          code: error.code,
          message: ERROR_COPY[error.code] ?? ERROR_COPY.unavailable,
        },
      }
    }
    return {
      status: 'error',
      results: [],
      error: { code: 'unavailable', message: ERROR_COPY.unavailable },
    }
  }
}

export function flightLookupErrorMessage(outcome: FlightLookupOutcome): string | null {
  if (outcome.status === 'no-results') {
    return 'No matching flight was found for this date. Check the flight number and date, or enter the details manually.'
  }
  if (outcome.status === 'disabled') {
    return 'Live flight lookup is not enabled in this deployment. Enter the details manually or use a demo journey from the home page.'
  }
  return outcome.error?.message ?? null
}
