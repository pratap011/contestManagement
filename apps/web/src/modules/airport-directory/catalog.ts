export interface AirportTerminalSummary {
  id: string
  name: string
}

export interface AirportLiveCapabilities {
  /** BLR publishes a public current-day flight board. */
  airportBoard: boolean
  /** BLR publishes live checkpoint queue displays. */
  queues: boolean
  weather: boolean
  aircraft: boolean
  push: boolean
}

export interface AirportCatalogEntry {
  code: string
  name: string
  city: string
  country: string
  timezone: string
  /** "full" uses mapped indoor walkways; "schematic" uses inferred terminal links. */
  coverage: 'full' | 'schematic'
  live: AirportLiveCapabilities
  terminals: AirportTerminalSummary[]
  note: string
}

export const AIRPORT_CATALOG: AirportCatalogEntry[] = [
  {
    code: 'BLR',
    name: 'Kempegowda International Airport',
    city: 'Bengaluru',
    country: 'India',
    timezone: 'Asia/Kolkata',
    coverage: 'full',
    live: { airportBoard: true, queues: true, weather: true, aircraft: true, push: true },
    terminals: [
      { id: 't1', name: 'Terminal 1' },
      { id: 't2', name: 'Terminal 2' },
    ],
    note: 'Mapped indoor corridors, live airport board, checkpoint waits and the T1↔T2 shuttle.',
  },
  {
    code: 'DEL',
    name: 'Indira Gandhi International Airport',
    city: 'New Delhi',
    country: 'India',
    timezone: 'Asia/Kolkata',
    coverage: 'schematic',
    live: { airportBoard: false, queues: false, weather: true, aircraft: true, push: false },
    terminals: [
      { id: 't1', name: 'Terminal 1' },
      { id: 't2', name: 'Terminal 2' },
      { id: 't3', name: 'Terminal 3' },
    ],
    note: 'Terminal-level OSM map with the airport-published T1/T2/T3 shuttle. Connectors are inferred.',
  },
  {
    code: 'BOM',
    name: 'Chhatrapati Shivaji Maharaj International Airport',
    city: 'Mumbai',
    country: 'India',
    timezone: 'Asia/Kolkata',
    coverage: 'schematic',
    live: { airportBoard: false, queues: false, weather: true, aircraft: true, push: false },
    terminals: [
      { id: 't1', name: 'Terminal 1' },
      { id: 't2', name: 'Terminal 2' },
    ],
    note: 'Terminal-level OSM map with the airport-published T1↔T2 coach. Connectors are inferred.',
  },
  {
    code: 'HYD',
    name: 'Rajiv Gandhi International Airport',
    city: 'Hyderabad',
    country: 'India',
    timezone: 'Asia/Kolkata',
    coverage: 'schematic',
    live: { airportBoard: false, queues: false, weather: true, aircraft: true, push: false },
    terminals: [{ id: 't1', name: 'Integrated Terminal' }],
    note: 'Single integrated terminal. Gate positions come from OSM; hall connectors are inferred.',
  },
  {
    code: 'MAA',
    name: 'Chennai International Airport',
    city: 'Chennai',
    country: 'India',
    timezone: 'Asia/Kolkata',
    coverage: 'schematic',
    live: { airportBoard: false, queues: false, weather: true, aircraft: true, push: false },
    terminals: [
      { id: 't1', name: 'Terminal 1 (Domestic)' },
      { id: 't2', name: 'Terminal 2 (International)' },
    ],
    note: 'Two adjacent terminals. Gate positions come from OSM; hall connectors are inferred.',
  },
  {
    code: 'CCU',
    name: 'Netaji Subhas Chandra Bose International Airport',
    city: 'Kolkata',
    country: 'India',
    timezone: 'Asia/Kolkata',
    coverage: 'schematic',
    live: { airportBoard: false, queues: false, weather: true, aircraft: true, push: false },
    terminals: [
      { id: 't1', name: 'Terminal 1 (Domestic)' },
      { id: 't2', name: 'Terminal 2 (Integrated)' },
    ],
    note: 'Domestic and integrated terminals. Gate positions come from OSM; connectors are inferred.',
  },
]

export const DEFAULT_AIRPORT_CODE = 'BLR'

export function getAirportSummary(code: string | undefined | null): AirportCatalogEntry {
  const normalised = (code ?? '').toUpperCase()
  return (
    AIRPORT_CATALOG.find((airport) => airport.code === normalised) ??
    AIRPORT_CATALOG.find((airport) => airport.code === DEFAULT_AIRPORT_CODE)!
  )
}

export function isKnownAirportCode(code: string): boolean {
  return AIRPORT_CATALOG.some((airport) => airport.code === code.toUpperCase())
}
