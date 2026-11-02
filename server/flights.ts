import { config } from './config.ts'

export type FlightDirection = 'departure' | 'arrival'

export interface ProviderFlight {
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
  gateFloor?: number
  status?: string
  source: 'provider'
  provider: 'blr-airport-board' | 'aviationstack'
  direction: FlightDirection
  fetchedAt: string
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

const FLIGHT_NUMBER_PATTERN = /^(?:[A-Z0-9]{2}|[A-Z]{3})\d{1,4}[A-Z]?$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function compactFlightNumber(value: string): string {
  return value.trim().toUpperCase().replace(/[\s-]+/g, '')
}

export function normaliseFlightNumber(value: string): string {
  const compact = compactFlightNumber(value)
  const match = compact.match(/^([A-Z0-9]{2}|[A-Z]{3})(\d{1,4})([A-Z]?)$/)
  return match ? `${match[1]} ${match[2]}${match[3] ?? ''}` : compact
}

export function isValidFlightNumber(value: string): boolean {
  const compact = compactFlightNumber(value)
  const match = compact.match(FLIGHT_NUMBER_PATTERN)
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

export function todayInAirportTimeZone(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/** Converts a BLR local wall-clock value to ISO. India has a fixed +05:30 offset. */
function blrLocalToIso(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  const normalised = value.replace(' ', 'T')
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(normalised)) return undefined
  const date = new Date(`${normalised}+05:30`)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

const STATUS_LABELS: Record<string, string> = {
  ONTIME: 'On time',
  GATECLOSED: 'Gate closed',
  FINALCALL: 'Final call',
  DELAYED: 'Delayed',
  CANCELLED: 'Cancelled',
  BOARDING: 'Boarding',
  DEPARTED: 'Departed',
  ARRIVED: 'Arrived',
  SCHEDULED: 'Scheduled',
  DIVERTED: 'Diverted',
  UNKNOWN: 'Status unknown',
}

function formatStatus(value: string | undefined): string | undefined {
  if (!value) return undefined
  const key = value.replace(/[^A-Za-z]/g, '').toUpperCase()
  if (STATUS_LABELS[key]) return STATUS_LABELS[key]
  return value
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/** Some board rows omit srcDestTerminal; gate numbering still identifies the terminal. */
function inferTerminalFromGate(gate: string | undefined): string | undefined {
  if (!gate) return undefined
  if (/^[CD]\d/i.test(gate)) return 'T2'
  if (/^[AB]?\d+$/i.test(gate)) return 'T1'
  return undefined
}

function normaliseTerminal(value: string | undefined): string | undefined {
  if (!value) return undefined
  const match = value.trim().toUpperCase().match(/^T?([12])$/)
  return match ? `T${match[1]}` : undefined
}

interface BlrGateDirectoryEntry {
  terminal?: number
  floor?: number
  gates?: string[]
}

interface BlrGateDirectoryResponse {
  data?: BlrGateDirectoryEntry[]
}

interface BlrBoardRow {
  flight_unique_no?: string | null
  airline_name?: string | null
  airline_iata_id?: string | null
  org_airport_id?: string | null
  dest_airport_id?: string | null
  schedule_date?: string | null
  schedule_hour_id?: string | null
  estimated_hour_id?: string | null
  gate_id?: string | null
  flight_status_id?: string | null
  srcDestTerminal?: string | null
  baseTerminal?: string | null
}

interface BlrBoardResponse {
  data?: {
    arr?: BlrBoardRow[]
    dep?: BlrBoardRow[]
  }
}

interface GateInfo {
  terminal: string
  floor: number
}

function mapBlrRow(
  row: BlrBoardRow,
  direction: FlightDirection,
  fetchedAt: string,
  gateDirectory: Map<string, GateInfo>,
): ProviderFlight | null {
  if (!row.flight_unique_no) return null
  if (!isValidFlightNumber(row.flight_unique_no)) return null
  const scheduled = blrLocalToIso(row.schedule_hour_id)
  const estimated = blrLocalToIso(row.estimated_hour_id)
  if (!scheduled) return null

  const gate = row.gate_id?.trim().toUpperCase() || undefined
  const gateInfo = gate ? gateDirectory.get(gate) : undefined
  const terminal =
    gateInfo?.terminal ??
    normaliseTerminal(row.srcDestTerminal ?? row.baseTerminal ?? undefined) ??
    inferTerminalFromGate(gate)
  const flight: ProviderFlight = {
    flightNumber: normaliseFlightNumber(row.flight_unique_no),
    airline: row.airline_name ?? undefined,
    origin: (row.org_airport_id ?? undefined)?.toUpperCase(),
    destination: (row.dest_airport_id ?? undefined)?.toUpperCase(),
    terminal,
    gate,
    gateFloor: gateInfo?.floor,
    status: formatStatus(row.flight_status_id ?? undefined),
    source: 'provider',
    provider: 'blr-airport-board',
    direction,
    fetchedAt,
  }
  if (direction === 'departure') {
    flight.scheduledDeparture = scheduled
    flight.estimatedDeparture = estimated
  } else {
    flight.scheduledArrival = scheduled
    flight.estimatedArrival = estimated
  }
  return flight
}

interface CacheEntry<T> {
  expiresAt: number
  value: T
}

let boardCache: CacheEntry<BlrBoardResponse> | null = null
let gateDirectoryCache: CacheEntry<Map<string, GateInfo>> | null = null
const aviationstackCache = new Map<string, CacheEntry<ProviderFlight[]>>()

async function fetchJson(url: string, headers: Record<string, string>): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(config.flightProviderTimeoutMs),
    })
  } catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new FlightProviderError('timeout', 'The live flight provider timed out.')
    }
    throw new FlightProviderError('unavailable', 'The live flight provider could not be reached.')
  }

  if (response.status === 429) {
    throw new FlightProviderError('quota', 'The live flight provider limit has been reached.')
  }
  if (response.status === 401 || response.status === 403) {
    throw new FlightProviderError('unauthorized', 'The live flight provider rejected the request.')
  }
  if (!response.ok) {
    throw new FlightProviderError('unavailable', 'The live flight provider is unavailable.')
  }

  try {
    return await response.json()
  } catch (error) {
    // AbortSignal.timeout also aborts while the body is being read, so keep
    // the timeout classification instead of reporting malformed data.
    if (
      error instanceof Error &&
      (error.name === 'TimeoutError' || error.name === 'AbortError')
    ) {
      throw new FlightProviderError('timeout', 'The live flight provider timed out.')
    }
    throw new FlightProviderError('malformed', 'The live flight provider returned unreadable data.')
  }
}

