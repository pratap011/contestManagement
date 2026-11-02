export type QueueTerminal = 'T1' | 'T2'
export type QueueDirection = 'departure' | 'arrival'

export interface QueueCheckpoint {
  id: string
  label: string
  milestone: string
  waitMinutes: number | null
  queueLength: number | null
  optional: boolean
}

export interface TerminalQueues {
  terminal: QueueTerminal
  direction: QueueDirection
  checkpoints: QueueCheckpoint[]
  totalMinutes: number | null
  source: 'blr-airport-qms'
  sourceLabel: string
  fetchedAt: string
  note: string
}

export interface AirportWeather {
  temperatureC: number | null
  apparentTemperatureC: number | null
  humidityPercent: number | null
  precipitationMm: number | null
  windKph: number | null
  condition: string
  observedAt: string | null
  timezone: string
  source: 'open-meteo'
  sourceLabel: string
  note: string
}

export interface AircraftPosition {
  found: boolean
  flightNumber: string
  callsign: string
  lat: number | null
  lon: number | null
  altitudeMeters: number | null
  groundSpeedMps: number | null
  headingDegrees: number | null
  onGround: boolean | null
  lastContact: string | null
  distanceKm: number | null
  source: 'opensky'
  sourceLabel: string
  fetchedAt: string
  note: string
}
