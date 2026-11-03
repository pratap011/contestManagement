import { appConfig } from '@/config'
import { minutesBetween } from '@/lib/time'
import type { FlightResult } from '@/modules/flights/types'

export type TriState = 'yes' | 'no' | 'unknown'

export interface ConnectionContext {
  sameBooking: TriState
  baggageThrough: TriState
  needsFormalities: TriState
}

export const DEFAULT_CONNECTION_CONTEXT: ConnectionContext = {
  sameBooking: 'unknown',
  baggageThrough: 'unknown',
  needsFormalities: 'unknown',
}

export type TimingBasis = 'scheduled' | 'estimated' | 'scheduled+estimated' | 'unavailable'

export interface ConnectionAssessment {
  scheduledMinutes: number | null
  estimatedMinutes: number | null
  timingBasis: TimingBasis
  planningAllowanceMinutes: number
  usableMinutes: number | null
  warnings: string[]
  requiredChecks: string[]
}

export interface AssessmentOptions {
  boardingBufferMinutes?: number
  procedureAllowanceMinutes?: number
  terminalsDiffer?: boolean
}

const ADVISORY =
  'This is an informational estimate, not a guarantee. Airline and airport instructions take precedence.'

function durationFor(
  arrivalIso: string | undefined,
  departureIso: string | undefined,
): number | null {
  if (!arrivalIso || !departureIso) return null
  return minutesBetween(arrivalIso, departureIso)
}

/**
 * Calculates a connection duration and conservative planning allowances. It
 * deliberately never labels a connection as safe: unknown airline/airport rules
 * remain warnings that direct the passenger to staff.
 */
export function assessConnection(
  arrival: FlightResult,
  departure: FlightResult,
  context: ConnectionContext,
  options: AssessmentOptions = {},
): ConnectionAssessment {
  const scheduledMinutes = durationFor(arrival.scheduledArrival, departure.scheduledDeparture)
  const estimatedArrival = arrival.estimatedArrival ?? arrival.scheduledArrival
  const estimatedDeparture = departure.estimatedDeparture ?? departure.scheduledDeparture
  const hasEstimate = Boolean(
    arrival.estimatedArrival || departure.estimatedDeparture,
  )
  const estimatedMinutes = hasEstimate ? durationFor(estimatedArrival, estimatedDeparture) : null

  let timingBasis: TimingBasis = 'unavailable'
  if (scheduledMinutes !== null && estimatedMinutes !== null) timingBasis = 'scheduled+estimated'
  else if (scheduledMinutes !== null) timingBasis = 'scheduled'
  else if (estimatedMinutes !== null) timingBasis = 'estimated'

  const effectiveMinutes = scheduledMinutes ?? estimatedMinutes
  const warnings: string[] = []
  const requiredChecks: string[] = [
    'Confirm the connection and any transfer requirements with your airline.',
    'Check airport screens for the current departure gate and boarding time.',
    'Keep your boarding pass and travel documents available.',
  ]

  if (effectiveMinutes === null) {
    warnings.push(
      'Scheduled arrival and departure times are incomplete, so a connection duration cannot be calculated.',
    )
  } else if (effectiveMinutes <= 0) {
    warnings.push(
      'The connecting departure is not after the arrival time. Check the flight dates and times before travelling.',
    )
  }

  if (context.sameBooking === 'unknown') {
    warnings.push('Confirm with your airline whether both flights are on one booking.')
  } else if (context.sameBooking === 'no') {
    warnings.push(
      'Separate tickets: you may need to leave the airside area, check in again, and re-clear security.',
    )
  }

  if (context.baggageThrough === 'unknown') {
    warnings.push('Confirm whether your baggage is checked through to the final destination.')
  } else if (context.baggageThrough === 'no') {
    warnings.push(
      'Your baggage must be collected and rechecked. Allow time for the baggage hall, check-in, and security.',
    )
  }

  if (context.needsFormalities === 'unknown') {
    warnings.push(
      'Confirm whether you must clear immigration, customs, or security at this airport; this MVP cannot infer it.',
    )
  } else if (context.needsFormalities === 'yes') {
    warnings.push('You must clear the required immigration, customs, or security checks at this airport.')
  }

  if (options.terminalsDiffer) {
    warnings.push(
      'The arrival and departure terminals differ. The map includes the airport-published inter-terminal transfer where available, but confirm transfer eligibility, security and baggage steps with airline or airport staff.',
    )
  }

  if (effectiveMinutes !== null && effectiveMinutes > 0 && effectiveMinutes < 75) {
    warnings.push(
      'This is a short connection. Speak to airline or airport staff before leaving the gate area.',
    )
  }

  warnings.push(ADVISORY)

  const procedureRequired =
    context.needsFormalities === 'yes' ||
    context.sameBooking === 'no' ||
    context.baggageThrough === 'no'
  const planningAllowanceMinutes =
    (options.boardingBufferMinutes ?? appConfig.connection.boardingBufferMinutes) +
    (procedureRequired
      ? (options.procedureAllowanceMinutes ?? appConfig.connection.procedureAllowanceMinutes)
      : 0)

  return {
    scheduledMinutes,
    estimatedMinutes,
    timingBasis,
    planningAllowanceMinutes,
    usableMinutes:
      effectiveMinutes !== null && effectiveMinutes > 0
        ? effectiveMinutes - planningAllowanceMinutes
        : null,
    warnings,
    requiredChecks,
  }
}

export function isConnectionContextComplete(context: ConnectionContext): boolean {
  return (
    context.sameBooking !== 'unknown' &&
    context.baggageThrough !== 'unknown' &&
    context.needsFormalities !== 'unknown'
  )
}

export function contextLabel(value: TriState, yes: string, no: string): string {
  if (value === 'yes') return yes
  if (value === 'no') return no
  return 'Not provided'
}