async function fetchBlrBoard(): Promise<BlrBoardResponse> {
  const now = Date.now()
  if (boardCache && boardCache.expiresAt > now) return boardCache.value

  const body = await fetchJson(config.blrBoardUrl, {
    Accept: 'application/json',
    'User-Agent': 'BLR-Navigator/1.0 (airport data client)',
    // The airport's public website endpoint checks the browser origin.
    Origin: 'https://www.bengaluruairport.com',
    Referer: 'https://www.bengaluruairport.com/',
  })
  if (typeof body !== 'object' || body === null) {
    throw new FlightProviderError('malformed', 'The airport board returned unreadable data.')
  }
  const parsed = body as BlrBoardResponse
  if (!parsed.data || (!Array.isArray(parsed.data.arr) && !Array.isArray(parsed.data.dep))) {
    throw new FlightProviderError('malformed', 'The airport board returned an unexpected shape.')
  }
  boardCache = { expiresAt: now + config.flightCacheTtlMs, value: parsed }
  return parsed
}

async function fetchGateDirectory(): Promise<Map<string, GateInfo>> {
  const now = Date.now()
  if (gateDirectoryCache && gateDirectoryCache.expiresAt > now) return gateDirectoryCache.value
  const directory = new Map<string, GateInfo>()
  try {
    const body = await fetchJson(config.blrGateDirectoryUrl, {
      Accept: 'application/json',
      'User-Agent': 'BLR-Navigator/1.0 (airport data client)',
      Origin: 'https://www.bengaluruairport.com',
      Referer: 'https://www.bengaluruairport.com/',
    })
    const parsed = body as BlrGateDirectoryResponse
    for (const entry of parsed.data ?? []) {
      if (!entry.terminal || !Number.isFinite(entry.floor)) continue
      const terminal = `T${entry.terminal}`
      for (const gate of entry.gates ?? []) {
        directory.set(gate.trim().toUpperCase(), {
          terminal,
          floor: Number(entry.floor),
        })
      }
    }
  } catch {
    // Gate floors are an enhancement; the board remains usable without them.
  }
  gateDirectoryCache = { expiresAt: now + config.flightCacheTtlMs * 10, value: directory }
  return directory
}

