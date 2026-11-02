import { fromZonedTime } from 'date-fns-tz'
import type { FlightProvider, FlightResult } from '../types'
import {
  isValidFlightNumber,
  isValidTravelDate,
  normaliseFlightNumber,
} from '../validation'

export const BLR_TIME_ZONE = 'Asia/Kolkata'
export const DEMO_PROVIDER_ID = 'demo'

export interface DemoFlightDefinition {
  flightNumber: string
  airline: string
  origin: string
  destination: string
  terminal: string
  gate: string
  departureLocal: string
  arrivalLocal: string
}

export const DEMO_FLIGHTS: DemoFlightDefinition[] = [
  {
    flightNumber: '6E 2134',
    airline: 'IndiGo',
    origin: 'BLR',
    destination: 'DEL',
    terminal: 'T1',
    gate: 'A3',
    departureLocal: '20:00',
    arrivalLocal: '22:25',
  },
  {
    flightNumber: 'AI 508',
    airline: 'Air India',
    origin: 'DEL',
    destination: 'BLR',
    terminal: 'T1',
    gate: 'A2',
    departureLocal: '12:00',
    arrivalLocal: '16:10',
  },
  {
    flightNumber: '6E 6162',
    airline: 'IndiGo',
    origin: 'BLR',
    destination: 'MAA',
    terminal: 'T1',
    gate: 'A5',
    departureLocal: '20:45',
    arrivalLocal: '22:55',
  },
  {
    flightNumber: 'UK 864',
    airline: 'Vistara',
    origin: 'BLR',
    destination: 'BOM',
    terminal: 'T2',
    gate: 'B2',
    departureLocal: '21:10',
    arrivalLocal: '23:35',
  },
  {
    flightNumber: 'AI 803',
    airline: 'Air India',
    origin: 'BOM',
    destination: 'BLR',
    terminal: 'T2',
    gate: 'B1',
    departureLocal: '13:00',
    arrivalLocal: '15:10',
  },
]

export const DEMO_JOURNEYS = {
  departing: {
    flightNumber: '6E 2134',
    label: 'Departing · BLR to DEL · T1',
  },
  layover: {
    arrivalFlightNumber: 'AI 508',
    connectingFlightNumber: '6E 6162',
    label: 'Layover · DEL to BLR to MAA · T1',
  },
  departingT2: {
    flightNumber: 'UK 864',
    label: 'Departing · BLR to BOM · T2',
  },
} as const

function atLocalTime(date: string, time: string): string {
  return fromZonedTime(`${date}T${time}:00`, BLR_TIME_ZONE).toISOString()
}

function findDefinition(flightNumber: string): DemoFlightDefinition | undefined {
  const wanted = normaliseFlightNumber(flightNumber)
  return DEMO_FLIGHTS.find((flight) => flight.flightNumber === wanted)
}

export function findDemoFlights(flightNumber: string, date: string): FlightResult[] {
  if (!isValidFlightNumber(flightNumber) || !isValidTravelDate(date)) return []
  const definition = findDefinition(flightNumber)
  if (!definition) return []
  return [
    {
      flightNumber: definition.flightNumber,
      airline: definition.airline,
      origin: definition.origin,
      destination: definition.destination,
      scheduledDeparture: atLocalTime(date, definition.departureLocal),
      scheduledArrival: atLocalTime(date, definition.arrivalLocal),
      terminal: definition.terminal,
      gate: definition.gate,
      status: 'Scheduled (demo)',
      source: 'demo',
      fetchedAt: new Date().toISOString(),
    },
  ]
}

export class DemoFlightProvider implements FlightProvider {
  readonly id = DEMO_PROVIDER_ID
  readonly label = 'Deterministic demo schedule'

  async searchFlight(flightNumber: string, date: string): Promise<FlightResult[]> {
    return findDemoFlights(flightNumber, date)
  }
}
