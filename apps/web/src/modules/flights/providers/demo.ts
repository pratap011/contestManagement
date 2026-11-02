import { fromZonedTime } from 'date-fns-tz'
import type { FlightProvider, FlightResult, FlightRole } from '../types'
import {
  isValidFlightNumber,
  isValidTravelDate,
  normaliseFlightNumber,
} from '../validation'

export const BLR_TIME_ZONE = 'Asia/Kolkata'
export const DEMO_PROVIDER_ID = 'demo'

export interface DemoFlightDefinition {
  airport: string
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
  // BLR
  {
    airport: 'BLR',
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
    airport: 'BLR',
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
    airport: 'BLR',
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
    airport: 'BLR',
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
    airport: 'BLR',
    flightNumber: 'AI 803',
    airline: 'Air India',
    origin: 'BOM',
    destination: 'BLR',
    terminal: 'T2',
    gate: 'B1',
    departureLocal: '13:00',
    arrivalLocal: '15:10',
  },
  // DEL
  {
    airport: 'DEL',
    flightNumber: '6E 2001',
    airline: 'IndiGo',
    origin: 'DEL',
    destination: 'BOM',
    terminal: 'T2',
    gate: 'T2-G1',
    departureLocal: '09:20',
    arrivalLocal: '11:35',
  },
  {
    airport: 'DEL',
    flightNumber: 'AI 805',
    airline: 'Air India',
    origin: 'BOM',
    destination: 'DEL',
    terminal: 'T3',
    gate: 'T3-G1',
    departureLocal: '08:10',
    arrivalLocal: '10:20',
  },
  {
    airport: 'DEL',
    flightNumber: '6E 2002',
    airline: 'IndiGo',
    origin: 'DEL',
    destination: 'BLR',
    terminal: 'T1',
    gate: 'T1-G1',
    departureLocal: '18:40',
    arrivalLocal: '21:30',
  },
  // BOM
  {
    airport: 'BOM',
    flightNumber: '6E 5001',
    airline: 'IndiGo',
    origin: 'BOM',
    destination: 'DEL',
    terminal: 'T2',
    gate: 'T2-G1',
    departureLocal: '10:05',
    arrivalLocal: '12:20',
  },
  {
    airport: 'BOM',
    flightNumber: 'AI 806',
    airline: 'Air India',
    origin: 'DEL',
    destination: 'BOM',
    terminal: 'T1',
    gate: 'T1-G1',
    departureLocal: '07:30',
    arrivalLocal: '09:40',
  },
  {
    airport: 'BOM',
    flightNumber: 'UK 900',
    airline: 'Vistara',
    origin: 'BOM',
    destination: 'BLR',
    terminal: 'T2',
    gate: 'T2-G2',
    departureLocal: '19:15',
    arrivalLocal: '21:05',
  },
  // HYD
  {
    airport: 'HYD',
    flightNumber: '6E 7001',
    airline: 'IndiGo',
    origin: 'HYD',
    destination: 'DEL',
    terminal: 'T1',
    gate: 'T1-G1',
    departureLocal: '11:10',
    arrivalLocal: '13:35',
  },
  {
    airport: 'HYD',
    flightNumber: '6E 7002',
    airline: 'IndiGo',
    origin: 'HYD',
    destination: 'BLR',
    terminal: 'T1',
    gate: 'T1-G2',
    departureLocal: '17:20',
    arrivalLocal: '18:45',
  },
  {
    airport: 'HYD',
    flightNumber: 'AI 900',
    airline: 'Air India',
    origin: 'DEL',
    destination: 'HYD',
    terminal: 'T1',
    gate: 'T1-G1',
    departureLocal: '08:00',
    arrivalLocal: '10:20',
  },
  // MAA
  {
    airport: 'MAA',
    flightNumber: '6E 8001',
    airline: 'IndiGo',
    origin: 'MAA',
    destination: 'BLR',
    terminal: 'T1',
    gate: 'T1-G1',
    departureLocal: '14:20',
    arrivalLocal: '15:35',
  },
  {
    airport: 'MAA',
    flightNumber: '6E 8002',
    airline: 'IndiGo',
    origin: 'MAA',
    destination: 'DEL',
    terminal: 'T1',
    gate: 'T1-G2',
    departureLocal: '18:05',
    arrivalLocal: '20:30',
  },
  {
    airport: 'MAA',
    flightNumber: 'AI 901',
    airline: 'Air India',
    origin: 'BLR',
    destination: 'MAA',
    terminal: 'T2',
    gate: 'T2-G1',
    departureLocal: '09:15',
    arrivalLocal: '10:30',
  },
  // CCU
  {
    airport: 'CCU',
    flightNumber: '6E 9001',
    airline: 'IndiGo',
    origin: 'CCU',
    destination: 'DEL',
    terminal: 'T2',
    gate: 'T2-G1',
    departureLocal: '16:30',
    arrivalLocal: '18:55',
  },
  {
    airport: 'CCU',
    flightNumber: '6E 9002',
    airline: 'IndiGo',
    origin: 'CCU',
    destination: 'BLR',
    terminal: 'T2',
    gate: 'T2-G2',
    departureLocal: '20:10',
    arrivalLocal: '22:45',
  },
  {
    airport: 'CCU',
    flightNumber: 'AI 902',
    airline: 'Air India',
    origin: 'DEL',
    destination: 'CCU',
    terminal: 'T2',
    gate: 'T2-G1',
    departureLocal: '11:00',
    arrivalLocal: '13:20',
  },
]