function flightMatchesDirection(
  direction: FlightDirection | undefined,
  wanted: FlightDirection,
): boolean {
  return !direction || direction === wanted
}

async function searchBlrBoard(
  flightNumber: string,
  date: string,
  direction: FlightDirection | undefined,
  fetchedAt: string,
): Promise<ProviderFlight[]> {
  if (date !== todayInAirportTimeZone()) {
    // The public board only publishes the current airport day.
    return []
  }
  const board = await fetchBlrBoard()
  const wanted = compactFlightNumber(flightNumber)
  const rows: Array<{ row: BlrBoardRow; direction: FlightDirection }> = []
  if (flightMatchesDirection(direction, 'departure')) {
    for (const row of board.data?.dep ?? []) rows.push({ row, direction: 'departure' })
  }
  if (flightMatchesDirection(direction, 'arrival')) {
    for (const row of board.data?.arr ?? []) rows.push({ row, direction: 'arrival' })
  }
  const matchingRows = rows.filter(
    ({ row }) => compactFlightNumber(row.flight_unique_no ?? '') === wanted,
  )
  if (!matchingRows.length) return []
  const gateDirectory = await fetchGateDirectory()
  return matchingRows
    .map(({ row, direction: rowDirection }) =>
      mapBlrRow(row, rowDirection, fetchedAt, gateDirectory),
    )
    .filter((flight): flight is ProviderFlight => flight !== null)
}

interface AviationstackRow {
  flight_date?: string
  flight_status?: string
  departure?: {
    airport?: string
    iata?: string
    scheduled?: string
    estimated?: string
    terminal?: string
    gate?: string
  }
  arrival?: {
    airport?: string
    iata?: string
    scheduled?: string
    estimated?: string
    terminal?: string
    gate?: string
  }
  airline?: { name?: string }
  flight?: { iata?: string }
}

interface AviationstackResponse {
  data?: AviationstackRow[]
  error?: { code?: string; message?: string }
}

function aviationstackLocalToIso(value: string | undefined, isBlr: boolean): string | undefined {
  if (!value) return undefined
  const withoutOffset = value.replace(/(?:Z|[+-]\d{2}:?\d{2})$/i, '')
  if (isBlr) return blrLocalToIso(withoutOffset)
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString()
}

