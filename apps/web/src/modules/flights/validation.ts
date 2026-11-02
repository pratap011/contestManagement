import { localInputToIso } from '@/lib/time'
import type { FlightRole } from './types'

const FLIGHT_NUMBER_PATTERN = /^(?:[A-Z0-9]{2}|[A-Z]{3})\d{1,4}[A-Z]?$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const LOCAL_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/

export function compactFlightNumber(value: string): string {
  return value.trim().toUpperCase().replace(/[\s-]+/g, '')
}

/** Returns a display form such as "6E 2134"; returns the compact value if invalid. */
export function normaliseFlightNumber(value: string): string {
  const compact = compactFlightNumber(value)
  const match = compact.match(/^([A-Z0-9]{2}|[A-Z]{3})(\d{1,4})([A-Z]?)$/)
  return match ? `${match[1]} ${match[2]}${match[3] ?? ''}` : compact
}

export function isValidFlightNumber(value: string): boolean {
  const compact = compactFlightNumber(value)
  const match = compact.match(FLIGHT_NUMBER_PATTERN)
  // An all-numeric prefix is not an airline designator (e.g. "1234").
  const airlinePrefix = compact.replace(/\d{1,4}[A-Z]?$/, '')
  return Boolean(match && /[A-Z]/.test(airlinePrefix))
}

export function isValidTravelDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

/** Maps provider/manual terminal values such as "T1", "1" or "Terminal 3" to "T1".."T9". */
export function normaliseTerminalLabel(value: string | undefined): string | undefined {
  if (!value) return undefined
  const match = value.trim().toUpperCase().match(/^(?:TERMINAL\s*)?T?([1-9])$/)
  return match ? `T${match[1]}` : undefined
}

export function isValidLocalDateTime(value: string): boolean {
  return LOCAL_DATE_TIME_PATTERN.test(value)
}

export function isStale(fetchedAt: string | undefined, now = Date.now(), maxAgeMs = 30 * 60 * 1000): boolean {
  if (!fetchedAt) return false
  const time = new Date(fetchedAt).getTime()
  return Number.isFinite(time) && now - time > maxAgeMs
}

export interface ManualFlightFormValues {
  flightNumber: string
  airline: string
  origin: string
  destination: string
  terminal: string
  gate: string
  localDateTime: string
}

export type ManualFlightErrors = Partial<Record<keyof ManualFlightFormValues, string>>

export function validateManualFlight(
  values: ManualFlightFormValues,
  role: FlightRole,
  timeZone: string,
): ManualFlightErrors {
  const errors: ManualFlightErrors = {}
  if (!isValidFlightNumber(values.flightNumber)) {
    errors.flightNumber = 'Enter a flight number such as 6E 2134 or AI 508.'
  }
  if (!/^[A-Z]{3}$/.test(values.origin.trim().toUpperCase())) {
    errors.origin = 'Enter a three-letter origin airport code.'
  }
  if (!/^[A-Z]{3}$/.test(values.destination.trim().toUpperCase())) {
    errors.destination = 'Enter a three-letter destination airport code.'
  }
  if (
    /^[A-Z]{3}$/.test(values.origin.trim().toUpperCase()) &&
    /^[A-Z]{3}$/.test(values.destination.trim().toUpperCase()) &&
    values.origin.trim().toUpperCase() === values.destination.trim().toUpperCase()
  ) {
    errors.destination = 'Origin and destination must be different.'
  }
  if (!isValidLocalDateTime(values.localDateTime)) {
    errors.localDateTime =
      role === 'arrival' ? 'Enter the scheduled arrival time.' : 'Enter the scheduled departure time.'
  } else if (!localInputToIso(values.localDateTime, timeZone)) {
    errors.localDateTime = 'This local time could not be read in the airport timezone.'
  }
  return errors
}
