import { localInputToIso } from '@/lib/time'
import type { FlightResult, FlightRole } from '../types'
import {
  normaliseFlightNumber,
  normaliseTerminalLabel,
  type ManualFlightFormValues,
} from '../validation'

export function createManualFlight(
  values: ManualFlightFormValues,
  role: FlightRole,
  timeZone: string,
): FlightResult {
  const scheduled = localInputToIso(values.localDateTime, timeZone)
  const result: FlightResult = {
    flightNumber: normaliseFlightNumber(values.flightNumber),
    airline: values.airline.trim() || undefined,
    origin: values.origin.trim().toUpperCase() || undefined,
    destination: values.destination.trim().toUpperCase() || undefined,
    terminal: normaliseTerminalLabel(values.terminal),
    gate: values.gate.trim().toUpperCase() || undefined,
    source: 'manual',
    direction: role === 'arrival' ? 'arrival' : 'departure',
    fetchedAt: new Date().toISOString(),
  }
  if (role === 'arrival') {
    result.scheduledArrival = scheduled ?? undefined
  } else {
    result.scheduledDeparture = scheduled ?? undefined
  }
  return result
}