async function searchAviationstack(
  flightNumber: string,
  date: string,
  direction: FlightDirection | undefined,
  fetchedAt: string,
): Promise<ProviderFlight[]> {
  if (!config.aviationstackKey) return []
  const cacheKey = `${compactFlightNumber(flightNumber)}|${date}|${direction ?? 'both'}`
  const cached = aviationstackCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.value

  const url = new URL(`${config.aviationstackBaseUrl.replace(/\/$/, '')}/flights`)
  url.searchParams.set('access_key', config.aviationstackKey)
  url.searchParams.set('flight_iata', compactFlightNumber(flightNumber))
  url.searchParams.set('flight_date', date)
  const body = await fetchJson(url.toString(), { Accept: 'application/json' })
  const parsed = body as AviationstackResponse
  if (parsed.error) {
    if (parsed.error.code === 'usage_limit_reached' || parsed.error.code === 'rate_limit_reached') {
      throw new FlightProviderError('quota', 'The Aviationstack quota has been reached.')
    }
    if (parsed.error.code === 'invalid_access_key' || parsed.error.code === 'missing_access_key') {
      throw new FlightProviderError('unauthorized', 'Aviationstack credentials are not valid.')
    }
    throw new FlightProviderError('unavailable', 'Aviationstack is unavailable.')
  }
  if (!Array.isArray(parsed.data)) {
    throw new FlightProviderError('malformed', 'Aviationstack returned an unexpected shape.')
  }

  const results = parsed.data
    .map((row): ProviderFlight | null => {
      const rawNumber = row.flight?.iata
      if (!rawNumber || !isValidFlightNumber(rawNumber)) return null
      const depIsBlr = row.departure?.iata?.toUpperCase() === 'BLR'
      const arrIsBlr = row.arrival?.iata?.toUpperCase() === 'BLR'
      const rowDirection: FlightDirection | null = depIsBlr
        ? 'departure'
        : arrIsBlr
          ? 'arrival'
          : null
      if (!rowDirection || !flightMatchesDirection(direction, rowDirection)) return null
      const flight: ProviderFlight = {
        flightNumber: normaliseFlightNumber(rawNumber),
        airline: row.airline?.name,
        origin: row.departure?.iata?.toUpperCase(),
        destination: row.arrival?.iata?.toUpperCase(),
        terminal: normaliseTerminal(
          rowDirection === 'departure' ? row.departure?.terminal : row.arrival?.terminal,
        ),
        gate: (rowDirection === 'departure' ? row.departure?.gate : row.arrival?.gate)?.toUpperCase(),
        status: formatStatus(row.flight_status),
        source: 'provider',
        provider: 'aviationstack',
        direction: rowDirection,
        fetchedAt,
      }
      if (rowDirection === 'departure') {
        flight.scheduledDeparture = aviationstackLocalToIso(row.departure?.scheduled, true)
        flight.estimatedDeparture = aviationstackLocalToIso(row.departure?.estimated, true)
      } else {
        flight.scheduledArrival = aviationstackLocalToIso(row.arrival?.scheduled, true)
        flight.estimatedArrival = aviationstackLocalToIso(row.arrival?.estimated, true)
      }
      return flight
    })
    .filter((flight): flight is ProviderFlight => flight !== null)

  aviationstackCache.set(cacheKey, {
    expiresAt: Date.now() + config.flightCacheTtlMs * 5,
    value: results,
  })
  return results
}

export interface FlightSearchResult {
  results: ProviderFlight[]
  provider: string
  fetchedAt: string
}

/**
 * Tries the airport's public live board first. If it has no match (or the
 * requested date is not today), an optional Aviationstack key widens coverage.
 */
export async function searchLiveFlights(
  flightNumber: string,
  date: string,
  direction?: FlightDirection,
): Promise<FlightSearchResult> {
  const fetchedAt = new Date().toISOString()
  let boardResults: ProviderFlight[] = []
  let boardError: FlightProviderError | null = null

  try {
    boardResults = await searchBlrBoard(flightNumber, date, direction, fetchedAt)
  } catch (error) {
    boardError = error instanceof FlightProviderError ? error : new FlightProviderError(
      'unavailable',
      'The airport board is unavailable.',
    )
  }

  if (boardResults.length) {
    return { results: boardResults, provider: 'blr-airport-board', fetchedAt }
  }

  let fallbackError: FlightProviderError | null = null
  if (config.aviationstackKey) {
    try {
      const fallback = await searchAviationstack(flightNumber, date, direction, fetchedAt)
      if (fallback.length) {
        return { results: fallback, provider: 'aviationstack', fetchedAt }
      }
    } catch (error) {
      fallbackError =
        error instanceof FlightProviderError
          ? error
          : new FlightProviderError('unavailable', 'The Aviationstack fallback is unavailable.')
    }
  }

  if (boardError) throw boardError
  if (fallbackError) throw fallbackError
  return { results: [], provider: 'blr-airport-board', fetchedAt }
}
