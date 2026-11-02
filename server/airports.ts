export interface AirportServerMetadata {
  code: string
  name: string
  city: string
  timezone: string
  center: { lat: number; lon: number }
  /** Bounding box used for OpenSky aircraft queries. */
  bbox: { lamin: number; lomin: number; lamax: number; lomax: number }
  /** The airport publishes a public current-day flight board. */
  airportBoard: boolean
  queues: boolean
  weather: boolean
  aircraft: boolean
  push: boolean
}

export const AIRPORTS: Record<string, AirportServerMetadata> = {
  BLR: {
    code: 'BLR',
    name: 'Kempegowda International Airport',
    city: 'Bengaluru',
    timezone: 'Asia/Kolkata',
    center: { lat: 13.1989, lon: 77.7068 },
    bbox: { lamin: 13.15, lomin: 77.65, lamax: 13.25, lomax: 77.77 },
    airportBoard: true,
    queues: true,
    weather: true,
    aircraft: true,
    push: true,
  },
  DEL: {
    code: 'DEL',
    name: 'Indira Gandhi International Airport',
    city: 'New Delhi',
    timezone: 'Asia/Kolkata',
    center: { lat: 28.5562, lon: 77.1 },
    bbox: { lamin: 28.5, lomin: 77.04, lamax: 28.61, lomax: 77.16 },
    airportBoard: false,
    queues: false,
    weather: true,
    aircraft: true,
    push: false,
  },
  BOM: {
    code: 'BOM',
    name: 'Chhatrapati Shivaji Maharaj International Airport',
    city: 'Mumbai',
    timezone: 'Asia/Kolkata',
    center: { lat: 19.0896, lon: 72.8656 },
    bbox: { lamin: 19.04, lomin: 72.8, lamax: 19.14, lomax: 72.93 },
    airportBoard: false,
    queues: false,
    weather: true,
    aircraft: true,
    push: false,
  },
  HYD: {
    code: 'HYD',
    name: 'Rajiv Gandhi International Airport',
    city: 'Hyderabad',
    timezone: 'Asia/Kolkata',
    center: { lat: 17.2403, lon: 78.4294 },
    bbox: { lamin: 17.19, lomin: 78.37, lamax: 17.29, lomax: 78.49 },
    airportBoard: false,
    queues: false,
    weather: true,
    aircraft: true,
    push: false,
  },
  MAA: {
    code: 'MAA',
    name: 'Chennai International Airport',
    city: 'Chennai',
    timezone: 'Asia/Kolkata',
    center: { lat: 12.9941, lon: 80.1709 },
    bbox: { lamin: 12.94, lomin: 80.11, lamax: 13.05, lomax: 80.23 },
    airportBoard: false,
    queues: false,
    weather: true,
    aircraft: true,
    push: false,
  },
  CCU: {
    code: 'CCU',
    name: 'Netaji Subhas Chandra Bose International Airport',
    city: 'Kolkata',
    timezone: 'Asia/Kolkata',
    center: { lat: 22.6547, lon: 88.4467 },
    bbox: { lamin: 22.6, lomin: 88.38, lamax: 22.71, lomax: 88.51 },
    airportBoard: false,
    queues: false,
    weather: true,
    aircraft: true,
    push: false,
  },
}

export const DEFAULT_AIRPORT = 'BLR'

export function resolveAirport(code: unknown): AirportServerMetadata | null {
  const normalised = String(code ?? DEFAULT_AIRPORT).trim().toUpperCase()
  return AIRPORTS[normalised] ?? null
}

export function airportCodes(): string[] {
  return Object.keys(AIRPORTS)
}