export interface DemoJourneyChoice {
  flightNumber: string
  label: string
}

export interface DemoJourneySet {
  departing: DemoJourneyChoice
  layover: { arrivalFlightNumber: string; connectingFlightNumber: string; label: string }
  secondary: DemoJourneyChoice
}

export const DEMO_JOURNEYS_BY_AIRPORT: Record<string, DemoJourneySet> = {
  BLR: {
    departing: { flightNumber: '6E 2134', label: 'T1 · to DEL' },
    layover: {
      arrivalFlightNumber: 'AI 508',
      connectingFlightNumber: '6E 6162',
      label: 'T1 · DEL → BLR → MAA',
    },
    secondary: { flightNumber: 'UK 864', label: 'T2 · to BOM' },
  },
  DEL: {
    departing: { flightNumber: '6E 2001', label: 'T2 · to BOM' },
    layover: {
      arrivalFlightNumber: 'AI 805',
      connectingFlightNumber: '6E 2002',
      label: 'T3 → T1 · BOM → DEL → BLR',
    },
    secondary: { flightNumber: '6E 2002', label: 'T1 · to BLR' },
  },
  BOM: {
    departing: { flightNumber: '6E 5001', label: 'T2 · to DEL' },
    layover: {
      arrivalFlightNumber: 'AI 806',
      connectingFlightNumber: 'UK 900',
      label: 'T1 → T2 · DEL → BOM → BLR',
    },
    secondary: { flightNumber: 'UK 900', label: 'T2 · to BLR' },
  },
  HYD: {
    departing: { flightNumber: '6E 7001', label: 'T1 · to DEL' },
    layover: {
      arrivalFlightNumber: 'AI 900',
      connectingFlightNumber: '6E 7001',
      label: 'T1 · DEL → HYD → DEL',
    },
    secondary: { flightNumber: '6E 7002', label: 'T1 · to BLR' },
  },
  MAA: {
    departing: { flightNumber: '6E 8001', label: 'T1 · to BLR' },
    layover: {
      arrivalFlightNumber: 'AI 901',
      connectingFlightNumber: '6E 8001',
      label: 'T2 → T1 · BLR → MAA → BLR',
    },
    secondary: { flightNumber: '6E 8002', label: 'T1 · to DEL' },
  },
  CCU: {
    departing: { flightNumber: '6E 9001', label: 'T2 · to DEL' },
    layover: {
      arrivalFlightNumber: 'AI 902',
      connectingFlightNumber: '6E 9001',
      label: 'T2 · DEL → CCU → DEL',
    },
    secondary: { flightNumber: '6E 9002', label: 'T2 · to BLR' },
  },
}

export const DEMO_JOURNEYS = DEMO_JOURNEYS_BY_AIRPORT.BLR

export function demoJourneysFor(airportCode: string): DemoJourneySet {
  return DEMO_JOURNEYS_BY_AIRPORT[airportCode.toUpperCase()] ?? DEMO_JOURNEYS
}

function atLocalTime(date: string, time: string): string {
  return fromZonedTime(`${date}T${time}:00`, BLR_TIME_ZONE).toISOString()
}

function findDefinition(flightNumber: string): DemoFlightDefinition | undefined {
  const wanted = normaliseFlightNumber(flightNumber)
  return DEMO_FLIGHTS.find((flight) => flight.flightNumber === wanted)
}

export function findDemoFlights(
  flightNumber: string,
  date: string,
  role: FlightRole = 'departure',
  airportCode?: string,
): FlightResult[] {
  if (!isValidFlightNumber(flightNumber) || !isValidTravelDate(date)) return []
  const definition = findDefinition(flightNumber)
  if (!definition) return []
  if (airportCode && definition.airport !== airportCode.toUpperCase()) return []
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
      direction: role === 'arrival' ? 'arrival' : 'departure',
      fetchedAt: new Date().toISOString(),
    },
  ]
}

export class DemoFlightProvider implements FlightProvider {
  readonly id = DEMO_PROVIDER_ID
  readonly label = 'Deterministic demo schedule'

  async searchFlight(
    flightNumber: string,
    date: string,
    role?: FlightRole,
  ): Promise<FlightResult[]> {
    return findDemoFlights(flightNumber, date, role)
  }
}
